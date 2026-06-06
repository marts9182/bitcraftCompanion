import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { parseServerEnv } from "@bcc/shared";
import { discoverRegionModules } from "./spacetime/discover-regions";
import { readTerrain } from "./spacetime/terrain-reader";

// Terrain biome snapshot. Pulls terrain_chunk_state per region, reduces each
// overworld chunk to its dominant biome, and writes a COMPACT intermediate that
// scripts/render-terrain.py turns into apps/web/public/map/terrain.webp.
//
// WARNING: terrain is MULTI-GIGABYTE over the wire (~164 MB/region × ~13-25
// regions). This must run with a raised heap:
//   pnpm --filter @bcc/worker terrain-snapshot
// (the package.json script sets --max-old-space-size=4096). Optionally limit
// regions for a quick test:  ... terrain-snapshot --regions=14,7
//
// Each region is pulled on its OWN dedicated WebSocket (maxPayload 1 GiB) and
// fully reduced before the next, so the big frame is GC'd between regions.

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.terrain-cache");
const OUT_FILE = resolve(OUT_DIR, "terrain-biomes.json");
const PER_REGION_TIMEOUT = 600_000; // 10 min — terrain frames are large/slow

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

async function main() {
  const env = parseServerEnv();
  const conn = { uri: env.SPACETIME_URI, token: env.SPACETIME_TOKEN };

  // Region selection priority: --regions CLI arg > SPACETIME_REGIONS env > discovery.
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

  // Dedupe across regions: chunk_index is unique per overworld chunk; later
  // regions overwrite (harmless — overlap regions agree on terrain).
  const chunks = new Map<number, { x: number; z: number; biome: number }>();

  for (const moduleName of modules) {
    const region = moduleName.match(/(\d+)$/)?.[1] ?? moduleName;
    const startedAt = Date.now();
    try {
      const rows = await readTerrain({ ...conn, moduleName }, PER_REGION_TIMEOUT);
      for (const r of rows) chunks.set(r.index, { x: r.x, z: r.z, biome: r.biome });
      console.log(
        `[terrain] region ${region} (${moduleName}): +${rows.length} overworld chunks ` +
          `(total unique ${chunks.size}) in ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
    } catch (err) {
      // One region failing should not lose the rest of the render.
      console.warn(`[terrain] region ${region} (${moduleName}) FAILED:`, String(err));
    }
  }

  if (chunks.size === 0) {
    console.error("[terrain] no chunks collected — not writing an empty intermediate.");
    process.exit(1);
  }

  // Compact intermediate: bounds + a flat [x,z,biome] triple list (no keys).
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const triples: [number, number, number][] = [];
  for (const { x, z, biome } of chunks.values()) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
    triples.push([x, z, biome]);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ minX, minZ, maxX, maxZ, chunks: triples }));
  console.log(
    `[terrain] wrote ${triples.length} chunks → ${OUT_FILE}\n` +
      `[terrain] bounds x[${minX}..${maxX}] z[${minZ}..${maxZ}] ` +
      `(${maxX - minX + 1}×${maxZ - minZ + 1} px)`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[terrain] fatal:", e);
  process.exit(1);
});
