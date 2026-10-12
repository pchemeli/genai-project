import { Router, type IRouter } from "express";
import {
  InputTextSessionBody,
  InputTextSessionParams,
  InputTextSessionResponse,
  StartTextSessionBody,
  StartTextSessionResponse,
} from "@workspace/api-zod";
import { inputTextSession, startTextSession } from "../lib/textSessionService";

const router: IRouter = Router();

router.post("/text/session", async (req, res): Promise<void> => {
  const parsed = StartTextSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await startTextSession(parsed.data.code);
    res.status(201).json(StartTextSessionResponse.parse(result));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Could not start the session." });
  }
});

router.post("/text/session/:sessionId/input", async (req, res): Promise<void> => {
  const params = InputTextSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = InputTextSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(InputTextSessionResponse.parse(await inputTextSession(params.data.sessionId, parsed.data.digit)));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Could not update the session." });
  }
});

export default router;
