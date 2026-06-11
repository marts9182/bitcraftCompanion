// Supplies depletion projection — pure math, no IO.
//
// Strategy: ordinary least-squares slope over the trailing 7 days of supply
// snapshots (chosen over a two-point estimate for robustness to single-snapshot
// noise like a big donation or purchase landing between samples). When the
// slope is negative, ETA = now + currentSupplies / |slope|.

export const DEPLETION_WINDOW_DAYS = 7;
/** List badge threshold: only settlements projected to run out inside 14 days get flagged. */
export const DEPLETION_BADGE_DAYS = 14;
/** Detail-page display horizon: projections beyond this read as "declining slowly", not a date. */
export const DEPLETION_HORIZON_DAYS = 90;

const DAY_MS = 86_400_000;

export interface SupplySample {
  t: number | Date;
  supplies: number;
}

export interface DepletionEstimate {
  /** Least-squares slope in supplies/day over the trailing window (negative = draining). */
  slopePerDay: number;
  /** Projected run-out instant (ms epoch); null when slope >= 0. */
  etaMs: number | null;
  /** Fractional days until run-out; null when slope >= 0. */
  daysLeft: number | null;
}

/**
 * Fit a least-squares line to the in-window samples and project when supplies
 * hit zero. Returns null when a trend can't be established: fewer than two
 * finite samples inside the window, or all samples at one instant.
 */
export function estimateDepletion(
  samples: SupplySample[],
  currentSupplies: number,
  nowMs: number,
): DepletionEstimate | null {
  const cutoff = nowMs - DEPLETION_WINDOW_DAYS * DAY_MS;
  const pts: { t: number; supplies: number }[] = [];
  for (const s of samples) {
    const t = typeof s.t === "number" ? s.t : s.t.getTime();
    if (t >= cutoff && Number.isFinite(t) && Number.isFinite(s.supplies)) {
      pts.push({ t, supplies: s.supplies });
    }
  }
  if (pts.length < 2) return null;

  const n = pts.length;
  const tBar = pts.reduce((a, p) => a + p.t, 0) / n;
  const yBar = pts.reduce((a, p) => a + p.supplies, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    const dt = (p.t - tBar) / DAY_MS; // days, centered — keeps sxx well-conditioned
    sxx += dt * dt;
    sxy += dt * (p.supplies - yBar);
  }
  if (sxx === 0) return null; // all samples at the same instant

  const slopePerDay = sxy / sxx;
  if (slopePerDay >= 0) return { slopePerDay, etaMs: null, daysLeft: null };

  const daysLeft = Math.max(0, currentSupplies) / -slopePerDay;
  return { slopePerDay, etaMs: nowMs + daysLeft * DAY_MS, daysLeft };
}

/**
 * Whole-day count for the list's amber "{N}d" badge, or null when the
 * settlement isn't at risk (no ETA, or ETA at/beyond 14 days). Floored, so
 * "13d" reads "runs out in 13–14 days" and "0d" reads "runs out today".
 */
export function depletionBadgeDays(daysLeft: number | null): number | null {
  if (daysLeft === null || daysLeft >= DEPLETION_BADGE_DAYS) return null;
  return Math.max(0, Math.floor(daysLeft));
}
