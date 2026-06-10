/**
 * Resource/creature snapshot (bitjita parity): manual job that pulls the
 * resource & enemy catalogs from a bitcraft-live region module and upserts
 * them into Postgres. Later stages (positions, enemies, roads) will scan all
 * regions and emit static map files.
 *
 * Read-only (SubscribeMulti snapshot, no reducers). Run one stage at a time:
 *   pnpm --filter @bcc/worker resource-snapshot catalog
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import {
  parseServerEnv,
  createDb,
  schema,
  mapResourceDescRow,
  mapEnemyDescRow,
  makeUniqueSlug,
  type ResourceCatalogRow,
  type CreatureCatalogRow,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

// Regions to scan in the position/enemy/road stages. Desc tables are identical
// across regions, so catalog pulls only hit the FIRST region in the list.
const REGIONS = (process.env.RESOURCE_REGIONS ?? "7,8,9,12,13,14,17,18,19")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const regionModule = (r: number) => `bitcraft-live-${r}`;

// Static map-data outputs (used by the positions/enemies/roads stages).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT_DATA = resolve(REPO_ROOT, "apps/worker/out/map-data");
export const OUT_PUBLIC = resolve(REPO_ROOT, "apps/web/public/map");

const CHUNK = 200;

async function inChunks<T>(rows: T[], size: number, fn: (slice: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// Copied from leaderboard-snapshot.ts (file-local there): builds the
// onConflictDoUpdate set updating every column except the conflict key(s).
function conflictUpdateSet(table: PgTable, skip: string[]): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (skip.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

type Db = ReturnType<typeof createDb>;
type Conn = { uri: string; token: string };

/** Pull resource_desc + enemy_desc from the first region (descs are global). */
async function pullCatalogs(conn: Conn): Promise<{ resources: ResourceCatalogRow[]; creatures: CreatureCatalogRow[] }> {
  const region = REGIONS[0];
  if (region === undefined) throw new Error("RESOURCE_REGIONS resolved to an empty list");
  const moduleName = regionModule(region);
  console.log(`[resource] pulling catalogs from ${moduleName} …`);
  const tables = await readSnapshot(
    { ...conn, moduleName },
    ["SELECT * FROM resource_desc", "SELECT * FROM enemy_desc"],
    ["resource_desc", "enemy_desc"],
    120_000,
  );
  const resources = (tables.get("resource_desc") ?? []).map((r) => mapResourceDescRow(r as Record<string, unknown>));
  const creatures = (tables.get("enemy_desc") ?? []).map((r) => mapEnemyDescRow(r as Record<string, unknown>));
  console.log(`[resource] catalogs: ${resources.length} resources, ${creatures.length} creatures`);
  return { resources, creatures };
}

/** Assign unique slugs + spawn counts, then upsert both catalogs transactionally. */
async function upsertCatalogs(
  db: Db,
  resources: ResourceCatalogRow[],
  creatures: CreatureCatalogRow[],
  resourceCounts: Map<number, Record<string, number>>,
  creatureCounts: Map<number, Record<string, number>>,
): Promise<void> {
  const usedResourceSlugs = new Set<string>();
  const resourceRows = resources.map((r) => ({
    ...r,
    slug: makeUniqueSlug(r.name, r.id, usedResourceSlugs),
    spawnCounts: resourceCounts.get(r.id) ?? {},
  }));
  const usedCreatureSlugs = new Set<string>();
  const creatureRows = creatures.map((c) => ({
    ...c,
    slug: makeUniqueSlug(c.name, c.enemyType, usedCreatureSlugs),
    spawnCounts: creatureCounts.get(c.enemyType) ?? {},
  }));

  await db.transaction(async (tx) => {
    await inChunks(resourceRows, CHUNK, (slice) =>
      tx
        .insert(schema.resources)
        .values(slice)
        .onConflictDoUpdate({ target: schema.resources.id, set: conflictUpdateSet(schema.resources, ["id"]) }),
    );
    await inChunks(creatureRows, CHUNK, (slice) =>
      tx
        .insert(schema.creatures)
        .values(slice)
        .onConflictDoUpdate({
          target: schema.creatures.enemyType,
          set: conflictUpdateSet(schema.creatures, ["enemyType"]),
        }),
    );
  });
  console.log(`[resource] upserted ${resourceRows.length} resources, ${creatureRows.length} creatures`);
}

async function main() {
  const stage = process.argv[2] ?? "all";
  const env = parseServerEnv();
  const conn: Conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };
  console.log(`[resource] stage=${stage} regions=[${REGIONS.join(",")}]`);

  if (stage === "catalog" || stage === "all") {
    const db = createDb(env.DATABASE_URL);
    const { resources, creatures } = await pullCatalogs(conn);
    // Spawn counts are produced by the positions/enemies stages (later tasks);
    // the catalog stage leaves them at their default {}.
    await upsertCatalogs(db, resources, creatures, new Map(), new Map());
    console.log(`[resource] stage catalog done.`);
  } else if (stage === "positions" || stage === "enemies" || stage === "roads") {
    throw new Error(`stage "${stage}" implemented in a later task`);
  } else {
    throw new Error(`unknown stage ${stage} (expected catalog | positions | enemies | roads | all)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[resource] FAILED:", e);
  process.exit(1);
});
