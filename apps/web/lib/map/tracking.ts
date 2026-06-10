// Pure helpers for the map finder: URL state, point decimation, track colors.

export interface TrackState { resources: number[]; creatures: number[]; regions: number[]; roads: boolean }

// NOTE: drop empty segments BEFORE Number() — Number("") === 0, so a missing
// param would otherwise parse as [0] instead of [].
const numList = (v: string | string[] | undefined): number[] =>
  (typeof v === "string" ? v : "")
    .split(",")
    .filter((s) => s.trim() !== "")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0);

export function parseTrackParams(sp: Record<string, string | string[] | undefined>): TrackState {
  return {
    resources: numList(sp.resources),
    creatures: numList(sp.creatures),
    regions: numList(sp.regions),
    roads: sp.roads === "1",
  };
}

export function serializeTrackParams(s: TrackState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.resources.length) out.resources = s.resources.join(",");
  if (s.creatures.length) out.creatures = s.creatures.join(",");
  if (s.regions.length) out.regions = s.regions.join(",");
  if (s.roads) out.roads = "1";
  return out;
}

/** Even-stride sample of a flat [x,z,…] array down to ~budget points (keeps pairs aligned). */
export function decimate(xz: number[], budgetPoints: number): number[] {
  const points = xz.length / 2;
  if (points <= budgetPoints) return xz;
  const stride = Math.ceil(points / budgetPoints);
  const out: number[] = [];
  for (let p = 0; p < points; p += stride) out.push(xz[p * 2]!, xz[p * 2 + 1]!);
  return out;
}

export const TRACK_COLORS = ["#f5c451", "#6ec1e4", "#e4756e", "#8bd17c", "#c79bf2", "#f2a25c", "#7ce4cf", "#e486c7"] as const;
export const trackColor = (i: number): string => TRACK_COLORS[i % TRACK_COLORS.length]!;
