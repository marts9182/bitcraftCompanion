import { describe, it, expect } from "vitest";
import { formatGameCoords } from "./format";

// Expected values cross-checked against the live game via bitjita.com/claims/{id}
// (claims in three different regions, 2026-06-10).
describe("formatGameCoords", () => {
  it("converts small-hex coords to the game's large-tile N/E convention (z→N, x→E, ÷3)", () => {
    // Stormhollow (region 19): bitjita shows N 8618, E 8710
    expect(formatGameCoords(26130, 25854)).toBe("N8618, E8710");
    // Blackfen (region 9): bitjita shows N 3588, E 9218
    expect(formatGameCoords(27654, 10764)).toBe("N3588, E9218");
  });

  it("floors (never rounds) non-divisible coords", () => {
    // Istanbullfrog (region 18): x = 22859 → 7619.67 → bitjita shows E 7619
    expect(formatGameCoords(22859, 26533)).toBe("N8844, E7619");
  });

  it("handles the origin", () => {
    expect(formatGameCoords(0, 0)).toBe("N0, E0");
  });
});
