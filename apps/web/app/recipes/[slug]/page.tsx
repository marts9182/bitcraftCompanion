import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RecipeTypeBadge } from "@/components/compendium/RecipeTypeBadge";
import { StackList } from "@/components/compendium/CraftGraphSection";
import { getRecipeBySlug, getRecipeStacks, listAllRecipeSlugs } from "@/lib/queries/recipes";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

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
  const description = `${r.name} — a BitCraft ${r.type} recipe.`;
  return {
    title: r.name,
    description,
    alternates: { canonical: `/recipes/${r.slug}` },
    openGraph: { title: r.name, description, url: `${SITE_URL}/recipes/${r.slug}` },
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRecipeBySlug(slug);
  if (!r) notFound();
  const { inputs, outputs } = await getRecipeStacks(r.id);
  const url = `${SITE_URL}/recipes/${r.slug}`;
  const description = `${r.name} — a BitCraft ${r.type} recipe.`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Recipes", url: `${SITE_URL}/recipes` },
      { name: r.name, url },
    ]),
    thingJsonLd(r.name, description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/recipes" className="hover:underline">
          Recipes
        </Link>{" "}
        / <span>{r.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{r.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
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
