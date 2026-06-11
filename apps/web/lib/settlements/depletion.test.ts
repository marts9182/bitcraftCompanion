import { describe, it, expect } from "vitest";
import {
  estimateDepletion,
  depletionBadgeDays,
  DEPLETION_WINDOW_DAYS,
  DEPLETION_BADGE_DAYS,
} from "./depletion";

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11, 12, 0, 0); // 2026-06-11T12:00:00Z

/** n samples ending at `now`, one per `stepDays`, supplies = start + slope*daysFromFirst. */
function series(n: number, start: number, slopePerDay: number, stepDays = 1) {
  return Array.from({ length: n }, (_, i) => {
    const daysFromFirst = i * stepDays;
    return {
      t: now - (n - 1 - i) * stepDays * DAY,
      supplies: start + slopePerDay * daysFromFirst,
    };
  });
}

describe("estimateDepletion", () => {
  it("returns null with fewer than 2 in-window samples", () => {
    expect(estimateDepletion([], 1000, now)).toBeNull();
    expect(estimateDepletion([{ t: now, supplies: 1000 }], 1000, now)).toBeNull();
  });

  it("ignores samples older than the 7-day window", () => {
    const stale = [
      { t: now - (DEPLETION_WINDOW_DAYS + 2) * DAY, supplies: 5000 },
      { t: now - (DEPLETION_WINDOW_DAYS + 1) * DAY, supplies: 4000 },
    ];
    expect(estimateDepletion(stale, 1000, now)).toBeNull();
    // ...even when mixed with a single fresh point (1 in-window point < 2)
    expect(estimateDepletion([...stale, { t: now, supplies: 1000 }], 1000, now)).toBeNull();
  });

  it("produces an estimate from exactly 2 distinct in-window points", () => {
    const pts = [
      { t: now - 1 * DAY, supplies: 1100 },
      { t: now, supplies: 1000 },
    ];
    const est = estimateDepletion(pts, 1000, now);
    expect(est).not.toBeNull();
    expect(est!.slopePerDay).toBeCloseTo(-100, 6);
    expect(est!.daysLeft).toBeCloseTo(10, 6);
  });

  it("includes a sample exactly at the cutoff timestamp (inclusive >=)", () => {
    // If t === now - 7d were excluded, only 1 in-window point would remain → null.
    const pts = [
      { t: now - DEPLETION_WINDOW_DAYS * DAY, supplies: 1700 },
      { t: now, supplies: 1000 },
    ];
    const est = estimateDepletion(pts, 1000, now);
    expect(est).not.toBeNull();
    expect(est!.slopePerDay).toBeCloseTo(-100, 6);
  });

  it("returns null when all in-window samples share one timestamp (zero t-variance)", () => {
    const pts = [
      { t: now, supplies: 100 },
      { t: now, supplies: 200 },
    ];
    expect(estimateDepletion(pts, 100, now)).toBeNull();
  });

  it("recovers an exact linear decline and projects the run-out instant", () => {
    // 8 daily samples losing 100/day; current supplies 300 → out in 3 days.
    const est = estimateDepletion(series(8, 1700, -100), 300, now);
    expect(est).not.toBeNull();
    expect(est!.slopePerDay).toBeCloseTo(-100, 6);
    expect(est!.daysLeft).toBeCloseTo(3, 6);
    expect(est!.etaMs).toBeCloseTo(now + 3 * DAY, -3);
  });

  it("accepts Date objects for t", () => {
    const pts = series(8, 1700, -100).map((p) => ({ t: new Date(p.t), supplies: p.supplies }));
    const est = estimateDepletion(pts, 300, now);
    expect(est!.slopePerDay).toBeCloseTo(-100, 6);
  });

  it("is robust to symmetric noise (least squares, not two-point)", () => {
    // Alternating ±50 noise around a -100/day trend; two-point would be off by ~±14/day.
    const noisy = series(8, 1700, -100).map((p, i) => ({
      ...p,
      supplies: p.supplies + (i % 2 === 0 ? 50 : -50),
    }));
    const est = estimateDepletion(noisy, 300, now);
    expect(est!.slopePerDay).toBeGreaterThan(-115);
    expect(est!.slopePerDay).toBeLessThan(-85);
  });

  it("reports rising supplies with no ETA", () => {
    const est = estimateDepletion(series(8, 100, 50), 450, now);
    expect(est!.slopePerDay).toBeCloseTo(50, 6);
    expect(est!.etaMs).toBeNull();
    expect(est!.daysLeft).toBeNull();
  });

  it("reports flat supplies with no ETA", () => {
    const est = estimateDepletion(series(8, 500, 0), 500, now);
    expect(est!.slopePerDay).toBe(0);
    expect(est!.etaMs).toBeNull();
    expect(est!.daysLeft).toBeNull();
  });

  it("treats zero current supplies with a negative slope as already out (ETA now)", () => {
    const est = estimateDepletion(series(8, 700, -100), 0, now);
    expect(est!.daysLeft).toBe(0);
    expect(est!.etaMs).toBe(now);
  });

  it("clamps negative current supplies to zero days left", () => {
    const est = estimateDepletion(series(8, 700, -100), -5, now);
    expect(est!.daysLeft).toBe(0);
  });

  it("skips non-finite supply values", () => {
    const pts = [...series(8, 1700, -100), { t: now, supplies: Number.NaN }];
    const est = estimateDepletion(pts, 300, now);
    expect(est!.slopePerDay).toBeCloseTo(-100, 6);
  });
});

describe("depletionBadgeDays", () => {
  it("returns null when there is no ETA", () => {
    expect(depletionBadgeDays(null)).toBeNull();
  });

  it("returns null at or beyond the 14-day threshold", () => {
    expect(depletionBadgeDays(DEPLETION_BADGE_DAYS)).toBeNull();
    expect(depletionBadgeDays(45)).toBeNull();
  });

  it("floors fractional days under the threshold ('13d' = runs out in 13–14 days)", () => {
    expect(depletionBadgeDays(13.9)).toBe(13);
    expect(depletionBadgeDays(1.2)).toBe(1);
  });

  it("returns 0 for under-a-day (renders '0d' = runs out today)", () => {
    expect(depletionBadgeDays(0.4)).toBe(0);
    expect(depletionBadgeDays(0)).toBe(0);
  });
});
