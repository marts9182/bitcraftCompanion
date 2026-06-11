import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How the market works",
  description: "A plain-language guide to the BitCraft Online market: buy orders, sell orders, prices, and the spread.",
  alternates: { canonical: "/market/guide" },
};

/** Plain-language market explainer (spec §B5) — no jargon, game-native terms only. */
export default function MarketGuidePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/market" className="hover:underline">Market</Link> / <span>How the market works</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">How the market works</h1>

      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>
          Players trade items and cargo for Hex Coins at marketplaces built inside settlements.
        </p>
        <p>
          A <strong>sell order</strong> is an offer: &ldquo;I have some of this item and will sell each one for this many coins.&rdquo;
          A <strong>buy order</strong> is a request: &ldquo;I want some of this item and will pay this many coins for each one.&rdquo;
        </p>
        <p>
          The <strong>lowest sell price</strong> is the cheapest you can buy an item right now, and the{" "}
          <strong>highest buy price</strong> is the most you can sell it for right now.
        </p>
        <p>
          The <strong>spread</strong> is the gap between those two numbers — a small spread means lively trading, and a
          negative spread means you could buy from one player for less than another player is paying.
        </p>
        <p>
          Orders only exist at the marketplace where they were placed, so you have to travel there to trade — the
          Locations table on each item page shows which settlements have it.
        </p>
        <p>
          Prices on this site are snapshots refreshed about every 30 minutes, so in-game prices may have moved since.
        </p>
      </div>

      <p className="mt-8 text-sm">
        <Link href="/market" className="hover:underline">← Back to the market</Link>
      </p>
    </main>
  );
}
