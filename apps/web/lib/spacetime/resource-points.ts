import "server-only";
import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { extractTableInserts, packPositions } from "@bcc/shared";

const WS_SUBPROTOCOL = "v1.json.spacetimedb";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

/** Exchange the long-lived dev token for the short-lived WS token. */
async function exchangeToken(httpBase: string, token: string): Promise<string> {
  const res = await fetch(`${httpBase}/v1/identity/websocket-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("Token exchange returned no token");
  return body.token;
}

/** Decode one server frame: 1-byte compression tag (0=none, 2=gzip) or raw JSON. */
function decodeFrame(data: Buffer): string {
  const algo = data[0];
  if (algo === 0) return data.subarray(1).toString("utf8");
  if (algo === 2) return gunzipSync(data.subarray(1)).toString("utf8");
  if (algo === 1) throw new Error("Brotli frame; request compression=None");
  return data.toString("utf8");
}

/**
 * One-shot read-only query for a single resource's spawn positions in one
 * region module. Exchanges the token, opens a v1.json WebSocket, sends one
 * SubscribeMulti (single-resource JOIN — the attributable case), collects
 * location_state rows from the SubscribeMultiApplied frame, closes. Returns a
 * flat [x,z,…] small-hex array, OVERWORLD ONLY (packPositions drops dimension
 * != 1) so it matches the worker's catalogued spawnCounts and the map decoder's
 * overworld assumption. Server-only (uses `ws` + node:zlib); never import this
 * from a client component.
 */
export async function fetchResourcePoints(
  region: number,
  resourceId: number,
  timeoutMs = 8000,
): Promise<number[]> {
  const uri = requireEnv("SPACETIME_URI").replace(/\/+$/, "");
  const token = requireEnv("SPACETIME_TOKEN");
  const httpBase = uri.replace(/^ws/, "http");
  const moduleName = `bitcraft-live-${region}`;
  const tempToken = await exchangeToken(httpBase, token);
  const url =
    `${uri}/v1/database/${moduleName}/subscribe` +
    `?token=${encodeURIComponent(tempToken)}&compression=None`;
  const query =
    `SELECT location_state.* FROM location_state ` +
    `JOIN resource_state ON location_state.entity_id = resource_state.entity_id ` +
    `WHERE resource_state.resource_id = ${resourceId}`;

  return new Promise<number[]>((resolve, reject) => {
    const rows: unknown[] = [];
    let settled = false;
    const ws = new WebSocket(url, [WS_SUBPROTOCOL]);
    ws.binaryType = "arraybuffer";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => { ws.terminate(); reject(new Error("resource query timeout")); }),
      timeoutMs,
    );

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          SubscribeMulti: { query_strings: [query], request_id: 1, query_id: { id: 1 } },
        }),
      );
    });

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(decodeFrame(Buffer.from(data as ArrayBuffer)));
      } catch {
        return; // frame decode error (bad compression tag) or malformed JSON — skip frame
      }
      if (msg && typeof msg === "object" && "SubscriptionError" in msg) {
        // Preserve the server's reason — SQL/subscription rejections are otherwise opaque.
        const detail = JSON.stringify((msg as Record<string, unknown>).SubscriptionError).slice(0, 600);
        finish(() => { ws.close(); reject(new Error(`subscription rejected: ${detail}`)); });
        return;
      }
      const tables = extractTableInserts(msg);
      const ls = tables.get("location_state");
      if (ls) {
        for (const row of ls) rows.push(row); // loop, not push(...spread): can be 100k+ rows
        const xz = packPositions(rows as Array<{ x: number; z: number; dimension: number }>);
        finish(() => { ws.close(); resolve(xz); });
      }
    });

    ws.on("close", () => finish(() => reject(new Error("WS closed before data"))));
    ws.on("error", (err) => finish(() => reject(err)));
    ws.on("unexpected-response", (_req, res) =>
      finish(() => reject(new Error(`WS upgrade rejected: ${res.statusCode}`))),
    );
  });
}
