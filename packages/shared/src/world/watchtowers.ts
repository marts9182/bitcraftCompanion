// Watchtower marker derivation for the map.
//
// In the live data, EVERY map chunk carries a non-null watchtower_entity_id — it is the id
// of the watchtower whose coverage area INCLUDES that chunk, not a sparse "this chunk is a
// watchtower" flag. There are ~555 distinct watchtower ids, each covering a cluster of chunks.
//
// So a single marker per watchtower is positioned at the CENTROID of all chunks it covers
// (the mean of the chunk-center coordinates). This is an approximation of the tower's actual
// location — we do not ingest the watchtower building's exact coordinates — which is an
// acceptable v1.1 approximation.
import { chunkIndexToBounds } from "./coords";

export interface Watchtower {
  id: string;
  x: number;
  z: number;
  /** Number of chunks this watchtower covers (useful for an honest tooltip). */
  chunks: number;
}

export interface WatchtowerChunkRow {
  chunkIndex: string | number;
  id: string | number;
}

/**
 * Group chunk rows by watchtower id and return one Watchtower per distinct id, positioned at
 * the centroid (mean) of the centers of the chunks it covers. Single pass: accumulate
 * { sumX, sumZ, count } per id, then map to centroids.
 */
export function watchtowerCentroids(rows: WatchtowerChunkRow[]): Watchtower[] {
  const acc = new Map<string, { sumX: number; sumZ: number; count: number }>();
  for (const row of rows) {
    const b = chunkIndexToBounds(row.chunkIndex);
    const cx = b.x0 + 0.5;
    const cz = b.z0 + 0.5;
    const id = String(row.id);
    const cur = acc.get(id);
    if (cur) {
      cur.sumX += cx;
      cur.sumZ += cz;
      cur.count += 1;
    } else {
      acc.set(id, { sumX: cx, sumZ: cz, count: 1 });
    }
  }
  const out: Watchtower[] = [];
  for (const [id, { sumX, sumZ, count }] of acc) {
    out.push({ id, x: sumX / count, z: sumZ / count, chunks: count });
  }
  return out;
}
