import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/Stat";
import { SettlementTrendChart } from "@/components/settlements/SettlementTrendChart";
import {
  getSettlement, getSettlementMembers, getSettlementHistory, listSettlementIds,
} from "@/lib/queries/settlements";
import {
  estimateDepletion, DEPLETION_BADGE_DAYS, DEPLETION_HORIZON_DAYS, type DepletionEstimate,
} from "@/lib/settlements/depletion";
import { formatGameCoords } from "@/lib/format";

export const revalidate = 1800;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listSettlementIds(200);
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getSettlement(id);
  if (!s) return { title: "Settlement" };
  return {
    title: `${s.name} — Settlement`,
    description: `BitCraft Online settlement ${s.name}: supplies, treasury, tiles, members, and supply history.`,
    alternates: { canonical: `/settlements/${id}` },
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Short UTC date, matching the players page's last-seen idiom. */
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** One-line projection under the supplies chart; amber when run-out is under 14 days. */
function DepletionNote({ est }: { est: DepletionEstimate }) {
  if (est.daysLeft === null || est.etaMs === null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {est.slopePerDay > 0 ? "Supplies rising" : "Supplies stable"} over the last 7 days.
      </p>
    );
  }
  if (est.daysLeft > DEPLETION_HORIZON_DAYS) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Supplies declining slowly — {DEPLETION_HORIZON_DAYS}+ days of runway at the current 7-day rate.
      </p>
    );
  }
  const n = Math.ceil(est.daysLeft);
  const when = n <= 0 ? "today" : n === 1 ? "in 1 day" : `in ${n} days`;
  const atRisk = est.daysLeft < DEPLETION_BADGE_DAYS;
  return (
    <p className={`mt-2 text-sm ${atRisk ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
      Supplies run out ~{fmtDate(est.etaMs)} ({when}) at the current 7-day rate.
    </p>
  );
}

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSettlement(id);
  if (!s) notFound();

  const [members, history] = await Promise.all([
    getSettlementMembers(id),
    getSettlementHistory(id),
  ]);

  const suppliesPoints = history.map((p) => ({ snapshotAt: p.snapshotAt, value: p.supplies }));
  const treasuryPoints = history.map((p) => ({ snapshotAt: p.snapshotAt, value: p.treasury }));
  // Reuses the chart's history fetch — no extra query for the projection.
  const depletion = estimateDepletion(
    history.map((p) => ({ t: p.snapshotAt, supplies: p.supplies })),
    s.supplies,
    Date.now(),
  );

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/settlements" className="hover:underline">Settlements</Link> / <span>{s.name}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{s.name || `Claim ${s.entityId}`}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Region {s.region}</span>
        {s.ownerPlayerEntityId && (
          <>· <Link href={`/players/${s.ownerPlayerEntityId}`} className="hover:underline">{s.ownerName || "owner"}</Link></>
        )}
        {s.empireEntityId && (
          <>· <Link href={`/empires/${s.empireEntityId}`} className="hover:underline">{s.empireName || "empire"}</Link></>
        )}
        {s.canHouseStorehouse && <Badge>Can house storehouse</Badge>}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tiles" value={s.numTiles} />
        <Stat label="Tile neighbors" value={s.numTileNeighbors} />
        <Stat label="Supplies" value={s.supplies} />
        <Stat label="Supplies threshold" value={s.suppliesPurchaseThreshold} />
        <Stat label="Purchase price" value={s.suppliesPurchasePrice} />
        <Stat label="Treasury" value={s.treasury} />
        <Stat label="XP since minting" value={s.xpSinceMinting} />
        <Stat label="Members" value={s.memberCount} />
        <Stat label="Member donations" value={s.membersDonations} />
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Supplies history</h2>
        {depletion && <DepletionNote est={depletion} />}
        <SettlementTrendChart points={suppliesPoints} label="Supplies" color="#D5BB72" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Treasury history</h2>
        <SettlementTrendChart points={treasuryPoints} label="Treasury" color="#747184" />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Members</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No members.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.playerEntityId} className="flex flex-wrap items-center gap-2">
                <Link href={`/players/${m.playerEntityId}`} className="hover:underline">{m.username || `player ${m.playerEntityId}`}</Link>
                {m.coOwner && <Badge>Co-owner</Badge>}
                {m.officer && <Badge>Officer</Badge>}
                {m.build && <Badge>Build</Badge>}
                {m.inventory && <Badge>Inventory</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 text-sm text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">Location</h2>
        <p className="mt-3">
          {formatGameCoords(s.x, s.z)} ·{" "}
          <Link href="/map" className="hover:underline">View on map →</Link>
        </p>
      </section>
    </main>
  );
}
