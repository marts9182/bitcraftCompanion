// Biome helpers for the terrain base render. `terrain_chunk_state.biomes` is a
// flat Array<U32> of per-tile biome type ids within one chunk; we collapse each
// chunk to a single dominant biome (the mode) to colour 1px-per-chunk.

/** biome_type id → display name (biome_desc, EA2). 15 biomes; 0 is the dev biome. */
export const BIOME_NAMES: Record<number, string> = {
  0: "Dev",
  1: "Calm Forest",
  2: "Pine Woods",
  3: "Snowy Peaks",
  4: "Breezy Grasslands",
  5: "Autumn Forest",
  6: "Misty Tundra",
  7: "Desert Wasteland",
  8: "Swamp",
  9: "Rocky Garden",
  10: "Open Ocean",
  11: "Safe Meadows",
  12: "Cave",
  13: "Jungle",
  14: "Sapwoods",
};

/**
 * Most frequent value (mode) of a biome-id array. Ties are broken by the
 * SMALLEST biome id (deterministic). An empty array returns -1 (sentinel:
 * "no data" — renderers treat it as transparent).
 */
export function dominantBiome(biomes: number[]): number {
  if (biomes.length === 0) return -1;
  const counts = new Map<number, number>();
  for (const b of biomes) counts.set(b, (counts.get(b) ?? 0) + 1);
  let best = -1;
  let bestCount = 0;
  for (const [biome, count] of counts) {
    if (count > bestCount || (count === bestCount && biome < best)) {
      best = biome;
      bestCount = count;
    }
  }
  return best;
}
