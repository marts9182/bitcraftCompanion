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
  iconAssetName?: string | null;
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
  iconAssetName?: string | null;
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
    ...(info?.iconAssetName ? { iconAssetName: info.iconAssetName } : {}),
  };
}

function resolveStack(s: StackRow, refs: Record<string, RefInfo>): StackView {
  return resolveStackView(s, refs);
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
