import type { Metadata } from "next";
import { ItemsTable } from "@/components/compendium/ItemsTable";
import { ItemFilters } from "@/components/compendium/ItemFilters";
import { Pager } from "@/components/compendium/Pager";
import { listItems } from "@/lib/queries/items";
import { parseItemListParams } from "@/lib/queries/item-list-params";
import { itemListJsonLd, breadcrumbJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Items",
  description: "Browse the full BitCraft Online item compendium — tiers, rarities, and recipes.",
  alternates: { canonical: "/items" },
};

type SP = Record<string, string | string[] | undefined>;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = parseItemListParams(sp);
  const { rows, total, page, pageSize } = await listItems(params);

  const flat: Record<string, string | undefined> = {
    q: params.q,
    tier: params.tier?.toString(),
    rarity: params.rarity,
    tag: params.tag,
  };

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Items", url: `${SITE_URL}/items` },
    ]),
    itemListJsonLd(
      rows.map((r) => ({ name: r.name, url: `${SITE_URL}/items/${r.slug}` })),
      `${SITE_URL}/items`,
    ),
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <h1 className="text-3xl font-bold tracking-tight">Items</h1>
      <p className="mt-2 text-muted-foreground">{total.toLocaleString()} items</p>
      <div className="mt-6">
        <ItemFilters />
        <ItemsTable items={rows} />
        <Pager page={page} total={total} pageSize={pageSize} searchParams={flat} />
      </div>
    </main>
  );
}
