import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { Pager } from "@/components/compendium/Pager";
import { PageHeader } from "@/components/PageHeader";
import { MobileCard } from "@/components/mobile/MobileCard";
import { getMarketList } from "@/lib/queries/market";
import { MARKET_PAGE_SIZE, marketKey, parseMarketParams, type MarketSort } from "@/lib/market/params";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Market",
  description: "BitCraft Online market — lowest sell price, highest buy price, quantity, and recent sold volume per item across all regions.",
  alternates: { canonical: "/market" },
};

type Col = { key?: MarketSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { label: "Item" },
  { key: "ask", label: "Lowest sell price", align: "right" },
  { key: "bid", label: "Highest buy price", align: "right" },
  { key: "askQty", label: "Available", align: "right" },
  { label: "Markets", align: "right" },
  { key: "sold", label: "Sold (24h)", align: "right" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = parseMarketParams(sp);
  const { rows, total } = await getMarketList(params);

  const sortHref = (key: MarketSort) => {
    const qp = new URLSearchParams();
    if (params.q) qp.set("q", params.q);
    if (params.type !== "all") qp.set("type", params.type);
    qp.set("sort", key);
    return `/market?${qp.toString()}`;
  };
  const preserved: Record<string, string | undefined> = {
    q: params.q || undefined,
    type: params.type !== "all" ? params.type : undefined,
    sort: params.sort !== "sold" ? params.sort : undefined,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <PageHeader
        title="Market"
        subtitle={
          <>
            {total.toLocaleString()} traded items · <Link href="/market/guide" className="hover:underline">How the market works →</Link>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form method="GET" action="/market" className="flex items-center gap-2 text-sm">
          {params.sort !== "sold" && <input type="hidden" name="sort" value={params.sort} />}
          {params.type !== "all" && <input type="hidden" name="type" value={params.type} />}
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search items…"
            aria-label="Search market"
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">Search</button>
        </form>
        <div className="flex items-center gap-1 text-sm">
          {(["all", "item", "cargo"] as const).map((t) => {
            const qp = new URLSearchParams();
            if (params.q) qp.set("q", params.q);
            if (params.sort !== "sold") qp.set("sort", params.sort);
            if (t !== "all") qp.set("type", t);
            const active = params.type === t;
            return (
              <Link
                key={t}
                href={`/market?${qp.toString()}`}
                className={"rounded-md px-2.5 py-1.5 " + (active ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:bg-muted/40")}
              >
                {t === "all" ? "All" : t === "item" ? "Items" : "Cargo"}
              </Link>
            );
          })}
        </div>
      </div>

      <table className="mt-6 hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            {COLS.map((c) => (
              <th key={c.label} className={`py-2 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
                {c.key ? (
                  <Link href={sortHref(c.key)} className="hover:underline">
                    {c.label}{params.sort === c.key ? " ▲" : ""}
                  </Link>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={`${m.itemType}-${m.itemId}`} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * MARKET_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/market/${marketKey(m.itemType, m.itemId)}`} className="inline-flex items-center gap-2 hover:underline">
                  <EntityIcon assetName={m.iconAssetName} name={m.itemName} rarity={m.rarity} size={24} />
                  {m.itemName || `#${m.itemId}`}
                </Link>
              </td>
              <td className="py-2 pr-3 text-right font-mono">{m.lowestAsk?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.highestBid?.toLocaleString() ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.askQty.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{m.marketplaceCount.toLocaleString()}</td>
              <td className="py-2 text-right font-mono">{m.soldQtyRecent.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">No items found.</td></tr>
          )}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((m, i) => (
          <MobileCard
            key={`${m.itemType}-${m.itemId}`}
            href={`/market/${marketKey(m.itemType, m.itemId)}`}
            rank={(params.page - 1) * MARKET_PAGE_SIZE + i + 1}
            title={
              <span className="inline-flex items-center gap-2">
                <EntityIcon assetName={m.iconAssetName} name={m.itemName} rarity={m.rarity} size={20} />
                {m.itemName || `#${m.itemId}`}
              </span>
            }
            subtitle={`${m.itemType === 1 ? "Cargo" : "Item"}${m.tier != null ? ` · Tier ${m.tier}` : ""}`}
            stats={[
              { label: "Lowest sell price", value: m.lowestAsk?.toLocaleString() ?? "—" },
              { label: "Highest buy price", value: m.highestBid?.toLocaleString() ?? "—" },
              { label: "Sold (24h)", value: m.soldQtyRecent.toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No items found.</li>}
      </ul>

      <div className="mt-6">
        <Pager page={params.page} total={total} pageSize={MARKET_PAGE_SIZE} searchParams={preserved} basePath="/market" />
      </div>
    </main>
  );
}
