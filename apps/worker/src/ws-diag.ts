import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local") });

import WebSocket from "ws";
import { parseServerEnv } from "@bcc/shared";

/**
 * Connectivity tester for the SpacetimeDB subscribe WebSocket. Exchanges the
 * token, opens a connect-only WS (no subscribe, no reducer), and reports the
 * first server frame or the close code. Use it to retest access — e.g. after a
 * module rename or token refresh:
 *
 *   pnpm --filter @bcc/worker exec tsx src/ws-diag.ts
 *   SPACETIME_MODULE=bitcraft-live-global pnpm --filter @bcc/worker exec tsx src/ws-diag.ts
 *
 * A healthy module replies with an IdentityToken frame within ~1s. A stale/
 * wrong module accepts the upgrade then closes 1006 with no frame. A nonexistent
 * module rejects the upgrade with 404. (BitCraft Early Access 2 modules use the
 * `bitcraft-live-` prefix; the old bitcraft-global/bitcraft-1..9 are EA1.)
 */
async function main() {
  const env = parseServerEnv();

  // Token exchange: long-lived dev token -> short-lived WS token.
  const httpBase = env.SPACETIME_URI.replace(/\/+$/, "").replace(/^ws/, "http");
  const res = await fetch(`${httpBase}/v1/identity/websocket-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SPACETIME_TOKEN}` },
  });
  console.log(`[diag] token exchange: ${res.status} ${res.statusText}`);
  if (!res.ok) process.exit(1);
  const { token } = (await res.json()) as { token: string };

  const base = env.SPACETIME_URI.replace(/\/+$/, "");
  const url = `${base}/v1/database/${env.SPACETIME_MODULE}/subscribe?token=${encodeURIComponent(token)}&compression=None`;
  const startedAt = Date.now();
  const elapsed = () => `${Date.now() - startedAt}ms`;

  console.log(`[diag] module=${env.SPACETIME_MODULE} (connect-only, no subscribe)`);
  await new Promise<void>((done) => {
    const ws = new WebSocket(url, ["v1.bsatn.spacetimedb"]);
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      console.log(`[diag] stayed open ${elapsed()} with NO frame, then giving up`);
      ws.terminate();
      done();
    }, 8000);
    ws.on("open", () => console.log(`[diag] OPEN (${elapsed()}) accepted protocol="${ws.protocol}"`));
    ws.on("message", (data) => {
      const buf = Buffer.from(data as ArrayBuffer);
      console.log(`[diag] FRAME (${elapsed()}): ${buf.length} bytes, tag=${buf[0]} — healthy, server is talking`);
      clearTimeout(timer);
      ws.close();
      done();
    });
    ws.on("close", (code, reason) => {
      console.log(`[diag] CLOSE (${elapsed()}): code ${code}, reason "${reason?.toString() || "(none)"}"`);
      clearTimeout(timer);
      done();
    });
    ws.on("error", (err) => console.log(`[diag] ERROR (${elapsed()}): ${(err as Error).message}`));
    ws.on("unexpected-response", (_req, r) => { console.log(`[diag] UPGRADE REJECTED: ${r.statusCode} ${r.statusMessage}`); clearTimeout(timer); done(); });
  });
  process.exit(0);
}

main().catch((e) => { console.error("[diag] fatal:", e); process.exit(1); });
