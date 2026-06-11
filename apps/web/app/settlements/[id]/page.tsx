import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettlementTrendChart } from "@/components/settlements/SettlementTrendChart";
import {
  getSettlement, getSettlementMembers, getSettlementHistory, listSettlementIds,
} from "@/lib/queries/settlements";
import { formatGameCoords } from "@/lib/format";

export const revalidate = 300;
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
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
