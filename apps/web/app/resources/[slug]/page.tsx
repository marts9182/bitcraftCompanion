import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { DropsList } from "@/components/compendium/DropsList";
import { SpawnRegionsList } from "@/components/compendium/SpawnRegionsList";
import { ResourceMapEmbed } from "@/components/map/ResourceMapEmbed";
import { respawnLabel } from "@/components/compendium/ResourcesTable";
import { getResourceBySlug, listAllResourceSlugs } from "@/lib/queries/resources";
import { getItemsByIds } from "@/lib/queries/items";
import { getCargoByIds } from "@/lib/queries/cargo";
import { getMapRegions } from "@/lib/queries/map";
import { breadcrumbJsonLd, jsonLdScript, thingJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listAllResourceSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) return { title: "Resource not found" };
  const description =
    resource.description?.slice(0, 160) ||
    `Where to find ${resource.name} in BitCraft — every spawn location, respawn time, and yields.`;
  return {
    title: resource.name,
    description,
    alternates: { canonical: `/resources/${resource.slug}` },
    openGraph: { title: resource.name, description, url: `${SITE_URL}/resources/${resource.slug}` },
  };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) notFound();

  const yields = resource.yields;
  const spawnCounts = resource.spawnCounts;
  // Yield ids carry an explicit item/cargo type tag (refType), and the two id
  // spaces overlap, so resolve against the tagged table first and only fall
  // back to the other when the id is missing there.
  const yieldIds = yields.map((y) => y.id);
  const [yieldItems, yieldCargo, regions] = await Promise.all([
    getItemsByIds(yieldIds),
    getCargoByIds(yieldIds),
    getMapRegions(),
  ]);
  const itemById = new Map(yieldItems.map((i) => [i.id, i]));
  const cargoById = new Map(yieldCargo.map((c) => [c.id, c]));

  // Best region to farm: the region with the most live spawn points.
  const densest = Object.entries(spawnCounts)
    .map(([regionId, count]) => ({ regionId: Number(regionId), count }))
    .reduce<{ regionId: number; count: number } | null>((a, b) => (a && a.count >= b.count ? a : b), null);

  const url = `${SITE_URL}/resources/${resource.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Resources", url: `${SITE_URL}/resources` },
      { name: resource.name, url },
    ]),
    thingJsonLd(resource.name, resource.description, url),
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="text-sm text-muted-foreground">
        <Link href="/resources" className="hover:underline">
          Resources
        </Link>{" "}
        / <span>{resource.name}</span>
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <EntityIcon
          assetName={resource.iconAssetName}
          name={resource.name}
          rarity={resource.rarity}
          size={56}
        />
        <h1 className="text-3xl font-bold tracking-tight">{resource.name}</h1>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={resource.tier} />
        <RarityBadge rarity={resource.rarity} />
        {resource.category && <span className="text-sm text-muted-foreground">{resource.category}</span>}
      </div>

      {resource.description && <p className="mt-4 text-muted-foreground">{resource.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Max health</dt>
          <dd className="font-mono">{resource.maxHealth?.toLocaleString() ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Respawn</dt>
          <dd className="font-mono">{respawnLabel(resource)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{resource.category ?? "—"}</dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Yields when harvested</h2>
        <DropsList entries={yields} itemById={itemById} cargoById={cargoById} emptyText="No recorded yields." />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Spawns in</h2>
        {/* Only worth calling out when there are multiple regions to compare —
            with a single region it would just repeat the row below. */}
        {densest && Object.keys(spawnCounts).length > 1 && (
          <p className="mb-3 text-sm text-muted-foreground">
            Densest in{" "}
            <span className="font-medium text-foreground">
              {regions.find((r) => r.id === densest.regionId)?.name ?? `Region ${densest.regionId}`}
            </span>{" "}
            — {densest.count.toLocaleString()} spawn points.
          </p>
        )}
        <SpawnRegionsList
          spawnCounts={spawnCounts}
          regions={regions}
          hrefFor={(regionId) => `/map?resources=${resource.id}&regions=${regionId}`}
          emptyText="No known overworld spawns."
        />
      </section>

      {/* Embedded finder map, pre-tracking this resource. Only when there are
          spawns — otherwise the "Spawns in" empty state above already covers it. */}
      {Object.keys(spawnCounts).length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Where to find it</h2>
            <Link href={`/map?resources=${resource.id}`} className="text-sm text-primary hover:underline">
              Open full map →
            </Link>
          </div>
          <ResourceMapEmbed kind="resource" id={resource.id} />
        </section>
      )}
    </main>
  );
}
