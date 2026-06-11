/**
 * Shared typeahead-suggestion contract + pure filtering. Client-safe (no
 * server imports): the TypeaheadSearch component and the /api/suggest route
 * both use these types, and the filter runs in the browser over the slim
 * per-kind catalogs the route serves.
 */

export const SUGGEST_KINDS = ["items", "cargo", "recipes", "resources", "creatures"] as const;
export type SuggestKind = (typeof SUGGEST_KINDS)[number];

export function isSuggestKind(v: string): v is SuggestKind {
  return (SUGGEST_KINDS as readonly string[]).includes(v);
}

/**
 * One suggestible entity. Recipes resolve `name`/`tier` to their PRIMARY
 * output (highest-quantity stack) and carry the template's action verb
 * (`verb`, e.g. "Bake") so duplicate output names stay distinguishable.
 * Filtering matches `name` only.
 */
export interface SuggestEntry {
  name: string;
  slug: string;
  tier: number | null;
  verb?: string;
}

export interface SuggestPayload {
  v: 1;
  entries: SuggestEntry[];
}

/** Don't suggest until the needle is meaningful (matches the map finder). */
export const SUGGEST_MIN_QUERY = 2;
export const SUGGEST_MAX_RESULTS = 10;

/**
 * Case-insensitive substring match over a name catalog, prefix matches ranked
 * before mid-string matches (catalogs arrive name-sorted, so each bucket stays
 * alphabetical). Capped. Pure. `minQuery` is overridable for tiny catalogs
 * (the command palette filters its ~16 static pages from a single character).
 */
export function filterSuggestions(
  entries: SuggestEntry[],
  query: string,
  cap: number = SUGGEST_MAX_RESULTS,
  minQuery: number = SUGGEST_MIN_QUERY,
): SuggestEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < minQuery) return [];
  const prefix: SuggestEntry[] = [];
  const rest: SuggestEntry[] = [];
  for (const e of entries) {
    const i = e.name.toLowerCase().indexOf(needle);
    if (i === -1) continue;
    (i === 0 ? prefix : rest).push(e);
    // Once `cap` prefix matches exist the result is fully determined.
    if (prefix.length >= cap) break;
  }
  return prefix.concat(rest).slice(0, cap);
}
