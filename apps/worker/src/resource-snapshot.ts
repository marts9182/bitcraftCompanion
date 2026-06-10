/**
 * Resource/creature snapshot (bitjita parity): manual job that pulls the
 * resource & enemy catalogs from a bitcraft-live region module and upserts
 * them into Postgres. The positions stage scans every region in REGIONS and
 * emits static per-resource JSON under OUT_DATA (batch-safe: set
 * RESOURCE_REGIONS to run a subset without clobbering other regions' output).
 * Later stages (enemies, roads) follow in subsequent tasks.
 *
 * Read-only (SubscribeMulti snapshot, no reducers). Run one stage at a time:
 *   pnpm --filter @bcc/worker resource-snapshot catalog
 *   pnpm --filter @bcc/worker resource-snapshot positions
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  parseServerEnv,
  createDb,
  schema,
  mapResourceDescRow,
  mapEnemyDescRow,
  makeUniqueSlug,
  packPositions,
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

// ---------------------------------------------------------------------------
// Stage: positions — per-region resource position export to static JSON.
// ---------------------------------------------------------------------------

// Restricts the location pull to resource entities. Rows from multiple join
// queries in ONE SubscribeMulti merge unattributably, so each region does two
// full pulls (resource_state, then this join) and joins them in memory.
const RESOURCE_LOCATION_SQL =
  "SELECT location_state.* FROM location_state JOIN resource_state ON location_state.entity_id = resource_state.entity_id";

const SNAPSHOT_TIMEOUT_MS = 300_000;

interface ResourceIndex {
  v: 1;
  regions: number[];
  /** counts["<resourceId>"]["<region>"] = overworld spawn count. */
  counts: Record<string, Record<string, number>>;
}

/**
 * Pull every resource position in one region and write one packed JSON file
 * per resource id under OUT_DATA/resources/r{region}/. Records overworld
 * spawn counts into `counts` (keyed resourceId → { region: count }).
 *
 * Memory: ~650 MiB of snapshot JSON per region, so regions run strictly
 * sequentially and every large structure is dropped before the next pull.
 */
async function exportRegionPositions(
  conn: Conn,
  region: number,
  counts: Map<number, Record<string, number>>,
): Promise<void> {
  const moduleName = regionModule(region);

  // Pull 1: all resource instances → entity id → resource id. Entity ids are
  // u64 snowflakes above 2^53 and MUST stay strings (never Number()).
  console.log(`[resource] region ${region}: pulling resource_state from ${moduleName} …`);
  let snap = await readSnapshot(
    { ...conn, moduleName },
    ["SELECT * FROM resource_state"],
    ["resource_state"],
    SNAPSHOT_TIMEOUT_MS,
  );
  const resourceByEntity = new Map<string, number>();
  for (const raw of snap.get("resource_state") ?? []) {
    const row = raw as { entity_id: string | number; resource_id: number };
    resourceByEntity.set(String(row.entity_id), row.resource_id);
  }
  snap.clear();
  console.log(`[resource] region ${region}: ${resourceByEntity.size} resource instances`);

  // Pull 2: their locations, bucketed by resource id via the entity map.
  console.log(`[resource] region ${region}: pulling resource locations …`);
  snap = await readSnapshot({ ...conn, moduleName }, [RESOURCE_LOCATION_SQL], ["location_state"], SNAPSHOT_TIMEOUT_MS);
  const locationsByResource = new Map<number, Array<{ x: number; z: number; dimension: number }>>();
  for (const raw of snap.get("location_state") ?? []) {
    const row = raw as { entity_id: string | number; x: number; z: number; dimension: number };
    const resourceId = resourceByEntity.get(String(row.entity_id));
    if (resourceId === undefined) continue;
    let bucket = locationsByResource.get(resourceId);
    if (!bucket) locationsByResource.set(resourceId, (bucket = []));
    bucket.push({ x: row.x, z: row.z, dimension: row.dimension });
  }
  snap.clear();
  resourceByEntity.clear();

  // Write one file per resource. The fresh scan is authoritative for this
  // region, so recreate the directory (drops files for despawned resources).
  const dir = resolve(OUT_DATA, `resources/r${region}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let files = 0;
  for (const [id, rows] of locationsByResource) {
    const xz = packPositions(rows); // overworld (dimension 1) only
    if (xz.length === 0) continue;
    const count = xz.length / 2;
    await writeFile(resolve(dir, `${id}.json`), JSON.stringify({ v: 1, id, region, count, xz }));
    const perRegion = counts.get(id) ?? {};
    perRegion[String(region)] = count;
    counts.set(id, perRegion);
    files++;
  }
  console.log(`[resource] region ${region}: wrote ${files} resource files`);
}

/**
 * Merge this run's counts into OUT_DATA/resources/index.json. The full
 * 9-region run takes >10 min, so operators run batches (RESOURCE_REGIONS=7,8,9
 * …); each batch must not clobber earlier ones. Regions scanned in THIS run
 * are authoritative (their old entries are replaced wholesale); all other
 * regions' entries are preserved. Returns the merged counts map.
 */
async function mergeResourceIndex(
  newCounts: Map<number, Record<string, number>>,
): Promise<Map<number, Record<string, number>>> {
  const indexPath = resolve(OUT_DATA, "resources/index.json");
  let existing: ResourceIndex | undefined;
  try {
    existing = JSON.parse(await readFile(indexPath, "utf8")) as ResourceIndex;
  } catch {
    // first batch: no index on disk yet
  }

  const merged = new Map<number, Record<string, number>>();
  const rescanned = new Set(REGIONS.map(String));
  for (const [idStr, perRegion] of Object.entries(existing?.counts ?? {})) {
    const kept = Object.fromEntries(Object.entries(perRegion).filter(([region]) => !rescanned.has(region)));
    if (Object.keys(kept).length > 0) merged.set(Number(idStr), kept);
  }
  for (const [id, perRegion] of newCounts) {
    merged.set(id, { ...merged.get(id), ...perRegion });
  }

  const regions = [...new Set([...(existing?.regions ?? []), ...REGIONS])].sort((a, b) => a - b);
  const counts: ResourceIndex["counts"] = {};
  for (const id of [...merged.keys()].sort((a, b) => a - b)) counts[String(id)] = merged.get(id)!;
  const index: ResourceIndex = { v: 1, regions, counts };
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index));
  console.log(`[resource] index.json merged: ${regions.length} regions, ${merged.size} resources`);
  return merged;
}

/**
 * Stage `positions`: export packed resource positions for every region in
 * REGIONS, then merge spawn counts into the batch-safe index.json. Returns the
 * MERGED counts (complete spawnCounts for catalog upserts even on batch runs).
 * A region that fails (connection error etc.) is retried once.
 */
async function exportResourcePositions(conn: Conn): Promise<Map<number, Record<string, number>>> {
  const counts = new Map<number, Record<string, number>>();
  for (const region of REGIONS) {
    try {
      await exportRegionPositions(conn, region, counts);
    } catch (err) {
      console.warn(`[resource] region ${region} failed, retrying once:`, err);
      await exportRegionPositions(conn, region, counts);
    }
  }
  return mergeResourceIndex(counts);
}

async function main() {
  const stage = process.argv[2] ?? "all";
  const env = parseServerEnv();
  const conn: Conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };
  console.log(`[resource] stage=${stage} regions=[${REGIONS.join(",")}]`);

  if (stage === "catalog") {
    const db = createDb(env.DATABASE_URL);
    const { resources, creatures } = await pullCatalogs(conn);
    // Spawn counts are produced by the positions/enemies stages; the catalog
    // stage leaves them at their default {}.
    await upsertCatalogs(db, resources, creatures, new Map(), new Map());
    console.log(`[resource] stage catalog done.`);
  } else if (stage === "positions") {
    await exportResourcePositions(conn);
    console.log(`[resource] stage positions done.`);
  } else if (stage === "all") {
    console.log(`[resource] note: enemies/roads stages are not yet implemented; "all" runs catalog + positions.`);
    const db = createDb(env.DATABASE_URL);
    const { resources, creatures } = await pullCatalogs(conn);
    const resourceCounts = await exportResourcePositions(conn);
    // creatureCounts stays empty until the enemies stage lands (Task 5).
    await upsertCatalogs(db, resources, creatures, resourceCounts, new Map());
    console.log(`[resource] stage all done (catalog + positions).`);
  } else if (stage === "enemies" || stage === "roads") {
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
