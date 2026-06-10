# Recipes: readable names + makeable filter + tier filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/recipes`, show each recipe by its primary output (name + icon) with an action-verb badge, list only recipes that actually produce an item/cargo (tier ≠ −1), and add a Tier (1–10) filter — all query-time, no schema change.

**Architecture:** A pure `recipeVerb` helper extracts the verb from the template name. `listRecipes` is rewritten as a raw SQL query that picks each recipe's primary output (Postgres `DISTINCT ON`, highest-quantity output), resolves name/icon/tier/rarity, and filters by makeable + type + tier + search. The list page renders a purpose-built table; the detail page reuses a small `getRecipePrimaryOutput` helper for its title.

**Tech Stack:** Next.js 16 (RSC), Drizzle (`db.execute(sql\`…\`)`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-recipes-names-tier-filter-design.md`

**Conventions (every commit):** `pnpm --filter @bcc/web typecheck` per task; commit to `main`; messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
**Create:** `apps/web/lib/recipes.ts` (+ `apps/web/lib/recipes.test.ts`) — `recipeVerb`.
**Modify:** `apps/web/lib/queries/recipes.ts` (rewrite `listRecipes`, add `getRecipePrimaryOutput`); `apps/web/app/recipes/page.tsx` (tier filter + custom table); `apps/web/app/recipes/[slug]/page.tsx` (title from output + verb).

---

## Task 1: `recipeVerb` pure helper (TDD)

**Files:** Create `apps/web/lib/recipes.ts`, `apps/web/lib/recipes.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/web/lib/recipes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { recipeVerb } from "./recipes";

describe("recipeVerb", () => {
  it("takes the text before the first placeholder", () => {
    expect(recipeVerb("Craft {0}")).toBe("Craft");
    expect(recipeVerb("Recraft {1}")).toBe("Recraft");
    expect(recipeVerb("Forge {0}")).toBe("Forge");
    expect(recipeVerb("Package {1} into {0}")).toBe("Package");
    expect(recipeVerb("Braid {0} from {1}")).toBe("Braid");
  });
  it("falls back to the trimmed whole string when there is no placeholder", () => {
    expect(recipeVerb("Smelt")).toBe("Smelt");
    expect(recipeVerb("  Mix  ")).toBe("Mix");
  });
});
```

- [ ] **Step 2: Run it (fails)** — `pnpm exec vitest run apps/web/lib/recipes.test.ts` (from repo root) → FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/lib/recipes.ts`:
```ts
/** The action verb of a recipe, from its localization-template name:
 *  the text before the first "{…}" placeholder (e.g. "Package {1} into {0}" → "Package").
 *  Falls back to the trimmed whole string when there is no placeholder. */
export function recipeVerb(template: string): string {
  const i = template.indexOf("{");
  const v = (i === -1 ? template : template.slice(0, i)).trim();
  return v || template.trim();
}
```

- [ ] **Step 4: Run it (passes)** — `pnpm exec vitest run apps/web/lib/recipes.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/web/lib/recipes.ts apps/web/lib/recipes.test.ts
git commit -m "feat(recipes): recipeVerb helper (verb from template name) + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `listRecipes` + add `getRecipePrimaryOutput`

**Files:** Modify `apps/web/lib/queries/recipes.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire `apps/web/lib/queries/recipes.ts` with:
```ts
import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRecipeStacks } from "./craft-graph-db";
import { PAGE_SIZE, type ListParams } from "./list-params";
import { recipeVerb } from "@/lib/recipes";

export type RecipeRow = typeof schema.recipes.$inferSelect;

/** A row for the recipes list, resolved to what the recipe produces. */
export interface RecipeListRow {
  slug: string;
  name: string; // primary output (item/cargo) name — the display title
  verb: string; // action verb from the recipe template
  type: string; // crafting | construction
  tier: number | null; // primary output tier
  iconAssetName: string | null;
  rarity: string;
}
export interface RecipeListResult {
  rows: RecipeListRow[];
  total: number;
  page: number;
  pageSize: number;
}

// Each recipe's primary output = the highest-quantity output stack (tiebreak lowest ref_id),
// joined to items/cargo for name/icon/tier/rarity.
const PRIMARY_OUT = sql`
  WITH primary_out AS (
    SELECT DISTINCT ON (r.id)
      r.id, r.slug, r.name AS template, r.type,
      COALESCE(i.name, c.name) AS out_name,
      COALESCE(i.icon_asset_name, c.icon_asset_name) AS out_icon,
      COALESCE(i.tier, c.tier) AS out_tier,
      COALESCE(i.rarity, c.rarity, 'Default') AS out_rarity
    FROM recipes r
    JOIN recipe_outputs ro ON ro.recipe_id = r.id
    LEFT JOIN items i ON ro.ref_type = 'item' AND i.id = ro.ref_id
    LEFT JOIN cargo c ON ro.ref_type = 'cargo' AND c.id = ro.ref_id
    ORDER BY r.id, ro.quantity DESC, ro.ref_id
  )`;

export async function listRecipes(params: ListParams): Promise<RecipeListResult> {
  const db = getDb();
  // Makeable: has a real output, not the tier -1 sentinel.
  const conds = [sql`out_name IS NOT NULL`, sql`out_tier <> -1`];
  const type = params.filters.type;
  if (type === "crafting" || type === "construction") conds.push(sql`type = ${type}`);
  const tierNum = params.filters.tier ? Number.parseInt(params.filters.tier, 10) : NaN;
  if (Number.isInteger(tierNum) && tierNum >= 1 && tierNum <= 10) conds.push(sql`out_tier = ${tierNum}`);
  if (params.q) conds.push(sql`out_name ILIKE ${"%" + params.q + "%"}`);
  const where = sql.join(conds, sql` AND `);

  const totalRes = await db.execute(sql`${PRIMARY_OUT} SELECT count(*)::int AS total FROM primary_out WHERE ${where}`);
  const total = (totalRes as unknown as { total: number }[])[0]?.total ?? 0;

  const rowsRes = await db.execute(sql`
    ${PRIMARY_OUT}
    SELECT slug, template, type, out_name, out_icon, out_tier, out_rarity
    FROM primary_out
    WHERE ${where}
    ORDER BY out_name
    LIMIT ${PAGE_SIZE} OFFSET ${(params.page - 1) * PAGE_SIZE}
  `);
  const raw = rowsRes as unknown as {
    slug: string;
    template: string;
    type: string;
    out_name: string;
    out_icon: string | null;
    out_tier: number | null;
    out_rarity: string;
  }[];
  const rows: RecipeListRow[] = raw.map((r) => ({
    slug: r.slug,
    name: r.out_name,
    verb: recipeVerb(r.template),
    type: r.type,
    tier: r.out_tier,
    iconAssetName: r.out_icon,
    rarity: r.out_rarity,
  }));
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

/** The primary output (name/icon/tier/rarity) for one recipe, or null if it has none. */
export async function getRecipePrimaryOutput(
  recipeId: number,
): Promise<{ name: string; iconAssetName: string | null; tier: number | null; rarity: string } | null> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT DISTINCT ON (r.id)
      COALESCE(i.name, c.name) AS out_name,
      COALESCE(i.icon_asset_name, c.icon_asset_name) AS out_icon,
      COALESCE(i.tier, c.tier) AS out_tier,
      COALESCE(i.rarity, c.rarity, 'Default') AS out_rarity
    FROM recipes r
    JOIN recipe_outputs ro ON ro.recipe_id = r.id
    LEFT JOIN items i ON ro.ref_type = 'item' AND i.id = ro.ref_id
    LEFT JOIN cargo c ON ro.ref_type = 'cargo' AND c.id = ro.ref_id
    WHERE r.id = ${recipeId}
    ORDER BY r.id, ro.quantity DESC, ro.ref_id
  `);
  const row = (res as unknown as { out_name: string | null; out_icon: string | null; out_tier: number | null; out_rarity: string }[])[0];
  if (!row || row.out_name == null) return null;
  return { name: row.out_name, iconAssetName: row.out_icon, tier: row.out_tier, rarity: row.out_rarity };
}

export async function getRecipeBySlug(slug: string): Promise<RecipeRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.recipes).where(eq(schema.recipes.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllRecipeSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.recipes.slug }).from(schema.recipes);
  return rows.map((r) => r.slug);
}

export { getRecipeStacks };
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/lib/queries/recipes.ts
git commit -m "feat(recipes): resolve list to primary output + makeable/tier filters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Recipes list page — tier filter + output table

**Files:** Modify `apps/web/app/recipes/page.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire `apps/web/app/recipes/page.tsx` with:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { RecipeTypeBadge } from "@/components/compendium/RecipeTypeBadge";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listRecipes } from "@/lib/queries/recipes";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Browse BitCraft Online crafting recipes by what they produce, filterable by tier.",
  alternates: { canonical: "/recipes" },
};

type SP = Record<string, string | string[] | undefined>;

const TIER_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `Tier ${i + 1}` }));

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, ["type", "tier"]);
  const { rows, total, page, pageSize } = await listRecipes(params);
  const flat: Record<string, string | undefined> = { q: params.q, type: params.filters.type, tier: params.filters.tier };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/recipes/${r.slug}` })), `${SITE_URL}/recipes`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} makeable recipes</p>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/recipes"
          fields={[
            { name: "q", placeholder: "Search by output…", className: "max-w-xs" },
            {
              name: "type",
              placeholder: "All types",
              kind: "select",
              options: [
                { value: "crafting", label: "Crafting" },
                { value: "construction", label: "Construction" },
              ],
            },
            { name: "tier", placeholder: "All tiers", kind: "select", options: TIER_OPTIONS },
          ]}
        />
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Recipe</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 text-right">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <Link href={`/recipes/${r.slug}`} className="inline-flex items-center gap-2 hover:underline">
                      <EntityIcon assetName={r.iconAssetName} name={r.name} rarity={r.rarity} size={24} />
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.verb}</td>
                  <td className="py-2 pr-3"><RecipeTypeBadge type={r.type} /></td>
                  <td className="py-2 text-right tabular-nums">{r.tier ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No recipes match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-6">
          <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/recipes" />
        </div>
      </div>
    </main>
  );
}
```

(`parseListParams(sp, ["type","tier"])` — `parseListParams` already whitelists arbitrary filter keys, so passing `"tier"` is all that's needed; `listRecipes` validates the 1–10 range. `RecipeTypeBadge` and `EntityIcon` already exist. The Type filter is kept per spec; if Construction yields no makeable rows in practice, that's a cosmetic follow-up.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add apps/web/app/recipes/page.tsx
git commit -m "feat(recipes): output-named table + tier filter on the list page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Recipe detail title from output

**Files:** Modify `apps/web/app/recipes/[slug]/page.tsx`

- [ ] **Step 1: Import the helper + verb**

In `apps/web/app/recipes/[slug]/page.tsx`, update the recipes-query import line:
```tsx
import { getRecipeBySlug, getRecipeStacks, getRecipePrimaryOutput, listAllRecipeSlugs } from "@/lib/queries/recipes";
```
and add after the `@/lib/seo` import:
```tsx
import { recipeVerb } from "@/lib/recipes";
```

- [ ] **Step 2: Resolve the title in `generateMetadata`**

Replace the body of `generateMetadata` (after `if (!r) return …`) so the title uses the output:
```tsx
  const out = await getRecipePrimaryOutput(r.id);
  const title = out?.name ?? r.name;
  const description = `${title} — a BitCraft ${r.type} recipe.`;
  return {
    title,
    description,
    alternates: { canonical: `/recipes/${r.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/recipes/${r.slug}` },
  };
```

- [ ] **Step 3: Resolve the title in the page body**

In `RecipeDetailPage`, after `const { inputs, outputs } = await getRecipeStacks(r.id);` add:
```tsx
  const out = await getRecipePrimaryOutput(r.id);
  const title = out?.name ?? r.name;
  const verb = recipeVerb(r.name);
```
Then change `const description = …` to use `title`:
```tsx
  const description = `${title} — a BitCraft ${r.type} recipe.`;
```
In the JSON-LD breadcrumb + thing, replace `r.name` with `title` (the `{ name: r.name, url }` entry → `{ name: title, url }`, and `thingJsonLd(r.name, …)` → `thingJsonLd(title, …)`). In the markup, change the breadcrumb `<span>{r.name}</span>` → `<span>{title}</span>`, the `<h1 …>{r.name}</h1>` → `<h1 …>{title}</h1>`, and add the verb next to the type badge — change the badge row's first child to include the verb:
```tsx
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{verb}</span>
        <RecipeTypeBadge type={r.type} />
        {r.timeRequirement != null && <span className="text-muted-foreground">{r.timeRequirement}s</span>}
        {r.staminaRequirement != null && <span className="text-muted-foreground">{r.staminaRequirement} stamina</span>}
      </div>
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @bcc/web typecheck` → no errors.
```bash
git add "apps/web/app/recipes/[slug]/page.tsx"
git commit -m "feat(recipes): detail title from primary output + verb badge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verification

- [ ] **Step 1: Typecheck** — `pnpm typecheck` → all pass.
- [ ] **Step 2: Tests** — `pnpm test` → all pass incl. the new `recipeVerb` tests (was 182, now 184).
- [ ] **Step 3: Build** — `pnpm --filter @bcc/web build` → succeeds.
- [ ] **Step 4: Live/local check (after deploy or `pnpm --filter @bcc/web dev`):** `/recipes` shows readable output names + icons (no `{0}` templates), an Action verb column, a working **Tier** dropdown + Type filter + output search; the count reads "{n} makeable recipes"; a recipe detail page title is the output name with a verb badge.
- [ ] **Step 5: Push (deploys via Netlify)**
```bash
git push origin main
```

---

## Spec coverage check
- §1/§2 primary-output resolution (DISTINCT ON, highest qty) + verb → Task 1 (`recipeVerb`) + Task 2 (query). ✓
- §3 `listRecipes` rewrite (join, makeable WHERE tier≠-1, type/tier/q filters, paginate, count) → Task 2. ✓
- §4 list page: "makeable" count, Type + Tier filters, purpose-built output table, `tier` param → Task 3. ✓
- §5 detail title from output + verb badge → Task 4. ✓
- §6 testing (recipeVerb unit + typecheck/build) → Task 1 + Task 5. ✓
- §7 out-of-scope (calculator/craft-graph untouched; no denormalization; scroll-wrapper not cards) → respected. ✓
