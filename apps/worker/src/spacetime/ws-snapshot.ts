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
  expectedTables: string[],
  timeoutMs = 60_000,
): Promise<Map<string, RawRow[]>> {
  const url = `${config.uri.replace(/\/+$/, "")}/v1/database/${config.moduleName}/subscribe`;
  return new Promise((resolve, reject) => {
    const acc = new Map<string, RawRow[]>();
    const ws = new WebSocket(url, ["v1.json.spacetimedb"], {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      const missing = expectedTables.filter((t) => !acc.has(t));
      reject(new Error(`Snapshot timed out after ${timeoutMs}ms; missing tables: ${missing.join(", ") || "none"}`));
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
      const tables = extractTableInserts(msg);
      for (const [name, rows] of tables) {
        const existing = acc.get(name);
        if (existing) existing.push(...rows);
        else acc.set(name, rows);
      }
      if (expectedTables.every((t) => acc.has(t))) {
        clearTimeout(timer);
        ws.close();
        resolve(acc);
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
