import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { ActionResult, LibraryState, TextSessionResult } from "@workspace/api-zod";
import {
  cancelHold,
  getBook,
  getLoan,
  readLibraryState,
  renewLoan,
  reserveTitle,
} from "./libraryService";

type Screen = TextSessionResult["screen"];
type SessionData = {
  screen: Screen;
  selectedBookId: string | null;
  selectedHoldId: string | null;
  error: string | null;
  result: ActionResult | null;
};

function initialData(): SessionData {
  return { screen: "home", selectedBookId: null, selectedHoldId: null, error: null, result: null };
}

function displayDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date: Date | string, days: number): string {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function menuFor(data: SessionData, state: LibraryState): string {
  if (data.screen === "home") return "Shelf | 1 My loans | 2 Reserve a book | 3 My holds | 9 End";
  if (data.screen === "loans") {
    const lines = state.loans.map((loan, index) => {
      const book = getBook(state, loan.bookId);
      return `${index + 1} ${book?.title ?? "Unknown title"} — due ${displayDate(loan.dueDate)}`;
    });
    return ["My loans", ...lines, "0 Back | 9 End"].join("\n");
  }
  if (data.screen === "loan_detail") {
    const title = data.selectedBookId ? getBook(state, data.selectedBookId)?.title : "Loan";
    return `${title}\n1 Renew | 0 Back | 9 End`;
  }
  if (data.screen === "confirmation") {
    const loan = data.selectedBookId ? getLoan(state, data.selectedBookId) : undefined;
    const title = data.selectedBookId ? getBook(state, data.selectedBookId)?.title : "Loan";
    const newDueDate = loan ? addDays(loan.dueDate, 14) : "";
    return `${title}\nNew due date: ${newDueDate}\n1 Confirm | 0 Back`;
  }
  if (data.screen === "reserve") {
    const available = state.books.filter((book) => book.availability === "available");
    return ["Reserve a book", ...available.map((book, index) => `${index + 1} ${book.title}`), "0 Back | 9 End"].join("\n");
  }
  if (data.screen === "holds") {
    const activeHolds = state.holds.filter((hold) => hold.active);
    const lines = activeHolds.map((hold, index) => `${index + 1} Cancel hold on ${getBook(state, hold.bookId)?.title ?? "Unknown title"}`);
    return ["My holds", ...lines, "0 Back | 9 End"].join("\n");
  }
  if (data.screen === "ended") return "Session ended.";
  return data.result?.receipt.message ?? "Shelf";
}

async function serializeSession(sessionId: string, data: SessionData): Promise<TextSessionResult> {
  const state = await readLibraryState();
  return {
    sessionId,
    screen: data.screen,
    menu: data.error ? `Error: ${data.error}\n${menuFor(data, state)}` : menuFor(data, state),
    ended: data.screen === "ended",
    error: data.error,
    selectedBookId: data.selectedBookId,
    result: data.result,
  };
}

export async function startTextSession(code: string): Promise<TextSessionResult> {
  if (code !== "*123#") throw Object.assign(new Error("Use *123# to start the Shelf demo."), { status: 400 });
  const sessionId = randomUUID();
  const data = initialData();
  await pool.query(
    "INSERT INTO qurus_text_sessions (id, data) VALUES ($1, $2::jsonb)",
    [sessionId, JSON.stringify(data)],
  );
  return serializeSession(sessionId, data);
}

async function readSession(sessionId: string): Promise<SessionData> {
  const { rows } = await pool.query<{ data: SessionData }>(
    "SELECT data FROM qurus_text_sessions WHERE id = $1",
    [sessionId],
  );
  if (!rows[0]) throw Object.assign(new Error("Text session not found."), { status: 404 });
  return rows[0].data;
}

async function saveSession(sessionId: string, data: SessionData): Promise<TextSessionResult> {
  await pool.query(
    "UPDATE qurus_text_sessions SET data = $1::jsonb, updated_at = now() WHERE id = $2",
    [JSON.stringify(data), sessionId],
  );
  return serializeSession(sessionId, data);
}

export async function inputTextSession(
  sessionId: string,
  digit: string,
  idempotencyPrefix = `text-session:${sessionId}`,
): Promise<TextSessionResult> {
  let data = await readSession(sessionId);
  const state = await readLibraryState();
  if (!/^\d$/.test(digit)) {
    data.error = "Enter one digit.";
    return serializeSession(sessionId, data);
  }
  if (data.screen === "ended") return serializeSession(sessionId, data);

  data.error = null;
  data.result = null;
  const invalid = async (): Promise<TextSessionResult> => {
    data.error = "Invalid input. Choose a digit shown in this menu.";
    return serializeSession(sessionId, data);
  };

  if (digit === "9") {
    data = { ...data, screen: "ended", selectedBookId: null, selectedHoldId: null };
    return saveSession(sessionId, data);
  }

  if (data.screen === "home") {
    if (digit === "1") data.screen = "loans";
    else if (digit === "2") data.screen = "reserve";
    else if (digit === "3") data.screen = "holds";
    else return invalid();
    return saveSession(sessionId, data);
  }

  if (digit === "0") {
    if (data.screen === "confirmation") data.screen = "loan_detail";
    else if (data.screen === "loan_detail") data.screen = "loans";
    else data.screen = "home";
    data.selectedBookId = data.screen === "loan_detail" ? data.selectedBookId : null;
    data.selectedHoldId = null;
    return saveSession(sessionId, data);
  }

  const choice = Number(digit) - 1;
  if (data.screen === "loans") {
    const loan = state.loans[choice];
    if (!loan) return invalid();
    data.screen = "loan_detail";
    data.selectedBookId = loan.bookId;
    return saveSession(sessionId, data);
  }

  if (data.screen === "loan_detail" && digit === "1") {
    const loan = data.selectedBookId ? getLoan(state, data.selectedBookId) : undefined;
    if (!loan) return invalid();
    if (loan.renewalBlockedReason || loan.renewalsUsed >= loan.renewalLimit) {
      data.error = loan.renewalBlockedReason ?? "This loan has reached its renewal limit.";
      return serializeSession(sessionId, data);
    }
    data.screen = "confirmation";
    return saveSession(sessionId, data);
  }

  if (data.screen === "confirmation" && digit === "1") {
    if (!data.selectedBookId) return invalid();
    try {
      data.result = await renewLoan(data.selectedBookId, `${idempotencyPrefix}:renew:${data.selectedBookId}`);
      data.screen = "result";
      return saveSession(sessionId, data);
    } catch (error) {
      data.screen = "loan_detail";
      data.error = error instanceof Error ? error.message : "Renewal could not be completed.";
      return serializeSession(sessionId, data);
    }
  }

  if (data.screen === "reserve") {
    const available = state.books.filter((book) => book.availability === "available");
    const book = available[choice];
    if (!book) return invalid();
    try {
      data.result = await reserveTitle(book.id, `${idempotencyPrefix}:reserve:${book.id}`);
      data.screen = "result";
      data.selectedBookId = book.id;
      return saveSession(sessionId, data);
    } catch (error) {
      data.error = error instanceof Error ? error.message : "Reservation could not be completed.";
      return serializeSession(sessionId, data);
    }
  }

  if (data.screen === "holds") {
    const active = state.holds.filter((hold) => hold.active);
    const hold = active[choice];
    if (!hold) return invalid();
    try {
      data.result = await cancelHold(hold.id, `${idempotencyPrefix}:cancel:${hold.id}`);
      data.screen = "result";
      data.selectedHoldId = hold.id;
      return saveSession(sessionId, data);
    } catch (error) {
      data.error = error instanceof Error ? error.message : "Hold cancellation could not be completed.";
      return serializeSession(sessionId, data);
    }
  }

  return invalid();
}
