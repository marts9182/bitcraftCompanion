export const MARKET_PAGE_SIZE = 100;
export const MARKET_SORTS = ["sold", "ask", "bid", "askQty", "name", "tier"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];
export const MARKET_TYPES = ["all", "item", "cargo"] as const;
export type MarketTypeFilter = (typeof MARKET_TYPES)[number];

export interface MarketListParams {
  q: string;
  type: MarketTypeFilter;
  sort: MarketSort;
  page: number;
}

export function parseMarketParams(sp: Record<string, string | string[] | undefined>): MarketListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const typeRaw = one(sp.type) as MarketTypeFilter | undefined;
  const type = typeRaw && (MARKET_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "all";
  const sortRaw = one(sp.sort) as MarketSort | undefined;
  const sort = sortRaw && (MARKET_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "sold";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { q, type, sort, page };
}

/** Detail route key <type>-<id>. item_type 1 = cargo, else item. */
export function marketKey(itemType: number, itemId: number): string {
  return `${itemType === 1 ? "cargo" : "item"}-${itemId}`;
}
export function parseMarketKey(key: string): { itemType: number; itemId: number } | null {
  const m = /^(item|cargo)-(\d+)$/.exec(key);
  if (!m) return null;
  return { itemType: m[1] === "cargo" ? 1 : 0, itemId: Number(m[2]) };
}
