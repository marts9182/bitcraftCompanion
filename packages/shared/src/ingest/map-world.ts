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

/**
 * Empire entity id (string) → `#rrggbb`, derived from the GLOBAL module's
 * empire_emblem_state (empire → color1_id) joined to empire_color_desc
 * (id → color_argb, stored ARGB as 0xAARRGGBB so masking & 0xffffff yields RRGGBB).
 */
export function buildEmpireColors(colorDescRows: Raw[], emblemRows: Raw[]): Map<string, string> {
  const colorById = new Map<number, string>();
  for (const r of colorDescRows) {
    const id = toInt(r.id);
    if (id == null) continue;
    colorById.set(id, "#" + (Number(r.color_argb) & 0xffffff).toString(16).padStart(6, "0"));
  }
  const out = new Map<string, string>();
  for (const r of emblemRows) {
    const empireId = idStr(r.entity_id);
    const cid = toInt(r.color1_id);
    if (cid == null) continue;
    const hex = colorById.get(cid);
    if (hex) out.set(empireId, hex);
  }
  return out;
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
