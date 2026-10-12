import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const qurusLibraryStateTable = pgTable("qurus_library_state", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const qurusIdempotencyTable = pgTable("qurus_idempotency", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const qurusTextSessionsTable = pgTable("qurus_text_sessions", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const qurusAgentRunsTable = pgTable("qurus_agent_runs", {
  id: text("id").primaryKey(),
  route: text("route").notNull(),
  modelId: text("model_id").notNull(),
  routeMode: text("route_mode").notNull(),
  status: text("status").notNull().default("running"),
  usageMetadata: jsonb("usage_metadata")
    .$type<Array<Record<string, unknown> | null>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  verificationPassed: boolean("verification_passed"),
  elapsedMs: integer("elapsed_ms"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
