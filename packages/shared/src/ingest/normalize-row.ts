/**
 * Normalize a raw SpacetimeDB insert into a keyed record. Handles both the
 * positional-array encoding (zipped against the given column order) and the
 * already-keyed-object encoding.
 */
export function normalizeRow(columnOrder: string[], raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    columnOrder.forEach((col, i) => {
      out[col] = raw[i];
    });
    return out;
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  throw new Error(`Cannot normalize row of type ${typeof raw}`);
}
