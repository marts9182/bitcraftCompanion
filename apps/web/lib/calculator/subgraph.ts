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
      timeRequirement: r.timeRequirement ?? 0,
      staminaRequirement: r.staminaRequirement ?? 0,
      outputQty: out.quantity || 1, // guard bad data (0 → division by zero in expand)
      inputs: (inputsByRecipe.get(r.id) ?? []).map((i) => ({ refType: i.refType, refId: i.refId, quantity: i.quantity })),
    };
    const key = refKey(out.refType, out.refId);
    (recipesByRef[key] ??= []).push(calc);
  }

  return { recipesByRef, refInfo: args.refInfo };
}
