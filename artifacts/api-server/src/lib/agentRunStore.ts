import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const AGENT_RUN_LOCK_ID = "732841205813";
const DEFAULT_MAX_RUNS_PER_HOUR = 30;

export class AgentRunLimitError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 429 | 503,
  ) {
    super(message);
  }
}

export type AgentRunLease = {
  runId: string;
  appendUsageMetadata: (metadata: Record<string, unknown> | null) => Promise<void>;
  setRouteMode: (mode: "live" | "simulated") => Promise<void>;
  complete: (
    status: "completed" | "refused" | "unsupported" | "failed",
    elapsedMs: number,
    verificationPassed: boolean,
  ) => Promise<void>;
  release: () => Promise<void>;
};

export function getMaximumRunsPerHour(): number {
  const configured = process.env.QURUS_MAX_RUNS_PER_HOUR;
  if (configured === undefined || configured.trim() === "") return DEFAULT_MAX_RUNS_PER_HOUR;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error("QURUS_MAX_RUNS_PER_HOUR must be an integer from 1 to 1000.");
  }
  return value;
}

export async function getAgentRunStatus(): Promise<{
  runsInLastHour: number;
  maximumRunsPerHour: number;
  runInProgress: boolean;
}> {
  const maximumRunsPerHour = getMaximumRunsPerHour();
  const client = await pool.connect();
  let acquiredLock = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [AGENT_RUN_LOCK_ID],
    );
    acquiredLock = lock.rows[0]?.locked === true;
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM qurus_agent_runs WHERE started_at >= now() - interval '1 hour'",
    );
    return {
      runsInLastHour: result.rows[0]?.count ?? 0,
      maximumRunsPerHour,
      runInProgress: !acquiredLock,
    };
  } finally {
    try {
      if (acquiredLock) {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [AGENT_RUN_LOCK_ID]);
      }
    } finally {
      client.release();
    }
  }
}

export async function acquireAgentRunLease(
  route: "text" | "web",
  modelId: string,
): Promise<AgentRunLease> {
  const client = await pool.connect();
  let lockHeld = false;
  let released = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [AGENT_RUN_LOCK_ID],
    );
    lockHeld = lock.rows[0]?.locked === true;
    if (!lockHeld) {
      throw new AgentRunLimitError("Another Qurus agent run is already in progress.", 409);
    }

    const maximumRunsPerHour = getMaximumRunsPerHour();
    const count = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM qurus_agent_runs WHERE started_at >= now() - interval '1 hour'",
    );
    if ((count.rows[0]?.count ?? 0) >= maximumRunsPerHour) {
      throw new AgentRunLimitError(
        `The Qurus limit of ${maximumRunsPerHour} runs per hour has been reached.`,
        429,
      );
    }

    const runId = `run_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await client.query(
      `INSERT INTO qurus_agent_runs (id, route, model_id, route_mode, status, usage_metadata)
       VALUES ($1, $2, $3, 'live', 'running', '[]'::jsonb)`,
      [runId, route, modelId],
    );

    const unlock = async () => {
      if (released) return;
      released = true;
      try {
        if (lockHeld) {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [AGENT_RUN_LOCK_ID]);
          lockHeld = false;
        }
      } finally {
        client.release();
      }
    };

    return {
      runId,
      appendUsageMetadata: async (metadata) => {
        await client.query(
          `UPDATE qurus_agent_runs
           SET usage_metadata = usage_metadata || $2::jsonb
           WHERE id = $1`,
          [runId, JSON.stringify([metadata])],
        );
      },
      setRouteMode: async (mode) => {
        await client.query(
          "UPDATE qurus_agent_runs SET route_mode = $2 WHERE id = $1",
          [runId, mode],
        );
      },
      complete: async (status, elapsedMs, verificationPassed) => {
        await client.query(
          `UPDATE qurus_agent_runs
           SET status = $2, elapsed_ms = $3, verification_passed = $4, finished_at = now()
           WHERE id = $1`,
          [runId, status, elapsedMs, verificationPassed],
        );
      },
      release: unlock,
    };
  } catch (error) {
    try {
      if (lockHeld) {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [AGENT_RUN_LOCK_ID]);
      }
    } finally {
      client.release();
    }
    throw error;
  }
}
