import { describe, it, expect } from "vitest";
import { chunkIndexToCoord, chunkIndexToBounds, regionBounds, smallHexToChunk, decodeLocationSum } from "./coords";

// Real sampled rows from mobile_entity_state on bitcraft-live-14 (dimension==1). Region 14
// occupies chunk_x [240,320) and chunk_z [160,240) per world_region_state.
describe("chunkIndexToCoord", () => {
  it("decodes to the true chunk grid (cx = idx%1000 - 1; the game packs cx one high)", () => {
    expect(chunkIndexToCoord("212274")).toEqual({ cx: 273, cz: 212 });
    expect(chunkIndexToCoord("207265")).toEqual({ cx: 264, cz: 207 });
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
  it("returns a 1x1 chunk cell in chunk coordinates (true grid)", () => {
    expect(chunkIndexToBounds("212274")).toEqual({ x0: 273, z0: 212, x1: 274, z1: 213 });
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
    expect(c.x).toBeCloseTo(256.2, 0); // x/96 = 256.19 — the true grid, no offset
    expect(c.z).toBeCloseTo(162.4, 0);
    // Must land inside region 14's chunk bounds [240,320) x [160,240).
    expect(c.x).toBeGreaterThanOrEqual(240);
    expect(c.x).toBeLessThan(320);
    expect(c.z).toBeGreaterThanOrEqual(160);
    expect(c.z).toBeLessThan(240);
  });

  it("agrees with the corrected chunk_index decode (ground truth: one entity, both systems)", () => {
    // The Hexite Sealed Vault growth entity in region 3 carries BOTH coordinate
    // systems in the live data: chunk_index 43204 AND small-hex (19492, 4134).
    // small-hex ÷96 = 203 is the true chunk; the raw chunk_index decode would
    // give 204 (one high), which chunkIndexToCoord corrects with its -1. Both
    // must land on the SAME true chunk (203) — that's how all map layers align.
    const { cx, cz } = chunkIndexToCoord(43204); // corrected: { cx: 203, cz: 43 }
    const c = smallHexToChunk(19492, 4134);
    expect(Math.floor(c.x)).toBe(cx); // 203 == 203
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
