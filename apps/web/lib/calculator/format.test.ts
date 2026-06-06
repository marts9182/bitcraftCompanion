import { describe, it, expect } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("returns a dash for zero or negative", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });
  it("formats hours and minutes, dropping seconds", () => {
    expect(formatDuration(3720)).toBe("1h 2m");
  });
  it("rounds fractional seconds", () => {
    expect(formatDuration(59.6)).toBe("1m");
  });
});
