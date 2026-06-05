# Compendium Breadth (Cargo, Buildings, Recipes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped items Compendium to cargo, buildings, and recipes, plus a `/compendium` hub and global nav.

**Architecture:** Reuse the items patterns. Add two small shared pure helpers (`parseListParams`, `thingJsonLd`) and one shared server-only craft-graph DB module (`getCraftGraph`/`resolveRefs`/`getRecipeStacks`) generalized by `refType`. Per-entity server-only query modules + pages mirror items. Generic `EntityTable`/`CompendiumFilters` components keep duplication low. The already-shipped items code is left untouched except small backward-compatible additions to `Pager` (a `basePath` prop) and `CraftGraphSection` (export `StackList`, link cargo).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4, shadcn/ui, Drizzle/postgres-js, vitest (node env).

---

## Conventions (read first)

- **Work on `main` directly** (current workflow — no feature branch). Commit after each task.
- **Imports:** web reads data via `getDb()`/`schema` from `@/lib/db` only — NEVER the `@bcc/shared` barrel.
- **Path alias:** `@/*` → `apps/web/*`.
- **Tests:** vitest `include` is `apps/**/*.test.ts`, `environment: "node"` — pure-only `.test.ts`. Run from repo root: `npx vitest run`. Existing suite = 55 tests.
- **Typecheck:** `pnpm --filter @bcc/web typecheck`.
- **Next 16:** `params`/`searchParams` are Promises — always `await`.
- **Dev smoke (final task only):** `pnpm --filter @bcc/web dev` (background); `apps/web/.env.local` already has `DATABASE_URL`.
- **Commit trailer:** end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Existing reusable building blocks (already on `main`)
- `apps/web/lib/db.ts` → `getDb()`, `schema`.
- `apps/web/lib/jsonld.ts` → `breadcrumbJsonLd`, `itemJsonLd`, `itemListJsonLd`, `jsonLdScript`, `Crumb`.
- `apps/web/lib/queries/craft-graph.ts` → pure `buildCraftGraph`; types `RefType`, `RefInfo`, `StackRow`, `StackView`, `RecipeView`, `CraftGraph`.
- `apps/web/components/compendium/` → `RarityBadge`, `TierBadge`, `Pager`, `CraftGraphSection` (+ internal `StackList`), `ItemsTable`, `ItemFilters`.
- `apps/web/components/ui/input.tsx` → `Input`.

## File structure

Create:
- `apps/web/lib/queries/list-params.ts` (+ `.test.ts`) — generic `parseListParams`.
- `apps/web/lib/queries/craft-graph-db.ts` — shared `getCraftGraph` / `resolveRefs` / `getRecipeStacks` (server-only).
- `apps/web/lib/queries/cargo.ts`, `buildings.ts`, `recipes.ts` — per-entity queries.
- `apps/web/components/compendium/EntityTable.tsx`, `CompendiumFilters.tsx`, `RecipeTypeBadge.tsx`.
- `apps/web/app/cargo/page.tsx`, `apps/web/app/cargo/[slug]/page.tsx`.
- `apps/web/app/buildings/page.tsx`, `apps/web/app/buildings/[slug]/page.tsx`.
- `apps/web/app/recipes/page.tsx`, `apps/web/app/recipes/[slug]/page.tsx`.
- `apps/web/app/compendium/page.tsx`.

Modify:
- `apps/web/lib/jsonld.ts` (+ `.test.ts`) — add `thingJsonLd`.
- `apps/web/lib/queries/craft-graph.ts` (+ `craft-graph.test.ts`) — export pure `resolveStackView`.
- `apps/web/components/compendium/Pager.tsx` — add `basePath` prop (default `/items`).
- `apps/web/components/compendium/CraftGraphSection.tsx` — export `StackList`, link cargo refs.
- `apps/web/app/layout.tsx` — global nav.
- `apps/web/app/sitemap.ts` — all entities.
- `apps/web/app/api/revalidate/route.ts` — all sections on `{all:true}`.

---

## Task 1: Generic list-params parser (pure, TDD)

**Files:**
- Create: `apps/web/lib/queries/list-params.ts`
- Test: `apps/web/lib/queries/list-params.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseListParams, PAGE_SIZE } from "./list-params";

describe("parseListParams", () => {
  it("defaults to page 1 and empty filters", () => {
    expect(parseListParams({}, ["tier"])).toEqual({ page: 1, filters: {} });
  });

  it("trims q and drops it when blank", () => {
    expect(parseListParams({ q: "  axe " }, [])).toEqual({ q: "axe", page: 1, filters: {} });
    expect(parseListParams({ q: "   " }, [])).toEqual({ page: 1, filters: {} });
  });

  it("keeps only allowed filters (trimmed), drops others", () => {
    const out = parseListParams({ tier: "3", rarity: "Rare", type: "crafting" }, ["tier", "type"]);
    expect(out.filters).toEqual({ tier: "3", type: "crafting" });
  });

  it("clamps page to a positive integer", () => {
    expect(parseListParams({ page: "4" }, []).page).toBe(4);
    expect(parseListParams({ page: "0" }, []).page).toBe(1);
    expect(parseListParams({ page: "-2" }, []).page).toBe(1);
    expect(parseListParams({ page: "x" }, []).page).toBe(1);
  });

  it("takes the first value when given arrays", () => {
    expect(parseListParams({ q: ["sword", "bow"], tier: ["1", "2"] }, ["tier"])).toEqual({
      q: "sword",
      page: 1,
      filters: { tier: "1" },
    });
  });

  it("exposes PAGE_SIZE", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/queries/list-params.test.ts`
Expected: FAIL ("Cannot find module './list-params'").

- [ ] **Step 3: Write the implementation**

```ts
export const PAGE_SIZE = 50;

export interface ListParams {
  q?: string;
  page: number;
  filters: Record<string, string>;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | string[] | undefined): string | undefined {
  const s = first(v)?.trim();
  return s ? s : undefined;
}

/**
 * Parse Next.js searchParams into typed list params. `allowedFilters` whitelists
 * which keys are accepted as filters; everything else is ignored. Pure.
 */
export function parseListParams(raw: RawParams, allowedFilters: string[]): ListParams {
  const params: ListParams = { page: 1, filters: {} };

  const q = clean(raw.q);
  if (q) params.q = q;

  for (const key of allowedFilters) {
    const v = clean(raw[key]);
    if (v) params.filters[key] = v;
  }

  const pageStr = clean(raw.page);
  if (pageStr !== undefined && /^\d+$/.test(pageStr)) {
    const n = parseInt(pageStr, 10);
    if (n >= 1) params.page = n;
  }

  return params;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/queries/list-params.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/list-params.ts apps/web/lib/queries/list-params.test.ts
git commit -m "feat(web): generic parseListParams for compendium lists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: thingJsonLd builder (pure, TDD)

**Files:**
- Modify: `apps/web/lib/jsonld.ts`
- Test: `apps/web/lib/jsonld.test.ts`

- [ ] **Step 1: Add the failing test** — append to `apps/web/lib/jsonld.test.ts`. Update the top import to include `thingJsonLd`:

Change:
```ts
import { breadcrumbJsonLd, itemJsonLd, itemListJsonLd, jsonLdScript } from "./jsonld";
```
to:
```ts
import { breadcrumbJsonLd, itemJsonLd, itemListJsonLd, jsonLdScript, thingJsonLd } from "./jsonld";
```
Then append:
```ts
describe("thingJsonLd", () => {
  it("builds a Thing with description", () => {
    expect(thingJsonLd("Nail", "A small nail.", "https://x.com/items/nail")).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Nail",
      description: "A small nail.",
      url: "https://x.com/items/nail",
    });
  });

  it("omits description when empty", () => {
    expect(thingJsonLd("Nail", "", "https://x.com/items/nail").description).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/jsonld.test.ts`
Expected: FAIL (`thingJsonLd` not exported).

- [ ] **Step 3: Implement** — append to `apps/web/lib/jsonld.ts`:

```ts
/** Generic schema.org Thing for any compendium entity detail page. */
export function thingJsonLd(name: string, description: string, url: string) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name,
    url,
  };
  if (description) ld.description = description;
  return ld;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/jsonld.test.ts`
Expected: PASS (8 tests in file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/jsonld.ts apps/web/lib/jsonld.test.ts
git commit -m "feat(web): generic thingJsonLd builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Export pure resolveStackView (TDD)

Factor the stack→view resolution so the recipe detail can reuse it.

**Files:**
- Modify: `apps/web/lib/queries/craft-graph.ts`
- Test: `apps/web/lib/queries/craft-graph.test.ts`

- [ ] **Step 1: Add the failing test** — append to `apps/web/lib/queries/craft-graph.test.ts`. Update the top import to include `resolveStackView`:

Change:
```ts
import { buildCraftGraph, type CraftGraphInput } from "./craft-graph";
```
to:
```ts
import { buildCraftGraph, resolveStackView, type CraftGraphInput } from "./craft-graph";
```
Then append:
```ts
describe("resolveStackView", () => {
  const refs = { "item:1": { name: "Iron Ingot", slug: "iron-ingot" } };
  it("resolves a known ref", () => {
    expect(resolveStackView({ refType: "item", refId: 1, quantity: 2 }, refs)).toEqual({
      refType: "item",
      refId: 1,
      name: "Iron Ingot",
      slug: "iron-ingot",
      quantity: 2,
    });
  });
  it("falls back to a placeholder for an unknown ref", () => {
    expect(resolveStackView({ refType: "cargo", refId: 9, quantity: 1 }, refs)).toEqual({
      refType: "cargo",
      refId: 9,
      name: "cargo #9",
      slug: null,
      quantity: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/queries/craft-graph.test.ts`
Expected: FAIL (`resolveStackView` not exported).

- [ ] **Step 3: Implement** — in `apps/web/lib/queries/craft-graph.ts`, add the exported function and make the existing internal `resolveStack` delegate to it. Replace the existing `resolveStack` function:

```ts
function resolveStack(s: StackRow, refs: Record<string, RefInfo>): StackView {
  const info = refs[`${s.refType}:${s.refId}`];
  return {
    refType: s.refType,
    refId: s.refId,
    name: info?.name ?? `${s.refType} #${s.refId}`,
    slug: info?.slug ?? null,
    quantity: s.quantity,
  };
}
```
with:
```ts
/** Resolve a single stack reference to its display view (pure). */
export function resolveStackView(
  s: { refType: RefType; refId: number; quantity: number },
  refs: Record<string, RefInfo>,
): StackView {
  const info = refs[`${s.refType}:${s.refId}`];
  return {
    refType: s.refType,
    refId: s.refId,
    name: info?.name ?? `${s.refType} #${s.refId}`,
    slug: info?.slug ?? null,
    quantity: s.quantity,
  };
}

function resolveStack(s: StackRow, refs: Record<string, RefInfo>): StackView {
  return resolveStackView(s, refs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/queries/craft-graph.test.ts`
Expected: PASS (all existing craft-graph tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/craft-graph.ts apps/web/lib/queries/craft-graph.test.ts
git commit -m "feat(web): export pure resolveStackView from craft-graph

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Shared craft-graph DB module (server-only)

**Files:**
- Create: `apps/web/lib/queries/craft-graph-db.ts`

- [ ] **Step 1: Write the module**

```ts
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  buildCraftGraph,
  resolveStackView,
  type CraftGraph,
  type RefInfo,
  type RefType,
  type StackRow,
  type StackView,
} from "./craft-graph";

/** Resolve item/cargo references to name+slug, batched by table. */
export async function resolveRefs(stacks: { refType: RefType; refId: number }[]): Promise<Record<string, RefInfo>> {
  const db = getDb();
  const itemIds = [...new Set(stacks.filter((s) => s.refType === "item").map((s) => s.refId))];
  const cargoIds = [...new Set(stacks.filter((s) => s.refType === "cargo").map((s) => s.refId))];
  const refs: Record<string, RefInfo> = {};
  if (itemIds.length) {
    const r = await db
      .select({ id: schema.items.id, name: schema.items.name, slug: schema.items.slug })
      .from(schema.items)
      .where(inArray(schema.items.id, itemIds));
    for (const x of r) refs[`item:${x.id}`] = { name: x.name, slug: x.slug };
  }
  if (cargoIds.length) {
    const r = await db
      .select({ id: schema.cargo.id, name: schema.cargo.name, slug: schema.cargo.slug })
      .from(schema.cargo)
      .where(inArray(schema.cargo.id, cargoIds));
    for (const x of r) refs[`cargo:${x.id}`] = { name: x.name, slug: x.slug };
  }
  return refs;
}

/** Craft graph (made-by / used-in) for any entity, by refType. */
export async function getCraftGraph(refType: RefType, entityId: number): Promise<CraftGraph> {
  const db = getDb();
  const { recipeInputs, recipeOutputs, recipes } = schema;

  const madeByRows = await db
    .select({ recipeId: recipeOutputs.recipeId })
    .from(recipeOutputs)
    .where(and(eq(recipeOutputs.refType, refType), eq(recipeOutputs.refId, entityId)));
  const usedInRows = await db
    .select({ recipeId: recipeInputs.recipeId })
    .from(recipeInputs)
    .where(and(eq(recipeInputs.refType, refType), eq(recipeInputs.refId, entityId)));

  const madeByRecipeIds = [...new Set(madeByRows.map((r) => r.recipeId))];
  const usedInRecipeIds = [...new Set(usedInRows.map((r) => r.recipeId))];
  const allRecipeIds = [...new Set([...madeByRecipeIds, ...usedInRecipeIds])];
  if (allRecipeIds.length === 0) return { madeBy: [], usedIn: [] };

  const recipeRows = await db
    .select({ id: recipes.id, name: recipes.name, slug: recipes.slug, type: recipes.type })
    .from(recipes)
    .where(inArray(recipes.id, allRecipeIds));
  const inputRows = await db.select().from(recipeInputs).where(inArray(recipeInputs.recipeId, allRecipeIds));
  const outputRows = await db.select().from(recipeOutputs).where(inArray(recipeOutputs.recipeId, allRecipeIds));

  const stacks: StackRow[] = [
    ...inputRows.map((r) => ({ recipeId: r.recipeId, direction: "input" as const, refType: r.refType as RefType, refId: r.refId, quantity: r.quantity })),
    ...outputRows.map((r) => ({ recipeId: r.recipeId, direction: "output" as const, refType: r.refType as RefType, refId: r.refId, quantity: r.quantity })),
  ];
  const refs = await resolveRefs(stacks.map((s) => ({ refType: s.refType, refId: s.refId })));
  return buildCraftGraph(entityId, { recipes: recipeRows, stacks, refs, madeByRecipeIds, usedInRecipeIds });
}

/** The input/output stacks of a single recipe, resolved to views. */
export async function getRecipeStacks(recipeId: number): Promise<{ inputs: StackView[]; outputs: StackView[] }> {
  const db = getDb();
  const { recipeInputs, recipeOutputs } = schema;
  const inRows = await db.select().from(recipeInputs).where(eq(recipeInputs.recipeId, recipeId));
  const outRows = await db.select().from(recipeOutputs).where(eq(recipeOutputs.recipeId, recipeId));
  const refs = await resolveRefs([...inRows, ...outRows].map((r) => ({ refType: r.refType as RefType, refId: r.refId })));
  const view = (r: { refType: string; refId: number; quantity: number }): StackView =>
    resolveStackView({ refType: r.refType as RefType, refId: r.refId, quantity: r.quantity }, refs);
  return { inputs: inRows.map(view), outputs: outRows.map(view) };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/craft-graph-db.ts
git commit -m "feat(web): shared craft-graph DB helpers (getCraftGraph/resolveRefs/getRecipeStacks)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Component updates + new shared components

**Files:**
- Modify: `apps/web/components/compendium/Pager.tsx`
- Modify: `apps/web/components/compendium/CraftGraphSection.tsx`
- Create: `apps/web/components/compendium/RecipeTypeBadge.tsx`
- Create: `apps/web/components/compendium/EntityTable.tsx`
- Create: `apps/web/components/compendium/CompendiumFilters.tsx`

- [ ] **Step 1: Add `basePath` to Pager** — replace the ENTIRE contents of `apps/web/components/compendium/Pager.tsx`:

```tsx
import Link from "next/link";

function buildHref(basePath: string, searchParams: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}

export function Pager({
  page,
  total,
  pageSize,
  searchParams,
  basePath = "/items",
}: {
  page: number;
  total: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  basePath?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={buildHref(basePath, searchParams, page - 1)} className="hover:underline">
          ← Previous
        </Link>
      ) : (
        <span className="text-muted-foreground">← Previous</span>
      )}
      <span className="text-muted-foreground">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? (
        <Link href={buildHref(basePath, searchParams, page + 1)} className="hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-muted-foreground">Next →</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Export `StackList` and link cargo** — replace the ENTIRE contents of `apps/web/components/compendium/CraftGraphSection.tsx`:

```tsx
import Link from "next/link";
import type { RecipeView, StackView } from "@/lib/queries/craft-graph";

export function StackList({ stacks }: { stacks: StackView[] }) {
  if (stacks.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {stacks.map((s, i) => {
        const href = s.slug ? (s.refType === "cargo" ? `/cargo/${s.slug}` : `/items/${s.slug}`) : null;
        return (
          <li key={`${s.refType}-${s.refId}-${i}`}>
            <span className="text-muted-foreground">{s.quantity}×</span>{" "}
            {href ? (
              <Link href={href} className="hover:underline">
                {s.name}
              </Link>
            ) : (
              <span>{s.name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeView }) {
  return (
    <div className="rounded-md border p-3">
      <div className="font-medium">{recipe.name}</div>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Inputs</div>
          <StackList stacks={recipe.inputs} />
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Outputs</div>
          <StackList stacks={recipe.outputs} />
        </div>
      </div>
    </div>
  );
}

export function CraftGraphSection({ title, recipes }: { title: string; recipes: RecipeView[] }) {
  if (recipes.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="grid gap-3">
        {recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: RecipeTypeBadge** — create `apps/web/components/compendium/RecipeTypeBadge.tsx`:

```tsx
export function RecipeTypeBadge({ type }: { type: string }) {
  if (!type) return null;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const cls = type === "construction" ? "text-orange-400 border-orange-600" : "text-sky-400 border-sky-600";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 4: EntityTable** — create `apps/web/components/compendium/EntityTable.tsx`:

```tsx
import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import { RecipeTypeBadge } from "./RecipeTypeBadge";

export type EntityColumn = "tier" | "rarity" | "tag" | "type";

export interface EntityRow {
  id: number;
  slug: string;
  name: string;
  tier?: number | null;
  rarity?: string | null;
  tag?: string | null;
  type?: string | null;
}

const HEADER: Record<EntityColumn, string> = { tier: "Tier", rarity: "Rarity", tag: "Tag", type: "Type" };

export function EntityTable({
  rows,
  basePath,
  columns,
  emptyLabel = "No results.",
}: {
  rows: EntityRow[];
  basePath: string;
  columns: EntityColumn[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) return <p className="py-8 text-muted-foreground">{emptyLabel}</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Name</th>
          {columns.map((c) => (
            <th key={c} className="py-2 pr-4 font-medium">
              {HEADER[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
            <td className="py-2 pr-4">
              <Link href={`${basePath}/${r.slug}`} className="font-medium hover:underline">
                {r.name}
              </Link>
            </td>
            {columns.map((c) => (
              <td key={c} className="py-2 pr-4">
                {c === "tier" && <TierBadge tier={r.tier ?? null} />}
                {c === "rarity" && <RarityBadge rarity={r.rarity ?? "Default"} />}
                {c === "tag" && <span className="text-muted-foreground">{r.tag ?? "—"}</span>}
                {c === "type" && <RecipeTypeBadge type={r.type ?? ""} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: CompendiumFilters (client)** — create `apps/web/components/compendium/CompendiumFilters.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export interface FilterField {
  name: string;
  placeholder: string;
  kind?: "text" | "select";
  options?: { value: string; label: string }[];
  className?: string;
}

export function CompendiumFilters({ basePath, fields }: { basePath: string; fields: FilterField[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const f of fields) {
      const v = String(form.get(f.name) ?? "").trim();
      if (v) next.set(f.name, v);
    }
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-2">
      {fields.map((f) =>
        f.kind === "select" ? (
          <select
            key={f.name}
            name={f.name}
            defaultValue={sp.get(f.name) ?? ""}
            className={`h-9 rounded-md border border-input bg-transparent px-3 text-sm ${f.className ?? ""}`}
          >
            <option value="">{f.placeholder}</option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            key={f.name}
            name={f.name}
            placeholder={f.placeholder}
            defaultValue={sp.get(f.name) ?? ""}
            className={f.className ?? "max-w-xs"}
          />
        ),
      )}
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS. (The items page still uses `Pager` without `basePath` — the default `/items` keeps it working.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/compendium/
git commit -m "feat(web): Pager basePath, StackList export + cargo links, EntityTable/CompendiumFilters/RecipeTypeBadge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Cargo — queries + pages

**Files:**
- Create: `apps/web/lib/queries/cargo.ts`
- Create: `apps/web/app/cargo/page.tsx`
- Create: `apps/web/app/cargo/[slug]/page.tsx`

- [ ] **Step 1: Cargo queries** — create `apps/web/lib/queries/cargo.ts`:

```ts
import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCraftGraph } from "./craft-graph-db";
import type { CraftGraph } from "./craft-graph";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type CargoRow = typeof schema.cargo.$inferSelect;
export interface CargoListResult {
  rows: CargoRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCargo(params: ListParams): Promise<CargoListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.cargo.name, `%${params.q}%`));
  if (params.filters.tier && /^-?\d+$/.test(params.filters.tier))
    conds.push(eq(schema.cargo.tier, parseInt(params.filters.tier, 10)));
  if (params.filters.rarity) conds.push(eq(schema.cargo.rarity, params.filters.rarity));
  if (params.filters.tag) conds.push(eq(schema.cargo.tag, params.filters.tag));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.cargo).where(where);
  const rows = await db
    .select()
    .from(schema.cargo)
    .where(where)
    .orderBy(schema.cargo.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getCargoBySlug(slug: string): Promise<CargoRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.cargo).where(eq(schema.cargo.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllCargoSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.cargo.slug }).from(schema.cargo);
  return rows.map((r) => r.slug);
}

export function getCargoCraftGraph(cargoId: number): Promise<CraftGraph> {
  return getCraftGraph("cargo", cargoId);
}
```

- [ ] **Step 2: Cargo list page** — create `apps/web/app/cargo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EntityTable } from "@/components/compendium/EntityTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listCargo } from "@/lib/queries/cargo";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Cargo",
  description: "Browse BitCraft Online cargo — bulky goods, animal bodies, and more.",
  alternates: { canonical: "/cargo" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function CargoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, ["tier", "rarity", "tag"]);
  const { rows, total, page, pageSize } = await listCargo(params);
  const flat: Record<string, string | undefined> = {
    q: params.q,
    tier: params.filters.tier,
    rarity: params.filters.rarity,
    tag: params.filters.tag,
  };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Cargo", url: `${SITE_URL}/cargo` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/cargo/${r.slug}` })), `${SITE_URL}/cargo`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Cargo</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} cargo</p>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/cargo"
          fields={[
            { name: "q", placeholder: "Search cargo…", className: "max-w-xs" },
            { name: "tier", placeholder: "Tier", className: "w-24" },
            { name: "rarity", placeholder: "Rarity", className: "w-36" },
            { name: "tag", placeholder: "Tag", className: "w-40" },
          ]}
        />
        <EntityTable rows={rows} basePath="/cargo" columns={["tier", "rarity", "tag"]} emptyLabel="No cargo match your search." />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/cargo" />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Cargo detail page** — create `apps/web/app/cargo/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { CraftGraphSection } from "@/components/compendium/CraftGraphSection";
import { getCargoBySlug, getCargoCraftGraph, listAllCargoSlugs } from "@/lib/queries/cargo";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllCargoSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCargoBySlug(slug);
  if (!c) return { title: "Cargo not found" };
  const description = c.description?.slice(0, 160) || `${c.name} — BitCraft Online cargo.`;
  return {
    title: c.name,
    description,
    alternates: { canonical: `/cargo/${c.slug}` },
    openGraph: { title: c.name, description, url: `${SITE_URL}/cargo/${c.slug}` },
  };
}

export default async function CargoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCargoBySlug(slug);
  if (!c) notFound();
  const graph = await getCargoCraftGraph(c.id);
  const url = `${SITE_URL}/cargo/${c.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Cargo", url: `${SITE_URL}/cargo` },
      { name: c.name, url },
    ]),
    thingJsonLd(c.name, c.description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/cargo" className="hover:underline">
          Cargo
        </Link>{" "}
        / <span>{c.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{c.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={c.tier} />
        <RarityBadge rarity={c.rarity} />
        {c.tag && <span className="text-sm text-muted-foreground">{c.tag}</span>}
      </div>
      {c.description && <p className="mt-4 text-muted-foreground">{c.description}</p>}
      {c.volume != null && (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Volume</dt>
            <dd>{c.volume}</dd>
          </div>
        </dl>
      )}
      <CraftGraphSection title="Made by" recipes={graph.madeBy} />
      <CraftGraphSection title="Used in" recipes={graph.usedIn} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/cargo.ts apps/web/app/cargo/
git commit -m "feat(web): cargo list + detail pages with craft graph

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Buildings — queries + pages

**Files:**
- Create: `apps/web/lib/queries/buildings.ts`
- Create: `apps/web/app/buildings/page.tsx`
- Create: `apps/web/app/buildings/[slug]/page.tsx`

- [ ] **Step 1: Buildings queries** — create `apps/web/lib/queries/buildings.ts`:

```ts
import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type BuildingRow = typeof schema.buildings.$inferSelect;
export interface BuildingListResult {
  rows: BuildingRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBuildings(params: ListParams): Promise<BuildingListResult> {
  const db = getDb();
  const conds = [eq(schema.buildings.showInCompendium, true)];
  if (params.q) conds.push(ilike(schema.buildings.name, `%${params.q}%`));
  const where = and(...conds);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.buildings).where(where);
  const rows = await db
    .select()
    .from(schema.buildings)
    .where(where)
    .orderBy(schema.buildings.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getBuildingBySlug(slug: string): Promise<BuildingRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.buildings).where(eq(schema.buildings.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllBuildingSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ slug: schema.buildings.slug })
    .from(schema.buildings)
    .where(eq(schema.buildings.showInCompendium, true));
  return rows.map((r) => r.slug);
}
```

- [ ] **Step 2: Buildings list page** — create `apps/web/app/buildings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EntityTable } from "@/components/compendium/EntityTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listBuildings } from "@/lib/queries/buildings";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Buildings",
  description: "Browse BitCraft Online buildings — stations and structures.",
  alternates: { canonical: "/buildings" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, []);
  const { rows, total, page, pageSize } = await listBuildings(params);
  const flat: Record<string, string | undefined> = { q: params.q };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Buildings", url: `${SITE_URL}/buildings` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/buildings/${r.slug}` })), `${SITE_URL}/buildings`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Buildings</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} buildings</p>
      <div className="mt-6">
        <CompendiumFilters basePath="/buildings" fields={[{ name: "q", placeholder: "Search buildings…", className: "max-w-xs" }]} />
        <EntityTable rows={rows} basePath="/buildings" columns={[]} emptyLabel="No buildings match your search." />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/buildings" />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Building detail page** — create `apps/web/app/buildings/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBuildingBySlug, listAllBuildingSlugs } from "@/lib/queries/buildings";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllBuildingSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBuildingBySlug(slug);
  if (!b) return { title: "Building not found" };
  const description = b.description?.slice(0, 160) || `${b.name} — BitCraft Online building.`;
  return {
    title: b.name,
    description,
    alternates: { canonical: `/buildings/${b.slug}` },
    openGraph: { title: b.name, description, url: `${SITE_URL}/buildings/${b.slug}` },
  };
}

export default async function BuildingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBuildingBySlug(slug);
  if (!b) notFound();
  const url = `${SITE_URL}/buildings/${b.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Buildings", url: `${SITE_URL}/buildings` },
      { name: b.name, url },
    ]),
    thingJsonLd(b.name, b.description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/buildings" className="hover:underline">
          Buildings
        </Link>{" "}
        / <span>{b.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{b.name}</h1>
      {b.description && <p className="mt-4 text-muted-foreground">{b.description}</p>}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/buildings.ts apps/web/app/buildings/
git commit -m "feat(web): buildings list + detail pages (compendium-visible)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Recipes — queries + pages

**Files:**
- Create: `apps/web/lib/queries/recipes.ts`
- Create: `apps/web/app/recipes/page.tsx`
- Create: `apps/web/app/recipes/[slug]/page.tsx`

- [ ] **Step 1: Recipes queries** — create `apps/web/lib/queries/recipes.ts`:

```ts
import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRecipeStacks } from "./craft-graph-db";
import { PAGE_SIZE, type ListParams } from "./list-params";

export type RecipeRow = typeof schema.recipes.$inferSelect;
export interface RecipeListResult {
  rows: RecipeRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRecipes(params: ListParams): Promise<RecipeListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.recipes.name, `%${params.q}%`));
  if (params.filters.type === "crafting" || params.filters.type === "construction")
    conds.push(eq(schema.recipes.type, params.filters.type));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.recipes).where(where);
  const rows = await db
    .select()
    .from(schema.recipes)
    .where(where)
    .orderBy(schema.recipes.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
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

- [ ] **Step 2: Recipes list page** — create `apps/web/app/recipes/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EntityTable } from "@/components/compendium/EntityTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listRecipes } from "@/lib/queries/recipes";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Browse BitCraft Online crafting and construction recipes.",
  alternates: { canonical: "/recipes" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, ["type"]);
  const { rows, total, page, pageSize } = await listRecipes(params);
  const flat: Record<string, string | undefined> = { q: params.q, type: params.filters.type };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/recipes/${r.slug}` })), `${SITE_URL}/recipes`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} recipes</p>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/recipes"
          fields={[
            { name: "q", placeholder: "Search recipes…", className: "max-w-xs" },
            {
              name: "type",
              placeholder: "All types",
              kind: "select",
              options: [
                { value: "crafting", label: "Crafting" },
                { value: "construction", label: "Construction" },
              ],
            },
          ]}
        />
        <EntityTable rows={rows} basePath="/recipes" columns={["type"]} emptyLabel="No recipes match your search." />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/recipes" />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Recipe detail page** — create `apps/web/app/recipes/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RecipeTypeBadge } from "@/components/compendium/RecipeTypeBadge";
import { StackList } from "@/components/compendium/CraftGraphSection";
import { getRecipeBySlug, getRecipeStacks, listAllRecipeSlugs } from "@/lib/queries/recipes";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllRecipeSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getRecipeBySlug(slug);
  if (!r) return { title: "Recipe not found" };
  const description = `${r.name} — a BitCraft ${r.type} recipe.`;
  return {
    title: r.name,
    description,
    alternates: { canonical: `/recipes/${r.slug}` },
    openGraph: { title: r.name, description, url: `${SITE_URL}/recipes/${r.slug}` },
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRecipeBySlug(slug);
  if (!r) notFound();
  const { inputs, outputs } = await getRecipeStacks(r.id);
  const url = `${SITE_URL}/recipes/${r.slug}`;
  const description = `${r.name} — a BitCraft ${r.type} recipe.`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
      { name: r.name, url },
    ]),
    thingJsonLd(r.name, description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/recipes" className="hover:underline">
          Recipes
        </Link>{" "}
        / <span>{r.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{r.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <RecipeTypeBadge type={r.type} />
        {r.timeRequirement != null && <span className="text-muted-foreground">{r.timeRequirement}s</span>}
        {r.staminaRequirement != null && <span className="text-muted-foreground">{r.staminaRequirement} stamina</span>}
      </div>
      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Inputs</h2>
          <StackList stacks={inputs} />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Outputs</h2>
          <StackList stacks={outputs} />
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/recipes.ts apps/web/app/recipes/
git commit -m "feat(web): recipes list + detail (inputs/outputs, type filter)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Compendium hub + global nav

**Files:**
- Create: `apps/web/app/compendium/page.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Hub page** — create `apps/web/app/compendium/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Compendium",
  description: "Browse the BitCraft Online compendium: items, cargo, buildings, and recipes.",
  alternates: { canonical: "/compendium" },
};

const SECTIONS = [
  { href: "/items", title: "Items", desc: "Tools, materials, equipment, and more." },
  { href: "/cargo", title: "Cargo", desc: "Bulky goods and animal bodies." },
  { href: "/buildings", title: "Buildings", desc: "Stations and structures." },
  { href: "/recipes", title: "Recipes", desc: "Crafting and construction recipes." },
];

export default function CompendiumHub() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Compendium", url: `${SITE_URL}/compendium` },
  ]);
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Compendium</h1>
      <p className="mt-2 text-muted-foreground">Everything in BitCraft Online, searchable.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-lg border p-5 hover:bg-muted/40">
            <div className="text-lg font-semibold">{s.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Global nav** — replace the ENTIRE contents of `apps/web/app/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { defaultMetadata, websiteJsonLd } from "@/lib/seo";
import { jsonLdScript } from "@/lib/jsonld";

export const metadata = defaultMetadata;

const NAV: [string, string][] = [
  ["/items", "Items"],
  ["/cargo", "Cargo"],
  ["/buildings", "Buildings"],
  ["/recipes", "Recipes"],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
        />
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">
              BitCraft Companion
            </Link>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/compendium/page.tsx apps/web/app/layout.tsx
git commit -m "feat(web): /compendium hub + global navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Sitemap + revalidate coverage

**Files:**
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/api/revalidate/route.ts`

- [ ] **Step 1: Expand sitemap** — replace the ENTIRE contents of `apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { listAllItemSlugs } from "@/lib/queries/items";
import { listAllCargoSlugs } from "@/lib/queries/cargo";
import { listAllBuildingSlugs } from "@/lib/queries/buildings";
import { listAllRecipeSlugs } from "@/lib/queries/recipes";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [items, cargo, buildings, recipes] = await Promise.all([
    listAllItemSlugs(),
    listAllCargoSlugs(),
    listAllBuildingSlugs(),
    listAllRecipeSlugs(),
  ]);

  const detail = (section: string, slugs: string[]) =>
    slugs.map((slug) => ({
      url: `${SITE_URL}/${section}/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/compendium`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/items`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/cargo`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/buildings`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/recipes`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...detail("items", items),
    ...detail("cargo", cargo),
    ...detail("buildings", buildings),
    ...detail("recipes", recipes),
  ];
}
```

- [ ] **Step 2: Extend revalidate** — replace the ENTIRE contents of `apps/web/app/api/revalidate/route.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * On-demand ISR revalidation. The worker POSTs here after an ingestion run.
 * Guarded by a shared secret in the `x-revalidate-secret` header.
 * Body: { all?: boolean, slugs?: string[] }.
 * - `all`: revalidate every compendium section (list + detail).
 * - `slugs`: revalidate specific item detail pages (items only, this iteration).
 */
const SECTIONS = ["items", "cargo", "buildings", "recipes"];

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; slugs?: string[] };

  if (body.all) {
    revalidatePath("/compendium");
    for (const s of SECTIONS) {
      revalidatePath(`/${s}`);
      revalidatePath(`/${s}/[slug]`, "page");
    }
    return Response.json({ revalidated: "all" });
  }

  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  for (const slug of slugs) revalidatePath(`/items/${slug}`);
  revalidatePath("/items");
  return Response.json({ revalidated: slugs.length });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/app/api/revalidate/route.ts
git commit -m "feat(web): sitemap + revalidate cover all compendium sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Full verification

- [ ] **Step 1: Tests + typecheck + bundle safety**

Run: `npx vitest run`
Expected: all pass (existing 55 + new: list-params 6, thingJsonLd 2, resolveStackView 2 = **65 total**).

Run: `pnpm --filter @bcc/web typecheck` → PASS.

Run: `grep -rn "@bcc/shared\"" apps/web --include=*.ts --include=*.tsx`
Expected: NO bare-barrel imports (only `@bcc/shared/db` via `lib/db.ts`).

- [ ] **Step 2: Runtime smoke test**

Start the dev server in the background: `pnpm --filter @bcc/web dev` (Next on http://localhost:3000; `apps/web/.env.local` has `DATABASE_URL`).

Then verify (curl or browser). For each, expect HTTP 200 and the noted content:
- `/compendium` → four section cards.
- `/cargo` → table with a count; click a cargo → detail with Tier/Rarity and (if any) Made by / Used in linking items/cargo.
- `/buildings` → table (count ~662); click one → name + description.
- `/recipes` → table with Type column; filter `?type=construction`; click a recipe → Inputs/Outputs with links to `/items/<slug>` and `/cargo/<slug>`.
- A bad slug under each section → 404.
- Global nav appears on every page and links work.
- Re-check an existing item detail (`/items/<some-slug>`) → craft graph still renders and now cargo refs link to `/cargo/<slug>`.

Stop the server when done.

- [ ] **Step 3: Confirm clean tree + summary**

Run: `git status --short` (clean) and `git log --oneline -11 | cat`.

---

## Self-review notes / deviations

- **Items code left intact** except two backward-compatible changes: `Pager` gained an optional `basePath` (default `/items`, so the items page is unaffected) and `CraftGraphSection` was rewritten to export `StackList` and link cargo refs (same render for items; cargo refs now become links — a strict improvement). `craft-graph.ts` gained an exported `resolveStackView` (internal `resolveStack` delegates; existing tests still cover behavior).
- **No new DB-integration tests** (consistent with the items slice) — pure helpers are unit-tested; data correctness is covered by the runtime smoke test against live Neon.
- **Building `functions`** intentionally not rendered (opaque positional jsonb) — noted follow-up.
- **Per-slug revalidation** stays items-only; `{all:true}` covers all sections (per spec).
