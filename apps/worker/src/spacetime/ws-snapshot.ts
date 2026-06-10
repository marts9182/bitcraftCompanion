import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { extractTableInserts, type RawRow } from "@bcc/shared";

export interface SnapshotConfig {
  uri: string; // wss://host
  moduleName: string;
  token: string;
}

const WS_SUBPROTOCOL = "v1.json.spacetimedb";

/**
 * Exchange the long-lived dev token for the short-lived WebSocket token the
 * server expects in the `subscribe` query string. This mirrors the official
 * SDK: POST /v1/identity/websocket-token with `Authorization: Bearer <token>`.
 * The WS upgrade itself then carries NO auth header — only `?token=<temp>`.
 */
async function exchangeToken(config: SnapshotConfig): Promise<string> {
  const base = config.uri.replace(/\/+$/, "").replace(/^ws/, "http");
  const url = `${base}/v1/identity/websocket-token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("Token exchange returned no token");
  return body.token;
}

/**
 * Decode one server frame to its JSON payload string. Binary frames (the bsatn
 * path, and compressed json) are prefixed with a 1-byte compression tag:
 * 0 = none, 1 = brotli (unsupported), 2 = gzip. With the v1.json subprotocol and
 * compression=None the server sends raw JSON text frames with NO prefix, whose
 * first byte is '{' (123) or '[' (91) — never a tag value — so we fall through
 * to treating the whole buffer as text.
 */
function decodeFrame(data: Buffer): string {
  const algo = data[0];
  if (algo === 0) return data.subarray(1).toString("utf8");
  if (algo === 2) return gunzipSync(data.subarray(1)).toString("utf8");
  if (algo === 1) throw new Error("Brotli-compressed frame; request compression=None or Gzip");
  return data.toString("utf8"); // unprefixed JSON text frame
}

/** Coarse tag of a parsed server message, for diagnostics. */
function messageTag(msg: unknown): string {
  if (msg && typeof msg === "object") {
    const keys = Object.keys(msg as Record<string, unknown>);
    if (keys.length > 0) return keys[0]!;
  }
  return "unknown";
}

/**
 * Read-only one-shot snapshot: exchange the token, open a v1.json WebSocket,
 * send a single `SubscribeMulti` for the given SQL queries, collect the rows
 * from the `SubscribeMultiApplied` reply, then close. Never sends a reducer
 * call. Resolves to rows grouped by source table name.
 */
export async function readSnapshot(
  config: SnapshotConfig,
  queries: string[],
  expectedTables: string[],
  timeoutMs = 60_000,
): Promise<Map<string, RawRow[]>> {
  const tempToken = await exchangeToken(config);
  const base = config.uri.replace(/\/+$/, "");
  const url =
    `${base}/v1/database/${config.moduleName}/subscribe` +
    `?token=${encodeURIComponent(tempToken)}&compression=None`;

  return new Promise((resolve, reject) => {
    const acc = new Map<string, RawRow[]>();
    const tagsSeen: string[] = [];
    const startedAt = Date.now();
    const elapsed = () => `${Date.now() - startedAt}ms`;
    let settled = false;

    // Some full-table snapshots (e.g. resource_state) exceed ws's 100 MiB
    // default frame cap; 1 GiB keeps large one-shot pulls working.
    const ws = new WebSocket(url, [WS_SUBPROTOCOL], { maxPayload: 1 << 30 });
    ws.binaryType = "arraybuffer";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        ws.terminate();
        const missing = expectedTables.filter((t) => !acc.has(t));
        reject(
          new Error(
            `Snapshot timed out after ${timeoutMs}ms. Tags seen: [${tagsSeen.join(", ") || "none"}]. ` +
              `Missing tables: ${missing.join(", ") || "none"}.`,
          ),
        );
      });
    }, timeoutMs);

    ws.on("open", () => {
      console.log(`[snapshot] WS open (${elapsed()}); sending SubscribeMulti for ${queries.length} queries`);
      ws.send(
        JSON.stringify({
          SubscribeMulti: { query_strings: queries, request_id: 1, query_id: { id: 1 } },
        }),
      );
    });

    ws.on("message", (data) => {
      let payload: string;
      try {
        payload = decodeFrame(Buffer.from(data as ArrayBuffer));
      } catch (err) {
        console.warn(`[snapshot] frame decode failed (${elapsed()}):`, err);
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(payload);
      } catch {
        console.warn(`[snapshot] non-JSON frame (${elapsed()}): ${payload.slice(0, 120)}`);
        return;
      }
      const tag = messageTag(msg);
      tagsSeen.push(tag);
      console.log(`[snapshot] <- ${tag} (${elapsed()})`);

      if (tag === "SubscriptionError") {
        const detail = JSON.stringify((msg as Record<string, unknown>).SubscriptionError).slice(0, 600);
        finish(() => {
          ws.close();
          reject(new Error(`Subscription rejected by server (${elapsed()}): ${detail}`));
        });
        return;
      }

      const tables = extractTableInserts(msg);
      if (tables.size > 0 && tagsSeen.filter((t) => t === tag).length === 1) {
        // First data-bearing message of this kind: log its row counts.
        for (const [name, rows] of tables) console.log(`[snapshot]    ${name}: +${rows.length}`);
      }
      for (const [name, rows] of tables) {
        const existing = acc.get(name);
        if (existing) existing.push(...rows);
        else acc.set(name, rows);
      }
      if (expectedTables.every((t) => acc.has(t))) {
        finish(() => {
          ws.close();
          resolve(acc);
        });
      }
    });

    ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || "(none)";
      finish(() => {
        reject(
          new Error(
            `WS closed before snapshot complete: code ${code}, reason "${reason}" (${elapsed()}). ` +
              `Tags seen: [${tagsSeen.join(", ") || "none"}].`,
          ),
        );
      });
    });

    ws.on("error", (err) => {
      finish(() => reject(err));
    });

    ws.on("unexpected-response", (_req, res) => {
      finish(() => reject(new Error(`WebSocket upgrade rejected: ${res.statusCode} ${res.statusMessage}`)));
    });
  });
}
