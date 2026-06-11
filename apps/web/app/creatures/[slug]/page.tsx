import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RarityBadge } from "@/components/compendium/RarityBadge";
import { TierBadge } from "@/components/compendium/TierBadge";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { DropsList, type DropEntry } from "@/components/compendium/DropsList";
import { SpawnRegionsList } from "@/components/compendium/SpawnRegionsList";
import { ResourceMapEmbed } from "@/components/map/ResourceMapEmbed";
import { damageLabel } from "@/components/compendium/CreaturesTable";
import { getCreatureBySlug, listAllCreatureSlugs } from "@/lib/queries/creatures";
import { dangerHint } from "@/lib/creature-danger";
import { getItemsByIds } from "@/lib/queries/items";
import { getCargoByIds } from "@/lib/queries/cargo";
import { getMapRegions } from "@/lib/queries/map";
import { breadcrumbJsonLd, jsonLdScript, thingJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

/**
 * Parse the positional lootStacks arrays into DropsList entries. Live shape:
 *   [[variantTag, [id, qty, [typeTag(0=item,1=cargo), …], …]], probability]
 * Malformed entries are skipped rather than crashing the page.
 */
function parseLootStacks(lootStacks: unknown[]): DropEntry[] {
  const drops: DropEntry[] = [];
  for (const entry of lootStacks) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0])) continue;
    const payload = entry[0][1];
    if (!Array.isArray(payload)) continue;
    const [id, qty, typeTagged] = payload;
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    drops.push({
      id,
      qty: typeof qty === "number" && Number.isFinite(qty) ? qty : 1,
      refType: Array.isArray(typeTagged) && typeTagged[0] === 1 ? "cargo" : "item",
      chance: typeof entry[1] === "number" ? entry[1] : undefined,
    });
  }
  return drops;
}

/** Plain-language detection sentence; null-safe for partial data. */
function detectionCopy(detect: number | null, aggro: number | null): string {
  if (detect != null && aggro != null) return `Spots you from ${detect} tiles away and attacks within ${aggro}.`;
  if (detect != null) return `Spots you from ${detect} tiles away.`;
  if (aggro != null) return `Attacks within ${aggro} tiles.`;
  return "No detection data.";
}

export async function generateStaticParams() {
  const slugs = await listAllCreatureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const creature = await getCreatureBySlug(slug);
  if (!creature) return { title: "Creature not found" };
  const description =
    creature.description?.slice(0, 160) ||
    `${creature.name} in BitCraft — combat stats, detection ranges, loot drops, and every spawn region.`;
  return {
    title: creature.name,
    description,
    alternates: { canonical: `/creatures/${creature.slug}` },
    openGraph: { title: creature.name, description, url: `${SITE_URL}/creatures/${creature.slug}` },
  };
}

export default async function CreatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creature = await getCreatureBySlug(slug);
  if (!creature) notFound();

  const drops = parseLootStacks(creature.lootStacks);
  const spawnCounts = creature.spawnCounts;
  // Drop ids carry an explicit item/cargo type tag, and the two id spaces
  // overlap (e.g. cargo 9 "Ardea" vs item 9), so resolve against the tagged
  // table first and only fall back to the other when the id is missing there.
  const dropIds = drops.map((d) => d.id);
  const [dropItems, dropCargo, regions] = await Promise.all([
    getItemsByIds(dropIds),
    getCargoByIds(dropIds),
    getMapRegions(),
  ]);
  const itemById = new Map(dropItems.map((i) => [i.id, i]));
  const cargoById = new Map(dropCargo.map((c) => [c.id, c]));

  const url = `${SITE_URL}/creatures/${creature.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Creatures", url: `${SITE_URL}/creatures` },
      { name: creature.name, url },
    ]),
    thingJsonLd(creature.name, creature.description, url),
  ];

  const combatStats: { label: string; value: string }[] = [
    { label: "Health", value: creature.maxHealth?.toLocaleString() ?? "—" },
    { label: "Damage", value: damageLabel(creature) },
    { label: "Armor", value: creature.armor?.toLocaleString() ?? "—" },
    { label: "Accuracy", value: creature.accuracy?.toLocaleString() ?? "—" },
    { label: "Evasion", value: creature.evasion?.toLocaleString() ?? "—" },
    { label: "Attack level", value: creature.attackLevel?.toLocaleString() ?? "—" },
    { label: "Defense level", value: creature.defenseLevel?.toLocaleString() ?? "—" },
    { label: "Health regen", value: creature.healthRegen != null ? `${creature.healthRegen.toFixed(1)}/s` : "—" },
  ];
  const hint = dangerHint(creature);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="text-sm text-muted-foreground">
        <Link href="/creatures" className="hover:underline">
          Creatures
        </Link>{" "}
        / <span>{creature.name}</span>
      </nav>

      <div className="mt-4 flex items-center gap-3">
        <EntityIcon
          assetName={creature.iconAssetName}
          name={creature.name}
          rarity={creature.rarity}
          size={56}
        />
        <h1 className="text-3xl font-bold tracking-tight">{creature.name}</h1>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TierBadge tier={creature.tier} />
        <RarityBadge rarity={creature.rarity} />
        <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {creature.huntable ? "Huntable" : "Monster"}
        </span>
      </div>

      {creature.description && <p className="mt-4 text-muted-foreground">{creature.description}</p>}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Combat stats</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {combatStats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 font-mono">{s.value}</dd>
            </div>
          ))}
        </dl>
        {hint && <p className="mt-3 text-sm text-muted-foreground">{hint}</p>}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Detection &amp; aggro</h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Day</div>
            <p className="mt-1">{detectionCopy(creature.dayDetectRange, creature.dayAggroRange)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Night</div>
            <p className="mt-1">{detectionCopy(creature.nightDetectRange, creature.nightAggroRange)}</p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">
          {creature.huntable ? "Drops when hunted" : "Drops when slain"}
        </h2>
        <DropsList entries={drops} itemById={itemById} cargoById={cargoById} emptyText="No recorded drops." />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Spawns in</h2>
        <SpawnRegionsList
          spawnCounts={spawnCounts}
          regions={regions}
          hrefFor={(regionId) => `/map?creatures=${creature.enemyType}&regions=${regionId}`}
          emptyText="No known overworld spawns."
        />
      </section>

      {/* Embedded finder map, pre-tracking this creature. Only when there are
          spawns — otherwise the "Spawns in" empty state above already covers it. */}
      {Object.keys(spawnCounts).length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Where to find it</h2>
            <Link href={`/map?creatures=${creature.enemyType}`} className="text-sm text-primary hover:underline">
              Open full map →
            </Link>
          </div>
          <ResourceMapEmbed kind="creature" id={creature.enemyType} />
        </section>
      )}
    </main>
  );
}
