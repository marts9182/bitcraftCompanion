# Phase 1b — Compendium Items Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fast, SEO-strong, browsable Items section (`/items` list + `/items/[slug]` detail with craft graph) over the data already in Neon Postgres.

**Architecture:** Next.js App Router Server Components read Neon via a web-local query layer over `@bcc/shared/db` (narrow subpath only — never the barrel, which would pull the SpacetimeDB SDK into the bundle). Pure view-model + SEO builders are isolated for unit testing. Item detail pages use ISR (`generateStaticParams` over all slugs, `revalidate = 86400`) plus a secret-guarded `/api/revalidate` route the worker can call after ingestion.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4, shadcn/ui (base-nova, lucide), Drizzle ORM over postgres-js, vitest (node env).

---

## Conventions (read first)

- **Branch:** `phase-1b-compendium-items` (already created; spec already committed).
- **Imports:** web code imports data via `import { createDb, schema } from "@bcc/shared/db";` (matches `apps/web/app/status/page.tsx`). NEVER import from `@bcc/shared` (barrel).
- **Path alias:** `@/*` → `apps/web/*` (e.g. `@/lib/queries/items`, `@/components/compendium/RarityBadge`).
- **Tests:** vitest `include` is `apps/**/*.test.ts` with `environment: "node"`. Tests MUST be `.test.ts` (NOT `.tsx`) and cover pure functions only. Run the whole suite from repo root with `npx vitest run`.
- **Next 16 note:** in route segments, `params` and `searchParams` are Promises — always `await` them.
- **Run dev server:** `pnpm --filter @bcc/web dev` (Next on http://localhost:3000). Requires `DATABASE_URL` in `apps/web/.env.local` (or root `.env.local` — confirm the web app loads it; if a page shows "DATABASE_URL not configured", copy the value into `apps/web/.env.local`).
- **Commit style:** Conventional Commits; end messages with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File structure

Create:
- `apps/web/lib/db.ts` — `getDb()` singleton accessor (throws if `DATABASE_URL` missing).
- `apps/web/lib/queries/item-list-params.ts` — pure `parseItemListParams` + `ItemListParams` type.
- `apps/web/lib/queries/item-list-params.test.ts` — unit tests.
- `apps/web/lib/queries/craft-graph.ts` — pure `buildCraftGraph` + view-model types.
- `apps/web/lib/queries/craft-graph.test.ts` — unit tests.
- `apps/web/lib/queries/items.ts` — DB query functions (server-only).
- `apps/web/lib/jsonld.ts` — pure JSON-LD builders.
- `apps/web/lib/jsonld.test.ts` — unit tests.
- `apps/web/components/ui/input.tsx` — shadcn-style input.
- `apps/web/components/compendium/RarityBadge.tsx`, `TierBadge.tsx`.
- `apps/web/components/compendium/ItemsTable.tsx`, `ItemFilters.tsx`, `Pager.tsx`, `CraftGraphSection.tsx`.
- `apps/web/app/items/page.tsx` — list page.
- `apps/web/app/items/[slug]/page.tsx` — detail page (ISR).
- `apps/web/app/api/revalidate/route.ts` — on-demand revalidation.

Modify:
- `apps/web/app/sitemap.ts` — enumerate item slugs.
- `apps/web/app/page.tsx` — link to `/items`.
- `.env.example` — add `REVALIDATE_SECRET`.

---

## Task 1: Web DB accessor

**Files:**
- Create: `apps/web/lib/db.ts`

- [ ] **Step 1: Write the accessor**

```ts
import { createDb, schema } from "@bcc/shared/db";

/**
 * Server-only Drizzle accessor for the web app. Reads DATABASE_URL from the
 * environment and reuses the underlying client (createDb memoizes internally).
 * Throws a clear error if the connection string is missing.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return createDb(url);
}

export { schema };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/db.ts
git commit -m "feat(web): server-only Drizzle accessor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Item list params parser (pure, TDD)

**Files:**
- Create: `apps/web/lib/queries/item-list-params.ts`
- Test: `apps/web/lib/queries/item-list-params.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseItemListParams, PAGE_SIZE } from "./item-list-params";

describe("parseItemListParams", () => {
  it("applies defaults for empty input", () => {
    expect(parseItemListParams({})).toEqual({ page: 1 });
  });

  it("trims q and drops it when blank", () => {
    expect(parseItemListParams({ q: "  axe " })).toEqual({ q: "axe", page: 1 });
    expect(parseItemListParams({ q: "   " })).toEqual({ page: 1 });
  });

  it("parses tier as an integer and ignores non-numeric", () => {
    expect(parseItemListParams({ tier: "3" })).toEqual({ tier: 3, page: 1 });
    expect(parseItemListParams({ tier: "abc" })).toEqual({ page: 1 });
    expect(parseItemListParams({ tier: "-1" })).toEqual({ tier: -1, page: 1 });
  });

  it("keeps rarity and tag as trimmed strings", () => {
    expect(parseItemListParams({ rarity: "Rare", tag: " Tools " })).toEqual({
      rarity: "Rare",
      tag: "Tools",
      page: 1,
    });
  });

  it("clamps page to a positive integer", () => {
    expect(parseItemListParams({ page: "4" }).page).toBe(4);
    expect(parseItemListParams({ page: "0" }).page).toBe(1);
    expect(parseItemListParams({ page: "-2" }).page).toBe(1);
    expect(parseItemListParams({ page: "x" }).page).toBe(1);
  });

  it("takes the first value when given arrays", () => {
    expect(parseItemListParams({ q: ["sword", "bow"] })).toEqual({ q: "sword", page: 1 });
  });

  it("exposes a page size constant", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/queries/item-list-params.test.ts`
Expected: FAIL ("Cannot find module './item-list-params'").

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/queries/item-list-params.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/item-list-params.ts apps/web/lib/queries/item-list-params.test.ts
git commit -m "feat(web): pure item-list searchParams parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Craft-graph view-model builder (pure, TDD)

This is the heart of the detail page: given raw DB rows for the recipes that
produce/consume an item, build the "Made by" / "Used in" display model with all
referenced stacks resolved to names/slugs.

**Files:**
- Create: `apps/web/lib/queries/craft-graph.ts`
- Test: `apps/web/lib/queries/craft-graph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildCraftGraph, type CraftGraphInput } from "./craft-graph";

const base: CraftGraphInput = {
  recipes: [
    { id: 10, name: "Smelt Iron", slug: "smelt-iron", type: "crafting" },
    { id: 20, name: "Forge Nail", slug: "forge-nail", type: "crafting" },
  ],
  stacks: [
    // recipe 10 makes item 1 from cargo 99
    { recipeId: 10, direction: "output", refType: "item", refId: 1, quantity: 2 },
    { recipeId: 10, direction: "input", refType: "cargo", refId: 99, quantity: 5 },
    // recipe 20 uses item 1 to make item 2
    { recipeId: 20, direction: "input", refType: "item", refId: 1, quantity: 3 },
    { recipeId: 20, direction: "output", refType: "item", refId: 2, quantity: 1 },
  ],
  refs: {
    "item:1": { name: "Iron Ingot", slug: "iron-ingot" },
    "item:2": { name: "Nail", slug: "nail" },
    "cargo:99": { name: "Iron Ore", slug: "iron-ore" },
  },
  madeByRecipeIds: [10],
  usedInRecipeIds: [20],
};

describe("buildCraftGraph", () => {
  it("groups recipes into madeBy and usedIn", () => {
    const g = buildCraftGraph(1, base);
    expect(g.madeBy.map((r) => r.id)).toEqual([10]);
    expect(g.usedIn.map((r) => r.id)).toEqual([20]);
  });

  it("resolves stack references to name/slug with quantities", () => {
    const g = buildCraftGraph(1, base);
    const madeBy = g.madeBy[0];
    expect(madeBy.outputs).toEqual([
      { refType: "item", refId: 1, name: "Iron Ingot", slug: "iron-ingot", quantity: 2 },
    ]);
    expect(madeBy.inputs).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 5 },
    ]);
  });

  it("falls back to a placeholder name for unresolved refs", () => {
    const g = buildCraftGraph(1, {
      ...base,
      refs: {},
      madeByRecipeIds: [10],
      usedInRecipeIds: [],
    });
    expect(g.madeBy[0].outputs[0]).toEqual({
      refType: "item",
      refId: 1,
      name: "item #1",
      slug: null,
      quantity: 2,
    });
  });

  it("returns empty arrays when the item has no recipes", () => {
    const g = buildCraftGraph(7, { ...base, madeByRecipeIds: [], usedInRecipeIds: [] });
    expect(g).toEqual({ madeBy: [], usedIn: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/queries/craft-graph.test.ts`
Expected: FAIL ("Cannot find module './craft-graph'").

- [ ] **Step 3: Write the implementation**

```ts
export type RefType = "item" | "cargo";

export interface RecipeRow {
  id: number;
  name: string;
  slug: string;
  type: string;
}

export interface StackRow {
  recipeId: number;
  direction: "input" | "output";
  refType: RefType;
  refId: number;
  quantity: number;
}

export interface RefInfo {
  name: string;
  slug: string;
}

export interface CraftGraphInput {
  recipes: RecipeRow[];
  stacks: StackRow[];
  /** Keyed by `${refType}:${refId}`. */
  refs: Record<string, RefInfo>;
  madeByRecipeIds: number[];
  usedInRecipeIds: number[];
}

export interface StackView {
  refType: RefType;
  refId: number;
  name: string;
  slug: string | null;
  quantity: number;
}

export interface RecipeView {
  id: number;
  name: string;
  slug: string;
  type: string;
  inputs: StackView[];
  outputs: StackView[];
}

export interface CraftGraph {
  madeBy: RecipeView[];
  usedIn: RecipeView[];
}

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

function toRecipeView(recipe: RecipeRow, stacks: StackRow[], refs: Record<string, RefInfo>): RecipeView {
  const mine = stacks.filter((s) => s.recipeId === recipe.id);
  return {
    id: recipe.id,
    name: recipe.name,
    slug: recipe.slug,
    type: recipe.type,
    inputs: mine.filter((s) => s.direction === "input").map((s) => resolveStack(s, refs)),
    outputs: mine.filter((s) => s.direction === "output").map((s) => resolveStack(s, refs)),
  };
}

/**
 * Build the craft graph for the item with id `itemId` from pre-fetched rows.
 * `madeBy` = recipes whose output is this item; `usedIn` = recipes that consume
 * it. Pure: all DB access happens in the caller.
 */
export function buildCraftGraph(_itemId: number, input: CraftGraphInput): CraftGraph {
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const view = (ids: number[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((r): r is RecipeRow => r !== undefined)
      .map((r) => toRecipeView(r, input.stacks, input.refs));
  return { madeBy: view(input.madeByRecipeIds), usedIn: view(input.usedInRecipeIds) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/queries/craft-graph.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/craft-graph.ts apps/web/lib/queries/craft-graph.test.ts
git commit -m "feat(web): pure craft-graph view-model builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: JSON-LD builders (pure, TDD)

**Files:**
- Create: `apps/web/lib/jsonld.ts`
- Test: `apps/web/lib/jsonld.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { breadcrumbJsonLd, itemJsonLd, itemListJsonLd } from "./jsonld";

describe("jsonld builders", () => {
  it("builds a BreadcrumbList with positions", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: "https://x.com/" },
      { name: "Items", url: "https://x.com/items" },
      { name: "Nail", url: "https://x.com/items/nail" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Nail",
      item: "https://x.com/items/nail",
    });
  });

  it("builds a Thing for an item", () => {
    const ld = itemJsonLd({ name: "Nail", description: "A small nail." }, "https://x.com/items/nail");
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Nail",
      description: "A small nail.",
      url: "https://x.com/items/nail",
    });
  });

  it("omits description when empty", () => {
    const ld = itemJsonLd({ name: "Nail", description: "" }, "https://x.com/items/nail");
    expect(ld.description).toBeUndefined();
  });

  it("builds an ItemList", () => {
    const ld = itemListJsonLd(
      [{ name: "Nail", url: "https://x.com/items/nail" }],
      "https://x.com/items",
    );
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.url).toBe("https://x.com/items");
    expect(ld.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Nail",
      url: "https://x.com/items/nail",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/jsonld.test.ts`
Expected: FAIL ("Cannot find module './jsonld'").

- [ ] **Step 3: Write the implementation**

```ts
export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function itemJsonLd(item: { name: string; description: string }, url: string) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: item.name,
    url,
  };
  if (item.description) ld.description = item.description;
  return ld;
}

export function itemListJsonLd(items: Crumb[], listUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: listUrl,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/jsonld.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/jsonld.ts apps/web/lib/jsonld.test.ts
git commit -m "feat(web): pure JSON-LD builders for items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Item DB queries (server-only)

Thin Drizzle queries plus the in-memory assembly that feeds `buildCraftGraph`.

**Files:**
- Create: `apps/web/lib/queries/items.ts`

- [ ] **Step 1: Write the queries**

```ts
import "server-only";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { buildCraftGraph, type CraftGraph, type RefInfo, type StackRow } from "./craft-graph";
import { PAGE_SIZE, type ItemListParams } from "./item-list-params";

export type ItemRow = typeof schema.items.$inferSelect;

export interface ItemListResult {
  rows: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated, filtered item list. */
export async function listItems(params: ItemListParams): Promise<ItemListResult> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(schema.items.name, `%${params.q}%`));
  if (params.tier !== undefined) conds.push(eq(schema.items.tier, params.tier));
  if (params.rarity) conds.push(eq(schema.items.rarity, params.rarity));
  if (params.tag) conds.push(eq(schema.items.tag, params.tag));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.items)
    .where(where);

  const rows = await db
    .select()
    .from(schema.items)
    .where(where)
    .orderBy(schema.items.name)
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);

  return { rows, total, page: params.page, pageSize: PAGE_SIZE };
}

export async function getItemBySlug(slug: string): Promise<ItemRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.items).where(eq(schema.items.slug, slug)).limit(1);
  return row ?? null;
}

export async function listAllItemSlugs(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ slug: schema.items.slug }).from(schema.items);
  return rows.map((r) => r.slug);
}

/** Fetch + assemble the craft graph for an item id. */
export async function getItemCraftGraph(itemId: number): Promise<CraftGraph> {
  const db = getDb();
  const { recipeInputs, recipeOutputs, recipes, items, cargo } = schema;

  const madeByRows = await db
    .select({ recipeId: recipeOutputs.recipeId })
    .from(recipeOutputs)
    .where(and(eq(recipeOutputs.refType, "item"), eq(recipeOutputs.refId, itemId)));
  const usedInRows = await db
    .select({ recipeId: recipeInputs.recipeId })
    .from(recipeInputs)
    .where(and(eq(recipeInputs.refType, "item"), eq(recipeInputs.refId, itemId)));

  const madeByRecipeIds = [...new Set(madeByRows.map((r) => r.recipeId))];
  const usedInRecipeIds = [...new Set(usedInRows.map((r) => r.recipeId))];
  const allRecipeIds = [...new Set([...madeByRecipeIds, ...usedInRecipeIds])];
  if (allRecipeIds.length === 0) return { madeBy: [], usedIn: [] };

  const recipeRows = await db
    .select({ id: recipes.id, name: recipes.name, slug: recipes.slug, type: recipes.type })
    .from(recipes)
    .where(inArray(recipes.id, allRecipeIds));

  const inputRows = await db
    .select()
    .from(recipeInputs)
    .where(inArray(recipeInputs.recipeId, allRecipeIds));
  const outputRows = await db
    .select()
    .from(recipeOutputs)
    .where(inArray(recipeOutputs.recipeId, allRecipeIds));

  const stacks: StackRow[] = [
    ...inputRows.map((r) => ({
      recipeId: r.recipeId,
      direction: "input" as const,
      refType: r.refType as "item" | "cargo",
      refId: r.refId,
      quantity: r.quantity,
    })),
    ...outputRows.map((r) => ({
      recipeId: r.recipeId,
      direction: "output" as const,
      refType: r.refType as "item" | "cargo",
      refId: r.refId,
      quantity: r.quantity,
    })),
  ];

  // Resolve every referenced item/cargo to name + slug.
  const itemIds = [...new Set(stacks.filter((s) => s.refType === "item").map((s) => s.refId))];
  const cargoIds = [...new Set(stacks.filter((s) => s.refType === "cargo").map((s) => s.refId))];
  const refs: Record<string, RefInfo> = {};
  if (itemIds.length) {
    const r = await db
      .select({ id: items.id, name: items.name, slug: items.slug })
      .from(items)
      .where(inArray(items.id, itemIds));
    for (const x of r) refs[`item:${x.id}`] = { name: x.name, slug: x.slug };
  }
  if (cargoIds.length) {
    const r = await db
      .select({ id: cargo.id, name: cargo.name, slug: cargo.slug })
      .from(cargo)
      .where(inArray(cargo.id, cargoIds));
    for (const x of r) refs[`cargo:${x.id}`] = { name: x.name, slug: x.slug };
  }

  return buildCraftGraph(itemId, { recipes: recipeRows, stacks, refs, madeByRecipeIds, usedInRecipeIds });
}
```

- [ ] **Step 2: Add the `server-only` dependency if missing**

Run: `pnpm --filter @bcc/web add server-only`
Expected: adds `server-only` to `apps/web/package.json`. (If already present, this is a no-op.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS. (If `schema.recipeInputs`/`recipeOutputs` names differ, reconcile against `packages/shared/src/db/schema.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/queries/items.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): item list/detail/craft-graph DB queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: UI primitives — Input + badges

**Files:**
- Create: `apps/web/components/ui/input.tsx`
- Create: `apps/web/components/compendium/RarityBadge.tsx`
- Create: `apps/web/components/compendium/TierBadge.tsx`

- [ ] **Step 1: Write the Input component**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Write RarityBadge**

```tsx
import { cn } from "@/lib/utils";

const RARITY_CLASS: Record<string, string> = {
  Default: "text-muted-foreground border-muted",
  Common: "text-zinc-300 border-zinc-500",
  Uncommon: "text-green-400 border-green-600",
  Rare: "text-blue-400 border-blue-600",
  Epic: "text-purple-400 border-purple-600",
  Legendary: "text-amber-400 border-amber-600",
  Mythic: "text-rose-400 border-rose-600",
};

export function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
        RARITY_CLASS[rarity] ?? RARITY_CLASS.Default,
      )}
    >
      {rarity}
    </span>
  );
}
```

- [ ] **Step 3: Write TierBadge**

```tsx
export function TierBadge({ tier }: { tier: number | null }) {
  if (tier == null || tier < 0) return null;
  return (
    <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
      Tier {tier}
    </span>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/input.tsx apps/web/components/compendium/RarityBadge.tsx apps/web/components/compendium/TierBadge.tsx
git commit -m "feat(web): input + rarity/tier badge primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Compendium components

**Files:**
- Create: `apps/web/components/compendium/ItemsTable.tsx`
- Create: `apps/web/components/compendium/Pager.tsx`
- Create: `apps/web/components/compendium/ItemFilters.tsx`
- Create: `apps/web/components/compendium/CraftGraphSection.tsx`

- [ ] **Step 1: Write ItemsTable**

```tsx
import Link from "next/link";
import { RarityBadge } from "./RarityBadge";
import { TierBadge } from "./TierBadge";
import type { ItemRow } from "@/lib/queries/items";

export function ItemsTable({ items }: { items: ItemRow[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-muted-foreground">No items match your search.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Tier</th>
          <th className="py-2 pr-4 font-medium">Rarity</th>
          <th className="py-2 font-medium">Tag</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} className="border-b border-border/50 hover:bg-muted/40">
            <td className="py-2 pr-4">
              <Link href={`/items/${it.slug}`} className="font-medium hover:underline">
                {it.name}
              </Link>
            </td>
            <td className="py-2 pr-4"><TierBadge tier={it.tier} /></td>
            <td className="py-2 pr-4"><RarityBadge rarity={it.rarity} /></td>
            <td className="py-2 text-muted-foreground">{it.tag ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Write Pager**

```tsx
import Link from "next/link";

function buildHref(searchParams: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
  sp.set("page", String(page));
  return `/items?${sp.toString()}`;
}

export function Pager({
  page,
  total,
  pageSize,
  searchParams,
}: {
  page: number;
  total: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={buildHref(searchParams, page - 1)} className="hover:underline">
          ← Previous
        </Link>
      ) : (
        <span className="text-muted-foreground">← Previous</span>
      )}
      <span className="text-muted-foreground">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? (
        <Link href={buildHref(searchParams, page + 1)} className="hover:underline">
          Next →
        </Link>
      ) : (
        <span className="text-muted-foreground">Next →</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: Write ItemFilters (client component)**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function ItemFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "tier", "rarity", "tag"]) {
      const v = String(form.get(key) ?? "").trim();
      if (v) next.set(key, v);
    }
    router.push(`/items?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap gap-2">
      <Input name="q" placeholder="Search items…" defaultValue={sp.get("q") ?? ""} className="max-w-xs" />
      <Input name="tier" placeholder="Tier" defaultValue={sp.get("tier") ?? ""} className="w-24" />
      <Input name="rarity" placeholder="Rarity" defaultValue={sp.get("rarity") ?? ""} className="w-36" />
      <Input name="tag" placeholder="Tag" defaultValue={sp.get("tag") ?? ""} className="w-40" />
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

- [ ] **Step 4: Write CraftGraphSection**

```tsx
import Link from "next/link";
import type { RecipeView, StackView } from "@/lib/queries/craft-graph";

function StackList({ stacks }: { stacks: StackView[] }) {
  if (stacks.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {stacks.map((s, i) => (
        <li key={`${s.refType}-${s.refId}-${i}`}>
          <span className="text-muted-foreground">{s.quantity}×</span>{" "}
          {s.slug && s.refType === "item" ? (
            <Link href={`/items/${s.slug}`} className="hover:underline">
              {s.name}
            </Link>
          ) : (
            <span>{s.name}</span>
          )}
        </li>
      ))}
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

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/compendium/
git commit -m "feat(web): items table, pager, filters, craft-graph section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Items list page

**Files:**
- Create: `apps/web/app/items/page.tsx`

- [ ] **Step 1: Write the list page**

```tsx
import type { Metadata } from "next";
import { ItemsTable } from "@/components/compendium/ItemsTable";
import { ItemFilters } from "@/components/compendium/ItemFilters";
import { Pager } from "@/components/compendium/Pager";
import { listItems } from "@/lib/queries/items";
import { parseItemListParams } from "@/lib/queries/item-list-params";
import { itemListJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Items",
  description: "Browse the full BitCraft Online item compendium — tiers, rarities, and recipes.",
  alternates: { canonical: "/items" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseItemListParams(sp);
  const { rows, total, page, pageSize } = await listItems(params);

  const flat: Record<string, string | undefined> = {
    q: params.q,
    tier: params.tier?.toString(),
    rarity: params.rarity,
    tag: params.tag,
  };

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Items", url: `${SITE_URL}/items` },
    ]),
    itemListJsonLd(
      rows.map((r) => ({ name: r.name, url: `${SITE_URL}/items/${r.slug}` })),
      `${SITE_URL}/items`,
    ),
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight">Items</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} items</p>
      <div className="mt-6">
        <ItemFilters />
        <ItemsTable items={rows} />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `pnpm --filter @bcc/web dev`
Visit `http://localhost:3000/items`. Expect a table of items with the total count (~7,425). Try `?q=axe`, `?rarity=Rare`, `?page=2`. Stop the server (Ctrl-C) when done.
(If "DATABASE_URL not configured" appears, add `DATABASE_URL` to `apps/web/.env.local` and retry.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/items/page.tsx
git commit -m "feat(web): items list page with search, filters, pagination

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Item detail page (ISR)

**Files:**
- Create: `apps/web/app/items/[slug]/page.tsx`

- [ ] **Step 1: Write the detail page**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { CraftGraphSection } from "@/components/compendium/CraftGraphSection";
import { getItemBySlug, getItemCraftGraph, listAllItemSlugs } from "@/lib/queries/items";
import { breadcrumbJsonLd, itemJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllItemSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) return { title: "Item not found" };
  const description = item.description?.slice(0, 160) || `${item.name} — BitCraft Online item.`;
  return {
    title: item.name,
    description,
    alternates: { canonical: `/items/${item.slug}` },
    openGraph: { title: item.name, description, url: `${SITE_URL}/items/${item.slug}` },
  };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const graph = await getItemCraftGraph(item.id);
  const url = `${SITE_URL}/items/${item.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Items", url: `${SITE_URL}/items` },
      { name: item.name, url },
    ]),
    itemJsonLd({ name: item.name, description: item.description }, url),
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="text-sm text-muted-foreground">
        <Link href="/items" className="hover:underline">
          Items
        </Link>{" "}
        / <span>{item.name}</span>
      </nav>

      <div className="mt-4 flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={item.tier} />
        <RarityBadge rarity={item.rarity} />
        {item.tag && <span className="text-sm text-muted-foreground">{item.tag}</span>}
      </div>

      {item.description && <p className="mt-4 text-muted-foreground">{item.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {item.volume != null && (
          <div>
            <dt className="text-muted-foreground">Volume</dt>
            <dd>{item.volume}</dd>
          </div>
        )}
        {item.durability != null && (
          <div>
            <dt className="text-muted-foreground">Durability</dt>
            <dd>{item.durability}</dd>
          </div>
        )}
      </dl>

      <CraftGraphSection title="Made by" recipes={graph.madeBy} />
      <CraftGraphSection title="Used in" recipes={graph.usedIn} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `pnpm --filter @bcc/web dev`
From `/items`, click an item (e.g. an ingot/tool). Expect name, tier/rarity badges, description, and "Made by"/"Used in" recipe cards with clickable item links. Visit a bad slug (`/items/not-a-real-item`) → 404. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/items/[slug]/page.tsx"
git commit -m "feat(web): item detail page with craft graph (ISR)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: On-demand revalidation route

**Files:**
- Create: `apps/web/app/api/revalidate/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the route**

```ts
import { revalidatePath } from "next/cache";

/**
 * On-demand ISR revalidation. The worker POSTs here after an ingestion run.
 * Guarded by a shared secret in the `x-revalidate-secret` header.
 * Body: { all?: boolean, slugs?: string[] }.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; slugs?: string[] };

  if (body.all) {
    revalidatePath("/items");
    revalidatePath("/items/[slug]", "page");
    return Response.json({ revalidated: "all" });
  }

  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  for (const slug of slugs) revalidatePath(`/items/${slug}`);
  revalidatePath("/items");
  return Response.json({ revalidated: slugs.length });
}
```

- [ ] **Step 2: Add the secret to `.env.example`**

Append to `.env.example`:

```
# Shared secret guarding the web app's on-demand ISR revalidation route
REVALIDATE_SECRET="REPLACE_WITH_A_LONG_RANDOM_STRING"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

With the dev server running and `REVALIDATE_SECRET=test` in `apps/web/.env.local`:
Run: `curl -s -X POST http://localhost:3000/api/revalidate -H "x-revalidate-secret: test" -H "content-type: application/json" -d '{"all":true}'`
Expected: `{"revalidated":"all"}`. Then without the header → `Unauthorized` (401).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/revalidate/route.ts .env.example
git commit -m "feat(web): secret-guarded on-demand revalidation route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Sitemap + home link

**Files:**
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Expand the sitemap**

Replace the contents of `apps/web/app/sitemap.ts` with:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { listAllItemSlugs } from "@/lib/queries/items";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const slugs = await listAllItemSlugs();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/items`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/items/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
```

- [ ] **Step 2: Add a home-page link to the compendium**

Replace `apps/web/app/page.tsx` with:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">BitCraft Companion</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The fast, comprehensive companion for BitCraft Online. Compendium, guides, and live data —
        coming online.
      </p>
      <Link
        href="/items"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
      >
        Browse the Item Compendium →
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + manual check**

Run: `pnpm --filter @bcc/web typecheck` → PASS.
With dev server running, visit `http://localhost:3000/sitemap.xml` → contains `/items/...` URLs. Home page shows the "Browse the Item Compendium" link.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/app/page.tsx
git commit -m "feat(web): item slugs in sitemap + home compendium link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Full verification

- [ ] **Step 1: Lint/typecheck/test the whole repo**

Run: `npx vitest run`
Expected: all tests pass (existing 36 + new: 7 + 4 + 4 = 51 total).

Run: `pnpm --filter @bcc/web typecheck && pnpm --filter @bcc/shared typecheck`
Expected: PASS.

- [ ] **Step 2: Production build (catches RSC/ISR issues `dev` misses)**

Run: `pnpm --filter @bcc/web build`
Expected: build succeeds; `/items/[slug]` reported as prerendered/ISR. (Build runs `generateStaticParams` → needs `DATABASE_URL` available to the build environment. If the build pulls all ~7,425 pages and is too slow, that's acceptable for now; note it for a future "prerender top-N + on-demand" optimization.)

- [ ] **Step 3: Confirm the SDK stayed out of the web bundle**

Run: `grep -rn "@bcc/shared\"" apps/web --include=*.ts --include=*.tsx`
Expected: NO matches importing the bare barrel `@bcc/shared` (only `@bcc/shared/db`). If any are found, fix them to the narrow subpath.

- [ ] **Step 4: Final manual smoke test**

`pnpm --filter @bcc/web dev`, click through Home → Items → an item detail → a linked recipe ingredient. Confirm craft-graph links navigate between items.

- [ ] **Step 5: Push the branch (optional, ask first)**

Do NOT push unless the user asks. When asked:
```bash
git push -u origin phase-1b-compendium-items
```

---

## Notes / deviations from spec

- **Render test substituted.** The spec mentioned a "lightweight render test of the detail page." The repo's vitest is `environment: "node"` with `include: apps/**/*.test.ts` (no `.tsx`, no jsdom/testing-library). Rather than pull in a DOM test stack for one async RSC page (which is awkward to render-test anyway), the plan covers the equivalent logic with pure unit tests (`craft-graph`, `item-list-params`, `jsonld`) and relies on the production `build` + manual smoke test for rendering. Revisit if/when a component-test harness is added.
- **Worker → `/api/revalidate` wiring** is intentionally deferred (the route ships here; the worker call is a small follow-up, per the spec's follow-ups list).
