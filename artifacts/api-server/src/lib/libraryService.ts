import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { GetLibraryStateResponse } from "@workspace/api-zod";
import type {
  ActionResult,
  Book,
  DueDateResult,
  Hold,
  LibraryState,
  Loan,
  Receipt,
} from "@workspace/api-zod";

const STATE_ID = "shelf-demo";

function dateLabel(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function fixtureState(): LibraryState {
  return {
    user: { id: "demo-reader", displayName: "Jordan Lee (demo)" },
    books: [
      { id: "long-way-home", title: "The Long Way Home", author: "Mira Ellison", genre: "Literary fiction", availability: "checked_out" },
      { id: "data-for-everyone", title: "Data for Everyone", author: "Ravi Sen", genre: "Technology", availability: "on_hold" },
      { id: "quiet-rivers", title: "Quiet Rivers", author: "Nadia Flores", genre: "Nature writing", availability: "on_hold" },
      { id: "field-notes-cities", title: "Field Notes on Cities", author: "Avery Brooks", genre: "Urban studies", availability: "available" },
      { id: "atlas-small-things", title: "The Atlas of Small Things", author: "Lena Park", genre: "Essays", availability: "available" },
      { id: "beginner-botany", title: "A Beginner’s Guide to Botany", author: "S. M. Ortega", genre: "Science", availability: "available" },
      { id: "borrowed-light", title: "Borrowed Light", author: "Elliot March", genre: "Mystery", availability: "checked_out" },
    ],
    loans: [
      { id: "loan-long-way", bookId: "long-way-home", dueDate: new Date("2026-10-15T00:00:00.000Z"), renewalsUsed: 0, renewalLimit: 2, renewalBlockedReason: null },
      { id: "loan-data", bookId: "data-for-everyone", dueDate: new Date("2026-10-22T00:00:00.000Z"), renewalsUsed: 0, renewalLimit: 2, renewalBlockedReason: "Another reader has placed a hold on this title." },
      { id: "loan-borrowed-light", bookId: "borrowed-light", dueDate: new Date("2026-10-27T00:00:00.000Z"), renewalsUsed: 1, renewalLimit: 2, renewalBlockedReason: null },
    ],
    holds: [
      { id: "hold-quiet-rivers", bookId: "quiet-rivers", placedAt: new Date("2026-09-28T00:00:00.000Z"), active: true },
    ],
  };
}

async function ensureFixtures(): Promise<void> {
  await pool.query(
    "INSERT INTO qurus_library_state (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
    [STATE_ID, JSON.stringify(fixtureState())],
  );
}

export async function readLibraryState(): Promise<LibraryState> {
  await ensureFixtures();
  const { rows } = await pool.query<{ data: LibraryState }>(
    "SELECT data FROM qurus_library_state WHERE id = $1",
    [STATE_ID],
  );
  if (!rows[0]) throw new Error("Shelf fixture state is missing.");
  return GetLibraryStateResponse.parse(rows[0].data);
}

function createReceipt(operation: string, message: string): Receipt {
  return {
    id: `rcpt_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    operation,
    message,
    createdAt: new Date(),
  };
}

async function withIdempotency(
  key: string,
  operation: (state: LibraryState) => Promise<{ result: ActionResult; state: LibraryState }>,
): Promise<ActionResult> {
  await ensureFixtures();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ data: LibraryState }>(
      "SELECT data FROM qurus_library_state WHERE id = $1 FOR UPDATE",
      [STATE_ID],
    );
    const rawState = locked.rows[0]?.data;
    const state = rawState ? GetLibraryStateResponse.parse(rawState) : undefined;
    if (!state) throw new Error("Shelf fixture state is missing.");
    const replay = await client.query<{ response: ActionResult }>(
      "SELECT response FROM qurus_idempotency WHERE key = $1",
      [key],
    );
    if (replay.rows[0]) {
      await client.query("COMMIT");
      return { ...replay.rows[0].response, idempotentReplay: true };
    }

    const { result, state: nextState } = await operation(state);
    await client.query(
      "UPDATE qurus_library_state SET data = $1::jsonb, updated_at = now() WHERE id = $2",
      [JSON.stringify(nextState), STATE_ID],
    );
    const stored = { ...result, idempotentReplay: false };
    await client.query(
      "INSERT INTO qurus_idempotency (key, response) VALUES ($1, $2::jsonb)",
      [key, JSON.stringify(stored)],
    );
    await client.query("COMMIT");
    return stored;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function titleFor(state: LibraryState, bookId: string): string | undefined {
  return state.books.find((book) => book.id === bookId)?.title;
}

export function getLoan(state: LibraryState, bookId: string): Loan | undefined {
  return state.loans.find((loan) => loan.bookId === bookId);
}

export function getBook(state: LibraryState, bookId: string): Book | undefined {
  return state.books.find((book) => book.id === bookId);
}

export async function renewLoan(bookId: string, idempotencyKey: string): Promise<ActionResult> {
  return withIdempotency(idempotencyKey, async (state) => {
    const loan = getLoan(state, bookId);
    if (!loan) throw Object.assign(new Error("No active loan was found for this title."), { status: 404 });
    if (loan.renewalBlockedReason) throw Object.assign(new Error(loan.renewalBlockedReason), { status: 409 });
    if (loan.renewalsUsed >= loan.renewalLimit) {
      throw Object.assign(new Error("This loan has reached its renewal limit."), { status: 409 });
    }
    const due = new Date(loan.dueDate);
    due.setUTCDate(due.getUTCDate() + 14);
    const dueDate = due;
    const nextState: LibraryState = {
      ...state,
      loans: state.loans.map((item) =>
        item.id === loan.id
          ? { ...item, dueDate, renewalsUsed: item.renewalsUsed + 1 }
          : item,
      ),
    };
    const receipt = createReceipt("renewal", `${titleFor(state, bookId)} renewed through ${dateLabel(dueDate)}.`);
    return { state: nextState, result: { receipt, state: nextState, idempotentReplay: false } };
  });
}

export async function reserveTitle(bookId: string, idempotencyKey: string): Promise<ActionResult> {
  return withIdempotency(idempotencyKey, async (state) => {
    const book = getBook(state, bookId);
    if (!book) throw Object.assign(new Error("Book not found."), { status: 404 });
    if (book.availability !== "available") {
      throw Object.assign(new Error("This title is not currently available to reserve."), { status: 409 });
    }
    const hold: Hold = {
      id: `hold-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      bookId,
      placedAt: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
      active: true,
    };
    const nextState: LibraryState = {
      ...state,
      books: state.books.map((item) => item.id === bookId ? { ...item, availability: "on_hold" } : item),
      holds: [...state.holds, hold],
    };
    const receipt = createReceipt("reservation", `${book.title} has been reserved.`);
    return { state: nextState, result: { receipt, state: nextState, idempotentReplay: false } };
  });
}

export async function cancelHold(holdId: string, idempotencyKey: string): Promise<ActionResult> {
  return withIdempotency(idempotencyKey, async (state) => {
    const hold = state.holds.find((item) => item.id === holdId && item.active);
    if (!hold) throw Object.assign(new Error("Active hold not found."), { status: 404 });
    const nextState: LibraryState = {
      ...state,
      holds: state.holds.map((item) => item.id === holdId ? { ...item, active: false } : item),
      books: state.books.map((book) =>
        book.id === hold.bookId ? { ...book, availability: "available" } : book,
      ),
    };
    const receipt = createReceipt("hold_cancellation", `Your hold on ${titleFor(state, hold.bookId)} was cancelled.`);
    return { state: nextState, result: { receipt, state: nextState, idempotentReplay: false } };
  });
}

export async function readDueDate(bookId: string): Promise<DueDateResult> {
  const state = await readLibraryState();
  const loan = getLoan(state, bookId);
  const title = titleFor(state, bookId);
  if (!loan || !title) throw Object.assign(new Error("No active loan was found for this title."), { status: 404 });
  return {
    bookId,
    title,
    dueDate: loan.dueDate,
    receipt: createReceipt("due_date_read", `${title} is due ${dateLabel(loan.dueDate)}.`),
  };
}

export async function resetLibrary(): Promise<LibraryState> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO qurus_library_state (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [STATE_ID, JSON.stringify(fixtureState())],
    );
    await client.query("DELETE FROM qurus_idempotency");
    await client.query("DELETE FROM qurus_text_sessions");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return readLibraryState();
}
