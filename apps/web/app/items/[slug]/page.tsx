import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { CraftGraphSection } from "@/components/compendium/CraftGraphSection";
import { getItemBySlug, getItemCraftGraph, listAllItemSlugs } from "@/lib/queries/items";
import { breadcrumbJsonLd, itemJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllItemSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) return { title: "Item not found" };
  const description = item.description?.slice(0, 160) || `${item.name} — BitCraft Online item.`;
  return {
    title: item.name,
    description,
    alternates: { canonical: `/items/${item.slug}` },
    openGraph: { title: item.name, description, url: `${SITE_URL}/items/${item.slug}` },
  };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const graph = await getItemCraftGraph(item.id);
  const url = `${SITE_URL}/items/${item.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Items", url: `${SITE_URL}/items` },
      { name: item.name, url },
    ]),
    itemJsonLd({ name: item.name, description: item.description }, url),
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="text-sm text-muted-foreground">
        <Link href="/items" className="hover:underline">
          Items
        </Link>{" "}
        / <span>{item.name}</span>
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <EntityIcon assetName={item.iconAssetName} name={item.name} rarity={item.rarity} size={56} />
        <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={item.tier} />
        <RarityBadge rarity={item.rarity} />
        {item.tag && <span className="text-sm text-muted-foreground">{item.tag}</span>}
      </div>

      {item.description && <p className="mt-4 text-muted-foreground">{item.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {item.volume != null && (
          <div>
            <dt className="text-muted-foreground">Volume</dt>
            <dd>{item.volume}</dd>
          </div>
        )}
        {item.durability != null && (
          <div>
            <dt className="text-muted-foreground">Durability</dt>
            <dd>{item.durability}</dd>
          </div>
        )}
      </dl>

      <Link
        href={`/calculator/item/${item.slug}`}
        className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Calculate materials →
      </Link>

      <CraftGraphSection title="Made by" recipes={graph.madeBy} />
      <CraftGraphSection title="Used in" recipes={graph.usedIn} />
    </main>
  );
}
