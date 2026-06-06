import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gameTimestampToMs } from "@bcc/shared";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { MarketPriceChart } from "@/components/market/MarketPriceChart";
import { parseMarketKey, marketKey } from "@/lib/market/params";
import {
  getMarketItem, getMarketOrders, getMarketLocations, getRecentSales, getMarketPriceHistory, listMarketItemKeys,
} from "@/lib/queries/market";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const keys = await listMarketItemKeys();
  return keys.map((k) => ({ key: marketKey(k.itemType, k.itemId) }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const parsed = parseMarketKey(key);
  if (!parsed) return { title: "Market" };
  const item = await getMarketItem(parsed.itemType, parsed.itemId);
  if (!item) return { title: "Market" };
  return {
    title: `${item.itemName} — Market`,
    description: `BitCraft Online market for ${item.itemName}: lowest ask, highest bid, locations, recent sales, and price history.`,
    alternates: { canonical: `/market/${key}` },
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

export default async function MarketItemPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const parsed = parseMarketKey(key);
  if (!parsed) notFound();
  const item = await getMarketItem(parsed.itemType, parsed.itemId);
  if (!item) notFound();

  const [orders, locations, sales, history] = await Promise.all([
    getMarketOrders(parsed.itemType, parsed.itemId),
    getMarketLocations(parsed.itemType, parsed.itemId),
    getRecentSales(parsed.itemType, parsed.itemId),
    getMarketPriceHistory(parsed.itemType, parsed.itemId),
  ]);

  const compendiumHref = `${item.itemType === 1 ? "/cargo" : "/items"}/${item.itemSlug}`;
  const spread = item.lowestAsk != null && item.highestBid != null ? item.lowestAsk - item.highestBid : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/market" className="hover:underline">Market</Link> / <span>{item.itemName}</span>
      </nav>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight">
        <EntityIcon assetName={item.iconAssetName} name={item.itemName} rarity={item.rarity} size={40} />
        {item.itemName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.itemType === 1 ? "Cargo" : "Item"}{item.tier != null ? ` · Tier ${item.tier}` : ""} · {item.rarity}
        {item.itemSlug ? <> · <Link href={compendiumHref} className="hover:underline">Compendium entry →</Link></> : null}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lowest ask" value={item.lowestAsk?.toLocaleString() ?? "—"} />
        <Stat label="Highest bid" value={item.highestBid?.toLocaleString() ?? "—"} />
        <Stat label="Spread" value={spread?.toLocaleString() ?? "—"} />
        <Stat label="Available" value={item.askQty} />
        <Stat label="Wanted" value={item.bidQty} />
        <Stat label="Markets" value={item.marketplaceCount} />
        <Stat label="Regions" value={item.regionCount} />
        <Stat label="Sold (24h)" value={item.soldQtyRecent} />
      </div>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Asks</h2>
          {orders.asks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sell orders.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Price</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 text-right">Cumul.</th></tr></thead>
              <tbody>
                {orders.asks.map((o, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`py-1.5 pr-3 text-right font-mono ${o.sentinel ? "text-muted-foreground" : ""}`}>{o.price.toLocaleString()}{o.sentinel ? " ⚠" : ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{o.quantity.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">{o.cumulative.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold">Bids</h2>
          {orders.bids.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No buy orders.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Price</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 text-right">Cumul.</th></tr></thead>
              <tbody>
                {orders.bids.map((o, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={`py-1.5 pr-3 text-right font-mono ${o.sentinel ? "text-muted-foreground" : ""}`}>{o.price.toLocaleString()}{o.sentinel ? " ⚠" : ""}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{o.quantity.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">{o.cumulative.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Price history</h2>
        <MarketPriceChart points={history} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Locations</h2>
        {locations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No active listings.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3">Claim</th><th className="py-2 pr-3">Region</th><th className="py-2 pr-3 text-right">Best ask</th><th className="py-2 text-right">Available</th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.claimEntityId} className="border-t border-border">
                  <td className="py-1.5 pr-3">{l.claimName || l.claimEntityId}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{l.region}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{l.bestAsk?.toLocaleString() ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono">{l.askQty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent sales</h2>
        <p className="mt-1 text-xs text-muted-foreground">Sale price is not recorded by the game — volume and timing only.</p>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No recent sales.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3">Region</th><th className="py-2">When</th></tr></thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-right font-mono">{s.quantity.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{s.region}</td>
                  <td className="py-1.5 text-muted-foreground">{new Date(gameTimestampToMs(s.timestamp)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
