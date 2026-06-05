import { toInt } from "./decode";

type Raw = Record<string, unknown>;
export type RefType = "item" | "cargo";
export interface GraphRow { recipeId: number; refType: RefType; refId: number; quantity: number }

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * Determine whether a stack references an item or cargo from its item_type value.
 * Handles three encodings:
 *  - string: "Item" / "Cargo" (GameData dump)
 *  - keyed tagged sum: { Item: [] } / { Cargo: [] }
 *  - positional sum from live SpacetimeDB: [tag, payload] where tag 1 = cargo
 */
export function refTypeOf(itemType: unknown): RefType {
  if (typeof itemType === "string") return /cargo/i.test(itemType) ? "cargo" : "item";
  if (Array.isArray(itemType)) return itemType[0] === 1 ? "cargo" : "item";
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

/**
 * Convert a list of recipe stacks to graph rows. Each stack is either a live
 * positional array `[item_id, quantity, item_type, ...]` or a keyed object
 * `{ item_id, quantity, item_type }` (GameData dump). Stacks without a usable
 * id are skipped.
 */
function stacksToRows(recipeId: number, stacks: unknown, forceType?: RefType): GraphRow[] {
  if (!Array.isArray(stacks)) return [];
  const rows: GraphRow[] = [];
  for (const s of stacks) {
    let refId: number | null;
    let quantity: number;
    let itemType: unknown;
    if (Array.isArray(s)) {
      refId = toInt(s[0]);
      quantity = toInt(s[1]) ?? 1;
      itemType = s[2];
    } else if (s && typeof s === "object") {
      const stack = s as Raw;
      refId = toInt(stack.item_id);
      quantity = toInt(stack.quantity) ?? 1;
      itemType = stack.item_type;
    } else {
      continue;
    }
    if (refId == null) continue;
    rows.push({ recipeId, refType: forceType ?? refTypeOf(itemType), refId, quantity });
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
