import { describe, it, expect } from "vitest";
import { levelForXp, XP_LEVEL_THRESHOLDS } from "./levels";

describe("levelForXp", () => {
  it("is level 1 at 0 xp and just below the level-2 threshold", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(519)).toBe(1);
  });
  it("crosses to the next level exactly at the threshold", () => {
    expect(levelForXp(520)).toBe(2);
    expect(levelForXp(1100)).toBe(3);
  });
  it("reaches max level 120 at the top threshold and beyond", () => {
    expect(levelForXp(2053471040)).toBe(120);
    expect(levelForXp(9999999999)).toBe(120);
  });
  it("clamps to a skill's maxLevel", () => {
    expect(levelForXp(2053471040, 100)).toBe(100);
  });
  it("has 120 thresholds starting at 0", () => {
    expect(XP_LEVEL_THRESHOLDS.length).toBe(120);
    expect(XP_LEVEL_THRESHOLDS[0]).toBe(0);
  });
});
