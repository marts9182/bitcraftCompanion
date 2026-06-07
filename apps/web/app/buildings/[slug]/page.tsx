import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { getBuildingBySlug, listAllBuildingSlugs } from "@/lib/queries/buildings";
import { breadcrumbJsonLd, thingJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllBuildingSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBuildingBySlug(slug);
  if (!b) return { title: "Building not found" };
  const description = b.description?.slice(0, 160) || `${b.name} — BitCraft Online building.`;
  return {
    title: b.name,
    description,
    alternates: { canonical: `/buildings/${b.slug}` },
    openGraph: { title: b.name, description, url: `${SITE_URL}/buildings/${b.slug}` },
  };
}

export default async function BuildingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBuildingBySlug(slug);
  if (!b) notFound();
  const url = `${SITE_URL}/buildings/${b.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Buildings", url: `${SITE_URL}/buildings` },
      { name: b.name, url },
    ]),
    thingJsonLd(b.name, b.description, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/buildings" className="hover:underline">
          Buildings
        </Link>{" "}
        / <span>{b.name}</span>
      </nav>
      <div className="mt-4 flex items-center gap-3">
        <EntityIcon assetName={b.iconAssetName} name={b.name} size={56} />
        <h1 className="text-3xl font-bold tracking-tight">{b.name}</h1>
      </div>
      {b.description && <p className="mt-4 text-muted-foreground">{b.description}</p>}
    </main>
  );
}
