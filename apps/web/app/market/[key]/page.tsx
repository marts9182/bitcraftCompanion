import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gameTimestampToMs } from "@bcc/shared";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { MarketPriceChart } from "@/components/market/MarketPriceChart";
import { Stat } from "@/components/Stat";
import { TimeAgo } from "@/components/TimeAgo";
import { parseMarketKey, marketKey } from "@/lib/market/params";
import {
  getMarketItem, getMarketOrders, getMarketLocations, getRecentSales, getRecentTrades, getMarketPriceHistory, listMarketItemKeys,
} from "@/lib/queries/market";

export const revalidate = 1800;
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
    description: `BitCraft Online market for ${item.itemName}: lowest sell price, highest buy price, locations, recent trades, and price history.`,
    alternates: { canonical: `/market/${key}` },
  };
}

export default async function MarketItemPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const parsed = parseMarketKey(key);
  if (!parsed) notFound();
  const item = await getMarketItem(parsed.itemType, parsed.itemId);
  if (!item) notFound();

  const [orders, locations, sales, trades, history] = await Promise.all([
    getMarketOrders(parsed.itemType, parsed.itemId),
    getMarketLocations(parsed.itemType, parsed.itemId),
    getRecentSales(parsed.itemType, parsed.itemId),
    getRecentTrades(parsed.itemType, parsed.itemId),
    getMarketPriceHistory(parsed.itemType, parsed.itemId),
  ]);

  const compendiumHref = `${item.itemType === 1 ? "/cargo" : "/items"}/${item.itemSlug}`;
  const spread = item.lowestAsk != null && item.highestBid != null ? item.lowestAsk - item.highestBid : null;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
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
        {" · "}<Link href="/market/guide" className="hover:underline">How the market works →</Link>
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Lowest sell price"
          value={item.lowestAsk?.toLocaleString() ?? "—"}
          help="Cheapest active sell order across all marketplaces. Orders are settlement-bound — you buy at the marketplace listing it (see Locations below)."
          note="the cheapest you can buy it right now"
        />
        <Stat
          label="Highest buy price"
          value={item.highestBid?.toLocaleString() ?? "—"}
          help="Highest active buy order across all marketplaces. Orders are settlement-bound — you sell at the marketplace where the buy order was placed."
          note="the most you can sell it for right now"
        />
        <Stat
          label="Spread"
          value={spread?.toLocaleString() ?? "—"}
          help="Gap between the lowest sell price and the highest buy price. Negative means you can buy cheaper than someone is paying."
          note="gap between the lowest sell price and the highest buy price"
        />
        <Stat label="Available" value={item.askQty} help="Total quantity listed across all sell orders." />
        <Stat label="Wanted" value={item.bidQty} help="Total quantity requested across all buy orders." />
        <Stat label="Markets" value={item.marketplaceCount} help="Marketplaces with at least one active order for this item." />
        <Stat label="Regions" value={item.regionCount} help="Regions where this item is currently traded." />
        <Stat label="Sold (24h)" value={item.soldQtyRecent} help="Quantity sold over roughly the last 24 hours." />
      </div>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Sell Orders</h2>
          {orders.asks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sell orders.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
            </div>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold">Buy Orders</h2>
          {orders.bids.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No buy orders.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
            </div>
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
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3">Claim</th><th className="py-2 pr-3">Region</th><th className="py-2 pr-3 text-right">Lowest sell price</th><th className="py-2 text-right">Available</th></tr></thead>
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
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent trades (inferred prices)</h2>
        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No trades observed yet — trades are inferred from order-book changes between snapshots.</p>
        ) : (
          <>
          <p className="mt-1 text-xs text-muted-foreground">
            Inferred from order-book changes between snapshots. Certain trades (part of an order bought or sold) are listed first; &ldquo;whole order&rdquo; rows may include cancelled orders.
          </p>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 text-right">Price</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3">Type</th><th className="py-2">When</th></tr></thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-right font-mono">{t.price.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{t.quantity.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      <span
                        className="cursor-help"
                        title={t.side === "sell" ? "Came off the sell-order book — someone bought at this price." : "Came off the buy-order book — someone sold at this price."}
                      >
                        {t.side === "sell" ? "bought" : "sold"}
                      </span>
                      {" · "}{t.kind === "partial" ? "part of an order" : "whole order"}
                    </td>
                    <td className="py-1.5 text-muted-foreground"><TimeAgo at={t.observedAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recent sales (game-recorded volume)</h2>
        <p className="mt-1 text-xs text-muted-foreground">Sale price is not recorded by the game — volume and timing only. For per-trade prices, see Recent trades above.</p>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No recent sales.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
          </div>
        )}
      </section>
    </main>
  );
}
