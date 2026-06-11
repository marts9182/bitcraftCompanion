import "server-only";
import { unstable_cache } from "next/cache";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * ISO timestamp of the most recent successful ingestion run, for the footer
 * freshness stamp. The query result is cached 5 min, but the ISO string is
 * captured into each page's HTML at generation time, so the displayed stamp
 * can lag the truth by up to ~min(page ISR window since last render, 300 s
 * query cache). Routes flushed on-demand via /api/revalidate stay near-fresh
 * (the worker pings it after every snapshot, and the "ingestion-time" tag
 * below flushes this cache in the same request); routes outside that flush
 * (/resources/[slug], /creatures/[slug], /calculator/...) can serve a stamp
 * as stale as their full ISR window (up to 86400 s). DataFreshness.tsx
 * documents this page-render-time staleness as accepted. Errors and an empty
 * table both yield null (footer shows "—"): the stamp must never take a page
 * down.
 */
export const getLastIngestionTime = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const [row] = await getDb()
        .select({ finishedAt: schema.ingestionRuns.finishedAt })
        .from(schema.ingestionRuns)
        .where(and(eq(schema.ingestionRuns.status, "ok"), isNotNull(schema.ingestionRuns.finishedAt)))
        .orderBy(desc(schema.ingestionRuns.finishedAt))
        .limit(1);
      return row?.finishedAt?.toISOString() ?? null;
    } catch (err) {
      console.error("[freshness] getLastIngestionTime failed:", err);
      return null;
    }
  },
  ["last-ingestion-time"],
  { revalidate: 300, tags: ["ingestion-time"] },
);
