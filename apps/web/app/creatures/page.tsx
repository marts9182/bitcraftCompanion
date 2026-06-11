import type { Metadata } from "next";
import { CreaturesTable } from "@/components/compendium/CreaturesTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import {
  getCreatureStats,
  listCreatureTiers,
  listCreatures,
  type CreatureListParams,
} from "@/lib/queries/creatures";
import { parseIntParam, parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Creatures",
  description:
    "Browse BitCraft Online creatures — combat stats, detection ranges, loot drops, and live map spawn locations for every animal and monster.",
  alternates: { canonical: "/creatures" },
};

type SP = Record<string, string | string[] | undefined>;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{value.toLocaleString()}</div>
    </div>
  );
}

export default async function CreaturesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = parseListParams(sp, ["tier", "huntable"]);
  const huntableStr = raw.filters.huntable;
  const params: CreatureListParams = {
    q: raw.q,
    tier: parseIntParam(raw.filters.tier),
    huntable: huntableStr === "1" ? true : huntableStr === "0" ? false : undefined,
    page: raw.page,
  };

  const [{ rows, total, page, pageSize }, tiers, stats] = await Promise.all([
    listCreatures(params),
    listCreatureTiers(),
    getCreatureStats(),
  ]);

  const flat: Record<string, string | undefined> = {
    q: params.q,
    tier: params.tier?.toString(),
    huntable: params.huntable === undefined ? undefined : params.huntable ? "1" : "0",
  };

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Creatures", url: `${SITE_URL}/creatures` },
    ]),
    itemListJsonLd(
      rows.map((c) => ({ name: c.name, url: `${SITE_URL}/creatures/${c.slug}` })),
      `${SITE_URL}/creatures`,
    ),
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight">Creatures</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} creatures</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Creatures" value={stats.total} />
        <Stat label="Huntable" value={stats.huntable} />
        <Stat label="Monsters" value={stats.monsters} />
      </div>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/creatures"
          fields={[
            { name: "q", placeholder: "Search creatures…", className: "max-w-xs", suggestKind: "creatures" },
            {
              name: "tier",
              placeholder: "All tiers",
              kind: "select",
              options: tiers.map((t) => ({ value: String(t), label: `Tier ${t}` })),
              className: "w-28",
            },
            {
              name: "huntable",
              placeholder: "All creatures",
              kind: "select",
              options: [
                { value: "1", label: "Huntable" },
                { value: "0", label: "Monsters" },
              ],
              className: "w-36",
            },
          ]}
        />
        <CreaturesTable creatures={rows} />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/creatures" />
      </div>
    </main>
  );
}
