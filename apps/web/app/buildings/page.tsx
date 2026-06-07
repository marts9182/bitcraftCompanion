import type { Metadata } from "next";
import { EntityTable } from "@/components/compendium/EntityTable";
import { CompendiumFilters } from "@/components/compendium/CompendiumFilters";
import { Pager } from "@/components/compendium/Pager";
import { listBuildings } from "@/lib/queries/buildings";
import { parseListParams } from "@/lib/queries/list-params";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Buildings",
  description: "Browse BitCraft Online buildings — stations and structures.",
  alternates: { canonical: "/buildings" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, []);
  const { rows, total, page, pageSize } = await listBuildings(params);
  const flat: Record<string, string | undefined> = { q: params.q };
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Buildings", url: `${SITE_URL}/buildings` },
    ]),
    itemListJsonLd(rows.map((r) => ({ name: r.name, url: `${SITE_URL}/buildings/${r.slug}` })), `${SITE_URL}/buildings`),
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Buildings</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} buildings</p>
      <div className="mt-6">
        <CompendiumFilters basePath="/buildings" fields={[{ name: "q", placeholder: "Search buildings…", className: "max-w-xs" }]} />
        <EntityTable rows={rows} basePath="/buildings" columns={[]} emptyLabel="No buildings match your search." />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} basePath="/buildings" />
      </div>
    </main>
  );
}
