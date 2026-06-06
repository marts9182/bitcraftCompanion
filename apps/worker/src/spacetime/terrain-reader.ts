import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { normalizeRow, COLUMN_ORDERS } from "@bcc/shared";

// Focused, streaming terrain reader. This intentionally COPIES the proven connect
// recipe from ./ws-snapshot.ts (token exchange → v1.json WS → SubscribeMulti →
// InitialSubscription/SubscribeMultiApplied → 1-byte compression prefix) — see
// ws-snapshot.ts as the source of truth for that handshake. It differs in two
// ways that matter for terrain and would destabilise the leaderboard path if
// retrofitted there:
//   1. maxPayload is raised to 1 GiB (terrain frames exceed ws's 100 MiB default).
//   2. Each chunk is reduced to its three per-tile layers (biome / water / elevation)
//      as the frame arrives; the rest of the heavy payload is dropped immediately.
//
// terrain_chunk_state rows arrive as KEYED objects; each chunk is a 32×32 tile grid:
//   biomes            Array<U32>  per-tile biome (type id is the low byte)
//   elevations        Array<I32>  per-tile height (≈ -21 … 409)
//   water_body_types  hex string  2 chars (1 byte) per tile: 0=land, 4=ocean, 3=lake, 1/2=river
// Only overworld chunks (dimension==1) are kept.

const WS_SUBPROTOCOL = "v1.json.spacetimedb";
const MAX_PAYLOAD = 1024 * 1024 * 1024; // 1 GiB
const TERRAIN_COLS = COLUMN_ORDERS.terrain_chunk_state ?? [];
export const TILES_PER_CHUNK_SIDE = 32;
const TILES_PER_CHUNK = TILES_PER_CHUNK_SIDE * TILES_PER_CHUNK_SIDE; // 1024

export interface TerrainReaderConfig {
  uri: string; // wss://host
  moduleName: string;
  token: string;
}

/** One chunk's per-tile layers (row-major, length 1024). */
export interface TerrainChunkTiles {
  cx: number;
  cz: number;
  biome: Uint8Array; // biome type id 0–14
  water: Uint8Array; // water body type (0 land, 1/2 river, 3 lake, 4 ocean)
  elev: Int16Array;
}

function parseHexBytes(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(s.substr(i * 2, 2), 16) || 0;
  return out;
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
 * (dimension==1) to its three per-tile layers. Resolves to the chunk list once
 * the subscription is applied.
 */
export async function readTerrain(
  config: TerrainReaderConfig,
  timeoutMs = 600_000,
): Promise<TerrainChunkTiles[]> {
  const tempToken = await exchangeToken(config);
  const base = config.uri.replace(/\/+$/, "");
  const url =
    `${base}/v1/database/${config.moduleName}/subscribe` +
    `?token=${encodeURIComponent(tempToken)}&compression=None`;

  return new Promise((resolve, reject) => {
    const out: TerrainChunkTiles[] = [];
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
            const r = normalizeRow(TERRAIN_COLS, parsed);
            if (Number(r.dimension) !== 1) continue; // overworld only
            const rawBiomes = r.biomes;
            const rawElev = r.elevations;
            if (!Array.isArray(rawBiomes) || !Array.isArray(rawElev)) continue;
            const biome = new Uint8Array(TILES_PER_CHUNK);
            const elev = new Int16Array(TILES_PER_CHUNK);
            for (let i = 0; i < TILES_PER_CHUNK; i++) {
              biome[i] = (Number(rawBiomes[i]) & 0xff) || 0;
              elev[i] = Number(rawElev[i]) | 0;
            }
            const water = parseHexBytes(String(r.water_body_types ?? ""), TILES_PER_CHUNK);
            out.push({ cx: Number(r.chunk_x), cz: Number(r.chunk_z), biome, water, elev });
            // `parsed`/`r` and their heavy arrays fall out of scope next iteration.
          }
        }
      }
      // The applied-subscription reply is the terminal frame for a one-shot read
      // and CONTAINS the terrain (processed just above). Resolve on it even with
      // no terrain rows — zero-player regions have no terrain and would otherwise
      // hang until timeout. `seenTerrainFrame` only gates the log/diagnostics.
      void seenTerrainFrame;
      const m = msg as { SubscribeMultiApplied?: unknown; InitialSubscription?: unknown };
      if (m.SubscribeMultiApplied || m.InitialSubscription) {
        finish(() => {
          ws.close();
          resolve(out);
        });
      }
    });

    ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || "(none)";
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
