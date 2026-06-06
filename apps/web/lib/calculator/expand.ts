import type { CalcNode, CalcRecipe, CalcResult, RefKey, RefType, Selections, ShoppingLine, Subgraph } from "./types";
import { refKey } from "./types";

/** Default recipe when several produce a ref: fewest inputs, tie-break lowest id. */
export function defaultRecipeId(recipes: CalcRecipe[]): number {
  return [...recipes].sort((a, b) => a.inputs.length - b.inputs.length || a.id - b.id)[0].id;
}

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
