import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
