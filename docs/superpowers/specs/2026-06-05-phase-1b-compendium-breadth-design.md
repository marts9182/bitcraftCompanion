# Phase 1b (cont.) — Compendium Breadth: Cargo, Buildings, Recipes

**Date:** 2026-06-05
**Status:** Approved design, ready for implementation plan
**Branch:** work directly on `main` (current workflow — no feature branch)

## 1. Goal

Extend the shipped items Compendium slice to the remaining ingested entity types —
**cargo, buildings, recipes** — plus a `/compendium` hub and global navigation, so
the Compendium covers all four entity types with consistent search/detail/SEO.

Builds on `2026-06-05-phase-1b-compendium-items-design.md` (the items vertical
slice) and reuses its patterns.

## 2. Scope

**In scope:**
- `/cargo` + `/cargo/[slug]` — item-like list + detail (with craft graph).
- `/buildings` + `/buildings/[slug]` — list (search only, compendium-visible) + simple detail.
- `/recipes` + `/recipes/[slug]` — list (search + type filter) + detail (inputs/outputs + requirements).
- `/compendium` hub page linking the four sections.
- Global navigation (in `layout.tsx`) linking Home + the four sections.
- Light generalization of shared pure helpers; enhance the craft graph to link cargo.
- Extend `sitemap.ts` and `/api/revalidate` to the new sections.
- Per-page SEO (metadata + JSON-LD) and ISR for all new detail pages.

**Out of scope (noted follow-ups):**
- Rendering building `functions` (opaque positional jsonb — needs decoding).
- Building ↔ recipe linking (via `building_requirement`).
- Real icons, global cross-entity search, advanced/faceted filters.
- Refactoring the already-shipped items code onto the new generic helpers.

## 3. Data facts (verified)

- `cargo` 557 rows; schema mirrors items (id, slug, name, description, tier, rarity, tag, volume) — no durability.
- `buildings` 954 rows, **662 with `show_in_compendium = true`**; `functions` is opaque positional jsonb (`[[1002,-1,0,...]]`) — not rendered.
- `recipes` 7,494 crafting + 700 construction; columns id, slug, name, type, time_requirement, stamina_requirement.
- `recipe_inputs`/`recipe_outputs` reference items AND cargo (`ref_type` ∈ {item, cargo}); both resolvable to name+slug.

## 4. Constraints (unchanged from items slice)

- Web imports ONLY `@bcc/shared/db` (+ `/db/schema`) via `apps/web/lib/db.ts` — never the `@bcc/shared` barrel (keeps the SDK out of the bundle).
- Query modules are server-only (`import "server-only"`).
- No secrets in code; `/api/revalidate` stays secret-guarded.

## 5. Architecture

### 5.1 Shared pure helpers (light generalization)

- `apps/web/lib/jsonld.ts`: add `thingJsonLd(name, description, url)` — a generic
  schema.org `Thing` builder (the existing `itemJsonLd` is a special case; keep
  `itemJsonLd` as-is for the shipped items page, OR have it delegate — implementer's
  choice, but do NOT change items page behavior). New entity detail pages use
  `thingJsonLd`.
- `apps/web/lib/queries/list-params.ts` (new): `parseListParams(raw, allowedFilters: string[])`
  → `{ q?: string; page: number; filters: Record<string, string> }`. Pure, unit-tested.
  Reused by cargo/buildings/recipes list pages. (Items keeps its existing
  `parseItemListParams` — untouched.)

### 5.2 Craft-graph enhancement (benefits items + cargo)

- `apps/web/components/compendium/CraftGraphSection.tsx` (`StackList`): link cargo
  refs to `/cargo/<slug>` (currently only item refs link, to `/items/<slug>`; cargo
  rendered as text). Item refs → `/items/<slug>`, cargo refs → `/cargo/<slug>`,
  slugless → text. No query change needed (`getItemCraftGraph` already resolves
  cargo name+slug).

### 5.3 Query modules (server-only, mirror items)

- `apps/web/lib/queries/cargo.ts`: `listCargo(params)`, `getCargoBySlug(slug)`,
  `listAllCargoSlugs()`, `getCargoCraftGraph(cargoId)`. The craft-graph fetch is the
  same shape as items but filters `ref_type = "cargo"` for the queried entity.
  Reuses `buildCraftGraph` (pure) and the same ref-resolution.
- `apps/web/lib/queries/buildings.ts`: `listBuildings(params)` (filtered to
  `show_in_compendium = true`, name search only), `getBuildingBySlug(slug)`,
  `listAllBuildingSlugs()` (compendium-visible only).
- `apps/web/lib/queries/recipes.ts`: `listRecipes(params)` (name search + optional
  `type` filter), `getRecipeBySlug(slug)`, `listAllRecipeSlugs()`,
  `getRecipeStacks(recipeId)` → `{ inputs: StackView[]; outputs: StackView[] }` by
  reading `recipe_inputs`/`recipe_outputs` for that recipe and resolving refs to
  name+slug+refType (reuse the resolution helper from items' craft-graph fetch;
  factor a shared `resolveRefs(db, stacks)` helper in `lib/queries/refs.ts` if it
  reduces duplication).

### 5.4 Components

- Reuse `RarityBadge`, `TierBadge`, `Pager`, `CraftGraphSection`, `Input`.
- `apps/web/components/compendium/EntityTable.tsx` (new, optional generic) OR small
  per-entity tables. Recommended: a generic `EntityTable` taking `basePath`, rows,
  and a column set — used by cargo (Name/Tier/Rarity/Tag), buildings (Name), recipes
  (Name/Type). Keep it simple; if a generic table gets awkward, use small per-entity
  tables that reuse the badges. Add a `RecipeTypeBadge` for crafting/construction.
- Filter forms: reuse `ItemFilters` pattern. Cargo needs the same filters as items;
  recipes needs a `type` select; buildings needs search only. Implementer may
  generalize `ItemFilters` into a small configurable filter form or add per-entity
  variants — keep it light.

### 5.5 Pages (Server Components, ISR)

Each detail page: `export const revalidate = 86400; export const dynamicParams = true;`
`generateStaticParams` over that entity's slugs; `generateMetadata` (title=name,
description, canonical, OG); body fetches by slug → `notFound()` if missing;
JSON-LD (BreadcrumbList + thingJsonLd; recipes also fine with thingJsonLd) via
`jsonLdScript`. List pages read `searchParams` (awaited), parse via
`parseListParams`, query, render filter form + table + Pager + ItemList JSON-LD.

- Recipe detail centers on: type (badge), time/stamina, and Inputs → Outputs using
  the stack rendering (links to items/cargo).
- Building detail: name + description (+ breadcrumb). No graph, no functions.

### 5.6 Hub + navigation

- `apps/web/app/compendium/page.tsx`: hub linking Items, Cargo, Buildings, Recipes
  (with counts optional), plus breadcrumb/metadata.
- `apps/web/app/layout.tsx`: a global `<header>`/nav with links to Home + the four
  sections (Items, Cargo, Buildings, Recipes) and/or the hub. Keep it minimal and
  consistent with the dark theme.

### 5.7 Cross-cutting

- `sitemap.ts`: add `/compendium`, `/cargo`, `/buildings`, `/recipes` and enumerate
  cargo/buildings(visible)/recipes slugs alongside items.
- `/api/revalidate`: on `{all:true}`, revalidate every section's list + detail route
  group (`/items`, `/items/[slug]`, `/cargo`, `/cargo/[slug]`, `/buildings`,
  `/buildings/[slug]`, `/recipes`, `/recipes/[slug]`). The per-slug body
  (`{slugs:[...]}`) stays items-only this iteration (generalizing it to other
  sections is a noted follow-up); `{all:true}` is the path that must cover everything.

## 6. SEO / AEO

- Per-page `generateMetadata` (title, description, canonical, OG) for every list and
  detail page.
- JSON-LD: `BreadcrumbList` + `thingJsonLd` on detail pages; `ItemList` on list pages
  (first page); hub gets a breadcrumb. All embedded via `jsonLdScript` (escaped).
- Sitemap covers all entities; descriptive internal links (recipe ↔ item/cargo,
  hub ↔ sections).

## 7. Error handling

- Unknown slug → `notFound()` (404). Empty results → friendly empty state.
- DB error → Next default error page (no detail leak). Revalidate secret invalid → 401.

## 8. Testing

- Unit tests (vitest, `.test.ts`, node env — pure only):
  - `parseListParams`: defaults, q trim, allowed-filter passthrough, unknown filter
    dropped, page clamp, array-first.
  - Recipe stack → view-model resolution (if a pure builder is factored): item vs
    cargo refType, resolved vs placeholder, quantity.
  - `thingJsonLd`: shape, description omitted when empty.
- Reuse existing `buildCraftGraph`/`jsonLdScript` tests.
- Runtime smoke (manual / controller): each list returns rows; a cargo detail shows
  craft graph with cargo links resolving; a recipe detail shows inputs/outputs linked;
  a building detail shows name/description; bad slugs 404; nav + hub link correctly.
- Full suite + `pnpm --filter @bcc/web typecheck` + bundle-safety grep must pass.

## 9. Open follow-ups (post-iteration)

1. Render/decode building `functions`; link buildings ↔ recipes (`building_requirement`).
2. Optionally refactor the items slice onto `parseListParams`/`EntityTable`/`thingJsonLd`.
3. Real icons; global cross-entity search; faceted filters.
4. Wire the worker to call `/api/revalidate` after ingestion (carried over).
