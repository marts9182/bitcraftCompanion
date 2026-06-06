import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { dominantBiome, normalizeRow, COLUMN_ORDERS } from "@bcc/shared";

// Focused, streaming terrain reader. This intentionally COPIES the proven connect
// recipe from ./ws-snapshot.ts (token exchange → v1.json WS → SubscribeMulti →
// InitialSubscription/SubscribeMultiApplied → 1-byte compression prefix) — see
// ws-snapshot.ts as the source of truth for that handshake. It differs in two
// ways that matter for terrain and would destabilise the leaderboard path if
// retrofitted there:
//   1. maxPayload is raised to 1 GiB (terrain frames exceed ws's 100 MiB default).
//   2. Rows are reduced to {x,z,biome} as each frame arrives and the heavy
//      biome/elevation/water arrays are dropped immediately, so the multi-GB
//      payload is never retained whole.

const WS_SUBPROTOCOL = "v1.json.spacetimedb";
const MAX_PAYLOAD = 1024 * 1024 * 1024; // 1 GiB
const TERRAIN_COLS = COLUMN_ORDERS.terrain_chunk_state ?? [];

export interface TerrainReaderConfig {
  uri: string; // wss://host
  moduleName: string;
  token: string;
}

export interface TerrainChunk {
  index: number;
  x: number;
  z: number;
  biome: number;
}

// dominantBiome is imported from @bcc/shared (pure + unit-tested there) so the
// reduction logic can't drift between the pull script and its tests.

async function exchangeToken(config: TerrainReaderConfig): Promise<string> {
  const base = config.uri.replace(/\/+$/, "").replace(/^ws/, "http");
  const res = await fetch(`${base}/v1/identity/websocket-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("Token exchange returned no token");
  return body.token;
}

function decodeFrame(data: Buffer): string {
  const algo = data[0];
  if (algo === 0) return data.subarray(1).toString("utf8");
  if (algo === 2) return gunzipSync(data.subarray(1)).toString("utf8");
  if (algo === 1) throw new Error("Brotli-compressed frame; request compression=None or Gzip");
  return data.toString("utf8");
}

/** Pull `tables` out of an InitialSubscription / SubscribeMultiApplied message. */
function tablesOf(msg: unknown): Array<{ table_name?: string; updates?: Array<{ inserts?: string[] }> }> {
  const m = msg as {
    InitialSubscription?: { database_update?: { tables?: unknown } };
    SubscribeMultiApplied?: { update?: { tables?: unknown } };
  };
  const tables = m?.InitialSubscription?.database_update?.tables ?? m?.SubscribeMultiApplied?.update?.tables;
  return Array.isArray(tables) ? (tables as Array<{ table_name?: string; updates?: Array<{ inserts?: string[] }> }>) : [];
}

/**
 * Read one region's terrain_chunk_state, reducing each overworld chunk
 * (dimension==1) to its dominant biome. Each frame is processed and discarded as
 * it arrives, so memory stays bounded by the result map, not the payload.
 * Resolves to the reduced chunks once the subscription is applied.
 */
export async function readTerrain(
  config: TerrainReaderConfig,
  timeoutMs = 600_000,
): Promise<TerrainChunk[]> {
  const tempToken = await exchangeToken(config);
  const base = config.uri.replace(/\/+$/, "");
  const url =
    `${base}/v1/database/${config.moduleName}/subscribe` +
    `?token=${encodeURIComponent(tempToken)}&compression=None`;

  return new Promise((resolve, reject) => {
    const out: TerrainChunk[] = [];
    let seenTerrainFrame = false;
    let settled = false;
    const startedAt = Date.now();
    const elapsed = () => `${Date.now() - startedAt}ms`;

    const ws = new WebSocket(url, [WS_SUBPROTOCOL], { maxPayload: MAX_PAYLOAD });
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
        reject(new Error(`Terrain read timed out after ${timeoutMs}ms (${config.moduleName}); chunks so far=${out.length}`));
      });
    }, timeoutMs);

    ws.on("open", () => {
      console.log(`[terrain] WS open ${config.moduleName} (${elapsed()}); subscribing terrain_chunk_state`);
      ws.send(
        JSON.stringify({
          SubscribeMulti: { query_strings: ["SELECT * FROM terrain_chunk_state"], request_id: 1, query_id: { id: 1 } },
        }),
      );
    });

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(decodeFrame(Buffer.from(data as ArrayBuffer)));
      } catch (err) {
        console.warn(`[terrain] frame decode/parse failed (${elapsed()}):`, err);
        return;
      }
      for (const table of tablesOf(msg)) {
        if (table.table_name !== "terrain_chunk_state") continue;
        seenTerrainFrame = true;
        for (const update of table.updates ?? []) {
          for (const raw of update.inserts ?? []) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              continue;
            }
            // Live terrain rows arrive as KEYED objects (not positional arrays
            // like the leaderboard tables); normalizeRow handles both encodings.
            const r = normalizeRow(TERRAIN_COLS, parsed);
            if (Number(r.dimension) !== 1) continue; // overworld only (interiors/instances are other dims)
            // Per-tile biome values are PACKED (biome_type in the low byte, sub-biome/
            // variant bits above); mask to 0xFF to get the 0–14 biome_type id.
            const biomes = r.biomes;
            const biome = Array.isArray(biomes)
              ? dominantBiome((biomes as number[]).map((b) => b & 0xff))
              : -1;
            out.push({
              index: Number(r.chunk_index),
              x: Number(r.chunk_x),
              z: Number(r.chunk_z),
              biome,
            });
            // `parsed`/`r` (with their heavy arrays) go out of scope at the next
            // iteration — only the 4 scalars above survive.
          }
        }
      }
      // The applied-subscription reply is the terminal frame for a one-shot read.
      const m = msg as { SubscribeMultiApplied?: unknown; InitialSubscription?: unknown };
      if (seenTerrainFrame && (m.SubscribeMultiApplied || m.InitialSubscription)) {
        finish(() => {
          ws.close();
          resolve(out);
        });
      }
    });

    ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || "(none)";
      // If we already have data and the server closed, treat as complete.
      finish(() => {
        if (out.length > 0) resolve(out);
        else reject(new Error(`WS closed before terrain read: code ${code}, reason "${reason}" (${elapsed()})`));
      });
    });
    ws.on("error", (err) => finish(() => reject(err)));
    ws.on("unexpected-response", (_req, res) =>
      finish(() => reject(new Error(`WebSocket upgrade rejected: ${res.statusCode} ${res.statusMessage}`))),
    );
  });
}
