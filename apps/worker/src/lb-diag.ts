// One-off diagnostic: subscribe to a single table to characterize why the large
// player tables don't arrive in the multi-table snapshot. NOT committed long-term.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import { parseServerEnv } from "@bcc/shared";
import { readSnapshot } from "./spacetime/ws-snapshot";

async function main() {
  const env = parseServerEnv();
  const table = process.argv[2] ?? "player_username_state";
  const timeout = Number(process.argv[3] ?? "90000");
  console.log(`[diag] subscribing to ONLY ${table}, timeout ${timeout}ms, module ${env.SPACETIME_MODULE}`);
  try {
    const tables = await readSnapshot(
      { uri: env.SPACETIME_URI, moduleName: env.SPACETIME_MODULE, token: env.SPACETIME_TOKEN },
      [`SELECT * FROM ${table}`],
      [table],
      timeout,
    );
    for (const [name, rows] of tables) console.log(`[diag] ${name}: ${rows.length} rows`);
    const sample = tables.get(table)?.[0];
    if (sample) console.log(`[diag] sample row:`, JSON.stringify(sample).slice(0, 200));
  } catch (err) {
    console.error(`[diag] FAILED:`, String(err));
  }
  process.exit(0);
}
main();
