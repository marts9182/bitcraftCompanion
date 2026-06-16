import { describe, it, expect } from "vitest";
import { formatGameCoords, formatTimeAgo } from "./format";
import { formatCountdown } from "./format";

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

describe("formatTimeAgo", () => {
  const now = Date.UTC(2026, 5, 11, 12, 0, 0); // 2026-06-11T12:00:00Z

  it("says 'just now' under a minute", () => {
    expect(formatTimeAgo(now, now)).toBe("just now");
    expect(formatTimeAgo(now - 59_000, now)).toBe("just now");
  });

  it("treats future timestamps (clock skew) as 'just now'", () => {
    expect(formatTimeAgo(now + 90_000, now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatTimeAgo(now - 60_000, now)).toBe("1m ago");
    expect(formatTimeAgo(now - 23 * 60_000, now)).toBe("23m ago");
    expect(formatTimeAgo(now - 59 * 60_000 - 59_000, now)).toBe("59m ago");
  });

  it("formats hours with a minute remainder", () => {
    expect(formatTimeAgo(now - 3_600_000, now)).toBe("1h ago");
    expect(formatTimeAgo(now - 3_600_000 - 2 * 60_000, now)).toBe("1h 2m ago");
    expect(formatTimeAgo(now - 23 * 3_600_000, now)).toBe("23h ago");
  });

  it("formats whole days past 24h", () => {
    expect(formatTimeAgo(now - 24 * 3_600_000, now)).toBe("1d ago");
    expect(formatTimeAgo(now - 3 * 24 * 3_600_000 - 5 * 3_600_000, now)).toBe("3d ago");
  });
});

describe("formatCountdown", () => {
  it("formats H:MM:SS for sub-day durations", () => {
    expect(formatCountdown(4 * 3600_000 + 23 * 60_000 + 17_000)).toBe("4:23:17");
  });
  it("includes days when >= 24h", () => {
    expect(formatCountdown(25 * 3600_000 + 60_000 + 5_000)).toBe("1d 1:01:05");
  });
  it("clamps negatives to zero", () => {
    expect(formatCountdown(-5000)).toBe("0:00:00");
  });
});
