import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { vividTerritoryColor } from "@bcc/shared";
import { getEmpireDetail, listEmpireIds } from "@/lib/queries/leaderboards";
import { EmpireMembers } from "@/components/empires/EmpireMembers";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listEmpireIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getEmpireDetail(id);
  if (!data) return { title: "Empire" };
  return {
    title: `${data.empire.name} — Empire`,
    description: `BitCraft Online empire ${data.empire.name}: members, claims, treasury, and towers.`,
    alternates: { canonical: `/empires/${id}` },
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

export default async function EmpirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEmpireDetail(id);
  if (!data) notFound();
  const { empire, towers, members } = data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/empires" className="hover:underline">Empires</Link> / <span>{empire.name}</span>
      </nav>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight">
        {empire.color && (
          <span
            className="inline-block h-5 w-5 rounded-sm border border-border"
            style={{ backgroundColor: vividTerritoryColor(empire.color) }}
          />
        )}
        {empire.name}
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Hexite energy" value={empire.currencyTreasury} />
        <Stat label="Foundry capsules" value={empire.foundryCapsules} />
        <Stat label="Reserve capsules" value={empire.reserveCapsules} />
        <Stat label="Claims" value={empire.numClaims} />
        <Stat label="Members" value={empire.memberCount} />
        <Stat label="Nobility threshold" value={empire.nobilityThreshold} />
        <Stat label="Towers" value={empire.towerCount} />
        <Stat label="Tower energy" value={empire.towerEnergy} />
        <Stat label="Tower upkeep" value={empire.towerUpkeep} />
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Towers</h2>
        {towers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No towers.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3 text-right">Energy</th>
                <th className="py-2 pr-3 text-right">Upkeep</th>
                <th className="py-2 text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {towers.map((t) => (
                <tr key={t.entityId} className="border-t border-border">
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{t.chunkIndex}</td>
                  <td className="py-2 pr-3 text-right font-mono">{t.energy.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right font-mono">{t.upkeep.toLocaleString()}</td>
                  <td className="py-2 text-right">{t.active ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Members ({members.length.toLocaleString()})</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No members.</p>
        ) : (
          <EmpireMembers members={members} />
        )}
      </section>
    </main>
  );
}
