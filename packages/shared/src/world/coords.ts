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

// THE single coordinate calibration in the whole map. The game's chunk_index
// packs chunk_x ONE HIGHER than the chunk_x grid that terrain
// (terrain_chunk_state.chunk_x), regions (region_min_chunk_x) and small-hex (÷96)
// all share. Proven two independent ways:
//   1. The Hexite vault entity carries chunk_index 43204 (raw cx 204) AND
//      small-hex 19492 (÷96 = 203) — the same entity, so true cx = 203.
//   2. On the map, empire borders (chunk_index) rendered exactly one chunk EAST
//      of the terrain landmasses until this -1 was applied.
// So subtract 1 from cx to land on the true grid (cz needs no correction). With
// this in place there are NO per-layer nudges anywhere: terrain, regions,
// claims (÷96), resource dots (÷96) and roads are all native to the true grid.
export function chunkIndexToCoord(chunkIndex: string | number): { cx: number; cz: number } {
  const idx = typeof chunkIndex === "string" ? Number(chunkIndex) : chunkIndex;
  return { cx: (idx % CHUNK_STRIDE) - 1, cz: Math.floor(idx / CHUNK_STRIDE) };
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

/** Convert a "small hex" (x,z) world position to CHUNK coordinates for the map.
 * small-hex ÷ 96 IS the true chunk grid — it matches terrain_chunk_state.chunk_x
 * and region_min_chunk_x directly, so there is no offset here. (The offset bug
 * was in chunkIndexToCoord, which is fixed at its source above.) */
export function smallHexToChunk(x: number, z: number): { x: number; z: number } {
  return { x: x / SMALL_HEX_PER_CHUNK, z: z / SMALL_HEX_PER_CHUNK };
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
