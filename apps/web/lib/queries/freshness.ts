import "server-only";
import { unstable_cache } from "next/cache";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * ISO timestamp of the most recent successful ingestion run, for the footer
 * freshness stamp. Cached 5 min — deliberately shorter than the 30-min
 * snapshot-cadence caches elsewhere, so a staleness display lags the truth by
 * at most ~5 min (a freshness indicator that is itself stale defeats its
 * purpose). Errors and an empty table both yield null (footer shows "—"):
 * the stamp must never take a page down.
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
    } catch {
      return null;
    }
  },
  ["last-ingestion-time"],
  { revalidate: 300 },
);
