import type { Metadata } from "next";
import { ResourcesTable } from "@/components/compendium/ResourcesTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import {
  getResourceStats,
  listResourceCategories,
  listResourceTiers,
  listResources,
  type ResourceListParams,
} from "@/lib/queries/resources";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Browse BitCraft Online gathering nodes — trees, ores, plants, and more, with respawn times and live map locations.",
  alternates: { canonical: "/resources" },
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

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = parseListParams(sp, ["category", "tier"]);
  const tierStr = raw.filters.tier;
  const params: ResourceListParams = {
    q: raw.q,
    category: raw.filters.category,
    tier: tierStr !== undefined && /^-?\d+$/.test(tierStr) ? parseInt(tierStr, 10) : undefined,
    page: raw.page,
  };

  const [{ rows, total, page, pageSize }, categories, tiers, stats] = await Promise.all([
    listResources(params),
    listResourceCategories(),
    listResourceTiers(),
    getResourceStats(),
  ]);

  const flat: Record<string, string | undefined> = {
    q: params.q,
    category: params.category,
    tier: params.tier?.toString(),
  };

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Resources", url: `${SITE_URL}/resources` },
    ]),
    itemListJsonLd(
      rows.map((r) => ({ name: r.name, url: `${SITE_URL}/resources/${r.slug}` })),
      `${SITE_URL}/resources`,
    ),
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight">Resources</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} resources</p>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Resources" value={stats.total} />
        <Stat label="Categories" value={stats.categories} />
        <Stat label="Respawning" value={stats.respawning} />
      </div>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/resources"
          fields={[
            { name: "q", placeholder: "Search resources…", className: "max-w-xs" },
            {
              name: "category",
              placeholder: "All categories",
              kind: "select",
              options: categories.map((c) => ({ value: c, label: c })),
              className: "w-44",
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
        <ResourcesTable resources={rows} />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/resources" />
      </div>
    </main>
  );
}
