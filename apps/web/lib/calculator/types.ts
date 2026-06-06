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
