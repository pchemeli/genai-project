import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  AgentLogEntry,
  AgentRunInput,
  AgentRunResult,
  LibraryState,
  TextStep,
  TextSessionResult,
} from "@workspace/api-zod";
import {
  cancelHold,
  getBook,
  getLoan,
  readDueDate,
  readLibraryState,
  renewLoan,
  reserveTitle,
} from "./libraryService";
import { inputTextSession, startTextSession } from "./textSessionService";

type Intent = {
  action: "renew" | "reserve" | "cancel" | "due" | "unsupported";
  bookId?: string;
  holdId?: string;
  title?: string;
  reason?: string;
};

const noChange = (left: LibraryState, right: LibraryState) =>
  JSON.stringify(left) === JSON.stringify(right);

const dateLabel = (date: Date | string | undefined) =>
  date ? new Date(date).toISOString().slice(0, 10) : "unknown";

function recognize(prompt: string, state: LibraryState): Intent {
  const text = prompt.toLowerCase();
  if (/\b(pay|payment|fine|fee)\b/.test(text)) {
    return { action: "unsupported", reason: "Payments and library fines are outside this demo. No records were changed." };
  }
  const book = state.books.find((item) => text.includes(item.title.toLowerCase()));
  if (!book) {
    return { action: "unsupported", reason: "I can only act on the fictional Shelf demo titles. No records were changed." };
  }
  if (/\b(cancel|remove|drop)\b/.test(text)) {
    const hold = state.holds.find((item) => item.bookId === book.id && item.active);
    return hold
      ? { action: "cancel", bookId: book.id, holdId: hold.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `There is no active hold on ${book.title}. No records were changed.` };
  }
  if (/\b(reserve|place|hold)\b/.test(text)) {
    return { action: "reserve", bookId: book.id, title: book.title };
  }
  if (/\b(due|when|date)\b/.test(text)) {
    return getLoan(state, book.id)
      ? { action: "due", bookId: book.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `${book.title} is not one of your active loans. No records were changed.` };
  }
  if (/\b(renew|extend)\b/.test(text)) {
    return getLoan(state, book.id)
      ? { action: "renew", bookId: book.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `${book.title} is not one of your active loans. No records were changed.` };
  }
  return { action: "unsupported", bookId: book.id, title: book.title, reason: "That request is not a supported Shelf action. No records were changed." };
}

function log(message: string, kind: AgentLogEntry["kind"] = "info"): AgentLogEntry {
  return { message, kind };
}

function choosePromptTitle(prompt: string, state: LibraryState): string {
  const found = state.books.find((book) => prompt.toLowerCase().includes(book.title.toLowerCase()));
  return found?.title ?? "the requested title";
}

async function runText(
  intent: Intent,
  state: LibraryState,
  idempotencyKey: string,
): Promise<{ textSteps: TextStep[]; resultText: string; dueDate?: Date }> {
  const steps: TextStep[] = [];
  const session = await startTextSession("*123#");
  steps.push({ digit: "*123#", menu: session.menu, error: null });
  const send = async (digit: string): Promise<TextSessionResult> => {
    const response = await inputTextSession(session.sessionId, digit, `agent:${idempotencyKey}`);
    steps.push({ digit, menu: response.menu, error: response.error });
    return response;
  };
  if (intent.action === "due" && intent.bookId) {
    const loans = await send("1");
    const dueDate = getLoan(state, intent.bookId)?.dueDate;
    const receipt = await readDueDate(intent.bookId);
    return {
      textSteps: steps,
      resultText: `${receipt.title} is due ${dateLabel(receipt.dueDate)}. Receipt ${receipt.receipt.id}.`,
      dueDate: loans.error ? undefined : dueDate,
    };
  }
  if (intent.action === "renew" && intent.bookId) {
    let current = await send("1");
    const loanIndex = state.loans.findIndex((loan) => loan.bookId === intent.bookId);
    if (loanIndex < 0) throw new Error("Loan was not listed in the Shelf menu.");
    current = await send(String(loanIndex + 1));
    current = await send("1");
    if (current.error) {
      return { textSteps: steps, resultText: `Renewal not completed: ${current.error}` };
    }
    if (current.screen !== "confirmation") throw new Error("Renewal confirmation menu did not open.");
    current = await send("1");
    if (!current.result) throw new Error(current.error ?? "Renewal did not return a receipt.");
    return {
      textSteps: steps,
      resultText: `${current.result.receipt.message} Receipt ${current.result.receipt.id}.`,
    };
  }
  if (intent.action === "reserve" && intent.bookId) {
    await send("2");
    const available = state.books.filter((book) => book.availability === "available");
    const index = available.findIndex((book) => book.id === intent.bookId);
    if (index < 0) throw new Error(`${intent.title ?? "That title"} is not currently available to reserve.`);
    const current = await send(String(index + 1));
    if (!current.result) throw new Error(current.error ?? "Reservation did not return a receipt.");
    return {
      textSteps: steps,
      resultText: `${current.result.receipt.message} Receipt ${current.result.receipt.id}.`,
    };
  }
  if (intent.action === "cancel" && intent.holdId) {
    await send("3");
    const holds = state.holds.filter((hold) => hold.active);
    const index = holds.findIndex((hold) => hold.id === intent.holdId);
    if (index < 0) throw new Error("The active hold was not listed in the Shelf menu.");
    const current = await send(String(index + 1));
    if (!current.result) throw new Error(current.error ?? "Cancellation did not return a receipt.");
    return {
      textSteps: steps,
      resultText: `${current.result.receipt.message} Receipt ${current.result.receipt.id}.`,
    };
  }
  return { textSteps: steps, resultText: "No library action was completed." };
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const started = performance.now();
  const before = await readLibraryState();
  const intent = recognize(input.prompt, before);
  const promptTitle = choosePromptTitle(input.prompt, before);
  const logEntries: AgentLogEntry[] = [
    log(`Request received: “${input.prompt}”`),
    log("Using the simulated Shelf agent. No language model is configured."),
  ];
  let status: AgentRunResult["status"] = "completed";
  let textSteps: TextStep[] = [];
  let actionResultText = "";
  let dueDate: Date | undefined;
  const idempotencyKey = input.idempotencyKey;

  if (intent.action === "unsupported") {
    status = "unsupported";
    logEntries.push(log(intent.reason ?? "That task is not supported.", "refusal"));
  } else if (intent.action === "renew" && intent.bookId) {
    const loan = getLoan(before, intent.bookId);
    if (loan?.renewalBlockedReason || (loan && loan.renewalsUsed >= loan.renewalLimit)) {
      status = "refused";
      const reason = loan.renewalBlockedReason ?? "This loan has reached its renewal limit.";
      logEntries.push(log(`${promptTitle} cannot be renewed: ${reason}`, "refusal"));
      if (input.route === "text") {
        try {
          const textResult = await runText(intent, before, idempotencyKey);
          textSteps = textResult.textSteps;
        } catch {
          // The refusal is already represented by the server-side validation result.
        }
      }
    } else {
      logEntries.push(log(`Renew ${promptTitle} through the ${input.route === "text" ? "text-menu simulation" : "visual library"} interface.`, "action"));
      if (input.route === "text") {
        const result = await runText(intent, before, idempotencyKey);
        textSteps = result.textSteps;
        actionResultText = result.resultText;
      } else {
        const result = await renewLoan(intent.bookId, `agent:${idempotencyKey}:renew`);
        actionResultText = `${result.receipt.message} Receipt ${result.receipt.id}.`;
      }
      logEntries.push(log(actionResultText, "success"));
    }
  } else if (intent.action === "reserve" && intent.bookId) {
    const book = getBook(before, intent.bookId);
    if (!book || book.availability !== "available") {
      status = "refused";
      logEntries.push(log(`${promptTitle} is not available to reserve. No records were changed.`, "refusal"));
    } else {
      logEntries.push(log(`Reserve ${promptTitle} through the ${input.route === "text" ? "text-menu simulation" : "visual library"} interface.`, "action"));
      if (input.route === "text") {
        const result = await runText(intent, before, idempotencyKey);
        textSteps = result.textSteps;
        actionResultText = result.resultText;
      } else {
        const result = await reserveTitle(intent.bookId, `agent:${idempotencyKey}:reserve`);
        actionResultText = `${result.receipt.message} Receipt ${result.receipt.id}.`;
      }
      logEntries.push(log(actionResultText, "success"));
    }
  } else if (intent.action === "cancel" && intent.holdId && intent.bookId) {
    logEntries.push(log(`Cancel the hold on ${promptTitle} through the ${input.route === "text" ? "text-menu simulation" : "visual library"} interface.`, "action"));
    if (input.route === "text") {
      const result = await runText(intent, before, idempotencyKey);
      textSteps = result.textSteps;
      actionResultText = result.resultText;
    } else {
      const result = await cancelHold(intent.holdId, `agent:${idempotencyKey}:cancel`);
      actionResultText = `${result.receipt.message} Receipt ${result.receipt.id}.`;
    }
    logEntries.push(log(actionResultText, "success"));
  } else if (intent.action === "due" && intent.bookId) {
    if (input.route === "text") {
      const result = await runText(intent, before, idempotencyKey);
      textSteps = result.textSteps;
      actionResultText = result.resultText;
      dueDate = result.dueDate;
    } else {
      const result = await readDueDate(intent.bookId);
      actionResultText = `${result.title} is due ${dateLabel(result.dueDate)}. Receipt ${result.receipt.id}.`;
      dueDate = result.dueDate;
    }
    logEntries.push(log(actionResultText, "success"));
  }

  const after = await readLibraryState();
  let passed = false;
  let verificationMessage: string;
  if (status === "unsupported" || status === "refused") {
    passed = noChange(before, after);
    verificationMessage = passed
      ? "Verified: committed library records are unchanged."
      : "Verification failed: an unsupported or refused task changed a record.";
  } else if (intent.action === "renew" && intent.bookId) {
    const original = getLoan(before, intent.bookId);
    const committed = getLoan(after, intent.bookId);
    const expectedDueDate = original ? new Date(original.dueDate) : undefined;
    expectedDueDate?.setUTCDate(expectedDueDate.getUTCDate() + 14);
    passed = Boolean(
      original &&
      committed &&
      committed.renewalsUsed === original.renewalsUsed + 1 &&
      expectedDueDate &&
      new Date(committed.dueDate).getTime() === expectedDueDate.getTime(),
    );
    verificationMessage = passed
      ? `Verified committed loan: due ${dateLabel(committed?.dueDate)}; renewals used ${committed?.renewalsUsed}.`
      : "Verification failed: the committed renewal was not found.";
  } else if (intent.action === "reserve" && intent.bookId) {
    passed = after.holds.some((hold) => hold.bookId === intent.bookId && hold.active) &&
      getBook(after, intent.bookId)?.availability === "on_hold";
    verificationMessage = passed
      ? "Verified committed reservation: an active hold is present."
      : "Verification failed: the committed hold was not found.";
  } else if (intent.action === "cancel" && intent.holdId) {
    const cancelledHold = after.holds.find((hold) => hold.id === intent.holdId && !hold.active);
    passed = Boolean(cancelledHold && getBook(after, cancelledHold.bookId)?.availability === "available");
    verificationMessage = passed
      ? "Verified committed cancellation: the hold is inactive."
      : "Verification failed: the hold is still active.";
  } else if (intent.action === "due" && intent.bookId) {
    const beforeDueDate = getLoan(before, intent.bookId)?.dueDate;
    const afterDueDate = getLoan(after, intent.bookId)?.dueDate;
    passed = Boolean(beforeDueDate && afterDueDate && new Date(beforeDueDate).getTime() === new Date(afterDueDate).getTime());
    verificationMessage = passed
      ? `Verified committed loan record unchanged: due ${dateLabel(dueDate ?? afterDueDate)}.`
      : "Verification failed: reading a due date changed the loan.";
  } else {
    passed = noChange(before, after);
    verificationMessage = passed ? "Verified no library records changed." : "Verification failed.";
  }
  logEntries.push(log(verificationMessage, passed ? "success" : "error"));

  const elapsedMs = Math.max(0, Math.round(performance.now() - started));
  const inputTokens = Math.ceil(input.prompt.length / 4);
  const outputTokens = Math.ceil(logEntries.reduce((total, entry) => total + entry.message.length, 0) / 4);
  const estimatedCostUsd = Number(((inputTokens * 0.0000015) + (outputTokens * 0.000006)).toFixed(6));
  return {
    runId: `run_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    route: input.route,
    status: status === "completed" && !passed ? "failed" : status,
    log: logEntries,
    textSteps,
    verification: { passed, message: verificationMessage },
    usage: {
      simulated: true,
      inputTokens,
      outputTokens,
      modelCalls: 0,
      elapsedMs,
      estimatedCostUsd,
    },
  };
}
