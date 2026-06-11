import Link from "next/link";
import { Logo } from "./Logo";
import { DataFreshness } from "./DataFreshness";
import { getLastIngestionTime } from "@/lib/queries/freshness";

const GROUPS: { heading: string; links: [string, string][] }[] = [
  { heading: "Explore", links: [["/compendium", "Compendium"], ["/calculator", "Calculator"], ["/map", "Map"]] },
  { heading: "Live data", links: [["/market", "Market"], ["/market/deals", "Market deals"], ["/settlements", "Settlements"], ["/empires", "Empires"], ["/players", "Players"], ["/leaderboards", "Leaderboards"]] },
  { heading: "More", links: [["/blog", "Blog"], ["/status", "Status"]] },
];

export async function SiteFooter() {
  // Server component: fetches the latest successful ingestion timestamp
  // (unstable_cache, 5 min) and hands the ISO string to a client component
  // that renders the relative time at view time — see DataFreshness for why.
  const updatedAtIso = await getLastIngestionTime();
  return (
    <footer className="mt-20 border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="BitCraft Companion — home">
              <Logo size={28} />
              <span className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight">
                <span className="text-foreground">BitCraft</span> <span className="text-primary">Companion</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              The fast, comprehensive companion for BitCraft Online — live markets, settlements, empires, map, and crafting.
            </p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.heading}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {g.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="mailto:hello@bitcraftcompanion.com" className="transition-colors hover:text-foreground">hello@bitcraftcompanion.com</a>
            <a href="mailto:support@bitcraftcompanion.com" className="transition-colors hover:text-foreground">support@bitcraftcompanion.com</a>
            <a href="mailto:privacy@bitcraftcompanion.com" className="transition-colors hover:text-foreground">privacy@bitcraftcompanion.com</a>
          </div>
          <DataFreshness updatedAtIso={updatedAtIso} />
          <p>© 2026 BitCraft Companion · Not affiliated with BitCraft or Clockwork Labs.</p>
        </div>
      </div>
    </footer>
  );
}
