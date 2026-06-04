import { describe, it, expect } from "vitest";
import { ReadOnlySpacetime } from "./readonly-connection";

describe("ReadOnlySpacetime", () => {
  it("exposes only read/connection methods (no reducer-calling surface)", () => {
    const allowed = new Set(["connect", "disconnect", "subscribe", "isConnected"]);
    const surface = Object.getOwnPropertyNames(ReadOnlySpacetime.prototype).filter((n) => n !== "constructor");
    for (const name of surface) {
      expect(allowed.has(name), `unexpected public method: ${name}`).toBe(true);
    }
    // Explicitly assert no method name hints at mutating the game.
    const forbidden = surface.filter((n) => /reduc|call|invoke|insert|update|delete|mutat|write/i.test(n));
    expect(forbidden).toEqual([]);
  });
});
