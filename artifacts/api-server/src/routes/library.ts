import { Router, type IRouter, type Response } from "express";
import {
  CancelHoldBody,
  CancelHoldResponse,
  GetLibraryStateResponse,
  ReadDueDateParams,
  ReadDueDateResponse,
  RenewLoanBody,
  RenewLoanResponse,
  ReserveTitleBody,
  ReserveTitleResponse,
  ResetLibraryResponse,
} from "@workspace/api-zod";
import {
  cancelHold,
  readDueDate,
  readLibraryState,
  renewLoan,
  reserveTitle,
  resetLibrary,
} from "../lib/libraryService";

const router: IRouter = Router();

function sendError(res: Response, error: unknown): void {
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : "Library request failed." });
}

router.get("/library/state", async (_req, res): Promise<void> => {
  res.json(GetLibraryStateResponse.parse(await readLibraryState()));
});

router.post("/library/renew", async (req, res): Promise<void> => {
  const parsed = RenewLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(RenewLoanResponse.parse(await renewLoan(parsed.data.bookId, parsed.data.idempotencyKey)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/library/reserve", async (req, res): Promise<void> => {
  const parsed = ReserveTitleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(ReserveTitleResponse.parse(await reserveTitle(parsed.data.bookId, parsed.data.idempotencyKey)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/library/cancel", async (req, res): Promise<void> => {
  const parsed = CancelHoldBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(CancelHoldResponse.parse(await cancelHold(parsed.data.holdId, parsed.data.idempotencyKey)));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/library/due/:bookId", async (req, res): Promise<void> => {
  const parsed = ReadDueDateParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(ReadDueDateResponse.parse(await readDueDate(parsed.data.bookId)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/library/reset", async (_req, res): Promise<void> => {
  res.json(ResetLibraryResponse.parse(await resetLibrary()));
});

export default router;
