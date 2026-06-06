import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayer, listTopPlayerIds } from "@/lib/queries/leaderboards";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listTopPlayerIds(200);
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPlayer(id);
  if (!data) return { title: "Player" };
  return {
    title: `${data.player.username} — Player`,
    description: `BitCraft Online player ${data.player.username}: skill levels, total XP, and activity.`,
    alternates: { canonical: `/players/${id}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPlayer(id);
  if (!data) notFound();
  const { player, skills } = data;
  const totalLevel = skills.reduce((a, s) => a + s.level, 0);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/leaderboards/skills" className="hover:underline">Leaderboards</Link> / <span>{player.username}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{player.username}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Region {player.region} · total level {totalLevel} · {Math.round(player.timePlayed / 3600).toLocaleString()}h played ·{" "}
        {player.signedIn ? <span className="text-green-500">online</span> : "offline"}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Skills</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-2 pr-3">Skill</th><th className="py-2 pr-3 text-right">Level</th><th className="py-2 text-right">XP</th></tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.skillId} className="border-t border-border">
              <td className="py-2 pr-3">
                <Link href={`/leaderboards/skills/${s.skillId}`} className="hover:underline">{s.name}</Link>
              </td>
              <td className="py-2 pr-3 text-right">{s.level}</td>
              <td className="py-2 text-right font-mono">{Number(s.xp).toLocaleString()}</td>
            </tr>
          ))}
          {skills.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No skill data.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
