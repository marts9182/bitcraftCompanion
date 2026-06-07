export const SETTLEMENT_PAGE_SIZE = 100;
export const SETTLEMENT_SORTS = ["tiles", "supplies", "treasury", "members", "name"] as const;
export type SettlementSort = (typeof SETTLEMENT_SORTS)[number];

export interface SettlementListParams {
  q: string;
  region: string;
  sort: SettlementSort;
  page: number;
}

export function parseSettlementParams(sp: Record<string, string | string[] | undefined>): SettlementListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const region = one(sp.region)?.trim() ?? "";
  const sortRaw = one(sp.sort) as SettlementSort | undefined;
  const sort = sortRaw && (SETTLEMENT_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "tiles";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { q, region, sort, page };
}
