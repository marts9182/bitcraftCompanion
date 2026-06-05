export const PAGE_SIZE = 50;

export interface ItemListParams {
  q?: string;
  tier?: number;
  rarity?: string;
  tag?: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function cleanStr(v: string | string[] | undefined): string | undefined {
  const s = first(v)?.trim();
  return s ? s : undefined;
}

/** Parse and normalize raw Next.js searchParams into typed item-list params. */
export function parseItemListParams(raw: RawParams): ItemListParams {
  const params: ItemListParams = { page: 1 };

  const q = cleanStr(raw.q);
  if (q) params.q = q;

  const tierStr = cleanStr(raw.tier);
  if (tierStr !== undefined && /^-?\d+$/.test(tierStr)) params.tier = parseInt(tierStr, 10);

  const rarity = cleanStr(raw.rarity);
  if (rarity) params.rarity = rarity;

  const tag = cleanStr(raw.tag);
  if (tag) params.tag = tag;

  const pageStr = cleanStr(raw.page);
  if (pageStr !== undefined && /^\d+$/.test(pageStr)) {
    const n = parseInt(pageStr, 10);
    if (n >= 1) params.page = n;
  }

  return params;
}
