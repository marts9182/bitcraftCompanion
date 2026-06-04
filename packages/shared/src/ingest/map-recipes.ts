import { toInt } from "./decode";

type Raw = Record<string, unknown>;
export type RefType = "item" | "cargo";
export interface GraphRow { recipeId: number; refType: RefType; refId: number; quantity: number }

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Determine whether a stack references an item or cargo from its item_type sum. */
export function refTypeOf(itemType: unknown): RefType {
  if (typeof itemType === "string") return /cargo/i.test(itemType) ? "cargo" : "item";
  if (itemType && typeof itemType === "object") {
    const key = Object.keys(itemType as object)[0] ?? "";
    return /cargo/i.test(key) ? "cargo" : "item";
  }
  return "item";
}

export function mapRecipeRow(raw: Raw, type: "crafting" | "construction", slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    type,
    timeRequirement: typeof raw.time_requirement === "number" ? raw.time_requirement : null,
    staminaRequirement: typeof raw.stamina_requirement === "number" ? raw.stamina_requirement : null,
    raw,
  };
}

function stacksToRows(recipeId: number, stacks: unknown, forceType?: RefType): GraphRow[] {
  if (!Array.isArray(stacks)) return [];
  const rows: GraphRow[] = [];
  for (const s of stacks) {
    if (!s || typeof s !== "object") continue;
    const stack = s as Raw;
    const refId = toInt(stack.item_id);
    if (refId == null) continue;
    rows.push({
      recipeId,
      refType: forceType ?? refTypeOf(stack.item_type),
      refId,
      quantity: toInt(stack.quantity) ?? 1,
    });
  }
  return rows;
}

/** Build recipe_inputs/recipe_outputs rows from a recipe's consumed/crafted stacks. */
export function buildRecipeGraph(recipeId: number, raw: Raw): { inputs: GraphRow[]; outputs: GraphRow[] } {
  const inputs = [
    ...stacksToRows(recipeId, raw.consumed_item_stacks),
    ...stacksToRows(recipeId, raw.consumed_cargo_stacks, "cargo"),
  ];
  const outputs = stacksToRows(recipeId, raw.crafted_item_stacks);
  return { inputs, outputs };
}
