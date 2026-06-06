import { describe, it, expect } from "vitest";
import { chunkIndexToCoord, chunkIndexToBounds, regionBounds, smallHexToChunk, decodeLocationSum } from "./coords";

// Real sampled rows from mobile_entity_state on bitcraft-live-14 (dimension==1). Region 14
// occupies chunk_x [240,320) and chunk_z [160,240) per world_region_state.
describe("chunkIndexToCoord", () => {
  it("decodes chunk_index = chunk_z*1000 + chunk_x, landing in the region's chunk bounds", () => {
    expect(chunkIndexToCoord("212274")).toEqual({ cx: 274, cz: 212 });
    expect(chunkIndexToCoord("207265")).toEqual({ cx: 265, cz: 207 });
    for (const ci of ["212274", "207265"]) {
      const { cx, cz } = chunkIndexToCoord(ci);
      expect(cx).toBeGreaterThanOrEqual(240);
      expect(cx).toBeLessThan(320);
      expect(cz).toBeGreaterThanOrEqual(160);
      expect(cz).toBeLessThan(240);
    }
  });
});

describe("chunkIndexToBounds", () => {
  it("returns a 1x1 chunk cell in chunk coordinates", () => {
    expect(chunkIndexToBounds("212274")).toEqual({ x0: 274, z0: 212, x1: 275, z1: 213 });
  });
});

describe("regionBounds", () => {
  it("returns the region rectangle natively in chunk coordinates", () => {
    expect(regionBounds({ minChunkX: 240, minChunkZ: 160, widthChunks: 80, heightChunks: 80 })).toEqual({
      x0: 240,
      z0: 160,
      x1: 320,
      z1: 240,
    });
  });
});

describe("smallHexToChunk", () => {
  it("converts a small-hex claim position into chunk coords inside its region", () => {
    const c = smallHexToChunk(24594, 15592); // a region-14 small-hex position
    expect(c.x).toBeCloseTo(256.2, 0);
    expect(c.z).toBeCloseTo(162.4, 0);
    // Must land inside region 14's chunk bounds [240,320) x [160,240).
    expect(c.x).toBeGreaterThanOrEqual(240);
    expect(c.x).toBeLessThan(320);
    expect(c.z).toBeGreaterThanOrEqual(160);
    expect(c.z).toBeLessThan(240);
  });
});

describe("decodeLocationSum", () => {
  it("extracts x,z,dimension from the positional Sum [tag,{x,z,dimension}]", () => {
    expect(decodeLocationSum([0, { x: 24594, z: 15592, dimension: 1 }])).toEqual({ x: 24594, z: 15592, dimension: 1 });
  });
  it("handles the keyed object form and rejects junk", () => {
    expect(decodeLocationSum({ x: 1, z: 2, dimension: 1 })).toEqual({ x: 1, z: 2, dimension: 1 });
    expect(decodeLocationSum(null)).toBeNull();
  });
});
