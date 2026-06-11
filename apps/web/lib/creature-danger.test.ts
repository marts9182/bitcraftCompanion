import { describe, it, expect } from "vitest";
import { dangerHint } from "./creature-danger";

describe("dangerHint", () => {
  it("uses the higher of attack and defense level", () => {
    expect(dangerHint({ attackLevel: 30, defenseLevel: 45 })).toBe(
      "Combat level 45 — bring gear around level 45 or higher.",
    );
    expect(dangerHint({ attackLevel: 60, defenseLevel: 20 })).toBe(
      "Combat level 60 — bring gear around level 60 or higher.",
    );
  });
  it("falls back to whichever level is present", () => {
    expect(dangerHint({ attackLevel: 12, defenseLevel: null })).toBe(
      "Combat level 12 — bring gear around level 12 or higher.",
    );
    expect(dangerHint({ attackLevel: null, defenseLevel: 8 })).toBe(
      "Combat level 8 — bring gear around level 8 or higher.",
    );
  });
  it("returns null when no combat levels are recorded", () => {
    expect(dangerHint({ attackLevel: null, defenseLevel: null })).toBeNull();
  });
  it("treats level 0 as unknown rather than hinting at level-0 gear", () => {
    expect(dangerHint({ attackLevel: 0, defenseLevel: 0 })).toBeNull();
    expect(dangerHint({ attackLevel: 0, defenseLevel: 15 })).toBe(
      "Combat level 15 — bring gear around level 15 or higher.",
    );
  });
});
