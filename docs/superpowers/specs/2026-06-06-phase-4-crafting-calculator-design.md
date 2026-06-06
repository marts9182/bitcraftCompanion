# Phase 4 — Crafting Calculator — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming → spec). Next: implementation plan.
**Phase:** 4 (first sub-project). Builds entirely on existing static recipe data; no new ingestion, no live pipeline.

## 1. Summary

Given a **target** (item or cargo) and a **quantity**, recursively expand its recipe
tree down to raw materials and produce three things:

1. A flattened **shopping list** of raw/base materials and their total quantities.
2. **Summed totals** — total craft time and stamina across every sub-craft.
3. An interactive **craft tree** with per-node **recipe swapping**.

This is the tool BitCraft players want most, and it sits directly on data we already
ingest: `recipes` (with `time_requirement` / `stamina_requirement`),
`recipe_inputs`, `recipe_outputs`, `items`, `cargo`.

## 2. Scope

**In (v1):**
- Targets: **items and cargo** produced by crafting recipes.
- Recursive bill-of-materials expansion to raw materials.
- Shopping list, summed time/stamina totals, collapsible craft tree.
- Per-node recipe swapping with instant recompute.
- Dedicated `/calculator` page + a "Calculate materials" entry point on item/cargo
  detail pages.

**Out (deferred):**
- **Building / construction recipes** (`type = "construction"`) — different target
  type and UX; revisit later.
- **"Already have / will gather" toggles** that stop expansion for chosen materials —
  a natural v2 add (the engine's `selections` model leaves room for it).
- Market prices / cost-in-currency (depends on the deferred live market pipeline).

## 3. Architecture — one pure engine, two runtimes

A single **pure, fully-unit-tested engine** runs in both places:

- **Server (SSR):** computes the default expansion so the page is indexable for SEO
  and works without JavaScript.
- **Client:** when a user swaps a recipe on a node, the **same engine** re-runs in the
  browser — no server round-trip.

To enable client-side recompute without shipping all ~8,276 recipes, the server first
computes the **transitive closure** of the target — only the recipes reachable from it
(typically dozens; a few KB) — and hands that compact subgraph to the client. A recipe
swap just re-runs the pure engine over that subgraph with an updated selection.

```
target + qty ──▶ [DB: build closure subgraph] ──▶ engine(subgraph, selections)
                                                      │
                              ┌───────────────────────┼────────────────────────┐
                          shopping list          totals (time/stamina)      craft tree
```

## 4. The engine (pure) — `apps/web/lib/calculator/`

Mirrors the existing split between `craft-graph.ts` (pure) and `craft-graph-db.ts`
(DB access).

### Inputs
- **Subgraph:**
  - `recipesByRef: Map<RefKey, CalcRecipe[]>` — for each reachable ref, the recipes
    that produce it. `RefKey = "${refType}:${refId}"`.
  - `refInfo: Map<RefKey, { name; slug; iconAssetName? }>` — display info.
  - A `CalcRecipe` carries: `id`, `type`, `timeRequirement`, `staminaRequirement`,
    `inputs: { refType; refId; quantity }[]`, and the `outputQty` of the target ref.
- **Target:** `{ refType; refId; quantity }`.
- **Selections:** `Map<RefKey, recipeId>` — which recipe to use at each multi-recipe
  node. Missing entries are filled with the default heuristic.

### Outputs
- `tree`: nested craft nodes (ref, chosen recipe, craft count, surplus, children).
- `shoppingList`: flattened raw-material lines `{ refType; refId; name; slug; icon?; quantity }`.
- `totals`: `{ timeRequirement; staminaRequirement }` summed across all crafts.
- `nodesWithAlternatives`: refs that have >1 producing recipe (drives the swap UI).

### Rules
- **Leaf / raw material:** a ref with no producing recipe is a shopping-list line;
  recursion stops there.
- **Quantity math:** a recipe yields `outputQty` of its target per craft. To produce
  `needed`, do `crafts = ceil(needed / outputQty)`. Each input contributes
  `crafts × inputQty`. **Surplus** = `crafts × outputQty − needed` (surfaced in the
  tree). Time/stamina contribution = `crafts × recipe.timeRequirement` (and stamina
  likewise); `null` requirements count as 0.
- **Default recipe** (when several recipes produce a ref): pick **fewest distinct
  inputs, tie-break lowest recipe id** — deterministic and simple. User-swappable.
- **Cycle guard:** maintain a `visited` set along the current path. If a ref reappears,
  treat it as a leaf (raw) to prevent infinite recursion.

## 5. Data layer — `apps/web/lib/queries/calculator-graph.ts`

Builds the closure subgraph for a target by walking the recipe graph level by level,
batching each level with `inArray` (bounded query count, not one query per node).
Reuses `recipeInputs` / `recipeOutputs` / `items` / `cargo` and the existing
`resolveRefs` pattern from `craft-graph-db.ts`.

Algorithm:
1. Seed a frontier with the target ref.
2. For the current frontier, fetch all recipes whose **output** matches those refs
   (`recipe_outputs`), plus those recipes' **inputs** (`recipe_inputs`).
3. New input refs not yet seen become the next frontier.
4. Stop when the frontier is empty (all reached refs are raw or already expanded).
5. Resolve all reached refs to `name`/`slug`/`icon` via a batched `resolveRefs`.

Returns the serializable subgraph the engine consumes (and that ships to the client).
Restricted to crafting recipes for v1 (`type` filter), so construction recipes don't
pull buildings into the graph.

## 6. UI

- **`/calculator` page:** a target search box + quantity input. SSR's the default
  result for whatever target is selected. Empty state explains the tool.
- **Per-item entry point:** a "Calculate materials" button on item and cargo detail
  pages, deep-linking to `/calculator/<item|cargo>/<slug>` (SSR'd, indexable). These
  routes share the page's result components.
- **Results layout:**
  - **Shopping List** — raw materials with icons, quantities, links to entity pages.
  - **Totals** card — formatted total time and stamina.
  - **Craft Tree** — collapsible nodes. Each node shows the ref, the recipe used, the
    craft count, and any surplus. Nodes in `nodesWithAlternatives` render a recipe-swap
    dropdown; selecting an alternative triggers a **client-side** recompute over the
    already-loaded subgraph.

### SEO
The `/calculator/<type>/<slug>` routes SSR the default expansion (metadata + readable
content) so they are indexable. Interactive swapping is a progressive enhancement.

## 7. Testing

**Engine (pure unit tests):**
- single one-level craft (target made directly from raw inputs);
- multi-level recursion (intermediates expand correctly);
- quantity rounding and surplus (`ceil` math, leftover surfaced);
- multiple-recipe default selection (fewest inputs, id tie-break);
- recipe swap recompute (different selection → different tree/list/totals);
- raw-material target (no recipe → "this is a raw material");
- cycle guard (A↔B does not infinite-loop).

**Data layer:** a closure smoke test confirming the subgraph for a known multi-level
item contains the expected refs and recipes.

## 8. Files (anticipated)

- `apps/web/lib/calculator/expand.ts` — pure engine.
- `apps/web/lib/calculator/expand.test.ts` — engine tests.
- `apps/web/lib/calculator/types.ts` — shared types (subgraph, tree, result).
- `apps/web/lib/queries/calculator-graph.ts` — closure builder (DB).
- `apps/web/app/calculator/page.tsx` — dedicated page.
- `apps/web/app/calculator/[type]/[slug]/page.tsx` — per-target SSR route.
- `apps/web/components/calculator/*` — ShoppingList, TotalsCard, CraftTree (+ swap),
  TargetSearch.
- Wiring: nav link, "Calculate materials" buttons on item/cargo detail pages, sitemap
  + llms.txt entries.

## 9. Non-goals / risks

- The closure could be large for deeply-nested late-game items; if a target's subgraph
  is unexpectedly big, the level-batched builder still bounds queries, and the client
  payload stays the reachable subgraph (not the whole DB). Add a depth/size guard only
  if a real target proves pathological (YAGNI until observed).
- Default-recipe heuristic is intentionally simple; "cheapest tree" selection is a
  future enhancement once a cost metric (e.g. market price) exists.
