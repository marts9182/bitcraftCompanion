import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmpire, listEmpireIds } from "@/lib/queries/leaderboards";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listEmpireIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getEmpire(id);
  if (!data) return { title: "Empire" };
  return {
    title: `${data.empire.name} — Empire`,
    description: `BitCraft Online empire ${data.empire.name}: members, claims, and treasury.`,
    alternates: { canonical: `/empires/${id}` },
  };
}

export default async function EmpirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEmpire(id);
  if (!data) notFound();
  const { empire, members } = data;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{empire.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Region {empire.region} · {empire.memberCount} members · {empire.numClaims} claims · treasury {Number(empire.treasury).toLocaleString()}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Members</h2>
      <ul className="mt-3 divide-y divide-border">
        {members.map((m) => (
          <li key={m.playerEntityId} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">#{m.rank}</span>
            {m.username ? (
              <Link href={`/players/${m.playerEntityId}`} className="hover:underline">{m.username}</Link>
            ) : (
              <span className="text-muted-foreground">player {m.playerEntityId}</span>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="py-6 text-center text-muted-foreground">No members.</li>}
      </ul>
    </main>
  );
}
