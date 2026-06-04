import WebSocket from "ws";
import { extractTableInserts, type RawRow } from "@bcc/shared";

export interface SnapshotConfig {
  uri: string; // wss://host
  moduleName: string;
  token: string;
}

/**
 * Read-only one-shot snapshot: open a v1.json WebSocket, subscribe to the given
 * SQL queries, collect the InitialSubscription rows, then close. Never sends a
 * reducer call. Resolves to rows grouped by source table name.
 */
export function readSnapshot(
  config: SnapshotConfig,
  queries: string[],
  timeoutMs = 60_000,
): Promise<Map<string, RawRow[]>> {
  const url = `${config.uri.replace(/\/+$/, "")}/v1/database/${config.moduleName}/subscribe`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, ["v1.json.spacetimedb"], {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Snapshot timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ Subscribe: { query_strings: queries, request_id: 1 } }));
    });
    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // ignore non-JSON frames
      }
      const tables = extractTableInserts(msg as object);
      if (tables.size > 0) {
        clearTimeout(timer);
        ws.close();
        resolve(tables);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket upgrade rejected: ${res.statusCode} ${res.statusMessage}`));
    });
  });
}
