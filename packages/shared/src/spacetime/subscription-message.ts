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
/**
 * Quote bare integer literals of 16+ digits so JSON.parse keeps them as strings.
 * Entity ids are u64 snowflakes (~1.4e18) far above 2^53, so a plain JSON.parse
 * rounds them and DISTINCT ids collide onto the same JS number — silently merging
 * rows (e.g. two players sharing a rounded id, one overwriting the other). Keeping
 * them as exact strings preserves identity; every consumer reads ids via String()/
 * toInt(), both of which accept numeric strings. Uses lookbehind/lookahead so it
 * never consumes the surrounding `[ , : ] }` delimiters (handles adjacent values).
 */
function preserveBigIntIds(raw: string): string {
  return raw.replace(/(?<=[:,[]\s*)\d{16,}(?=\s*[,\]}])/g, (m) => `"${m}"`);
}

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
          rows.push(JSON.parse(preserveBigIntIds(raw)));
        } catch {
          // skip a single malformed insert rather than failing the whole snapshot
        }
      }
    }
    result.set(name, rows);
  }
  return result;
}
