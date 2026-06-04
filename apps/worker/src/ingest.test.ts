import { describe, it, expect, vi } from "vitest";
import { shouldRunIngestion, computeBackoffMs } from "./ingest";

describe("shouldRunIngestion", () => {
  it("returns false when the kill switch is disabled", () => {
    expect(shouldRunIngestion({ INGESTION_ENABLED: false })).toBe(false);
  });
  it("returns true when enabled", () => {
    expect(shouldRunIngestion({ INGESTION_ENABLED: true })).toBe(true);
  });
});

describe("computeBackoffMs", () => {
  it("grows exponentially and caps at the max", () => {
    expect(computeBackoffMs(0)).toBeLessThanOrEqual(2000);
    expect(computeBackoffMs(10)).toBeLessThanOrEqual(60_000);
    expect(computeBackoffMs(10)).toBeGreaterThan(computeBackoffMs(0));
  });
});
