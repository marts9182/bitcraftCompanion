// World coordinate decoding for the map. Resolved by spike (2026-06-06) by correlating
// mobile_entity_state (chunk_index + location_x/z, dimension==1) with world_region_state
// on bitcraft-live-14:
//   chunk_index = chunk_z * 1000 + chunk_x   (STRIDE confirmed exactly; the decoded
//   (cx,cz) fall inside the region's known chunk bounds [240,320)×[160,240)).
//   Other-dimension (interior) entities carry far larger chunk_index values — ignore them.
//
// The MAP works in CHUNK coordinates:
//   - regions are NATIVELY in chunk coords (region_min_chunk_x, width_chunks, …) — no conversion
//   - territory cells are 1×1 chunk cells at (cx, cz)
//   - claim positions are "small hex" (~90 small-hex units per chunk) → divide to chunk coords
export const CHUNK_STRIDE = 1000;
// Calibrated against region 14: its claims (small-hex x[23503..30197] z[15592..22613])
// must fall inside its chunk bounds [240,320)×[160,240), which pins ~96 small-hex per chunk.
export const SMALL_HEX_PER_CHUNK = 96;

export interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function chunkIndexToCoord(chunkIndex: string | number): { cx: number; cz: number } {
  const idx = typeof chunkIndex === "string" ? Number(chunkIndex) : chunkIndex;
  return { cx: idx % CHUNK_STRIDE, cz: Math.floor(idx / CHUNK_STRIDE) };
}

/** Territory cell bounds in CHUNK coordinates (1 chunk = 1 unit). */
export function chunkIndexToBounds(chunkIndex: string | number): Bounds {
  const { cx, cz } = chunkIndexToCoord(chunkIndex);
  return { x0: cx, z0: cz, x1: cx + 1, z1: cz + 1 };
}

/** Region rectangle in CHUNK coordinates (native — region bounds are already chunk units). */
export function regionBounds(r: {
  minChunkX: number;
  minChunkZ: number;
  widthChunks: number;
  heightChunks: number;
}): Bounds {
  return {
    x0: r.minChunkX,
    z0: r.minChunkZ,
    x1: r.minChunkX + r.widthChunks,
    z1: r.minChunkZ + r.heightChunks,
  };
}

// The small-hex coordinate system sits exactly one CHUNK east of where a naive
// x/96 places it, relative to the chunk_index grid that the terrain images and
// all chunk-index layers (regions, territory, watchtowers) are aligned to.
// Proven by an entity carrying BOTH systems in the live data — the Hexite Sealed
// Vault growth entity in region 3:
//   chunk_index 43204            -> chunk (cx=204, cz=43)
//   small-hex   (19492, 4134)    -> x/96 = 203.04, z/96 = 43.06   (x one chunk short)
// So add one chunk in x. This is the SINGLE source of truth for small-hex layers
// (claims, resource spawn dots) — do NOT re-apply this offset per layer.
export const SMALL_HEX_CHUNK_DX = 1;

/** Convert a "small hex" (x,z) world position to CHUNK coordinates for the map,
 * calibrated to align with the chunk_index grid (see SMALL_HEX_CHUNK_DX). */
export function smallHexToChunk(x: number, z: number): { x: number; z: number } {
  return { x: x / SMALL_HEX_PER_CHUNK + SMALL_HEX_CHUNK_DX, z: z / SMALL_HEX_PER_CHUNK };
}

type Raw = Record<string, unknown>;

/** Extract {x,z,dimension} from claim_local_state.location, a positional Sum [tag,{…}] or keyed object. */
export function decodeLocationSum(loc: unknown): { x: number; z: number; dimension: number } | null {
  const payload = Array.isArray(loc) ? loc[1] : loc;
  if (payload && typeof payload === "object") {
    const o = payload as Raw;
    if (typeof o.x === "number" && typeof o.z === "number") {
      return { x: o.x, z: o.z, dimension: typeof o.dimension === "number" ? o.dimension : 1 };
    }
  }
  return null;
}
