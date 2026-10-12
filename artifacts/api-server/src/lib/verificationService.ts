import { createHash } from "node:crypto";
import type { AgentRunResult, LibraryState } from "@workspace/api-zod";
import { getBook, getLoan } from "./libraryService";

export type ShelfIntent = {
  action: "renew" | "reserve" | "cancel" | "due" | "unsupported";
  bookId?: string;
  holdId?: string;
  title?: string;
  reason?: string;
};

const dateLabel = (date: Date | string | undefined) =>
  date ? new Date(date).toISOString().slice(0, 10) : "unknown";

export function fixtureHash(state: LibraryState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 16);
}

export function recognize(prompt: string, state: LibraryState): ShelfIntent {
  const text = prompt.toLowerCase();
  if (/\b(pay|payment|fine|fee)\b/.test(text)) {
    return { action: "unsupported", reason: "Payments and library fines are outside this demo." };
  }
  const book = state.books.find((item) => text.includes(item.title.toLowerCase()));
  if (!book) {
    return { action: "unsupported", reason: "The request does not name a fictional Shelf title." };
  }
  if (/\b(cancel|remove|drop)\b/.test(text)) {
    const hold = state.holds.find((item) => item.bookId === book.id && item.active);
    return hold
      ? { action: "cancel", bookId: book.id, holdId: hold.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `There is no active hold on ${book.title}.` };
  }
  if (/\b(reserve|place|hold)\b/.test(text)) {
    return { action: "reserve", bookId: book.id, title: book.title };
  }
  if (/\b(due|when|date)\b/.test(text)) {
    return getLoan(state, book.id)
      ? { action: "due", bookId: book.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `${book.title} is not one of the active demo loans.` };
  }
  if (/\b(renew|extend)\b/.test(text)) {
    return getLoan(state, book.id)
      ? { action: "renew", bookId: book.id, title: book.title }
      : { action: "unsupported", bookId: book.id, title: book.title, reason: `${book.title} is not one of the active demo loans.` };
  }
  return { action: "unsupported", bookId: book.id, title: book.title, reason: "That request is not a supported Shelf action." };
}

export function verifyCommittedState(
  prompt: string,
  before: LibraryState,
  after: LibraryState,
  status: AgentRunResult["status"],
): { passed: boolean; message: string } {
  const intent = recognize(prompt, before);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);

  if (intent.action === "unsupported") {
    const passed = status === "unsupported" && unchanged;
    return {
      passed,
      message: passed
        ? "Verified: committed library records are unchanged."
        : "Verification failed: the unsupported request changed a record or was not refused.",
    };
  }

  if (intent.action === "renew" && intent.bookId) {
    const original = getLoan(before, intent.bookId);
    const committed = getLoan(after, intent.bookId);
    if (original?.renewalBlockedReason || (original && original.renewalsUsed >= original.renewalLimit)) {
      const passed = status === "refused" && unchanged;
      return {
        passed,
        message: passed
          ? `Verified: renewal was blocked and the due date remains ${dateLabel(original.dueDate)}.`
          : "Verification failed: the blocked renewal changed a committed record or was not refused.",
      };
    }
    const expectedDueDate = original ? new Date(original.dueDate) : undefined;
    expectedDueDate?.setUTCDate(expectedDueDate.getUTCDate() + 14);
    const passed = Boolean(
      status === "completed" &&
      original &&
      committed &&
      committed.renewalsUsed === original.renewalsUsed + 1 &&
      expectedDueDate &&
      new Date(committed.dueDate).getTime() === expectedDueDate.getTime(),
    );
    return {
      passed,
      message: passed
        ? `Verified committed loan: due ${dateLabel(committed?.dueDate)}; renewals used ${committed?.renewalsUsed}.`
        : "Verification failed: the committed renewal was not found.",
    };
  }

  if (intent.action === "reserve" && intent.bookId) {
    const wasAvailable = getBook(before, intent.bookId)?.availability === "available";
    if (!wasAvailable) {
      const passed = status === "refused" && unchanged;
      return {
        passed,
        message: passed
          ? "Verified: unavailable title was not reserved and no records changed."
          : "Verification failed: an unavailable title was changed or not refused.",
      };
    }
    const passed = status === "completed" &&
      after.holds.some((hold) => hold.bookId === intent.bookId && hold.active) &&
      getBook(after, intent.bookId)?.availability === "on_hold";
    return {
      passed,
      message: passed
        ? "Verified committed reservation: an active hold is present."
        : "Verification failed: the committed hold was not found.",
    };
  }

  if (intent.action === "cancel" && intent.holdId) {
    const cancelledHold = after.holds.find((hold) => hold.id === intent.holdId && !hold.active);
    const passed = status === "completed" &&
      Boolean(cancelledHold && getBook(after, cancelledHold.bookId)?.availability === "available");
    return {
      passed,
      message: passed
        ? "Verified committed cancellation: the hold is inactive."
        : "Verification failed: the hold is still active.",
    };
  }

  if (intent.action === "due" && intent.bookId) {
    const beforeDueDate = getLoan(before, intent.bookId)?.dueDate;
    const afterDueDate = getLoan(after, intent.bookId)?.dueDate;
    const passed = status === "completed" &&
      Boolean(beforeDueDate && afterDueDate && new Date(beforeDueDate).getTime() === new Date(afterDueDate).getTime());
    return {
      passed,
      message: passed
        ? `Verified committed loan record unchanged: due ${dateLabel(afterDueDate)}.`
        : "Verification failed: reading the due date changed a record or did not complete.",
    };
  }

  return {
    passed: false,
    message: "Verification failed: the request did not match a supported Shelf operation.",
  };
}
