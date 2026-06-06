// Spike: derive the chunk_index <-> (chunk_x, chunk_z) packing + chunk size, by
// correlating mobile_entity_state (has chunk_index AND location_x/z) and reading
// world_region_state. One-off; not committed.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });
import { parseServerEnv } from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";

async function main() {
  const env = parseServerEnv();
  const conn = { uri: env.SPACETIME_URI, moduleName: process.env.SPACETIME_MODULE ?? "bitcraft-live-14", token: env.SPACETIME_TOKEN };
  const tables = await readSnapshot(conn, ["SELECT * FROM mobile_entity_state", "SELECT * FROM world_region_state"], ["mobile_entity_state"], 60000);
  const region = (tables.get("world_region_state") ?? [])[0] as any;
  console.log("world_region_state:", JSON.stringify(region));
  const rows = (tables.get("mobile_entity_state") ?? []) as any[];
  const pts = rows
    .map((r) => ({ ci: Number(r.chunk_index), x: Number(r.location_x), z: Number(r.location_z), d: Number(r.dimension) }))
    .filter((p) => Number.isFinite(p.ci) && Number.isFinite(p.x) && Number.isFinite(p.z) && p.d === 1);
  console.log("dim=1 samples:", pts.length, "| first 3:", JSON.stringify(pts.slice(0, 3)));
  const xmin = Math.min(...pts.map((p) => p.x)), xmax = Math.max(...pts.map((p) => p.x));
  const zmin = Math.min(...pts.map((p) => p.z)), zmax = Math.max(...pts.map((p) => p.z));
  console.log(`dim=1 ranges: x[${xmin}..${xmax}] z[${zmin}..${zmax}] ci[${Math.min(...pts.map(p=>p.ci))}..${Math.max(...pts.map(p=>p.ci))}]`);

  // Region 14 occupies chunk_x [240,320), chunk_z [160,240). So S (units/chunk) satisfies
  // xmin/S >= 240 and xmax/S < 320  →  S in [xmax/320, xmin/240]. Likewise for z.
  const sLoX = xmax / 320, sHiX = xmin / 240, sLoZ = zmax / 240, sHiZ = zmin / 160;
  const sLo = Math.ceil(Math.max(sLoX, sLoZ)), sHi = Math.floor(Math.min(sHiX, sHiZ));
  console.log(`S range from region bounds: [${sLo}..${sHi}] (x:${sLoX.toFixed(0)}-${sHiX.toFixed(0)} z:${sLoZ.toFixed(0)}-${sHiZ.toFixed(0)})`);

  function solve(major: "z" | "x") {
    for (let S = Math.max(1, sLo); S <= sHi; S++) {
      // derive STRIDE per point, require all equal + integer + formula holds for ALL
      const strideOf = (p: any) => {
        const cx = Math.floor(p.x / S), cz = Math.floor(p.z / S);
        if (major === "z") { if (cz === 0) return null; const r = p.ci - cx; return r % cz === 0 ? r / cz : null; }
        else { if (cx === 0) return null; const r = p.ci - cz; return r % cx === 0 ? r / cx : null; }
      };
      const samp = pts.slice(0, 60).map(strideOf).filter((v): v is number => v != null);
      if (samp.length < 20) continue;
      const STRIDE = samp[0]!;
      if (!samp.every((v) => v === STRIDE)) continue;
      const good = pts.every((p) => {
        const cx = Math.floor(p.x / S), cz = Math.floor(p.z / S);
        return (major === "z" ? cz * STRIDE + cx : cx * STRIDE + cz) === p.ci;
      });
      if (good) return { S, STRIDE, major };
    }
    return null;
  }
  console.log("BEST:", JSON.stringify(solve("z") ?? solve("x")));
  process.exit(0);
}
main();
