import { createDb, schema, ReadOnlySpacetime, type ServerEnv } from "@bcc/shared";

/** The kill switch: ingestion only runs when explicitly enabled. */
export function shouldRunIngestion(env: Pick<ServerEnv, "INGESTION_ENABLED">): boolean {
  return env.INGESTION_ENABLED === true;
}

/** Exponential backoff with a 60s cap and small jitter-free base for determinism in tests. */
export function computeBackoffMs(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  return Math.min(base, 60_000);
}

/** Wire a read-only subscription to raw_snapshots upserts. */
export function startIngestion(env: ServerEnv): ReadOnlySpacetime {
  const db = createDb(env.DATABASE_URL);
  const sky = new ReadOnlySpacetime({
    uri: env.SPACETIME_URI,
    moduleName: env.SPACETIME_MODULE,
    token: env.SPACETIME_TOKEN,
  });

  sky.connect({
    onConnect: () => {
      console.log("[worker] connected (read-only) to SpacetimeDB");
      // Phase 0 spike: subscribe to a single small table to prove the path.
      // Phase 1 will replace this with the real compendium tables.
      sky.subscribe(["SELECT * FROM player LIMIT 1"], async (table, row) => {
        await db.insert(schema.rawSnapshots).values({
          sourceTable: table,
          entityId: String((row as { entity_id?: unknown })?.entity_id ?? "unknown"),
          payload: row as object,
        });
      });
    },
    onError: (e) => console.error("[worker] connection error:", e),
  });

  return sky;
}
