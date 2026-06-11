import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RecipeTypeBadge } from "@/components/compendium/RecipeTypeBadge";
import { StackList } from "@/components/compendium/CraftGraphSection";
import { getRecipeBySlug, getRecipePrimaryOutput, getRecipeStacks, listAllRecipeSlugs } from "@/lib/queries/recipes";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";
import { recipeVerb } from "@/lib/recipes";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllRecipeSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getRecipeBySlug(slug);
  if (!r) return { title: "Recipe not found" };
  // The recipe name is a localization template ("Craft {0}") — title by output.
  const out = await getRecipePrimaryOutput(r.id);
  const title = out?.name ?? r.name;
  const description = `${title} — a BitCraft ${r.type} recipe.`;
  return {
    title,
    description,
    alternates: { canonical: `/recipes/${r.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/recipes/${r.slug}` },
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRecipeBySlug(slug);
  if (!r) notFound();
  const [{ inputs, outputs }, out] = await Promise.all([getRecipeStacks(r.id), getRecipePrimaryOutput(r.id)]);
  const title = out?.name ?? r.name;
  const verb = recipeVerb(r.name);
  const url = `${SITE_URL}/recipes/${r.slug}`;
  const description = `${title} — a BitCraft ${r.type} recipe.`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
      { name: title, url },
    ]),
    thingJsonLd(title, description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/recipes" className="hover:underline">
          Recipes
        </Link>{" "}
        / <span>{title}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {verb}
        </span>
        <RecipeTypeBadge type={r.type} />
        {r.timeRequirement != null && <span className="text-muted-foreground">{r.timeRequirement}s</span>}
        {r.staminaRequirement != null && <span className="text-muted-foreground">{r.staminaRequirement} stamina</span>}
      </div>
      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Inputs</h2>
          <StackList stacks={inputs} />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Outputs</h2>
          <StackList stacks={outputs} />
        </div>
      </section>
    </main>
  );
}
