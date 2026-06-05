/** A parsed row from a SpacetimeDB JSON subscription (array or keyed object). */
export type RawRow = unknown;

interface TableUpdate {
  table_name?: string;
  updates?: Array<{ inserts?: string[] }>;
}
interface DatabaseUpdate {
  tables?: TableUpdate[];
}
interface ServerMessage {
  // Reply to the legacy `Subscribe` request.
  InitialSubscription?: { database_update?: DatabaseUpdate };
  // Reply to the modern `SubscribeMulti` request (what the 1.x SDK sends).
  SubscribeMultiApplied?: { update?: DatabaseUpdate };
}

/**
 * Extract inserted rows from a v1.json SpacetimeDB server message, grouped by
 * table name. Each insert is a JSON string and is parsed here. Handles both the
 * legacy `InitialSubscription` reply and the modern `SubscribeMultiApplied`
 * reply. Non-subscription messages (e.g. IdentityToken) yield an empty map.
 */
export function extractTableInserts(message: unknown): Map<string, RawRow[]> {
  const result = new Map<string, RawRow[]>();
  const msg = message as ServerMessage;
  const tables =
    msg?.InitialSubscription?.database_update?.tables ?? msg?.SubscribeMultiApplied?.update?.tables;
  if (!tables) return result;
  for (const table of tables) {
    const name = table.table_name;
    if (!name) continue;
    const rows: RawRow[] = result.get(name) ?? [];
    for (const update of table.updates ?? []) {
      for (const raw of update.inserts ?? []) {
        try {
          rows.push(JSON.parse(raw));
        } catch {
          // skip a single malformed insert rather than failing the whole snapshot
        }
      }
    }
    result.set(name, rows);
  }
  return result;
}
