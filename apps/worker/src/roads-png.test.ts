import { describe, it, expect } from "vitest";
import { rasterizeRoads, SMALLHEX_PER_PX } from "./roads-png";

describe("rasterizeRoads", () => {
  it("maps small-hex points into a north-up RGBA grid with bounds", () => {
    const r = rasterizeRoads([960, 960, 1920, 2880]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.minChunkX).toBe(10); expect(r.minChunkZ).toBe(10);
    expect(r.maxChunkX).toBe(21); expect(r.maxChunkZ).toBe(31);
    expect(r.width).toBe(Math.ceil(((21 - 10) * 96) / SMALLHEX_PER_PX));
    const px = Math.floor((960 - 10 * 96) / SMALLHEX_PER_PX);
    const pz = Math.floor((960 - 10 * 96) / SMALLHEX_PER_PX);
    const row = r.height - 1 - pz;
    const o = (row * r.width + px) * 4;
    expect(r.rgba[o + 3]).toBeGreaterThan(0); // alpha set (north-up row)
  });
  it("returns null for empty input", () => {
    expect(rasterizeRoads([])).toBeNull();
  });
});
