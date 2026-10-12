import { Router, type IRouter } from "express";
import { RunAgentBody, RunAgentResponse } from "@workspace/api-zod";
import { runAgent } from "../lib/agentService";

const router: IRouter = Router();

router.post("/agent/run", async (req, res): Promise<void> => {
  const parsed = RunAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(RunAgentResponse.parse(await runAgent(parsed.data)));
  } catch (error) {
    req.log.error({ err: error }, "Qurus agent run failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "The demo run failed." });
  }
});

export default router;
