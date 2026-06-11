/**
 * Command-palette sources + pure merging/ranking. Client-safe (no server
 * imports). The CommandPalette component feeds the lazily fetched suggest
 * catalogs plus the static page list through buildPaletteResults on every
 * keystroke — same client-side filtering model as TypeaheadSearch.
 *
 * v1 follow-up: settlements/empires/players are NOT searchable here yet —
 * they have no /api/suggest catalogs (their lists live behind server-rendered
 * search pages). Add slim suggest catalogs for them, append the kinds to
 * SUGGEST_KINDS, and they will slot straight into this merge.
 */
import { NAV, isNavGroup, type NavLink } from "../components/nav-items";
import {
  filterSuggestions,
  SUGGEST_KINDS,
  type SuggestEntry,
  type SuggestKind,
} from "./suggest";

export type PaletteKind = "page" | SuggestKind;

export interface PaletteResult {
  kind: PaletteKind;
  label: string;
  /** Navigation target — pages keep their href, catalog hits get /{kind}/{slug}. */
  href: string;
  tier: number | null;
  /** Recipe action verb ("Smelt", "Bake", …) to disambiguate duplicate output names. */
  verb?: string;
}

/** Badge text per result kind. */
export const PALETTE_KIND_LABEL: Record<PaletteKind, string> = {
  page: "Page",
  items: "Item",
  cargo: "Cargo",
  recipes: "Recipe",
  resources: "Resource",
  creatures: "Creature",
};

export const PALETTE_PAGE_CAP = 6;
export const PALETTE_KIND_CAP = 4;

/** Pages reachable from the palette but absent from the header nav. */
const EXTRA_PAGES: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/market/guide", label: "Market guide" },
];

/**
 * Static page source: the header nav (single source of truth — nav-items.ts)
 * flattened, plus palette-only extras, deduped by href. Group "Overview"
 * entries are renamed ("Compendium overview") so they read sensibly outside
 * their dropdown.
 */
export const PALETTE_PAGES: NavLink[] = (() => {
  const flat: NavLink[] = [...EXTRA_PAGES];
  for (const entry of NAV) {
    if (isNavGroup(entry)) {
      for (const item of entry.items) {
        flat.push(item.label === "Overview" ? { href: item.href, label: `${entry.label} overview` } : item);
      }
    } else {
      flat.push(entry);
    }
  }
  const seen = new Set<string>();
  return flat.filter((p) => (seen.has(p.href) ? false : (seen.add(p.href), true)));
})();

/** Catalogs may still be in flight when the user starts typing — partial is fine. */
export type PaletteCatalogs = Partial<Record<SuggestKind, SuggestEntry[]>>;

/**
 * Merge + rank all palette sources for a query. Pure.
 *
 * - Empty/whitespace query → browse mode: the full page list.
 * - 1 character → pages only (tiny catalog, filtering is already meaningful);
 *   suggest catalogs keep their 2-char minimum, matching TypeaheadSearch.
 * - Pages always rank ahead of catalog hits; catalog kinds keep SUGGEST_KINDS
 *   order. Within each source, prefix matches rank before mid-string matches
 *   (filterSuggestions). Per-source caps keep the list scannable.
 */
export function buildPaletteResults(
  query: string,
  catalogs: PaletteCatalogs,
  pages: NavLink[] = PALETTE_PAGES,
): PaletteResult[] {
  const trimmed = query.trim();
  const pageEntries: SuggestEntry[] = pages.map((p) => ({ name: p.label, slug: p.href, tier: null }));

  if (trimmed.length === 0) {
    return pageEntries.map((p) => ({ kind: "page", label: p.name, href: p.slug, tier: null }));
  }

  const results: PaletteResult[] = filterSuggestions(pageEntries, trimmed, PALETTE_PAGE_CAP, 1).map((p) => ({
    kind: "page",
    label: p.name,
    href: p.slug,
    tier: null,
  }));

  for (const kind of SUGGEST_KINDS) {
    const catalog = catalogs[kind];
    if (!catalog) continue; // not loaded (yet) — skip silently
    for (const s of filterSuggestions(catalog, trimmed, PALETTE_KIND_CAP)) {
      results.push({ kind, label: s.name, href: `/${kind}/${s.slug}`, tier: s.tier, ...(s.verb ? { verb: s.verb } : {}) });
    }
  }
  return results;
}
