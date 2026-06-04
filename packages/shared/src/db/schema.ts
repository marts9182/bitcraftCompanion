import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/** Audit row written by the worker for each ingestion run. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "running" | "ok" | "error"
  rowsUpserted: integer("rows_upserted").default(0).notNull(),
  error: text("error"),
});

/** Generic raw payload storage keyed by source table + entity id (resilience / reprocessing). */
export const rawSnapshots = pgTable("raw_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceTable: text("source_table").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewRawSnapshot = typeof rawSnapshots.$inferInsert;
