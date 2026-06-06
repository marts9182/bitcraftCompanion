import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { parseServerEnv } from "@bcc/shared";
import { discoverRegionModules } from "./spacetime/discover-regions";
import { readTerrain, TILES_PER_CHUNK_SIDE, type TerrainChunkTiles } from "./spacetime/terrain-reader";

// Per-tile terrain snapshot. Pulls terrain_chunk_state per region and writes ONE
// binary per region (its 32×32-tile-per-chunk biome / water / elevation layers),
// which scripts/render-terrain.py turns into a per-region biome image.
//
// WARNING: terrain is MULTI-GIGABYTE over the wire (~164 MB/region × up to 25
// regions). Run with a raised heap (the package.json script sets
// --max-old-space-size=4096):
//   pnpm --filter @bcc/worker terrain-snapshot
// Limit regions for a quick test:  ... terrain-snapshot --regions=14,7
//
// Each region is pulled on its OWN dedicated WebSocket (maxPayload 1 GiB), written
// to disk, and freed before the next so peak memory stays ~one region.

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.terrain-cache");
const PER_REGION_TIMEOUT = 120_000; // 2 min backstop (real regions reply in seconds; empty ones resolve on the applied frame)
const TILES = TILES_PER_CHUNK_SIDE * TILES_PER_CHUNK_SIDE; // 1024
const REC_BYTES = 8 + TILES + TILES + TILES * 2; // cx,cz int32 + biome + water + elev(int16)

function parseRegionArg(): string[] | null {
  const arg = process.argv.find((a) => a.startsWith("--regions="));
  if (!arg) return null;
  return arg
    .slice("--regions=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? `bitcraft-live-${s}` : s));
}

/** Serialize one region's chunks to a flat binary buffer + compute chunk bounds. */
function encodeRegion(chunks: TerrainChunkTiles[]) {
  let minCx = Infinity, minCz = Infinity, maxCx = -Infinity, maxCz = -Infinity;
  const buf = Buffer.allocUnsafe(chunks.length * REC_BYTES);
  let o = 0;
  for (const c of chunks) {
    if (c.cx < minCx) minCx = c.cx;
    if (c.cz < minCz) minCz = c.cz;
    if (c.cx > maxCx) maxCx = c.cx;
    if (c.cz > maxCz) maxCz = c.cz;
    buf.writeInt32LE(c.cx, o); o += 4;
    buf.writeInt32LE(c.cz, o); o += 4;
    Buffer.from(c.biome.buffer, c.biome.byteOffset, TILES).copy(buf, o); o += TILES;
    Buffer.from(c.water.buffer, c.water.byteOffset, TILES).copy(buf, o); o += TILES;
    Buffer.from(c.elev.buffer, c.elev.byteOffset, TILES * 2).copy(buf, o); o += TILES * 2;
  }
  return { buf, minCx, minCz, maxCx, maxCz };
}

async function main() {
  const env = parseServerEnv();
  const conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };

  const cliRegions = parseRegionArg();
  const envRegions = env.SPACETIME_REGIONS
    ? env.SPACETIME_REGIONS.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  let modules: string[];
  if (cliRegions) {
    modules = cliRegions;
    console.log(`[terrain] regions from --regions: [${modules.join(",")}]`);
  } else if (envRegions) {
    modules = envRegions;
    console.log(`[terrain] regions from SPACETIME_REGIONS: [${modules.join(",")}]`);
  } else {
    const httpBase = env.SPACETIME_URI.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
    modules = await discoverRegionModules(httpBase);
    console.log(`[terrain] discovered ${modules.length} region modules: [${modules.join(",")}]`);
  }
  if (modules.length === 0) {
    console.error("[terrain] no region modules to pull — aborting.");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  // When doing a FULL discovery run, clear stale per-region files first; for a
  // targeted --regions run, leave the others in place.
  if (!cliRegions) {
    for (const f of await readdir(OUT_DIR)) {
      if (/^region-\d+\.(bin|json)$/.test(f)) await unlink(resolve(OUT_DIR, f));
    }
  }

  let written = 0;
  for (const moduleName of modules) {
    const region = moduleName.match(/(\d+)$/)?.[1] ?? moduleName;
    const startedAt = Date.now();
    try {
      const chunks = await readTerrain({ ...conn, moduleName }, PER_REGION_TIMEOUT);
      if (chunks.length === 0) {
        console.warn(`[terrain] region ${region}: 0 overworld chunks — skipping.`);
        continue;
      }
      const { buf, minCx, minCz, maxCx, maxCz } = encodeRegion(chunks);
      await writeFile(resolve(OUT_DIR, `region-${region}.bin`), buf);
      await writeFile(
        resolve(OUT_DIR, `region-${region}.json`),
        JSON.stringify({ region: Number(region), minChunkX: minCx, minChunkZ: minCz, maxChunkX: maxCx, maxChunkZ: maxCz, chunkSize: TILES_PER_CHUNK_SIDE, chunks: chunks.length }),
      );
      written++;
      console.log(
        `[terrain] region ${region}: ${chunks.length} chunks → region-${region}.bin ` +
          `(${(buf.length / 1e6).toFixed(1)} MB, chunk bounds x[${minCx}..${maxCx}] z[${minCz}..${maxCz}]) ` +
          `in ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
    } catch (err) {
      console.warn(`[terrain] region ${region} (${moduleName}) FAILED:`, String(err));
    }
  }

  if (written === 0) {
    console.error("[terrain] no regions written.");
    process.exit(1);
  }
  console.log(`[terrain] wrote ${written} region file(s) → ${OUT_DIR}\n[terrain] next: python scripts/render-terrain.py`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[terrain] fatal:", e);
  process.exit(1);
});
