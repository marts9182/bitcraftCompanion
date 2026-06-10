export const RARITIES = ["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Decode a SpacetimeDB rarity value (index, name, or tagged sum) to a Rarity. */
export function decodeRarity(value: unknown): Rarity {
  // Wire-format tagged enums arrive as [variantIndex, {}] over the v1.json subprotocol.
  // Must precede the object branch: arrays are objects, and Object.keys([1,{}])[0] is "0".
  if (Array.isArray(value) && typeof value[0] === "number") return RARITIES[value[0]] ?? "Default";
  if (typeof value === "number" && RARITIES[value]) return RARITIES[value];
  if (typeof value === "string" && (RARITIES as readonly string[]).includes(value)) return value as Rarity;
  if (value && typeof value === "object") {
    const key = Object.keys(value as object)[0];
    if (key !== undefined) {
      const asNum = Number(key);
      if (Number.isInteger(asNum) && RARITIES[asNum]) return RARITIES[asNum];
      if ((RARITIES as readonly string[]).includes(key)) return key as Rarity;
    }
  }
  return "Default";
}

/** Coerce a value to an integer, or null if not coercible. */
export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return null;
}

/** URL slug from a display name (does not de-duplicate; see makeUniqueSlug). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
