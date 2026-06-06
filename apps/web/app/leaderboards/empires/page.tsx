import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getEmpireLeaderboard, listRegions } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Empire Leaderboard",
  description: "BitCraft Online empires ranked by claims, treasury, and members.",
  alternates: { canonical: "/leaderboards/empires" },
};

export default async function EmpiresLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total }, regions] = await Promise.all([getEmpireLeaderboard(params), listRegions()]);
  const pagerParams = params.region !== "all" ? { region: params.region } : {};

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Empire Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} empires</p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={params.region} /></div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Empire</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Members</th>
            <th className="py-2 pr-3 text-right">Claims</th>
            <th className="py-2 text-right">Treasury</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{(params.page - 1) * LB_PAGE_SIZE + i + 1}</td>
              <td className="py-2 pr-3"><Link href={`/empires/${e.entityId}`} className="hover:underline">{e.name}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{e.region}</td>
              <td className="py-2 pr-3 text-right">{e.memberCount}</td>
              <td className="py-2 pr-3 text-right">{e.numClaims}</td>
              <td className="py-2 text-right font-mono">{Number(e.treasury).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No empires yet.</td></tr>}
        </tbody>
      </table>
      <div className="mt-6"><Pager page={params.page} total={total} pageSize={LB_PAGE_SIZE} searchParams={pagerParams} basePath="/leaderboards/empires" /></div>
    </main>
  );
}
