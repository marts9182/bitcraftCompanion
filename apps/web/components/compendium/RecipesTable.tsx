import Link from "next/link";
import { TierBadge } from "./TierBadge";
import { RecipeTypeBadge } from "./RecipeTypeBadge";
import { EntityIcon } from "./EntityIcon";
import { MobileCard } from "@/components/mobile/MobileCard";
import type { RecipeListRow } from "@/lib/queries/recipes";

/** Small muted chip for the recipe's action verb ("Craft", "Bake", …). */
function VerbBadge({ verb }: { verb: string }) {
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {verb}
    </span>
  );
}

/**
 * Recipes list: each row titled by the recipe's primary OUTPUT (icon + name)
 * with the template's action verb as a badge — recipe names themselves are
 * unresolved localization templates ("Craft {0}") and never shown.
 * Desktop table ≥ md, MobileCard list below (ResourcesTable pattern).
 */
export function RecipesTable({ recipes }: { recipes: RecipeListRow[] }) {
  if (recipes.length === 0) {
    return <p className="py-8 text-muted-foreground">No recipes match your search.</p>;
  }
  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Recipe</th>
            <th className="py-2 pr-4 font-medium">Action</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 font-medium">Tier</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((r) => (
            <tr key={r.slug} className="border-b border-border/50 hover:bg-muted/40">
              <td className="py-2 pr-4">
                <Link href={`/recipes/${r.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                  <EntityIcon assetName={r.iconAssetName} name={r.name} rarity={r.rarity} size={24} />
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <VerbBadge verb={r.verb} />
              </td>
              <td className="py-2 pr-4">
                <RecipeTypeBadge type={r.type} />
              </td>
              <td className="py-2">
                <TierBadge tier={r.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 md:hidden">
        {recipes.map((r) => (
          <MobileCard
            key={r.slug}
            title={
              <Link href={`/recipes/${r.slug}`} className="inline-flex items-center gap-2 hover:underline">
                <EntityIcon assetName={r.iconAssetName} name={r.name} rarity={r.rarity} size={20} />
                {r.name}
              </Link>
            }
            subtitle={[r.verb, r.tier != null && r.tier >= 0 ? `Tier ${r.tier}` : null].filter(Boolean).join(" · ")}
            stats={[{ label: "Type", value: <RecipeTypeBadge type={r.type} /> }]}
          />
        ))}
      </ul>
    </>
  );
}
