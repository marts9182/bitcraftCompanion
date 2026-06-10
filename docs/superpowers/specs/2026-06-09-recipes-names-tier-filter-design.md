# Recipes — readable names + makeable filter + tier filter (design)

**Date:** 2026-06-09
**Status:** Design / approved by user — proceeding to writing-plans.
**Context:** Post-launch polish on `/recipes`. The list shows 8,194 recipes whose **names are unresolved localization templates** (`Craft {0}`, `Recraft {1}`, `Package {1} into {0}`, `Cook {0}`, …) — every recipe uses one, so they're useless as titles. Recipes have no tier of their own, but each maps (via `recipe_outputs`) to an output **item/cargo that has a tier**. ~621 recipes have no item/cargo output (construction/building recipes), and some outputs carry a `-1` tier sentinel. (Data confirmed against the live DB.)

---

## 1. Decisions locked
- ✅ **Title = primary output** (item/cargo name + icon); the template's leading **verb** shown as a small badge.
- ✅ **Makeable filter:** list only recipes that have a real item/cargo output with **tier ≠ -1**.
- ✅ **Tier filter:** a Tier dropdown **1–10** filtering by the output's tier; search matches the **output name**.
- ✅ **Query-time** resolution (no schema change / no re-ingest).

## 2. Primary-output resolution
For each recipe, the **primary output** = the `recipe_outputs` row with the **highest `quantity`** (tiebreak: lowest `ref_id`). Join to `items` (ref_type `item`) or `cargo` (ref_type `cargo`) to get `name`, `icon_asset_name`, `tier`, `rarity`. In Postgres this is `DISTINCT ON (recipe_id)` with `ORDER BY recipe_id, quantity DESC, ref_id`.

The **verb** comes from the recipe's template `name`: the text **before the first `{`**, trimmed (e.g. `Package {1} into {0}` → `Package`, `Craft {0}` → `Craft`). Pure helper `recipeVerb(template: string): string` (fallback: the whole trimmed template if there's no `{`).

## 3. Query — `listRecipes` (`apps/web/lib/queries/recipes.ts`)
Rewrite to return resolved rows. New result row shape:
```ts
interface RecipeListRow {
  slug: string;
  name: string;        // resolved OUTPUT name (display title)
  verb: string;        // from recipeVerb(template)
  type: string;        // crafting | construction
  tier: number | null; // output tier
  iconAssetName: string | null;
  rarity: string;
}
```
- Base: `recipes r JOIN recipe_outputs ro ON ro.recipe_id = r.id LEFT JOIN items i … LEFT JOIN cargo c …`, `DISTINCT ON (r.id)` picking the primary output (ORDER BY `r.id, ro.quantity DESC, ro.ref_id`).
- **Makeable WHERE:** `COALESCE(i.name, c.name) IS NOT NULL AND COALESCE(i.tier, c.tier) <> -1`.
- **Filters:** `type` (= `r.type`), `tier` (= `COALESCE(i.tier,c.tier) = $tier`), `q` (`ilike` on `COALESCE(i.name,c.name)`).
- Wrap the `DISTINCT ON` select in a subquery to **order by output name** and paginate (`limit PAGE_SIZE offset …`). `total` = count over the same filtered/distinct set.
- `verb` computed in JS from the selected `r.name` template via `recipeVerb`.
- Keep `getRecipeBySlug`, `listAllRecipeSlugs`, `getRecipeStacks` as-is.

## 4. List page — `apps/web/app/recipes/page.tsx`
- Header count: "{total} makeable recipes".
- Filters (`CompendiumFilters`): keep **Type** (crafting/construction), add **Tier** select with options 1–10, plus the existing search.
- Replace the generic `EntityTable` with a **purpose-built table** (like settlements/market): columns **Recipe** (icon + output name, links to `/recipes/[slug]`), **Action** (verb badge), **Type**, **Tier**. Tabular, token-styled, mobile-friendly (the responsive-cards pattern is optional here; a horizontal-scroll wrapper is acceptable for v1).
- `parseListParams(sp, ["type", "tier"])` — add `tier` to the recognized filter keys; coerce to a 1–10 int (ignore otherwise).

## 5. Detail page — `apps/web/app/recipes/[slug]/page.tsx`
- Resolve the page **title** to the primary output name + verb badge (consistency with the list), using the same primary-output logic (a shared query helper, e.g. `getRecipePrimaryOutput(recipeId)` or fold into `getRecipeBySlug`). Keep the existing inputs/outputs/time/stamina sections unchanged. `generateStaticParams` (all slugs) unchanged — every recipe still has a detail page by URL.

## 6. Testing & verification
- **Unit (Vitest):** `recipeVerb` — `Craft {0}`→`Craft`, `Package {1} into {0}`→`Package`, `Recraft {1}`→`Recraft`, no-brace fallback.
- `pnpm typecheck` + `pnpm test` green; `pnpm --filter @bcc/web build` succeeds.
- Live check after deploy: `/recipes` shows readable output names + icons, no `{0}` templates; Type + Tier filters + search work; outputless/sentinel recipes are gone; a recipe detail title is readable.

## 7. Out of scope
Calculator/craft-graph (already resolve via items), denormalizing output columns onto `recipes`, mobile card layout for the recipes table (scroll wrapper suffices for v1), construction recipes in the list (intentionally excluded — no item output).
