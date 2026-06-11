import type { Metadata } from "next";
import Link from "next/link";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { PageHeader } from "@/components/PageHeader";
import { MobileCard } from "@/components/mobile/MobileCard";
import { getDeals } from "@/lib/queries/deals";
import { marketKey } from "@/lib/market/params";
import { parseDealsParams, DEFAULT_MAX_PROFIT_PCT, type Deal } from "@/lib/market/deals";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Market deals",
  description:
    "BitCraft Online arbitrage finder — buy low at one settlement, sell high at another. Profit, distance, and profit-per-tile for every crossed order pair.",
  alternates: { canonical: "/market/deals" },
};

const COLS = [
  { label: "#" },
  { label: "Item" },
  { label: "Buy at" },
  { label: "Sell at" },
  { label: "Qty", align: "right" },
  { label: "Profit", align: "right" },
  { label: "Distance (tiles)", align: "right" },
  { label: "Profit / tile", align: "right" },
  { label: "Route" },
] as const;

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 100 ? Math.round(pct).toLocaleString() : pct.toFixed(1)}%`;
}
function fmtDistance(d: number | null): string {
  return d === null ? "—" : Math.round(d).toLocaleString();
}
function fmtPerTile(v: number | null): string {
  if (v === null) return "—";
  return v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1);
}

/** Amber pill marking a same-marketplace crossed pair: buy and re-sell on the spot. */
function InstantFlipBadge() {
  return (
    <span
      title="Both orders are at the same marketplace — buy and re-sell on the spot, no travel"
      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      Instant flip
    </span>
  );
}

function PlaceCell({ place, price }: { place: Deal["buyAt"]; price: number }) {
  return (
    <>
      {place.claimEntityId ? (
        <Link href={`/settlements/${place.claimEntityId}`} className="hover:underline">
          {place.claimName || `Claim ${place.claimEntityId}`}
        </Link>
      ) : (
        <span className="text-muted-foreground">Unknown</span>
      )}
      <div className="text-xs text-muted-foreground">
        for <span className="font-mono">{price.toLocaleString()}</span> each · Region {place.region}
      </div>
    </>
  );
}

/** Plain-language one-liner used on mobile cards: "Buy at X for 2 → sell at Y for 125". */
function dealSentence(d: Deal): string {
  const buyName = d.buyAt.claimName || "an unknown settlement";
  const sellName = d.sellAt.claimName || "an unknown settlement";
  return `Buy at ${buyName} for ${d.payPrice.toLocaleString()} → sell at ${sellName} for ${d.receivePrice.toLocaleString()}`;
}

export default async function MarketDealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseDealsParams(sp);
  const { deals, matching, hasDistances } = await getDeals(filters);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
      <PageHeader
        title="Market deals"
        subtitle={
          <>
            Buy low at one settlement, sell high at another — {matching.toLocaleString()} profitable routes right now ·{" "}
            <Link href="/market" className="hover:underline">Browse the market →</Link>
          </>
        }
      />

      <form method="GET" action="/market/deals" className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Min quantity</span>
          <input type="number" name="minQty" min={1} defaultValue={filters.minQty ?? ""} placeholder="Any"
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Min profit %</span>
          <input type="number" name="minPct" min={1} defaultValue={filters.minPct ?? ""} placeholder="Any"
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground" title="Hides stale-order traps (absurd profit on forgotten 1-coin orders). Clear to show everything.">
            Max profit % ⓘ
          </span>
          <input type="number" name="maxPct" min={1} defaultValue={filters.maxPct ?? ""} placeholder="No cap"
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Max distance (tiles)</span>
          <input type="number" name="maxDistance" min={1} defaultValue={filters.maxDistance ?? ""} placeholder="Any"
            className="h-9 w-36 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Region (either end)</span>
          <input type="text" name="region" defaultValue={filters.region ?? ""} placeholder="Any"
            className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">Apply</button>
      </form>

      {!hasDistances && deals.length > 0 && (
        <p className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Marketplace coordinates aren’t available yet, so distances show “—” and the max-distance
          filter only applies to routes with a known distance. They’ll fill in after the next data snapshot.
        </p>
      )}

      <table className="mt-6 hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            {COLS.map((c) => (
              <th key={c.label} className={`py-2 pr-3 ${"align" in c && c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => (
            <tr key={`${d.itemType}-${d.itemId}-${i}`} className="border-t border-border align-top">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/market/${marketKey(d.itemType, d.itemId)}`} className="inline-flex items-center gap-2 hover:underline">
                  <EntityIcon assetName={d.iconAssetName} name={d.itemName} rarity={d.rarity} size={24} />
                  {d.itemName || `#${d.itemId}`}
                </Link>
              </td>
              <td className="py-2 pr-3"><PlaceCell place={d.buyAt} price={d.payPrice} /></td>
              <td className="py-2 pr-3"><PlaceCell place={d.sellAt} price={d.receivePrice} /></td>
              <td className="py-2 pr-3 text-right font-mono">{d.qty.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right">
                <span className="font-mono">{d.profitTotal.toLocaleString()}</span>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{d.profitEach.toLocaleString()}</span> each · {fmtPct(d.profitPct)}
                </div>
              </td>
              <td className="py-2 pr-3 text-right">
                {d.instantFlip ? <InstantFlipBadge /> : <span className="font-mono">{fmtDistance(d.distanceTiles)}</span>}
              </td>
              <td className="py-2 pr-3 text-right font-mono">{d.instantFlip ? <span className="font-sans text-muted-foreground">instant</span> : fmtPerTile(d.profitPerTile)}</td>
              <td className="py-2">
                <Link
                  href={`/map?regions=${encodeURIComponent(d.buyAt.region)}`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  title="Frames the route's start region on the map (per-route pins are on the roadmap)"
                >
                  Map →
                </Link>
              </td>
            </tr>
          ))}
          {deals.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">
                No deals match these filters — try raising the max profit % or clearing a filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {deals.map((d, i) => (
          <MobileCard
            key={`${d.itemType}-${d.itemId}-${i}`}
            href={`/market/${marketKey(d.itemType, d.itemId)}`}
            rank={i + 1}
            title={
              <span className="inline-flex items-center gap-2">
                <EntityIcon assetName={d.iconAssetName} name={d.itemName} rarity={d.rarity} size={20} />
                {d.itemName || `#${d.itemId}`}
              </span>
            }
            subtitle={dealSentence(d)}
            stats={[
              { label: "Qty", value: d.qty.toLocaleString() },
              { label: "Profit", value: `${d.profitTotal.toLocaleString()} (${fmtPct(d.profitPct)})` },
              {
                label: "Distance (tiles)",
                value: d.instantFlip ? <InstantFlipBadge /> : fmtDistance(d.distanceTiles),
              },
              { label: "Profit / tile", value: d.instantFlip ? "instant" : fmtPerTile(d.profitPerTile) },
            ]}
          />
        ))}
        {deals.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            No deals match these filters — try raising the max profit % or clearing a filter.
          </li>
        )}
      </ul>

      {matching > deals.length && (
        <p className="mt-4 text-xs text-muted-foreground">
          Showing the top {deals.length.toLocaleString()} of {matching.toLocaleString()} matching routes by total profit.
        </p>
      )}

      <section className="mt-10 text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">How these deals work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            A deal means buying from someone’s <strong>sell order</strong> at one marketplace and selling into
            someone’s <strong>buy order</strong> at another. Prices are Hex Coins per unit.
          </li>
          <li>Qty is the smaller of the two orders — the most you can flip in one trip.</li>
          <li>
            Profit % is measured against what you pay. The max profit % filter defaults to {DEFAULT_MAX_PROFIT_PCT}% to
            hide stale-order traps (a forgotten 1-coin sell order looks like a 10,000% jackpot but rarely survives the
            trip) — raise or clear it to see everything.
          </li>
          <li>
            Distance is a straight line in game tiles (the same units as the map’s N/E coordinates) — actual travel
            will be longer. Routes without known marketplace coordinates show “—” and are not excluded by the
            max-distance filter.
          </li>
          <li>“Instant flip” rows have both orders at the same marketplace — no travel, so profit per tile doesn’t apply.</li>
          <li>
            Order data refreshes about every 30 minutes; an order can fill or be cancelled in between, so check prices
            in game before hauling. The map link frames the route’s start region — per-route pins are on the roadmap.
          </li>
        </ul>
      </section>
    </main>
  );
}
