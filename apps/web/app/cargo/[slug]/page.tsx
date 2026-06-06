import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { CraftGraphSection } from "@/components/compendium/CraftGraphSection";
import { getCargoBySlug, getCargoCraftGraph, listAllCargoSlugs } from "@/lib/queries/cargo";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllCargoSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCargoBySlug(slug);
  if (!c) return { title: "Cargo not found" };
  const description = c.description?.slice(0, 160) || `${c.name} — BitCraft Online cargo.`;
  return {
    title: c.name,
    description,
    alternates: { canonical: `/cargo/${c.slug}` },
    openGraph: { title: c.name, description, url: `${SITE_URL}/cargo/${c.slug}` },
  };
}

export default async function CargoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCargoBySlug(slug);
  if (!c) notFound();
  const graph = await getCargoCraftGraph(c.id);
  const url = `${SITE_URL}/cargo/${c.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Cargo", url: `${SITE_URL}/cargo` },
      { name: c.name, url },
    ]),
    thingJsonLd(c.name, c.description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/cargo" className="hover:underline">
          Cargo
        </Link>{" "}
        / <span>{c.name}</span>
      </nav>
      <div className="mt-4 flex items-center gap-3">
        <EntityIcon assetName={c.iconAssetName} name={c.name} rarity={c.rarity} size={56} />
        <h1 className="text-3xl font-bold tracking-tight">{c.name}</h1>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={c.tier} />
        <RarityBadge rarity={c.rarity} />
        {c.tag && <span className="text-sm text-muted-foreground">{c.tag}</span>}
      </div>
      {c.description && <p className="mt-4 text-muted-foreground">{c.description}</p>}
      {c.volume != null && (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Volume</dt>
            <dd>{c.volume}</dd>
          </div>
        </dl>
      )}
      <CraftGraphSection title="Made by" recipes={graph.madeBy} />
      <CraftGraphSection title="Used in" recipes={graph.usedIn} />
    </main>
  );
}
