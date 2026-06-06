# Crafting Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a crafting calculator that expands any item/cargo's recipe tree to raw materials, summing time/stamina, with an interactive per-node recipe swap.

**Architecture:** One pure, unit-tested engine (`lib/calculator/`) runs on the server (SSR for SEO) and re-runs in the browser on user interaction. The server first fetches the target's transitive-closure **subgraph** (only reachable crafting recipes — a few KB) and hands it to a client island that recomputes instantly on quantity/recipe changes. Mirrors the existing `craft-graph.ts` (pure) / `craft-graph-db.ts` (DB) split.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM (Postgres/Neon), Tailwind v4, Vitest. Spec: `docs/superpowers/specs/2026-06-06-phase-4-crafting-calculator-design.md`.

---

## Conventions (read once)

- **Run all tests** (from repo root): `pnpm test`
- **Run one test file:** `pnpm exec vitest run apps/web/lib/calculator/<file>.test.ts`
- **Typecheck the web app:** `pnpm --filter @bcc/web typecheck`
- **Build the web app:** `pnpm --filter @bcc/web build`
- **Dev server:** `pnpm --filter @bcc/web dev` (port 3000). After stopping, kill the lingering process by port: `Get-NetTCPConnection -LocalPort 3000`.
- Server-only DB modules start with `import "server-only";`. Pure modules never import `server-only` or `@/lib/db`.
- Commit messages follow the repo style: `feat(web): …`, `test(web): …`.

## File Structure

**Pure engine (`apps/web/lib/calculator/`):**
- `types.ts` — shared types + `refKey` helper. No I/O.
- `format.ts` — `formatDuration` (seconds → human string).
- `expand.ts` — `defaultRecipeId` + `expand` (the BOM engine).
- `subgraph.ts` — `assembleSubgraph` (flat DB rows → `Subgraph`).

**DB layer (`apps/web/lib/queries/`):**
- `calculator-graph.ts` — `getCalculatorSubgraph`, `searchTargets`, `listCraftableTargets`.

**UI:**
- `apps/web/components/calculator/ShoppingList.tsx` — presentational.
- `apps/web/components/calculator/TotalsCard.tsx` — presentational.
- `apps/web/components/calculator/CraftTree.tsx` — client; recursive tree + swap.
- `apps/web/components/calculator/CalculatorResult.tsx` — client island holding qty + selections state.
- `apps/web/components/calculator/TargetSearch.tsx` — client search form.
- `apps/web/app/calculator/page.tsx` — finder page.
- `apps/web/app/calculator/[type]/[slug]/page.tsx` — per-target SSR result.

**Wiring:** `app/layout.tsx` (nav), `app/items/[slug]/page.tsx` + `app/cargo/[slug]/page.tsx` (entry buttons), `app/sitemap.ts`, `app/llms.txt/route.ts`.

---

## Task 1: Calculator types

**Files:**
- Create: `apps/web/lib/calculator/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// apps/web/lib/calculator/types.ts
export type RefType = "item" | "cargo";
export type RefKey = `${RefType}:${number}`;

export function refKey(refType: RefType, refId: number): RefKey {
  return `${refType}:${refId}`;
}

export interface RefInfo {
  name: string;
  slug: string;
  iconAssetName?: string | null;
}

export interface CalcStack {
  refType: RefType;
  refId: number;
  quantity: number;
}

/** A recipe as the engine consumes it, scoped to one produced ref. */
export interface CalcRecipe {
  id: number;
  name: string;
  type: string;
  timeRequirement: number; // seconds; 0 if unknown
  staminaRequirement: number; // 0 if unknown
  outputQty: number; // qty of THIS ref produced per craft
  inputs: CalcStack[];
}

export interface Subgraph {
  /** All crafting recipes that produce each reachable ref, keyed by refKey. */
  recipesByRef: Record<RefKey, CalcRecipe[]>;
  /** Display info for every reachable ref, keyed by refKey. */
  refInfo: Record<RefKey, RefInfo>;
}

/** User overrides: which recipe to use at a given ref. */
export type Selections = Record<RefKey, number>;

export interface CalcNode {
  refType: RefType;
  refId: number;
  name: string;
  slug: string | null;
  iconAssetName?: string | null;
  needed: number;
  recipeId: number | null; // null = raw material (leaf)
  crafts: number; // times the recipe runs (0 for raw)
  produced: number; // crafts * outputQty (0 for raw)
  surplus: number; // produced - needed (0 for raw)
  children: CalcNode[];
  hasAlternatives: boolean; // >1 recipe produces this ref
}

export interface ShoppingLine {
  refType: RefType;
  refId: number;
  name: string;
  slug: string | null;
  iconAssetName?: string | null;
  quantity: number;
}

export interface CalcTotals {
  timeRequirement: number;
  staminaRequirement: number;
}

export interface CalcResult {
  tree: CalcNode;
  shoppingList: ShoppingLine[];
  totals: CalcTotals;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/calculator/types.ts
git commit -m "feat(web): calculator engine types"
```

---

## Task 2: Duration formatting

**Files:**
- Create: `apps/web/lib/calculator/format.ts`
- Test: `apps/web/lib/calculator/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/calculator/format.test.ts
import { describe, it, expect } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("returns a dash for zero or negative", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });
  it("formats hours and minutes, dropping seconds", () => {
    expect(formatDuration(3720)).toBe("1h 2m");
  });
  it("rounds fractional seconds", () => {
    expect(formatDuration(59.6)).toBe("1m");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/calculator/format.test.ts`
Expected: FAIL with "Cannot find module './format'" or "formatDuration is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/calculator/format.ts
/** Format a duration in seconds as "1h 2m", "3m 30s", or "45s". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec && !h) parts.push(`${sec}s`);
  return parts.join(" ") || "—";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/lib/calculator/format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/calculator/format.ts apps/web/lib/calculator/format.test.ts
git commit -m "feat(web): formatDuration helper for the calculator"
```

---

## Task 3: Default recipe selection

**Files:**
- Create: `apps/web/lib/calculator/expand.ts`
- Test: `apps/web/lib/calculator/expand.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/calculator/expand.test.ts
import { describe, it, expect } from "vitest";
import { defaultRecipeId } from "./expand";
import type { CalcRecipe } from "./types";

const r = (id: number, inputs: number): CalcRecipe => ({
  id,
  name: `Recipe ${id}`,
  type: "crafting",
  timeRequirement: 0,
  staminaRequirement: 0,
  outputQty: 1,
  inputs: Array.from({ length: inputs }, (_, i) => ({ refType: "item" as const, refId: 1000 + i, quantity: 1 })),
});

describe("defaultRecipeId", () => {
  it("prefers the recipe with the fewest inputs", () => {
    expect(defaultRecipeId([r(5, 3), r(6, 1), r(7, 2)])).toBe(6);
  });
  it("breaks ties by lowest id", () => {
    expect(defaultRecipeId([r(9, 2), r(4, 2)])).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/calculator/expand.test.ts`
Expected: FAIL with "defaultRecipeId is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/lib/calculator/expand.ts
import type { CalcRecipe } from "./types";

/** Default recipe when several produce a ref: fewest inputs, tie-break lowest id. */
export function defaultRecipeId(recipes: CalcRecipe[]): number {
  return [...recipes].sort((a, b) => a.inputs.length - b.inputs.length || a.id - b.id)[0].id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/lib/calculator/expand.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/calculator/expand.ts apps/web/lib/calculator/expand.test.ts
git commit -m "feat(web): defaultRecipeId heuristic"
```

---

## Task 4: The expansion engine

**Files:**
- Modify: `apps/web/lib/calculator/expand.ts`
- Modify: `apps/web/lib/calculator/expand.test.ts`

This task adds the `expand` function. It uses a small fixture subgraph shared across cases.

- [ ] **Step 1: Add the failing tests**

Append to `apps/web/lib/calculator/expand.test.ts`:

```ts
import { expand } from "./expand";
import type { Subgraph } from "./types";

// Iron Ore (cargo 99) --smelt--> Iron Ingot (item 1, x2) --forge--> Nail (item 2, x1)
// Nail also has a second, costlier recipe (item 2 from item 1 x5) to test alternatives.
const sg: Subgraph = {
  recipesByRef: {
    "item:1": [
      { id: 10, name: "Smelt Iron", type: "crafting", timeRequirement: 5, staminaRequirement: 2, outputQty: 2, inputs: [{ refType: "cargo", refId: 99, quantity: 5 }] },
    ],
    "item:2": [
      { id: 20, name: "Forge Nail", type: "crafting", timeRequirement: 3, staminaRequirement: 1, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 3 }] },
      { id: 21, name: "Forge Nail (slow)", type: "crafting", timeRequirement: 9, staminaRequirement: 4, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 5 }] },
    ],
  },
  refInfo: {
    "item:1": { name: "Iron Ingot", slug: "iron-ingot" },
    "item:2": { name: "Nail", slug: "nail" },
    "cargo:99": { name: "Iron Ore", slug: "iron-ore" },
  },
};

describe("expand", () => {
  it("expands a single-level craft to raw materials", () => {
    const res = expand(sg, { refType: "item", refId: 1, quantity: 2 });
    expect(res.tree.recipeId).toBe(10);
    expect(res.tree.crafts).toBe(1);
    expect(res.shoppingList).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 5 },
    ]);
    expect(res.totals).toEqual({ timeRequirement: 5, staminaRequirement: 2 });
  });

  it("expands multiple levels and aggregates raw materials", () => {
    const res = expand(sg, { refType: "item", refId: 2, quantity: 1 });
    // Need 1 nail -> recipe 20 (default: fewest inputs) needs 3 ingots.
    // 3 ingots -> recipe 10 makes 2 per craft -> ceil(3/2)=2 crafts -> 10 ore.
    const ore = res.shoppingList.find((l) => l.refId === 99);
    expect(ore?.quantity).toBe(10);
    // time: forge 1 craft (3) + smelt 2 crafts (10) = 13
    expect(res.totals.timeRequirement).toBe(13);
  });

  it("rounds craft counts up and reports surplus", () => {
    const res = expand(sg, { refType: "item", refId: 1, quantity: 3 });
    expect(res.tree.crafts).toBe(2); // ceil(3/2)
    expect(res.tree.produced).toBe(4);
    expect(res.tree.surplus).toBe(1);
  });

  it("flags nodes with alternatives and honors a selection override", () => {
    const def = expand(sg, { refType: "item", refId: 2, quantity: 1 });
    expect(def.tree.hasAlternatives).toBe(true);
    const swapped = expand(sg, { refType: "item", refId: 2, quantity: 1 }, { "item:2": 21 });
    // recipe 21 needs 5 ingots -> ceil(5/2)=3 smelts -> 15 ore
    const ore = swapped.shoppingList.find((l) => l.refId === 99);
    expect(ore?.quantity).toBe(15);
  });

  it("treats a target with no recipe as a raw material", () => {
    const res = expand(sg, { refType: "cargo", refId: 99, quantity: 4 });
    expect(res.tree.recipeId).toBeNull();
    expect(res.shoppingList).toEqual([
      { refType: "cargo", refId: 99, name: "Iron Ore", slug: "iron-ore", quantity: 4 },
    ]);
    expect(res.totals).toEqual({ timeRequirement: 0, staminaRequirement: 0 });
  });

  it("breaks cycles by treating the repeated ref as raw", () => {
    const cyclic: Subgraph = {
      recipesByRef: {
        "item:1": [{ id: 1, name: "A", type: "crafting", timeRequirement: 0, staminaRequirement: 0, outputQty: 1, inputs: [{ refType: "item", refId: 2, quantity: 1 }] }],
        "item:2": [{ id: 2, name: "B", type: "crafting", timeRequirement: 0, staminaRequirement: 0, outputQty: 1, inputs: [{ refType: "item", refId: 1, quantity: 1 }] }],
      },
      refInfo: { "item:1": { name: "A", slug: "a" }, "item:2": { name: "B", slug: "b" } },
    };
    const res = expand(cyclic, { refType: "item", refId: 1, quantity: 1 });
    // item:1 -> item:2 -> item:1 (cycle, raw)
    const raw = res.shoppingList.find((l) => l.refId === 1);
    expect(raw?.quantity).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/web/lib/calculator/expand.test.ts`
Expected: FAIL with "expand is not a function".

- [ ] **Step 3: Implement `expand`**

Append to `apps/web/lib/calculator/expand.ts`:

```ts
import type { CalcNode, CalcResult, RefKey, RefType, Selections, ShoppingLine, Subgraph } from "./types";
import { refKey } from "./types";

export function expand(
  subgraph: Subgraph,
  target: { refType: RefType; refId: number; quantity: number },
  selections: Selections = {},
): CalcResult {
  const shopping = new Map<RefKey, ShoppingLine>();
  const totals = { timeRequirement: 0, staminaRequirement: 0 };

  function addRaw(refType: RefType, refId: number, name: string, slug: string | null, icon: string | null | undefined, qty: number) {
    const key = refKey(refType, refId);
    const existing = shopping.get(key);
    if (existing) {
      existing.quantity += qty;
      return;
    }
    shopping.set(key, {
      refType,
      refId,
      name,
      slug,
      ...(icon ? { iconAssetName: icon } : {}),
      quantity: qty,
    });
  }

  function walk(refType: RefType, refId: number, needed: number, path: Set<RefKey>): CalcNode {
    const key = refKey(refType, refId);
    const info = subgraph.refInfo[key];
    const name = info?.name ?? `${refType} #${refId}`;
    const slug = info?.slug ?? null;
    const icon = info?.iconAssetName;

    const node: CalcNode = {
      refType,
      refId,
      name,
      slug,
      ...(icon ? { iconAssetName: icon } : {}),
      needed,
      recipeId: null,
      crafts: 0,
      produced: 0,
      surplus: 0,
      children: [],
      hasAlternatives: false,
    };

    const recipes = subgraph.recipesByRef[key] ?? [];
    if (recipes.length === 0 || path.has(key)) {
      addRaw(refType, refId, name, slug, icon, needed);
      return node;
    }

    const chosenId = selections[key] ?? defaultRecipeId(recipes);
    const recipe = recipes.find((x) => x.id === chosenId) ?? recipes[0];
    const crafts = Math.ceil(needed / recipe.outputQty);
    totals.timeRequirement += crafts * recipe.timeRequirement;
    totals.staminaRequirement += crafts * recipe.staminaRequirement;

    const nextPath = new Set(path).add(key);
    node.recipeId = recipe.id;
    node.crafts = crafts;
    node.produced = crafts * recipe.outputQty;
    node.surplus = node.produced - needed;
    node.hasAlternatives = recipes.length > 1;
    node.children = recipe.inputs.map((inp) => walk(inp.refType, inp.refId, inp.quantity * crafts, nextPath));
    return node;
  }

  const tree = walk(target.refType, target.refId, target.quantity, new Set());
  return { tree, shoppingList: [...shopping.values()], totals };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/lib/calculator/expand.test.ts`
Expected: PASS (8 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/calculator/expand.ts apps/web/lib/calculator/expand.test.ts
git commit -m "feat(web): crafting BOM expansion engine"
```

---

## Task 5: Assemble a subgraph from DB rows

**Files:**
- Create: `apps/web/lib/calculator/subgraph.ts`
- Test: `apps/web/lib/calculator/subgraph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/calculator/subgraph.test.ts
import { describe, it, expect } from "vitest";
import { assembleSubgraph } from "./subgraph";

describe("assembleSubgraph", () => {
  it("groups recipes by produced ref with scoped outputQty and inputs", () => {
    const sg = assembleSubgraph({
      recipes: [{ id: 10, name: "Smelt Iron", type: "crafting", timeRequirement: 5, staminaRequirement: null }],
      outputs: [{ recipeId: 10, refType: "item", refId: 1, quantity: 2 }],
      inputs: [{ recipeId: 10, refType: "cargo", refId: 99, quantity: 5 }],
      refInfo: { "item:1": { name: "Iron Ingot", slug: "iron-ingot" } },
    });
    expect(sg.recipesByRef["item:1"]).toEqual([
      {
        id: 10,
        name: "Smelt Iron",
        type: "crafting",
        timeRequirement: 5,
        staminaRequirement: 0,
        outputQty: 2,
        inputs: [{ refType: "cargo", refId: 99, quantity: 5 }],
      },
    ]);
    expect(sg.refInfo["item:1"].name).toBe("Iron Ingot");
  });

  it("registers the same recipe under each ref it produces", () => {
    const sg = assembleSubgraph({
      recipes: [{ id: 30, name: "Saw Logs", type: "crafting", timeRequirement: 1, staminaRequirement: 1 }],
      outputs: [
        { recipeId: 30, refType: "item", refId: 5, quantity: 4 },
        { recipeId: 30, refType: "item", refId: 6, quantity: 1 },
      ],
      inputs: [{ recipeId: 30, refType: "item", refId: 7, quantity: 1 }],
      refInfo: {},
    });
    expect(sg.recipesByRef["item:5"][0].outputQty).toBe(4);
    expect(sg.recipesByRef["item:6"][0].outputQty).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/calculator/subgraph.test.ts`
Expected: FAIL with "Cannot find module './subgraph'".

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/calculator/subgraph.ts
import type { CalcRecipe, RefInfo, RefKey, RefType, Subgraph } from "./types";
import { refKey } from "./types";

export interface RawRecipeRow {
  id: number;
  name: string;
  type: string;
  timeRequirement: number | null;
  staminaRequirement: number | null;
}

export interface RawStackRow {
  recipeId: number;
  refType: RefType;
  refId: number;
  quantity: number;
}

/** Build a Subgraph from flat recipe/input/output rows (pure). */
export function assembleSubgraph(args: {
  recipes: RawRecipeRow[];
  outputs: RawStackRow[];
  inputs: RawStackRow[];
  refInfo: Record<RefKey, RefInfo>;
}): Subgraph {
  const recipeById = new Map(args.recipes.map((r) => [r.id, r]));
  const inputsByRecipe = new Map<number, RawStackRow[]>();
  for (const i of args.inputs) {
    const arr = inputsByRecipe.get(i.recipeId) ?? [];
    arr.push(i);
    inputsByRecipe.set(i.recipeId, arr);
  }

  const recipesByRef: Record<RefKey, CalcRecipe[]> = {};
  for (const out of args.outputs) {
    const r = recipeById.get(out.recipeId);
    if (!r) continue;
    const calc: CalcRecipe = {
      id: r.id,
      name: r.name,
      type: r.type,
      timeRequirement: r.timeRequirement ?? 0,
      staminaRequirement: r.staminaRequirement ?? 0,
      outputQty: out.quantity,
      inputs: (inputsByRecipe.get(r.id) ?? []).map((i) => ({ refType: i.refType, refId: i.refId, quantity: i.quantity })),
    };
    const key = refKey(out.refType, out.refId);
    (recipesByRef[key] ??= []).push(calc);
  }

  return { recipesByRef, refInfo: args.refInfo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/lib/calculator/subgraph.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/calculator/subgraph.ts apps/web/lib/calculator/subgraph.test.ts
git commit -m "feat(web): assembleSubgraph from recipe rows"
```

---

## Task 6: DB closure builder + target queries

**Files:**
- Create: `apps/web/lib/queries/calculator-graph.ts`

No unit test (the repo has no DB-touching vitest tests; verified via typecheck here and the page load in Task 11).

- [ ] **Step 1: Write the DB module**

```ts
// apps/web/lib/queries/calculator-graph.ts
import "server-only";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { assembleSubgraph, type RawStackRow } from "@/lib/calculator/subgraph";
import { resolveRefs } from "./craft-graph-db";
import type { RefKey, RefType, Subgraph } from "@/lib/calculator/types";
import { refKey } from "@/lib/calculator/types";

const CRAFTING = "crafting";

/** Transitive-closure subgraph reachable from a target (crafting recipes only). */
export async function getCalculatorSubgraph(refType: RefType, refId: number): Promise<Subgraph> {
  const db = getDb();
  const { recipes, recipeInputs, recipeOutputs } = schema;

  const seen = new Set<RefKey>([refKey(refType, refId)]);
  const fetchedRecipes = new Set<number>();
  let frontier: { refType: RefType; refId: number }[] = [{ refType, refId }];

  const recipeRows = new Map<number, typeof recipes.$inferSelect>();
  const outputRows: RawStackRow[] = [];
  const inputRows: RawStackRow[] = [];

  while (frontier.length) {
    const outs = await db
      .select()
      .from(recipeOutputs)
      .where(or(...frontier.map((f) => and(eq(recipeOutputs.refType, f.refType), eq(recipeOutputs.refId, f.refId)))));

    const outRecipeIds = [...new Set(outs.map((o) => o.recipeId))];
    const recs = outRecipeIds.length
      ? await db.select().from(recipes).where(and(inArray(recipes.id, outRecipeIds), eq(recipes.type, CRAFTING)))
      : [];
    const craftingIds = new Set(recs.map((r) => r.id));
    for (const r of recs) recipeRows.set(r.id, r);

    // Outputs for crafting recipes producing current frontier refs (each frontier ref seen once).
    for (const o of outs) {
      if (craftingIds.has(o.recipeId)) {
        outputRows.push({ recipeId: o.recipeId, refType: o.refType as RefType, refId: o.refId, quantity: o.quantity });
      }
    }

    // Fetch inputs only for crafting recipes not already expanded (avoids double-counting co-products).
    const newRecipeIds = [...craftingIds].filter((id) => !fetchedRecipes.has(id));
    const ins = newRecipeIds.length
      ? await db.select().from(recipeInputs).where(inArray(recipeInputs.recipeId, newRecipeIds))
      : [];
    for (const id of newRecipeIds) fetchedRecipes.add(id);

    const next: { refType: RefType; refId: number }[] = [];
    for (const i of ins) {
      inputRows.push({ recipeId: i.recipeId, refType: i.refType as RefType, refId: i.refId, quantity: i.quantity });
      const k = refKey(i.refType as RefType, i.refId);
      if (!seen.has(k)) {
        seen.add(k);
        next.push({ refType: i.refType as RefType, refId: i.refId });
      }
    }
    frontier = next;
  }

  const allStacks = [...outputRows, ...inputRows];
  const refInfo = (await resolveRefs(allStacks.map((s) => ({ refType: s.refType, refId: s.refId })))) as Record<RefKey, { name: string; slug: string; iconAssetName?: string | null }>;

  return assembleSubgraph({
    recipes: [...recipeRows.values()].map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      timeRequirement: r.timeRequirement,
      staminaRequirement: r.staminaRequirement,
    })),
    outputs: outputRows,
    inputs: inputRows,
    refInfo,
  });
}

export interface TargetHit {
  refType: RefType;
  refId: number;
  name: string;
  slug: string;
  iconAssetName: string | null;
}

/** Search items and cargo by name for the calculator finder. */
export async function searchTargets(q: string, limit = 20): Promise<TargetHit[]> {
  const db = getDb();
  const like = `%${q}%`;
  const itemRows = await db
    .select({ id: schema.items.id, name: schema.items.name, slug: schema.items.slug, icon: schema.items.iconAssetName })
    .from(schema.items)
    .where(ilike(schema.items.name, like))
    .orderBy(schema.items.name)
    .limit(limit);
  const cargoRows = await db
    .select({ id: schema.cargo.id, name: schema.cargo.name, slug: schema.cargo.slug, icon: schema.cargo.iconAssetName })
    .from(schema.cargo)
    .where(ilike(schema.cargo.name, like))
    .orderBy(schema.cargo.name)
    .limit(limit);
  const hits: TargetHit[] = [
    ...itemRows.map((r) => ({ refType: "item" as const, refId: r.id, name: r.name, slug: r.slug, iconAssetName: r.icon })),
    ...cargoRows.map((r) => ({ refType: "cargo" as const, refId: r.id, name: r.name, slug: r.slug, iconAssetName: r.icon })),
  ];
  return hits.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/** Distinct item/cargo targets that have at least one crafting recipe (for SSG + sitemap). */
export async function listCraftableTargets(): Promise<{ refType: RefType; slug: string }[]> {
  const db = getDb();
  const { recipeOutputs, recipes, items, cargo } = schema;
  const itemRows = await db
    .selectDistinct({ slug: items.slug })
    .from(recipeOutputs)
    .innerJoin(recipes, and(eq(recipes.id, recipeOutputs.recipeId), eq(recipes.type, CRAFTING)))
    .innerJoin(items, and(eq(recipeOutputs.refType, "item"), eq(items.id, recipeOutputs.refId)));
  const cargoRows = await db
    .selectDistinct({ slug: cargo.slug })
    .from(recipeOutputs)
    .innerJoin(recipes, and(eq(recipes.id, recipeOutputs.recipeId), eq(recipes.type, CRAFTING)))
    .innerJoin(cargo, and(eq(recipeOutputs.refType, "cargo"), eq(cargo.id, recipeOutputs.refId)));
  return [
    ...itemRows.map((r) => ({ refType: "item" as const, slug: r.slug })),
    ...cargoRows.map((r) => ({ refType: "cargo" as const, slug: r.slug })),
  ];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS. If `resolveRefs`'s return type does not satisfy the cast, confirm its signature in `apps/web/lib/queries/craft-graph-db.ts` (it returns `Record<string, RefInfo>` with `{ name, slug, iconAssetName? }`) — the cast to `Record<RefKey, …>` is safe because keys are `${refType}:${refId}`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/calculator-graph.ts
git commit -m "feat(web): calculator subgraph closure + target queries"
```

---

## Task 7: Presentational components (ShoppingList, TotalsCard)

**Files:**
- Create: `apps/web/components/calculator/ShoppingList.tsx`
- Create: `apps/web/components/calculator/TotalsCard.tsx`

- [ ] **Step 1: Write ShoppingList**

```tsx
// apps/web/components/calculator/ShoppingList.tsx
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import type { ShoppingLine } from "@/lib/calculator/types";

export function ShoppingList({ lines }: { lines: ShoppingLine[] }) {
  if (lines.length === 0) {
    return <p className="text-muted-foreground">This is a raw material — nothing to craft.</p>;
  }
  const sorted = [...lines].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {sorted.map((l) => (
        <li key={`${l.refType}:${l.refId}`} className="flex items-center gap-3 px-3 py-2">
          <EntityIcon assetName={l.iconAssetName} name={l.name} size={28} />
          {l.slug ? (
            <Link href={`/${l.refType === "item" ? "items" : "cargo"}/${l.slug}`} className="hover:underline">
              {l.name}
            </Link>
          ) : (
            <span>{l.name}</span>
          )}
          <span className="ml-auto font-mono text-sm">×{l.quantity}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Write TotalsCard**

```tsx
// apps/web/components/calculator/TotalsCard.tsx
import { formatDuration } from "@/lib/calculator/format";
import type { CalcTotals } from "@/lib/calculator/types";

export function TotalsCard({ totals }: { totals: CalcTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-md border border-border p-4 text-sm">
      <div>
        <dt className="text-muted-foreground">Total time</dt>
        <dd className="text-lg font-semibold">{formatDuration(totals.timeRequirement)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Total stamina</dt>
        <dd className="text-lg font-semibold">{totals.staminaRequirement ? Math.round(totals.staminaRequirement) : "—"}</dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/calculator/ShoppingList.tsx apps/web/components/calculator/TotalsCard.tsx
git commit -m "feat(web): calculator shopping list + totals card"
```

---

## Task 8: Interactive components (CraftTree, CalculatorResult, TargetSearch)

**Files:**
- Create: `apps/web/components/calculator/CraftTree.tsx`
- Create: `apps/web/components/calculator/CalculatorResult.tsx`
- Create: `apps/web/components/calculator/TargetSearch.tsx`

- [ ] **Step 1: Write CraftTree**

```tsx
// apps/web/components/calculator/CraftTree.tsx
"use client";
import { useState } from "react";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { defaultRecipeId } from "@/lib/calculator/expand";
import { refKey, type CalcNode, type Selections, type Subgraph } from "@/lib/calculator/types";

interface TreeProps {
  node: CalcNode;
  subgraph: Subgraph;
  selections: Selections;
  onSelect: (key: string, recipeId: number) => void;
}

export function CraftTree({ node, subgraph, selections, onSelect }: TreeProps) {
  return (
    <ul className="space-y-1 text-sm">
      <TreeNode node={node} subgraph={subgraph} selections={selections} onSelect={onSelect} />
    </ul>
  );
}

function TreeNode({ node, subgraph, selections, onSelect }: TreeProps) {
  const [open, setOpen] = useState(true);
  const key = refKey(node.refType, node.refId);
  const recipes = subgraph.recipesByRef[key] ?? [];
  const selectedId = node.recipeId ?? (recipes.length ? selections[key] ?? defaultRecipeId(recipes) : null);

  return (
    <li>
      <div className="flex items-center gap-2 py-1">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Collapse" : "Expand"}
            className="w-4 text-muted-foreground"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <EntityIcon assetName={node.iconAssetName} name={node.name} size={24} />
        <span>{node.name}</span>
        <span className="font-mono text-muted-foreground">×{node.needed}</span>
        {node.surplus > 0 && <span className="text-xs text-muted-foreground">(+{node.surplus} surplus)</span>}
        {node.hasAlternatives && selectedId != null && (
          <select
            value={selectedId}
            onChange={(e) => onSelect(key, Number(e.target.value))}
            aria-label={`Recipe for ${node.name}`}
            className="ml-auto h-7 rounded border border-input bg-transparent px-2 text-xs"
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ul className="ml-5 space-y-1 border-l border-border pl-3">
          {node.children.map((c) => (
            <TreeNode key={`${c.refType}:${c.refId}`} node={c} subgraph={subgraph} selections={selections} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Write CalculatorResult**

```tsx
// apps/web/components/calculator/CalculatorResult.tsx
"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { expand } from "@/lib/calculator/expand";
import type { RefType, Selections, Subgraph } from "@/lib/calculator/types";
import { ShoppingList } from "./ShoppingList";
import { TotalsCard } from "./TotalsCard";
import { CraftTree } from "./CraftTree";

export function CalculatorResult({
  subgraph,
  target,
}: {
  subgraph: Subgraph;
  target: { refType: RefType; refId: number };
}) {
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<Selections>({});

  const result = useMemo(
    () => expand(subgraph, { refType: target.refType, refId: target.refId, quantity: Math.max(1, qty) }, selections),
    [subgraph, target.refType, target.refId, qty, selections],
  );

  return (
    <div className="mt-6 space-y-8">
      <label className="flex items-center gap-2 text-sm">
        Quantity
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          className="w-24"
          aria-label="Quantity to craft"
        />
      </label>

      <TotalsCard totals={result.totals} />

      <section>
        <h2 className="mb-2 text-xl font-semibold">Shopping list</h2>
        <ShoppingList lines={result.shoppingList} />
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Craft tree</h2>
        <CraftTree
          node={result.tree}
          subgraph={subgraph}
          selections={selections}
          onSelect={(key, id) => setSelections((s) => ({ ...s, [key]: id }))}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Write TargetSearch**

```tsx
// apps/web/components/calculator/TargetSearch.tsx
"use client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function TargetSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    router.push(q ? `/calculator?q=${encodeURIComponent(q)}` : "/calculator");
  }
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input name="q" defaultValue={defaultValue} placeholder="Search items or cargo…" aria-label="Search craft target" className="max-w-sm" />
      <button type="submit" className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90">
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/calculator/CraftTree.tsx apps/web/components/calculator/CalculatorResult.tsx apps/web/components/calculator/TargetSearch.tsx
git commit -m "feat(web): interactive craft tree, result island, target search"
```

---

## Task 9: Pages (finder + per-target result)

**Files:**
- Create: `apps/web/app/calculator/page.tsx`
- Create: `apps/web/app/calculator/[type]/[slug]/page.tsx`

- [ ] **Step 1: Write the finder page**

```tsx
// apps/web/app/calculator/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { TargetSearch } from "@/components/calculator/TargetSearch";
import { searchTargets } from "@/lib/queries/calculator-graph";

export const metadata: Metadata = {
  title: "Crafting Calculator",
  description: "Calculate the raw materials, time, and stamina needed to craft any item or cargo in BitCraft Online.",
  alternates: { canonical: "/calculator" },
};

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const hits = query ? await searchTargets(query) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Crafting Calculator</h1>
      <p className="mt-2 text-muted-foreground">
        Search for an item or cargo to see every raw material, plus the total time and stamina, needed to craft it.
      </p>
      <div className="mt-6">
        <TargetSearch defaultValue={query} />
      </div>
      {query && (
        <ul className="mt-6 divide-y divide-border">
          {hits.length === 0 && <li className="py-3 text-muted-foreground">No matches for “{query}”.</li>}
          {hits.map((h) => (
            <li key={`${h.refType}:${h.refId}`}>
              <Link href={`/calculator/${h.refType}/${h.slug}`} className="flex items-center gap-3 py-3 hover:underline">
                <EntityIcon assetName={h.iconAssetName} name={h.name} size={32} />
                <span>{h.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{h.refType}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the per-target result page**

```tsx
// apps/web/app/calculator/[type]/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalculatorResult } from "@/components/calculator/CalculatorResult";
import { getItemBySlug } from "@/lib/queries/items";
import { getCargoBySlug } from "@/lib/queries/cargo";
import { getCalculatorSubgraph, listCraftableTargets } from "@/lib/queries/calculator-graph";
import { refKey, type RefType } from "@/lib/calculator/types";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const targets = await listCraftableTargets();
  return targets.map((t) => ({ type: t.refType, slug: t.slug }));
}

interface Target {
  refType: RefType;
  id: number;
  name: string;
  slug: string;
  icon: string | null;
}

async function loadTarget(type: string, slug: string): Promise<Target | null> {
  if (type === "item") {
    const r = await getItemBySlug(slug);
    return r ? { refType: "item", id: r.id, name: r.name, slug: r.slug, icon: r.iconAssetName } : null;
  }
  if (type === "cargo") {
    const r = await getCargoBySlug(slug);
    return r ? { refType: "cargo", id: r.id, name: r.name, slug: r.slug, icon: r.iconAssetName } : null;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ type: string; slug: string }> }): Promise<Metadata> {
  const { type, slug } = await params;
  const t = await loadTarget(type, slug);
  if (!t) return { title: "Crafting Calculator" };
  return {
    title: `${t.name} — Crafting Calculator`,
    description: `Raw materials, time, and stamina needed to craft ${t.name} in BitCraft Online.`,
    alternates: { canonical: `/calculator/${type}/${slug}` },
    openGraph: { title: `${t.name} — Crafting Calculator`, url: `${SITE_URL}/calculator/${type}/${slug}` },
  };
}

export default async function CalculatorResultPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  if (type !== "item" && type !== "cargo") notFound();
  const t = await loadTarget(type, slug);
  if (!t) notFound();

  const subgraph = await getCalculatorSubgraph(t.refType, t.id);
  // Ensure the target resolves even if it has no recipe (raw material).
  const key = refKey(t.refType, t.id);
  subgraph.refInfo[key] ??= { name: t.name, slug: t.slug, iconAssetName: t.icon };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/calculator" className="hover:underline">
          Calculator
        </Link>{" "}
        / <span>{t.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.name}</h1>
      <p className="mt-1 text-muted-foreground">Crafting calculator</p>
      <CalculatorResult subgraph={subgraph} target={{ refType: t.refType, refId: t.id }} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/calculator
git commit -m "feat(web): calculator finder + per-target result pages"
```

---

## Task 10: Wiring (nav, entry buttons, sitemap, llms.txt)

**Files:**
- Modify: `apps/web/app/layout.tsx:9-15`
- Modify: `apps/web/app/items/[slug]/page.tsx` (add entry button near the badges)
- Modify: `apps/web/app/cargo/[slug]/page.tsx` (add entry button near the badges)
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/llms.txt/route.ts:10-16`

- [ ] **Step 1: Add the nav link**

In `apps/web/app/layout.tsx`, change the `NAV` array to include the calculator:

```ts
const NAV: [string, string][] = [
  ["/items", "Items"],
  ["/cargo", "Cargo"],
  ["/buildings", "Buildings"],
  ["/recipes", "Recipes"],
  ["/calculator", "Calculator"],
  ["/blog", "Blog"],
];
```

- [ ] **Step 2: Add the "Calculate materials" button to the item detail page**

In `apps/web/app/items/[slug]/page.tsx`, insert this block immediately after the closing `</dl>` (the stats list, around line 91) and before `<CraftGraphSection title="Made by" …>`:

```tsx
      <Link
        href={`/calculator/item/${item.slug}`}
        className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Calculate materials →
      </Link>
```

(`Link` is already imported in this file.)

- [ ] **Step 3: Add the "Calculate materials" button to the cargo detail page**

Open `apps/web/app/cargo/[slug]/page.tsx`. Confirm `Link` is imported (add `import Link from "next/link";` if absent). Insert the same block, immediately before the first `<CraftGraphSection …>`, using the cargo slug:

```tsx
      <Link
        href={`/calculator/cargo/${cargo.slug}`}
        className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Calculate materials →
      </Link>
```

Note: match the local variable name used for the cargo row in that file (it may be `cargo` or `row`); use whatever the page already uses for `.slug`.

- [ ] **Step 4: Add calculator URLs to the sitemap**

In `apps/web/app/sitemap.ts`:

1. Add the import:

```ts
import { listCraftableTargets } from "@/lib/queries/calculator-graph";
```

2. Add `listCraftableTargets()` to the parallel fetch and use it. Change the `Promise.all` block and `return` to include craftable targets:

```ts
  const [items, cargo, buildings, recipes, craftable] = await Promise.all([
    listAllItemSlugs(),
    listAllCargoSlugs(),
    listAllBuildingSlugs(),
    listAllRecipeSlugs(),
    listCraftableTargets(),
  ]);
```

3. Add the calculator hub entry next to the other section hubs (after the `/recipes` line):

```ts
    { url: `${SITE_URL}/calculator`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
```

4. Add the per-target entries to the returned array (after the `...detail("recipes", recipes)` spread):

```ts
    ...craftable.map((t) => ({
      url: `${SITE_URL}/calculator/${t.refType}/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
```

- [ ] **Step 5: Add the calculator to llms.txt**

In `apps/web/app/llms.txt/route.ts`, add a line under the `## Compendium` block (after the `Recipes:` line):

```
- Calculator: ${SITE_URL}/calculator
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @bcc/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/items apps/web/app/cargo apps/web/app/sitemap.ts apps/web/app/llms.txt
git commit -m "feat(web): wire calculator into nav, detail pages, sitemap, llms.txt"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — all prior tests plus the new calculator tests (format 5, defaultRecipeId 2, expand 6, subgraph 2). Total should be the previous 92 + 17 = 109 passing.

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm --filter @bcc/web build`
Expected: PASS. The build statically generates `/calculator/<type>/<slug>` pages for craftable targets (via `generateStaticParams`). Watch for any "Dynamic server usage" or serialization errors.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm --filter @bcc/web dev`
Then in a browser:
- Visit `http://localhost:3000/calculator`, search a known craftable (e.g. an item you know has a recipe), and click a result.
- On the result page, confirm: the shopping list shows raw materials, totals show time/stamina, and the craft tree expands.
- Change the quantity → totals and shopping list update.
- On a node with a recipe dropdown (alternatives), swap the recipe → the tree/list/totals recompute.
- Open an item detail page (`/items/<slug>`) and click "Calculate materials →" — it lands on the result page.

When done, stop the dev server and kill the lingering process:
Run: `Get-NetTCPConnection -LocalPort 3000` (then stop the owning PID if still listening).

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(web): calculator verification fixes"
```

(Skip if the working tree is already clean.)

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** engine (Tasks 3-4), subgraph closure (Tasks 5-6), shopping list + totals + tree (Tasks 4, 7, 8), per-node swap (Tasks 4, 8), dedicated page + per-item entry (Tasks 9-10), SSR/SEO (Task 9 `generateMetadata` + `generateStaticParams`), testing (Tasks 2-5, 11). Construction recipes excluded via the `type = "crafting"` filter in Task 6.
- **Out of scope (per spec):** building/construction targets, "already have" toggles, market cost.
- **Type consistency:** `refKey`, `CalcRecipe` (incl. `name`), `Subgraph`, `Selections`, `CalcNode`, `ShoppingLine`, `CalcTotals`, `CalcResult` are defined once in Task 1 and used unchanged thereafter.
