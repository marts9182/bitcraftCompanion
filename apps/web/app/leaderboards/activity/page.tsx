import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getActivityLeaderboard, listRegions } from "@/lib/queries/leaderboards";
import { MobileCard } from "@/components/mobile/MobileCard";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Activity Leaderboard",
  description: "Most-played BitCraft Online players and who's online right now.",
  alternates: { canonical: "/leaderboards/activity" },
};

function hours(seconds: number): string {
  return `${Math.round(seconds / 3600).toLocaleString()}h`;
}

export default async function ActivityLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total, online }, regions] = await Promise.all([getActivityLeaderboard(params), listRegions()]);
  const pagerParams = params.region !== "all" ? { region: params.region } : {};

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {online.toLocaleString()} online now · {total.toLocaleString()} players
      </p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={params.region} /></div>

      <table className="mt-6 hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 text-right">Time played</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3"><Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3">{r.signedIn ? <span className="text-green-500">● online</span> : <span className="text-muted-foreground">offline</span>}</td>
              <td className="py-2 text-right font-mono">{hours(r.timePlayed)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No players yet.</td></tr>}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r, i) => (
          <MobileCard
            key={r.entityId}
            href={`/players/${r.entityId}`}
            rank={(params.page - 1) * LB_PAGE_SIZE + i + 1}
            title={r.username}
            subtitle={`${r.region} · ${r.signedIn ? "online" : "offline"}`}
            stats={[{ label: "Time played", value: hours(r.timePlayed) }]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players yet.</li>}
      </ul>

      <div className="mt-6"><Pager page={params.page} total={total} pageSize={LB_PAGE_SIZE} searchParams={pagerParams} basePath="/leaderboards/activity" /></div>
    </main>
  );
}
