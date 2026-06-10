import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { EntityIcon } from "@/components/compendium/EntityIcon";
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
  // Yield ids reference items OR cargo (trees yield trunks, which are cargo),
  // so resolve against both tables; items win when an id exists in both.
  const yieldIds = yields.map((y) => y.itemId);
  const [yieldItems, yieldCargo, regions] = await Promise.all([
    getItemsByIds(yieldIds),
    getCargoByIds(yieldIds),
    getMapRegions(),
  ]);
  const itemById = new Map(yieldItems.map((i) => [i.id, i]));
  const cargoById = new Map(yieldCargo.map((c) => [c.id, c]));
  const regionNames = new Map(regions.map((r) => [r.id, r.name]));
  const spawns = Object.entries(spawnCounts)
    .map(([regionId, count]) => ({ regionId: Number(regionId), count }))
    .sort((a, b) => b.count - a.count);

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
        {yields.length === 0 ? (
          <p className="text-muted-foreground">No recorded yields.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {yields.map((y, i) => {
              const item = itemById.get(y.itemId);
              const cargo = item ? undefined : cargoById.get(y.itemId);
              const resolved = item ?? cargo;
              return (
                <li key={`${y.itemId}-${i}`} className="flex items-center gap-2">
                  {resolved ? (
                    <>
                      <EntityIcon
                        assetName={resolved.iconAssetName}
                        name={resolved.name}
                        rarity={resolved.rarity}
                        size={24}
                      />
                      <Link
                        href={item ? `/items/${item.slug}` : `/cargo/${resolved.slug}`}
                        className="font-medium hover:underline"
                      >
                        {resolved.name}
                      </Link>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Item #{y.itemId}</span>
                  )}
                  <span className="font-mono text-muted-foreground">× {y.qty}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Spawns in</h2>
        {spawns.length === 0 ? (
          <p className="text-muted-foreground">No known overworld spawns.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {spawns.map((s) => (
              <li key={s.regionId}>
                <Link
                  href={`/map?resources=${resource.id}&regions=${s.regionId}`}
                  className="hover:underline"
                >
                  <span className="font-medium">
                    {regionNames.get(s.regionId) ?? `Region ${s.regionId}`}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {s.count.toLocaleString()} spawn points
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Task 13: embedded "Where to find it" map goes here */}
    </main>
  );
}
