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
    expect(c.x).toBeCloseTo(257.2, 0); // x/96 = 256.19, calibrated +1 chunk east
    expect(c.z).toBeCloseTo(162.4, 0);
    // Must land inside region 14's chunk bounds [240,320) x [160,240).
    expect(c.x).toBeGreaterThanOrEqual(240);
    expect(c.x).toBeLessThan(320);
    expect(c.z).toBeGreaterThanOrEqual(160);
    expect(c.z).toBeLessThan(240);
  });

  it("aligns small-hex with the chunk_index grid (ground truth: one entity, both systems)", () => {
    // The Hexite Sealed Vault growth entity in region 3 carries BOTH coordinate
    // systems in the live data: chunk_index 43204 AND small-hex (19492, 4134).
    // The decoded small-hex chunk MUST match the chunk_index grid (which the
    // terrain images are aligned to). A naive x/96 lands one chunk WEST (203),
    // so smallHexToChunk applies a +1 east calibration to reach 204.
    const { cx, cz } = chunkIndexToCoord(43204); // { cx: 204, cz: 43 }
    const c = smallHexToChunk(19492, 4134);
    expect(Math.floor(c.x)).toBe(cx); // 204, not 203
    expect(Math.floor(c.z)).toBe(cz); // 43
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
