import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/compendium/Pager";
import { getSettlementsList } from "@/lib/queries/settlements";
import { SETTLEMENT_PAGE_SIZE, parseSettlementParams, type SettlementSort } from "@/lib/settlements/params";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Settlements",
  description: "BitCraft Online player settlements — supplies, treasury, tiles, maintenance, and members across all regions.",
  alternates: { canonical: "/settlements" },
};

type Col = { key?: SettlementSort; label: string; align?: "right" };
const COLS: Col[] = [
  { label: "#" },
  { key: "name", label: "Settlement" },
  { label: "Region" },
  { label: "Owner" },
  { label: "Empire" },
  { key: "tiles", label: "Tiles", align: "right" },
  { key: "supplies", label: "Supplies", align: "right" },
  { key: "treasury", label: "Treasury", align: "right" },
  { key: "maintenance", label: "Maintenance", align: "right" },
  { key: "members", label: "Members", align: "right" },
];

export default async function SettlementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = parseSettlementParams(sp);
  const { rows, total } = await getSettlementsList(params);

  const sortHref = (key: SettlementSort) => {
    const qp = new URLSearchParams();
    if (params.q) qp.set("q", params.q);
    if (params.region) qp.set("region", params.region);
    qp.set("sort", key);
    return `/settlements?${qp.toString()}`;
  };
  const preserved: Record<string, string | undefined> = {
    q: params.q || undefined,
    region: params.region || undefined,
    sort: params.sort !== "tiles" ? params.sort : undefined,
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Settlements</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} player settlements</p>

      <form method="GET" action="/settlements" className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {params.sort !== "tiles" && <input type="hidden" name="sort" value={params.sort} />}
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Search settlements…"
          aria-label="Search settlements"
          className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <input
          type="text"
          name="region"
          defaultValue={params.region}
          placeholder="Region"
          aria-label="Filter by region"
          className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted/40">Search</button>
      </form>

      <table className="mt-6 w-full text-sm">
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
          {rows.map((s, i) => (
            <tr key={s.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * SETTLEMENT_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/settlements/${s.entityId}`} className="hover:underline">{s.name || `Claim ${s.entityId}`}</Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{s.region}</td>
              <td className="py-2 pr-3">
                {s.ownerPlayerEntityId ? (
                  <Link href={`/players/${s.ownerPlayerEntityId}`} className="hover:underline">{s.ownerName || "—"}</Link>
                ) : "—"}
              </td>
              <td className="py-2 pr-3">
                {s.empireEntityId ? (
                  <Link href={`/empires/${s.empireEntityId}`} className="hover:underline">{s.empireName || "—"}</Link>
                ) : "—"}
              </td>
              <td className="py-2 pr-3 text-right font-mono">{s.numTiles.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{s.supplies.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{s.treasury.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right font-mono">{Math.round(s.buildingMaintenance).toLocaleString()}</td>
              <td className="py-2 text-right font-mono">{s.memberCount.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="py-6 text-center text-muted-foreground">No settlements found.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6">
        <Pager page={params.page} total={total} pageSize={SETTLEMENT_PAGE_SIZE} searchParams={preserved} basePath="/settlements" />
      </div>
    </main>
  );
}
