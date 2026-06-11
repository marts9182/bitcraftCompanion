import type { Metadata } from "next";
import Link from "next/link";
import { vividTerritoryColor } from "@bcc/shared";
import { Pager } from "@/components/compendium/Pager";
import { LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getEmpiresList, type EmpireSort } from "@/lib/queries/leaderboards";
import { MobileCard } from "@/components/mobile/MobileCard";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Empires",
  description: "BitCraft Online empires — searchable and sortable by claims, Hexite energy, members, and towers.",
  alternates: { canonical: "/empires" },
};

const SORTS: readonly EmpireSort[] = ["claims", "hexcoin", "capsules", "reserve", "members", "towers"];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type Col = { key?: EmpireSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { label: "Empire" },
  { key: "members", label: "Members", align: "right" },
  { key: "claims", label: "Claims", align: "right" },
  { key: "hexcoin", label: "Hexite energy", align: "right" },
  { key: "capsules", label: "Foundry capsules", align: "right" },
  { key: "reserve", label: "Reserve capsules", align: "right" },
  { key: "towers", label: "Towers", align: "right" },
];

export default async function EmpiresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? "";
  const sortRaw = one(sp.sort) as EmpireSort | undefined;
  const sort: EmpireSort = sortRaw && SORTS.includes(sortRaw) ? sortRaw : "claims";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  // Empires are global-replicated across region modules (no meaningful single
  // region), so the list is not region-filtered — region "all" always.
  const { rows, total } = await getEmpiresList({ q, sort, region: "all", page });

  // Preserve current filters across sort-header links and the pager.
  const preserved: Record<string, string | undefined> = {
    q: q || undefined,
    sort: sort !== "claims" ? sort : undefined,
  };
  const sortHref = (key: EmpireSort) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", key);
    return `/empires?${params.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Empires</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} empires</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form method="GET" action="/empires" className="flex items-center gap-2 text-sm">
          {sort !== "claims" && <input type="hidden" name="sort" value={sort} />}
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search empires…"
            aria-label="Search empires"
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">
            Search
          </button>
        </form>
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
          {rows.map((e, i) => (
            <tr key={e.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/empires/${e.entityId}`} className="inline-flex items-center gap-2 hover:underline">
                  {e.color && (
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-border"
                      style={{ backgroundColor: vividTerritoryColor(e.color) }}
                    />
                  )}
                  {e.name}
                </Link>
              </td>
              <td className="py-2 pr-3 text-right font-mono">{e.memberCount.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{e.numClaims.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{e.currencyTreasury.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{e.foundryCapsules.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{e.reserveCapsules.toLocaleString()}</td>
              <td className="py-2 text-right font-mono">{e.towerCount.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">
                No empires found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((e, i) => (
          <MobileCard
            key={e.entityId}
            href={`/empires/${e.entityId}`}
            rank={(page - 1) * LB_PAGE_SIZE + i + 1}
            title={
              <span className="inline-flex items-center gap-2">
                {e.color && (
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-border"
                    style={{ backgroundColor: vividTerritoryColor(e.color) }}
                  />
                )}
                {e.name}
              </span>
            }
            stats={[
              { label: "Members", value: e.memberCount.toLocaleString() },
              { label: "Claims", value: e.numClaims.toLocaleString() },
              { label: "Hexite energy", value: e.currencyTreasury.toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No empires found.</li>}
      </ul>

      <div className="mt-6">
        <Pager page={page} total={total} pageSize={LB_PAGE_SIZE} searchParams={preserved} basePath="/empires" />
      </div>
    </main>
  );
}
