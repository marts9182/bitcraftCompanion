# Phase 1b — Compendium Web (Items Vertical Slice)

**Date:** 2026-06-05
**Status:** Approved design, ready for implementation plan
**Branch target:** new `phase-1b-compendium-items` off `main`

## 1. Goal

Build the first public-facing slice of the BitCraft Companion Compendium: a fast,
SEO-strong, browsable **Items** section over the data already ingested into Neon
Postgres (7,425 items, plus the recipe craft graph). This slice establishes the
patterns (data access, routing, rendering, SEO, layout) that later replicate to
cargo, buildings, and recipes.

Aligns with the parent design spec `2026-06-04-bitcraft-companion-design.md`
(§8 data model, §9 SEO/AEO, §12 aesthetic, Phase 1 Compendium MVP).

## 2. Scope

**In scope (this iteration):**
- `/items` — searchable, filterable, paginated list page.
- `/items/[slug]` — item detail page including the craft graph.
- Web-local data-access layer over `@bcc/shared/db`.
- ISR rendering + on-demand revalidation hook for the worker.
- Per-page SEO (metadata, JSON-LD, sitemap of item slugs).
- Text-first visual baseline using shadcn/ui on the existing dark theme.

**Out of scope (explicit follow-ups):**
- Cargo / buildings / recipes pages (replicate this pattern later).
- Real icon images (text-first now; `iconAssetName` stored but unused visually).
- A `/compendium` hub landing page.
- Advanced/instant client-side search.
- `llms.txt` and OG-image generation.
- DB-integration test harness.

## 3. Constraints

- **Bundle safety (hard):** the web app imports ONLY the narrow subpaths
  `@bcc/shared/db` (`createDb`) and `@bcc/shared/db/schema`. It MUST NOT import
  the `@bcc/shared` barrel, which re-exports `ReadOnlySpacetime` and pulls the
  SpacetimeDB SDK into the bundle.
- **Server-only data access:** query modules run only in Server Components / route
  handlers; never shipped to the client. `DATABASE_URL` stays server-side.
- **Public repo:** no secrets in code; the revalidation route is guarded by a
  secret from env.

## 4. Architecture

### 4.1 Data-access layer — `apps/web/lib/queries/items.ts` (server-only)

Functions (thin over Drizzle, using `createDb(process.env.DATABASE_URL)`):

- `listItems({ q?, tier?, rarity?, tag?, page })` → `{ rows, total, page, pageSize }`.
  - `q`: case-insensitive name match (`ILIKE %q%`).
  - `tier`, `rarity`, `tag`: equality filters (indexed columns).
  - Pagination: `pageSize = 50`; returns total count for pager.
- `getItemBySlug(slug)` → `Item | null` (null → `notFound()`).
- `getItemCraftGraph(itemId)` → `{ madeBy: RecipeRef[], usedIn: RecipeRef[] }`:
  - **madeBy**: recipes whose `recipe_outputs` reference this item.
  - **usedIn**: recipes whose `recipe_inputs` reference this item.
  - Each `RecipeRef` resolves the recipe (id, name, slug, type) and its other
    inputs/outputs, with each stack's quantity and the referenced entity's name +
    slug + refType (item|cargo), joined back to `items`/`cargo` by `ref_type`+`ref_id`.
- `listAllItemSlugs()` → slugs for `generateStaticParams` and the sitemap.

### 4.2 Pure view-model builders — `apps/web/lib/queries/craft-graph.ts`

Separate pure functions transform raw joined rows into the display shape
(`madeBy`/`usedIn` grouped by recipe with resolved references). Pure → unit
testable with fixture rows, no DB.

### 4.3 Routes / components — `apps/web/app/items/`

- `app/items/page.tsx` — list page (Server Component). Reads `searchParams`
  (`q`, `tier`, `rarity`, `tag`, `page`); renders a results table/grid + filter
  controls + pager. Dynamic (uses searchParams); queries cached per param set.
- `app/items/[slug]/page.tsx` — detail page (Server Component). ISR.
- Components in `apps/web/components/compendium/`: `ItemCard`/`ItemRow`,
  `RarityBadge`, `TierBadge`, `CraftGraphSection`, `RecipeRefList`, `Pager`,
  `ItemFilters`. Reuse existing shadcn `card`/`button`; add `badge`/`table`/
  `input` as needed.

## 5. Rendering strategy (ISR)

- `/items/[slug]`: `generateStaticParams()` returns all item slugs;
  `export const dynamicParams = true`; `export const revalidate = 86400` (24h).
- **On-demand revalidation:** `app/api/revalidate/route.ts` (POST, guarded by a
  shared secret in env, e.g. `REVALIDATE_SECRET`). Accepts changed slugs (or "all")
  and calls `revalidatePath`/`revalidateTag`. The worker calls this after a
  successful ingestion run so updated data appears without a redeploy. (Worker
  wiring is a small follow-up; the route ships in this slice.)
- `/items` list: dynamic via `searchParams`, with `unstable_cache`/`revalidate`
  on the underlying queries to avoid hammering Neon under crawl load.

## 6. SEO / AEO

- `generateMetadata` per item: `title = item.name`, description derived from
  `item.description` (truncated), canonical `/items/[slug]`, OpenGraph/Twitter
  via `lib/seo.ts` defaults.
- JSON-LD: `BreadcrumbList` (Home › Items › <name>) + an entity object
  (`Thing`/`Product`-style: name, description) on detail; `ItemList` on the list
  page (first page).
- `sitemap.ts`: expanded to enumerate all item slugs (via `listAllItemSlugs`)
  alongside the static routes.
- Clean, semantic HTML and descriptive internal links (item ↔ recipe ↔ item).

## 7. Aesthetic

Text-forward, dense-but-clean presentation on the existing dark-first theme using
shadcn/ui primitives. Rarity is color-coded; tier shown as a badge; placeholder
icon slot reserved for future real icons. Pixel-level "premium" polish is the
deferred frontend-design pass; this slice delivers a tasteful, consistent baseline.

## 8. Error handling

- Unknown slug → `notFound()` (404 page).
- Empty search/filter results → friendly empty state, still indexable.
- DB/query error → error boundary; never leak connection details.
- Missing/invalid revalidation secret → 401.

## 9. Testing

- Unit tests (vitest) for the pure view-model builders in `craft-graph.ts`
  (madeBy/usedIn grouping, reference resolution, quantity handling) with fixture
  rows covering: item with multiple recipes, item used as both input and output,
  cargo references, and an item with no recipes.
- Unit test for filter→query param mapping (pure helper that builds the where
  conditions / validates/normalizes searchParams).
- A lightweight render test of the detail page with sample props.
- DB-integration tests deferred (queries kept thin over Drizzle).

## 10. Open follow-ups (post-slice)

1. Replicate to cargo, buildings, recipes (shared list/detail patterns).
2. Wire the worker to call `/api/revalidate` after ingestion.
3. Real icon sourcing/hosting.
4. `/compendium` hub + global search.
5. `llms.txt`, OG image generation, richer JSON-LD.
