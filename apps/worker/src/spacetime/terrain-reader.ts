import { gunzipSync } from "node:zlib";
import WebSocket from "ws";

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

// Positional indices into terrain_chunk_state (see COLUMN_ORDERS.terrain_chunk_state):
// [chunk_index, chunk_x, chunk_z, dimension, biomes, …]. We read by index so we
// never materialise a keyed object (and so we can ignore the heavy tail columns).
const I_CHUNK_INDEX = 0;
const I_CHUNK_X = 1;
const I_CHUNK_Z = 2;
const I_DIMENSION = 3;
const I_BIOMES = 4;

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

/** Most frequent biome id in a tile array; ties → smallest id; empty → -1. */
function dominantBiome(biomes: number[]): number {
  if (biomes.length === 0) return -1;
  const counts = new Map<number, number>();
  for (const b of biomes) counts.set(b, (counts.get(b) ?? 0) + 1);
  let best = -1;
  let bestCount = 0;
  for (const [biome, count] of counts) {
    if (count > bestCount || (count === bestCount && biome < best)) {
      best = biome;
      bestCount = count;
    }
  }
  return best;
}

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
            let row: unknown[];
            try {
              row = JSON.parse(raw) as unknown[];
            } catch {
              continue;
            }
            if (!Array.isArray(row)) continue;
            if (Number(row[I_DIMENSION]) !== 1) continue; // overworld only
            const biomes = row[I_BIOMES];
            const biome = Array.isArray(biomes) ? dominantBiome(biomes as number[]) : -1;
            out.push({
              index: Number(row[I_CHUNK_INDEX]),
              x: Number(row[I_CHUNK_X]),
              z: Number(row[I_CHUNK_Z]),
              biome,
            });
            // `row` (with its heavy arrays) goes out of scope at the next
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
