export const PAGE_SIZE = 50;

export interface ListParams {
  q?: string;
  page: number;
  filters: Record<string, string>;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | string[] | undefined): string | undefined {
  const s = first(v)?.trim();
  return s ? s : undefined;
}

/**
 * Parse Next.js searchParams into typed list params. `allowedFilters` whitelists
 * which keys are accepted as filters; everything else is ignored. Pure.
 */
export function parseListParams(raw: RawParams, allowedFilters: string[]): ListParams {
  const params: ListParams = { page: 1, filters: {} };

  const q = clean(raw.q);
  if (q) params.q = q;

  for (const key of allowedFilters) {
    const v = clean(raw[key]);
    if (v) params.filters[key] = v;
  }

  const pageStr = clean(raw.page);
  if (pageStr !== undefined && /^\d+$/.test(pageStr)) {
    const n = parseInt(pageStr, 10);
    if (n >= 1) params.page = n;
  }

  return params;
}

/**
 * Parse an optional integer query param (e.g. tier filters). Accepts an
 * optionally negative whole number; anything else returns undefined. Pure.
 */
export function parseIntParam(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  return parseInt(value, 10);
}
