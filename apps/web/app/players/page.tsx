import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { MobileCard } from "@/components/mobile/MobileCard";
import { LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getPlayersList, listRegions, type PlayerSort } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Players",
  description: "BitCraft Online players — searchable and sortable by total level and hours played.",
  alternates: { canonical: "/players" },
};

const SORTS: readonly PlayerSort[] = ["level", "playtime", "name"];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type Col = { key?: PlayerSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { key: "name", label: "Player" },
  { label: "Region" },
  { key: "level", label: "Total level", align: "right" },
  { key: "playtime", label: "Hours played", align: "right" },
  { label: "" },
];

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? "";
  const region = one(sp.region)?.trim() || "all";
  const sortRaw = one(sp.sort) as PlayerSort | undefined;
  const sort: PlayerSort = sortRaw && SORTS.includes(sortRaw) ? sortRaw : "level";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const [{ rows, total }, regions] = await Promise.all([
    getPlayersList({ q, sort, region, page }),
    listRegions(),
  ]);

  // Preserve current filters across sort-header links, pager, and region switch.
  const preserved: Record<string, string | undefined> = {
    q: q || undefined,
    sort: sort !== "level" ? sort : undefined,
    region: region !== "all" ? region : undefined,
  };
  const sortHref = (key: PlayerSort) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (region !== "all") params.set("region", region);
    params.set("sort", key);
    return `/players?${params.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Players</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} players</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form method="GET" action="/players" className="flex items-center gap-2 text-sm">
          {region !== "all" && <input type="hidden" name="region" value={region} />}
          {sort !== "level" && <input type="hidden" name="sort" value={sort} />}
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search players…"
            aria-label="Search players"
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">
            Search
          </button>
        </form>
        <RegionSwitcher regions={regions} current={region} />
      </div>

      <table className="mt-6 hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            {COLS.map((c) => (
              <th key={c.label} className={`py-2 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
                {c.key ? (
                  <Link href={sortHref(c.key)} className="hover:underline">
                    {c.label}
                    {sort === c.key ? " ▲" : ""}
                  </Link>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/players/${p.entityId}`} className="hover:underline">{p.username}</Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{p.region || "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{p.totalLevel.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{Math.round(p.timePlayed / 3600).toLocaleString()}</td>
              <td className="py-2 text-right">
                {p.signedIn && <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" title="online" />}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">
                No players found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((p, i) => (
          <MobileCard
            key={p.entityId}
            href={`/players/${p.entityId}`}
            rank={(page - 1) * LB_PAGE_SIZE + i + 1}
            title={p.username}
            subtitle={`${p.region || "—"}${p.signedIn ? " · online" : ""}`}
            stats={[
              { label: "Total level", value: p.totalLevel.toLocaleString() },
              { label: "Hours played", value: Math.round(p.timePlayed / 3600).toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players found.</li>}
      </ul>

      <div className="mt-6">
        <Pager page={page} total={total} pageSize={LB_PAGE_SIZE} searchParams={preserved} basePath="/players" />
      </div>
    </main>
  );
}
