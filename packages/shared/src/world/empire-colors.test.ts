import { describe, it, expect } from "vitest";
import { vividTerritoryColor } from "./empire-colors";

describe("vividTerritoryColor", () => {
  it("leaves pure white untouched (no hue to fabricate)", () => {
    expect(vividTerritoryColor("#ffffff")).toBe("#ffffff");
  });

  it("leaves near-grayscale colors untouched", () => {
    expect(vividTerritoryColor("#c2c2c2")).toBe("#c2c2c2");
  });

  it("boosts saturation of a pale-but-colored emblem", () => {
    // cream #e6d5a1: real hue, low-ish saturation, very light → should become richer
    const out = vividTerritoryColor("#e6d5a1");
    expect(out).not.toBe("#e6d5a1");
    // sanity: still a valid 6-digit hex
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the same hue family (a green stays green)", () => {
    const out = vividTerritoryColor("#216332"); // green
    const n = parseInt(out.slice(1), 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("returns invalid input unchanged", () => {
    expect(vividTerritoryColor("not-a-color")).toBe("not-a-color");
    expect(vividTerritoryColor("#888888")).toBe("#888888"); // gray fallback stays gray
  });
});
