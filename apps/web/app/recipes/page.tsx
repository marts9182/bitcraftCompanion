import type { Metadata } from "next";
import { RecipesTable } from "@/components/compendium/RecipesTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listRecipeOutputTiers, listRecipes } from "@/lib/queries/recipes";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Browse BitCraft Online crafting recipes by what they produce, filterable by tier.",
  alternates: { canonical: "/recipes" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, ["type", "tier"]);
  const [{ rows, total, page, pageSize }, tiers] = await Promise.all([listRecipes(params), listRecipeOutputTiers()]);
  const flat: Record<string, string | undefined> = {
    q: params.q,
    type: params.filters.type,
    tier: params.filters.tier,
  };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/recipes/${r.slug}` })), `${SITE_URL}/recipes`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} makeable recipes</p>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/recipes"
          fields={[
            { name: "q", placeholder: "Search by output…", className: "max-w-xs", suggestKind: "recipes" },
            {
              name: "type",
              placeholder: "All types",
              kind: "select",
              options: [
                { value: "crafting", label: "Crafting" },
                { value: "construction", label: "Construction" },
              ],
            },
            {
              name: "tier",
              placeholder: "All tiers",
              kind: "select",
              options: tiers.map((t) => ({ value: String(t), label: `Tier ${t}` })),
              className: "w-28",
            },
          ]}
        />
        <RecipesTable recipes={rows} />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/recipes" />
      </div>
    </main>
  );
}
