/** A parsed row from a SpacetimeDB JSON subscription (array or keyed object). */
export type RawRow = unknown;

interface TableUpdate {
  table_name?: string;
  updates?: Array<{ inserts?: string[] }>;
}
interface ServerMessage {
  InitialSubscription?: { database_update?: { tables?: TableUpdate[] } };
}

/**
 * Extract inserted rows from a v1.json SpacetimeDB server message, grouped by
 * table name. Each insert is a JSON string and is parsed here. Non-subscription
 * messages (e.g. IdentityToken) yield an empty map.
 */
export function extractTableInserts(message: ServerMessage): Map<string, RawRow[]> {
  const result = new Map<string, RawRow[]>();
  const tables = message.InitialSubscription?.database_update?.tables;
  if (!tables) return result;
  for (const table of tables) {
    const name = table.table_name;
    if (!name) continue;
    const rows: RawRow[] = result.get(name) ?? [];
    for (const update of table.updates ?? []) {
      for (const raw of update.inserts ?? []) {
        rows.push(JSON.parse(raw));
      }
    }
    result.set(name, rows);
  }
  return result;
}
