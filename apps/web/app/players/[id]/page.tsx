import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerDetail, listTopPlayerIds } from "@/lib/queries/leaderboards";
import { classifyClaim } from "@bcc/shared";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const ids = await listTopPlayerIds(200);
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPlayerDetail(id);
  if (!data) return { title: "Player" };
  return {
    title: `${data.player.username} — Player`,
    description: `BitCraft Online player ${data.player.username}: skill levels, total XP, empire, claims, and activity.`,
    alternates: { canonical: `/players/${id}` },
  };
}

// signInTimestamp is microseconds since unix epoch; render a short UTC date.
function lastSeen(micros: number): string | null {
  if (!micros) return null;
  const d = new Date(micros / 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPlayerDetail(id);
  if (!data) notFound();
  const { player, skills, empire, claims } = data;
  const totalLevel = skills.reduce((a, s) => a + s.level, 0);
  const seen = lastSeen(player.signInTimestamp);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/players" className="hover:underline">Players</Link> / <span>{player.username}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{player.username}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Region {player.region} · total level {totalLevel} · {Math.round(player.timePlayed / 3600).toLocaleString()}h played ·{" "}
        {Math.round(player.timeSignedIn / 3600).toLocaleString()}h signed in ·{" "}
        {player.signedIn ? <span className="text-green-500">online</span> : "offline"}
        {seen && !player.signedIn ? <> · last seen {seen}</> : null}
      </p>

      <p className="mt-3 text-sm">
        {empire ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Empire:</span>
            <Link href={`/empires/${empire.entityId}`} className="hover:underline">{empire.name}</Link>
            <span className="text-muted-foreground">· rank {empire.rank}</span>
            {empire.noble && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Noble
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">No empire.</span>
        )}
      </p>

      <h2 className="mt-8 text-xl font-semibold">Claims</h2>
      {claims.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No claim memberships.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {claims.map((c) => {
            const isSettlement = !!c.claimName && classifyClaim(c.claimName).kind === "settlement";
            return (
            <li key={c.claimEntityId} className="flex flex-wrap items-center gap-2">
              {isSettlement ? (
                <Link href={`/settlements/${c.claimEntityId}`} className="hover:underline">{c.claimName}</Link>
              ) : (
                <span>{c.claimName || `claim ${c.claimEntityId}`}</span>
              )}
              {c.coOwner && <Badge>Co-owner</Badge>}
              {c.officer && <Badge>Officer</Badge>}
              {c.build && <Badge>Build</Badge>}
              {c.inventory && <Badge>Inventory</Badge>}
            </li>
            );
          })}
        </ul>
      )}

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
