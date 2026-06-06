import type { Metadata } from "next";
import Link from "next/link";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE, SKILL_SORTS } from "@/lib/leaderboards/params";
import { getTotalLeaderboard, listRegions, listSkills } from "@/lib/queries/leaderboards";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Skills Leaderboard",
  description: "Top BitCraft Online players ranked by total XP, total level, and per-skill mastery.",
  alternates: { canonical: "/leaderboards/skills" },
};

const SORT_LABEL: Record<(typeof SKILL_SORTS)[number], string> = {
  totalXp: "Total XP",
  totalLevel: "Total Level",
  highestLevel: "Highest Level",
};

export default async function SkillsLeaderboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLeaderboardParams(await searchParams);
  const [{ rows, total }, regions, skills] = await Promise.all([getTotalLeaderboard(params), listRegions(), listSkills()]);

  const pagerParams: Record<string, string | undefined> = {
    region: params.region !== "all" ? params.region : undefined,
    sort: params.sort,
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Skills Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} ranked players · {skills.length} skills</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <RegionSwitcher regions={regions} current={params.region} />
        <div className="flex gap-2 text-sm">
          {SKILL_SORTS.map((s) => {
            const sp = new URLSearchParams();
            if (params.region !== "all") sp.set("region", params.region);
            sp.set("sort", s);
            return (
              <Link
                key={s}
                href={`/leaderboards/skills?${sp.toString()}`}
                className={`rounded-md border px-3 py-1 ${params.sort === s ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {SORT_LABEL[s]}
              </Link>
            );
          })}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Highest</th>
            <th className="py-2 pr-3 text-right">Total Level</th>
            <th className="py-2 text-right">Total XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{r.rank}</td>
              <td className="py-2 pr-3">
                <Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3 text-right">{r.highestLevel}</td>
              <td className="py-2 pr-3 text-right">{r.totalLevel}</td>
              <td className="py-2 text-right font-mono">{Number(r.totalXp).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No ranked players yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 flex flex-wrap gap-2">
        {skills.map((s) => (
          <Link key={s.id} href={`/leaderboards/skills/${s.id}`} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40">
            {s.name}
          </Link>
        ))}
      </div>

      <Pager page={params.page} total={total} pageSize={LB_PAGE_SIZE} searchParams={pagerParams} basePath="/leaderboards/skills" />
    </main>
  );
}
