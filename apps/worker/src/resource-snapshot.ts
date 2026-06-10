/**
 * Resource/creature snapshot (bitjita parity): manual job that pulls the
 * resource & enemy catalogs from a bitcraft-live region module and upserts
 * them into Postgres. The positions stage scans every region in REGIONS and
 * emits static per-resource JSON under OUT_DATA; the enemies stage emits
 * per-region enemy positions under OUT_PUBLIC/enemies; the roads stage
 * rasterizes paved tiles into PNG overlays under OUT_PUBLIC/roads. All three
 * are batch-safe: set RESOURCE_REGIONS to run a subset without clobbering
 * other regions' output.
 *
 * Read-only (SubscribeMulti snapshot, no reducers). Run one stage at a time:
 *   pnpm --filter @bcc/worker resource-snapshot catalog
 *   pnpm --filter @bcc/worker resource-snapshot positions
 *   pnpm --filter @bcc/worker resource-snapshot enemies
 *   pnpm --filter @bcc/worker resource-snapshot roads
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  parseServerEnv,
  createDb,
  schema,
  mapResourceDescRow,
  mapEnemyDescRow,
  makeUniqueSlug,
  packPositions,
  packMobilePositions,
  type ResourceCatalogRow,
  type CreatureCatalogRow,
} from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";
import { rasterizeRoads, encodePng } from "./roads-png";
import { sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

// Regions to scan in the position/enemy/road stages. Desc tables are identical
// across regions, so catalog pulls only hit the FIRST region in the list.
const REGIONS = (process.env.RESOURCE_REGIONS ?? "7,8,9,12,13,14,17,18,19")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
if (REGIONS.length === 0) {
  // Guard: a malformed RESOURCE_REGIONS would otherwise no-op every stage and exit 0 (a green CI run that produced nothing).
  throw new Error(`RESOURCE_REGIONS resolved to an empty region list: "${process.env.RESOURCE_REGIONS}"`);
}
const regionModule = (r: number) => `bitcraft-live-${r}`;

// Static map-data outputs (used by the positions/enemies/roads stages).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT_DATA = resolve(REPO_ROOT, "apps/worker/out/map-data");
export const OUT_PUBLIC = resolve(REPO_ROOT, "apps/web/public/map");

const CHUNK = 200;

/** Pause before the single per-region retry — most WS failures are transient. */
const RETRY_DELAY_MS = 3_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

// ---------------------------------------------------------------------------
// Batch-safe index files (shared by the resources and enemies stages, and the
// roads manifest). Regions rescanned in THIS run are authoritative; all other
// regions' entries are preserved so RESOURCE_REGIONS batches never clobber
// each other.
// ---------------------------------------------------------------------------

/**
 * Read+parse a JSON index. A missing file is fine (first batch → undefined);
 * CORRUPT JSON aborts the run loudly — silently starting fresh would clobber
 * every prior batch on the next write.
 */
async function readIndexFile<T>(path: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[resource] CORRUPT index JSON at ${path} — aborting instead of clobbering prior batches.`);
    throw err;
  }
}

/** Atomic index write: write `.tmp` in the same directory, then rename over. */
async function writeIndexFile(path: string, json: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, json);
  await rename(tmp, path);
}

interface CountIndex {
  v: 1;
  regions: number[];
  /** counts["<id>"]["<region>"] = overworld spawn count. */
  counts: Record<string, Record<string, number>>;
}

/**
 * Merge per-region counts (keyed id → { region: count }) into the index file
 * at `indexPath`. Called after EACH region completes so a mid-run failure
 * never desyncs the index from the per-region files already written.
 * Returns the MERGED counts map (complete spawnCounts even on batch runs).
 */
async function mergeIndexFile(
  indexPath: string,
  rescannedRegions: number[],
  newCounts: Map<number, Record<string, number>>,
): Promise<Map<number, Record<string, number>>> {
  const existing = await readIndexFile<CountIndex>(indexPath);

  const merged = new Map<number, Record<string, number>>();
  const rescanned = new Set(rescannedRegions.map(String));
  for (const [idStr, perRegion] of Object.entries(existing?.counts ?? {})) {
    const kept = Object.fromEntries(Object.entries(perRegion).filter(([region]) => !rescanned.has(region)));
    if (Object.keys(kept).length > 0) merged.set(Number(idStr), kept);
  }
  for (const [id, perRegion] of newCounts) {
    merged.set(id, { ...merged.get(id), ...perRegion });
  }

  const regions = [...new Set([...(existing?.regions ?? []), ...rescannedRegions])].sort((a, b) => a - b);
  const counts: CountIndex["counts"] = {};
  for (const id of [...merged.keys()].sort((a, b) => a - b)) counts[String(id)] = merged.get(id)!;
  await writeIndexFile(indexPath, JSON.stringify({ v: 1, regions, counts } satisfies CountIndex));
  console.log(`[resource] index merged (${indexPath}): ${regions.length} regions, ${merged.size} ids`);
  return merged;
}

/**
 * Pull every resource position in one region and write one packed JSON file
 * per resource id under OUT_DATA/resources/r{region}/. Returns this region's
 * overworld spawn counts (keyed resourceId → { region: count }) — region-local
 * so a retried region always starts from a clean map.
 *
 * Memory: ~650 MiB of snapshot JSON per region, so regions run strictly
 * sequentially and every large structure is dropped before the next pull.
 */
async function exportRegionPositions(conn: Conn, region: number): Promise<Map<number, Record<string, number>>> {
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
  const counts = new Map<number, Record<string, number>>();
  let files = 0;
  for (const [id, rows] of locationsByResource) {
    const xz = packPositions(rows); // overworld (dimension 1) only
    if (xz.length === 0) continue;
    const count = xz.length / 2;
    await writeFile(resolve(dir, `${id}.json`), JSON.stringify({ v: 1, id, region, count, xz }));
    counts.set(id, { [String(region)]: count });
    files++;
  }
  console.log(`[resource] region ${region}: wrote ${files} resource files`);
  return counts;
}

/**
 * Stage `positions`: export packed resource positions for every region in
 * REGIONS, merging spawn counts into the batch-safe index.json after EACH
 * region. Returns the MERGED counts (complete spawnCounts for catalog upserts
 * even on batch runs). A region that fails (connection error etc.) is retried
 * once after a short pause.
 */
async function exportResourcePositions(conn: Conn): Promise<Map<number, Record<string, number>>> {
  const indexPath = resolve(OUT_DATA, "resources/index.json");
  let merged = new Map<number, Record<string, number>>();
  for (const region of REGIONS) {
    let counts: Map<number, Record<string, number>>;
    try {
      counts = await exportRegionPositions(conn, region);
    } catch (err) {
      console.warn(`[resource] region ${region} failed, retrying once in ${RETRY_DELAY_MS}ms:`, err);
      await sleep(RETRY_DELAY_MS);
      counts = await exportRegionPositions(conn, region);
    }
    merged = await mergeIndexFile(indexPath, [region], counts);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Stage: enemies — per-region enemy position export to static JSON.
// ---------------------------------------------------------------------------

// Restricts the mobile-entity pull to enemies. enemy_state and
// mobile_entity_state are DIFFERENT tables, so both queries can share one
// SubscribeMulti (only join queries on the SAME table merge unattributably).
const ENEMY_MOBILE_SQL =
  "SELECT mobile_entity_state.* FROM mobile_entity_state JOIN enemy_state ON mobile_entity_state.entity_id = enemy_state.entity_id";

/**
 * Pull every enemy in one region and write OUT_PUBLIC/enemies/r{region}.json
 * ({ v, region, types: { enemyType: [x,z,…] } }, small-hex overworld coords).
 * Returns this region's spawn counts (enemyType → { region: count }).
 */
async function exportRegionEnemies(conn: Conn, region: number): Promise<Map<number, Record<string, number>>> {
  const moduleName = regionModule(region);
  console.log(`[resource] region ${region}: pulling enemy_state + enemy positions from ${moduleName} …`);
  const snap = await readSnapshot(
    { ...conn, moduleName },
    ["SELECT * FROM enemy_state", ENEMY_MOBILE_SQL],
    ["enemy_state", "mobile_entity_state"],
    180_000,
  );

  // enemy_type is a tagged enum encoded [variantIdx, {}]; the variant index
  // equals enemy_desc.enemy_type (the creatures-catalog PK).
  const typeByEntity = new Map<string, number>();
  for (const raw of snap.get("enemy_state") ?? []) {
    const row = raw as { entity_id: string | number; enemy_type: unknown };
    const v = row.enemy_type;
    if (Array.isArray(v) && typeof v[0] === "number") typeByEntity.set(String(row.entity_id), v[0]);
  }

  const mobileRows = (snap.get("mobile_entity_state") ?? []) as Array<{
    entity_id: string | number;
    location_x: number;
    location_z: number;
    dimension: number;
  }>;
  const types = packMobilePositions(mobileRows, typeByEntity); // milli → small-hex, overworld only
  snap.clear();

  const dir = resolve(OUT_PUBLIC, "enemies");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, `r${region}.json`), JSON.stringify({ v: 1, region, types }));

  const counts = new Map<number, Record<string, number>>();
  let total = 0;
  for (const [typeStr, xz] of Object.entries(types)) {
    counts.set(Number(typeStr), { [String(region)]: xz.length / 2 });
    total += xz.length / 2;
  }
  console.log(`[resource] region ${region}: wrote enemies/r${region}.json (${counts.size} types, ${total} enemies)`);
  return counts;
}

/**
 * Stage `enemies`: export enemy positions for every region in REGIONS, merging
 * spawn counts into the batch-safe OUT_PUBLIC/enemies/index.json after each
 * region. Returns the MERGED counts (complete creature spawnCounts for catalog
 * upserts even on batch runs).
 */
async function exportEnemies(conn: Conn): Promise<Map<number, Record<string, number>>> {
  const indexPath = resolve(OUT_PUBLIC, "enemies/index.json");
  let merged = new Map<number, Record<string, number>>();
  for (const region of REGIONS) {
    let counts: Map<number, Record<string, number>>;
    try {
      counts = await exportRegionEnemies(conn, region);
    } catch (err) {
      console.warn(`[resource] region ${region} enemies failed, retrying once in ${RETRY_DELAY_MS}ms:`, err);
      await sleep(RETRY_DELAY_MS);
      counts = await exportRegionEnemies(conn, region);
    }
    merged = await mergeIndexFile(indexPath, [region], counts);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Stage: roads — per-region paved-tile rasters as PNG map overlays.
// ---------------------------------------------------------------------------

const ROAD_LOCATION_SQL =
  "SELECT location_state.* FROM location_state JOIN paved_tile_state ON location_state.entity_id = paved_tile_state.entity_id";

interface RoadManifestEntry {
  region: number;
  url: string;
  /** Chunk-coordinate bounds of the PNG (min inclusive, max exclusive). */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface RoadManifest {
  v: 1;
  regions: RoadManifestEntry[];
}

/**
 * Pull every paved tile in one region (~501k rows / ~44 MiB on r7), rasterize
 * north-up, and write OUT_PUBLIC/roads/r{region}.png. Returns the manifest
 * entry, or null if the region has no roads.
 */
async function exportRegionRoads(conn: Conn, region: number): Promise<RoadManifestEntry | null> {
  const moduleName = regionModule(region);
  console.log(`[resource] region ${region}: pulling paved tile locations from ${moduleName} …`);
  const snap = await readSnapshot({ ...conn, moduleName }, [ROAD_LOCATION_SQL], ["location_state"], SNAPSHOT_TIMEOUT_MS);
  const rows = (snap.get("location_state") ?? []) as Array<{ x: number; z: number; dimension: number }>;
  const xz = packPositions(rows); // overworld (dimension 1) only
  snap.clear();

  const raster = rasterizeRoads(xz);
  if (!raster) {
    console.log(`[resource] region ${region}: no roads`);
    return null;
  }
  const dir = resolve(OUT_PUBLIC, "roads");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, `r${region}.png`), encodePng(raster));
  console.log(
    `[resource] region ${region}: wrote roads/r${region}.png ` +
      `(${raster.width}x${raster.height}px, ${xz.length / 2} paved tiles)`,
  );
  return {
    region,
    url: `/map/roads/r${region}.png`,
    minX: raster.minChunkX,
    minZ: raster.minChunkZ,
    maxX: raster.maxChunkX,
    maxZ: raster.maxChunkZ,
  };
}

/**
 * Merge one region's manifest entry into OUT_PUBLIC/roads/roads.json (same
 * batch-safe semantics as the count indexes: the rescanned region's old entry
 * is replaced — or dropped if it now has no roads — others are preserved).
 */
async function mergeRoadsManifest(region: number, entry: RoadManifestEntry | null): Promise<void> {
  const manifestPath = resolve(OUT_PUBLIC, "roads/roads.json");
  const existing = await readIndexFile<RoadManifest>(manifestPath);
  const entries = (existing?.regions ?? []).filter((e) => e.region !== region);
  if (entry) entries.push(entry);
  entries.sort((a, b) => a.region - b.region);
  await writeIndexFile(manifestPath, JSON.stringify({ v: 1, regions: entries } satisfies RoadManifest));
  console.log(`[resource] roads.json merged: ${entries.length} regions`);
}

/** Stage `roads`: export the road overlay PNG + manifest for every region. */
async function exportRoads(conn: Conn): Promise<void> {
  for (const region of REGIONS) {
    let entry: RoadManifestEntry | null;
    try {
      entry = await exportRegionRoads(conn, region);
    } catch (err) {
      console.warn(`[resource] region ${region} roads failed, retrying once in ${RETRY_DELAY_MS}ms:`, err);
      await sleep(RETRY_DELAY_MS);
      entry = await exportRegionRoads(conn, region);
    }
    await mergeRoadsManifest(region, entry);
  }
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
  } else if (stage === "enemies") {
    await exportEnemies(conn);
    console.log(`[resource] stage enemies done.`);
  } else if (stage === "roads") {
    await exportRoads(conn);
    console.log(`[resource] stage roads done.`);
  } else if (stage === "all") {
    const db = createDb(env.DATABASE_URL);
    const { resources, creatures } = await pullCatalogs(conn);
    const resourceCounts = await exportResourcePositions(conn);
    const creatureCounts = await exportEnemies(conn);
    await exportRoads(conn);
    await upsertCatalogs(db, resources, creatures, resourceCounts, creatureCounts);
    console.log(`[resource] stage all done.`);
  } else {
    throw new Error(`unknown stage ${stage} (expected catalog | positions | enemies | roads | all)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[resource] FAILED:", e);
  process.exit(1);
});
