import { describe, it, expect } from "vitest";
import { gridBucketDownsample } from "@/lib/map/downsample";

describe("gridBucketDownsample", () => {
  it("returns the input unchanged when at or under cap", () => {
    const xz = [0, 0, 10, 10, 20, 20];
    const r = gridBucketDownsample(xz, 5000);
    expect(r.sampled).toBe(false);
    expect(r.xz).toBe(xz); // same reference, not a copy
  });

  it("returns empty unchanged", () => {
    expect(gridBucketDownsample([], 5000)).toEqual({ xz: [], sampled: false });
  });

  it("caps points and preserves spatial spread when over cap", () => {
    // 8 points clustered near the 4 corners of a 0..100 box; cap 4 -> ~4 cells.
    const xz = [0, 0, 1, 1, 0, 100, 1, 99, 100, 0, 99, 1, 100, 100, 99, 99];
    const r = gridBucketDownsample(xz, 4);
    expect(r.sampled).toBe(true);
    expect(r.xz.length / 2).toBeLessThanOrEqual(4);
    expect(r.xz.length / 2).toBeGreaterThanOrEqual(1);
  });
});
