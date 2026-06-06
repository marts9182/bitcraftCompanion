import { toInt } from "./decode";
import { decodeLocationSum } from "../world/coords";

type Raw = Record<string, unknown>;
const idStr = (v: unknown) => (v == null ? "" : String(v));

export interface MapClaimRow { entityId: string; name: string; x: number; z: number; dimension: number; numTiles: number; treasury: number; supplies: number; }
export function mapClaimLocalRows(rows: Raw[], nameById: Map<string, string>): MapClaimRow[] {
  const out: MapClaimRow[] = [];
  for (const r of rows) {
    const loc = decodeLocationSum(r.location);
    if (!loc) continue;
    const id = idStr(r.entity_id);
    out.push({
      entityId: id,
      name: nameById.get(id) ?? `Claim ${id}`,
      x: loc.x, z: loc.z, dimension: loc.dimension,
      numTiles: toInt(r.num_tiles) ?? 0,
      treasury: toInt(r.treasury) ?? 0,
      supplies: toInt(r.supplies) ?? 0,
    });
  }
  return out;
}

export interface MapChunkRow { chunkIndex: string; empireEntityId: string; watchtowerEntityId: string | null; }
export function mapChunkRows(rows: Raw[]): MapChunkRow[] {
  return rows.map((r) => ({
    chunkIndex: idStr(r.chunk_index),
    empireEntityId: idStr(r.empire_entity_id),
    watchtowerEntityId: r.watchtower_entity_id != null ? idStr(r.watchtower_entity_id) : null,
  }));
}

export interface MapRegionRow { id: number; name: string | null; minChunkX: number; minChunkZ: number; widthChunks: number; heightChunks: number; regionIndex: number; }
export function mapRegionRows(rows: Raw[], nameById: Map<number, string>): MapRegionRow[] {
  return rows.map((r) => {
    const id = toInt(r.id)!;
    return {
      id,
      name: nameById.get(id) ?? null,
      minChunkX: toInt(r.region_min_chunk_x) ?? 0,
      minChunkZ: toInt(r.region_min_chunk_z) ?? 0,
      widthChunks: toInt(r.region_width_chunks) ?? 0,
      heightChunks: toInt(r.region_height_chunks) ?? 0,
      regionIndex: toInt(r.region_index) ?? 0,
    };
  });
}
