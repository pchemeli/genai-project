import { Router, type IRouter } from "express";
import { GetAgentStatusResponse, RunAgentBody, RunAgentResponse } from "@workspace/api-zod";
import { AgentRunLimitError } from "../lib/agentRunStore";
import { getAgentStatus, runGeminiAgent } from "../lib/geminiAgentService";

const router: IRouter = Router();

router.get("/agent/status", async (req, res): Promise<void> => {
  try {
    res.json(GetAgentStatusResponse.parse(await getAgentStatus()));
  } catch {
    req.log.warn("Qurus agent status could not be read.");
    res.status(503).json({ error: "Agent status is temporarily unavailable." });
  }
});

router.post("/agent/run", async (req, res): Promise<void> => {
  const parsed = RunAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(RunAgentResponse.parse(await runGeminiAgent(parsed.data)));
  } catch (error) {
    if (error instanceof AgentRunLimitError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const status =
      error && typeof error === "object" && "status" in error &&
      (error.status === 503 || error.status === 409 || error.status === 429)
        ? error.status
        : 500;
    const message = status === 503 && error instanceof Error
      ? error.message
      : status === 500
        ? "The agent run failed. Provider details were not logged."
        : "The agent is temporarily unavailable.";
    req.log.warn({ status }, "Qurus agent run request failed; provider details omitted.");
    res.status(status).json({ error: message });
  }
});

export default router;
