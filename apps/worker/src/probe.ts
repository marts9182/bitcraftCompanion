/**
 * Read-only connection probe (Phase 0 spike, Task 8).
 *
 * Proves we can reach BitCraft's SpacetimeDB and authenticate, and captures the
 * real schema + a few sample rows to drive the Phase 1 Compendium plan.
 *
 * Uses ONLY read-only HTTP endpoints (schema + SQL SELECT). It never calls a
 * reducer and cannot affect the live game. Run with: pnpm --filter @bcc/worker probe
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

const uri = process.env.SPACETIME_URI ?? "";
const moduleName = process.env.SPACETIME_MODULE ?? "";
const token = process.env.SPACETIME_TOKEN ?? "";

if (!uri || !moduleName || !token) {
  console.error("[probe] Missing SPACETIME_URI, SPACETIME_MODULE, or SPACETIME_TOKEN in .env.local");
  process.exit(1);
}

// HTTP base: wss:// -> https://, ws:// -> http://
const httpBase = uri.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
const authHeaders = { Authorization: `Bearer ${token}` };

async function main() {
  console.log(`[probe] host=${httpBase}  module=${moduleName}`);

  // 1) Schema (no auth required) — proves connectivity and lists tables.
  const schemaUrl = `${httpBase}/v1/database/${moduleName}/schema?version=9`;
  const sres = await fetch(schemaUrl);
  console.log(`[probe] GET schema -> ${sres.status} ${sres.statusText}`);
  let tableNames: string[] = [];
  if (sres.ok) {
    const schema = (await sres.json()) as { tables?: Array<{ name?: unknown }> };
    tableNames = (schema.tables ?? [])
      .map((t) => (typeof t.name === "string" ? t.name : JSON.stringify(t.name)))
      .filter(Boolean);
    console.log(`[probe] module has ${tableNames.length} tables.`);
    const interesting = tableNames.filter((n) => /item|cargo|recipe|building|resource|skill|desc/i.test(n));
    console.log(`[probe] compendium-looking tables (${interesting.length}):`);
    console.log("  " + interesting.slice(0, 80).join(", "));
  } else {
    console.log("[probe] schema error body:", (await sres.text()).slice(0, 600));
  }

  // 2) Read-only SQL (uses Bearer token) — proves auth and shows a real row shape.
  const candidate = tableNames.includes("item_desc")
    ? "item_desc"
    : tableNames.find((n) => /item.*desc|item_desc|^item/i.test(n)) ?? tableNames[0];

  if (!candidate) {
    console.log("[probe] no tables to sample; stopping.");
    return;
  }

  const sql = `SELECT * FROM ${candidate} LIMIT 2`;
  const qres = await fetch(`${httpBase}/v1/database/${moduleName}/sql`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "text/plain" },
    body: sql,
  });
  console.log(`[probe] POST sql "${sql}" -> ${qres.status} ${qres.statusText}`);
  const text = await qres.text();
  if (!qres.ok) {
    console.log("[probe] sql error body:", text.slice(0, 800));
    return;
  }
  try {
    const parsed = JSON.parse(text) as Array<{ schema?: unknown; rows?: unknown[] }>;
    const first = parsed[0];
    const cols = (first?.schema as { elements?: Array<{ name?: { some?: string } | string }> } | undefined)?.elements;
    if (cols) {
      const colNames = cols.map((c) => {
        const n = c.name as { some?: string } | string | undefined;
        return typeof n === "string" ? n : n?.some ?? "?";
      });
      console.log(`[probe] '${candidate}' columns (${colNames.length}):`);
      console.log("  " + colNames.join(", "));
    }
    console.log(`[probe] sample rows from '${candidate}':`);
    console.log(JSON.stringify(first?.rows?.slice(0, 2), null, 2).slice(0, 2000));
  } catch {
    console.log("[probe] sql raw body (first 1500 chars):\n", text.slice(0, 1500));
  }

  console.log("\n[probe] SUCCESS — read-only connection to the live game confirmed (no reducers called).");
}

main().catch((e) => {
  console.error("[probe] error:", e);
  process.exit(1);
});
