/** Region modules the game exposes as bitcraft-live-{N}. */
export const KNOWN_REGIONS = new Set([7, 8, 9, 12, 13, 14, 17, 18, 19]);

export type ParseResult = { ok: true; region: number; id: number } | { ok: false };

/** Validate the route's path params. Region must be a known region; id a positive int. */
export function parseParams(regionStr: string, idStr: string): ParseResult {
  const region = Number(regionStr);
  const id = Number(idStr);
  if (!Number.isInteger(region) || !KNOWN_REGIONS.has(region)) return { ok: false };
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  return { ok: true, region, id };
}
