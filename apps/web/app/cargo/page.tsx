import type { Metadata } from "next";
import { EntityTable } from "@/components/compendium/EntityTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listCargo } from "@/lib/queries/cargo";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Cargo",
  description: "Browse BitCraft Online cargo — bulky goods, animal bodies, and more.",
  alternates: { canonical: "/cargo" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function CargoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, ["tier", "rarity", "tag"]);
  const { rows, total, page, pageSize } = await listCargo(params);
  const flat: Record<string, string | undefined> = {
    q: params.q,
    tier: params.filters.tier,
    rarity: params.filters.rarity,
    tag: params.filters.tag,
  };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Cargo", url: `${SITE_URL}/cargo` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/cargo/${r.slug}` })), `${SITE_URL}/cargo`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Cargo</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} cargo</p>
      <div className="mt-6">
        <CompendiumFilters
          basePath="/cargo"
          fields={[
            { name: "q", placeholder: "Search cargo…", className: "max-w-xs" },
            { name: "tier", placeholder: "Tier", className: "w-24" },
            { name: "rarity", placeholder: "Rarity", className: "w-36" },
            { name: "tag", placeholder: "Tag", className: "w-40" },
          ]}
        />
        <EntityTable rows={rows} basePath="/cargo" columns={["tier", "rarity", "tag"]} emptyLabel="No cargo match your search." />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/cargo" />
      </div>
    </main>
  );
}
