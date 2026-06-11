import "server-only";
import { unstable_cache } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { SuggestEntry, SuggestKind } from "@/lib/suggest";
import { recipeOutputTierSql } from "./recipes";

// Catalogs only change when a worker snapshot lands — same 30 min cadence as
// the map catalogs (lib/queries/map.ts).
const SUGGEST_CACHE = { revalidate: 1800 } as const;

const fetchers: Record<SuggestKind, () => Promise<SuggestEntry[]>> = {
  items: () =>
    getDb()
      .select({ name: schema.items.name, slug: schema.items.slug, tier: schema.items.tier })
      .from(schema.items)
      .orderBy(asc(schema.items.name)),
  cargo: () =>
    getDb()
      .select({ name: schema.cargo.name, slug: schema.cargo.slug, tier: schema.cargo.tier })
      .from(schema.cargo)
      .orderBy(asc(schema.cargo.name)),
  // Recipes have no own tier — reuse the derived MAX-output-tier expression
  // so suggestions agree with the /recipes list filter.
  recipes: () =>
    getDb()
      .select({ name: schema.recipes.name, slug: schema.recipes.slug, tier: recipeOutputTierSql })
      .from(schema.recipes)
      .orderBy(asc(schema.recipes.name)),
  resources: () =>
    getDb()
      .select({ name: schema.resources.name, slug: schema.resources.slug, tier: schema.resources.tier })
      .from(schema.resources)
      .where(eq(schema.resources.compendiumEntry, true))
      .orderBy(asc(schema.resources.name)),
  creatures: () =>
    getDb()
      .select({ name: schema.creatures.name, slug: schema.creatures.slug, tier: schema.creatures.tier })
      .from(schema.creatures)
      .orderBy(asc(schema.creatures.name)),
};

// One unstable_cache entry per kind (key "suggest-<kind>").
const cached = Object.fromEntries(
  (Object.keys(fetchers) as SuggestKind[]).map((kind) => [
    kind,
    unstable_cache(fetchers[kind], [`suggest-${kind}`], SUGGEST_CACHE),
  ]),
) as Record<SuggestKind, () => Promise<SuggestEntry[]>>;

/** Slim name/slug/tier catalog for one suggestible kind (30-min cached). */
export function getSuggestCatalog(kind: SuggestKind): Promise<SuggestEntry[]> {
  return cached[kind]();
}
