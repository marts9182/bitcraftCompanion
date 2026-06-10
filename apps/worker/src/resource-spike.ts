/**
 * Phase A spike (bitjita competitive upgrade): characterize the resource /
 * enemy / paved-tile tables in a bitcraft-live region module.
 *
 * Read-only (SubscribeMulti snapshot, no reducers). Run one stage at a time:
 *   $env:SPACETIME_MODULE='bitcraft-live-7'; pnpm --filter @bcc/worker exec tsx src/resource-spike.ts descs
 *   ... resource-spike.ts join <resourceId>
 *   ... resource-spike.ts paved
 *   ... resource-spike.ts states
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { parseServerEnv } from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";

function summarize(name: string, rows: unknown[]) {
  const bytes = Buffer.byteLength(JSON.stringify(rows));
  console.log(`\n[spike] ${name}: ${rows.length} rows, ${(bytes / 1024).toFixed(1)} KiB JSON`);
  if (rows[0]) console.log(`[spike] sample:`, JSON.stringify(rows[0]).slice(0, 600));
}

async function main() {
  const env = parseServerEnv();
  const stage = process.argv[2] ?? "descs";
  const conn = { uri: env.SPACETIME_URI, moduleName: env.SPACETIME_MODULE, token: env.SPACETIME_TOKEN };
  console.log(`[spike] stage=${stage} module=${env.SPACETIME_MODULE}`);

  if (stage === "descs") {
    const tables = await readSnapshot(
      conn,
      ["SELECT * FROM resource_desc", "SELECT * FROM enemy_desc"],
      ["resource_desc", "enemy_desc"],
      120_000,
    );
    for (const [name, rows] of tables) summarize(name, rows);
    // Show a few named resources to pick a join-test candidate.
    const rd = tables.get("resource_desc") ?? [];
    const named = rd
      .map((r) => r as { id?: number; name?: string; tier?: number; tag?: string })
      .filter((r) => r.name)
      .slice(0, 40);
    console.log("\n[spike] first resources:", named.map((r) => `${r.id}:${r.name}(T${r.tier},${r.tag})`).join(" | "));
  } else if (stage === "join") {
    const id = Number(process.argv[3]);
    if (!Number.isFinite(id)) throw new Error("usage: resource-spike.ts join <resourceId>");
    const q =
      `SELECT location_state.* FROM location_state ` +
      `JOIN resource_state ON location_state.entity_id = resource_state.entity_id ` +
      `WHERE resource_state.resource_id = ${id}`;
    console.log(`[spike] join query: ${q}`);
    const tables = await readSnapshot(conn, [q], ["location_state"], 120_000);
    for (const [name, rows] of tables) summarize(name, rows);
  } else if (stage === "paved") {
    const tables = await readSnapshot(conn, ["SELECT * FROM paved_tile_state"], ["paved_tile_state"], 180_000);
    for (const [name, rows] of tables) summarize(name, rows);
  } else if (stage === "enemies") {
    const tables = await readSnapshot(
      conn,
      [
        "SELECT * FROM enemy_state",
        "SELECT mobile_entity_state.* FROM mobile_entity_state JOIN enemy_state ON mobile_entity_state.entity_id = enemy_state.entity_id",
      ],
      ["enemy_state", "mobile_entity_state"],
      180_000,
    );
    for (const [name, rows] of tables) summarize(name, rows);
  } else if (stage === "paved-join") {
    const q =
      `SELECT location_state.* FROM location_state ` +
      `JOIN paved_tile_state ON location_state.entity_id = paved_tile_state.entity_id`;
    const tables = await readSnapshot(conn, [q], ["location_state"], 300_000);
    for (const [name, rows] of tables) summarize(name, rows);
  } else if (stage === "states") {
    const tables = await readSnapshot(conn, ["SELECT * FROM resource_state"], ["resource_state"], 300_000);
    for (const [name, rows] of tables) summarize(name, rows);
    const rows = (tables.get("resource_state") ?? []) as Array<{ resource_id?: number }>;
    const byId = new Map<number, number>();
    for (const r of rows) byId.set(r.resource_id ?? -1, (byId.get(r.resource_id ?? -1) ?? 0) + 1);
    const top = [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log(`[spike] distinct resource ids: ${byId.size}; top:`, top.map(([k, v]) => `${k}=${v}`).join(", "));
  } else {
    throw new Error(`unknown stage ${stage}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[spike] FAILED:", e);
  process.exit(1);
});
