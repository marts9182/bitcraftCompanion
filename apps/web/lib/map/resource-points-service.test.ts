import { describe, it, expect } from "vitest";
import { packAndDownsample } from "@/lib/map/resource-points-service";

describe("packAndDownsample", () => {
  it("passes through unchanged when under cap", () => {
    expect(packAndDownsample([0, 0, 5, 5], 4)).toEqual({
      xz: [0, 0, 5, 5],
      total: 2,
      sampled: false,
    });
  });

  it("preserves the true total and flags sampled when over cap", () => {
    const raw = [0, 0, 1, 1, 0, 100, 1, 99, 100, 0, 99, 1, 100, 100, 99, 99]; // 8 pts
    const r = packAndDownsample(raw, 4);
    expect(r.total).toBe(8); // true count, not the downsampled length
    expect(r.sampled).toBe(true);
    expect(r.xz.length / 2).toBeLessThanOrEqual(4);
  });

  it("handles empty input", () => {
    expect(packAndDownsample([], 4)).toEqual({ xz: [], total: 0, sampled: false });
  });
});
