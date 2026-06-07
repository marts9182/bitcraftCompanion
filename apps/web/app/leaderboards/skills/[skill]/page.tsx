import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegionSwitcher } from "@/components/leaderboards/RegionSwitcher";
import { Pager } from "@/components/compendium/Pager";
import { parseLeaderboardParams, LB_PAGE_SIZE } from "@/lib/leaderboards/params";
import { getSkillLeaderboard, listRegions, listSkills } from "@/lib/queries/leaderboards";
import { MobileCard } from "@/components/mobile/MobileCard";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const skills = await listSkills();
  return skills.map((s) => ({ skill: String(s.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ skill: string }> }): Promise<Metadata> {
  const { skill } = await params;
  const all = await listSkills();
  const s = all.find((x) => String(x.id) === skill);
  if (!s) return { title: "Skill Leaderboard" };
  return {
    title: `${s.name} Leaderboard`,
    description: `Top BitCraft Online players in ${s.name} ranked by XP and level.`,
    alternates: { canonical: `/leaderboards/skills/${skill}` },
  };
}

export default async function SkillLeaderboard({
  params,
  searchParams,
}: {
  params: Promise<{ skill: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { skill } = await params;
  const skillId = Number.parseInt(skill, 10);
  if (!Number.isFinite(skillId)) notFound();
  const lbParams = parseLeaderboardParams(await searchParams);
  const [all, regions, { rows, total }] = await Promise.all([listSkills(), listRegions(), getSkillLeaderboard(skillId, lbParams)]);
  const meta = all.find((s) => s.id === skillId);
  if (!meta) notFound();

  const pagerParams: Record<string, string | undefined> = {
    region: lbParams.region !== "all" ? lbParams.region : undefined,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/leaderboards/skills" className="hover:underline">Skills</Link> / <span>{meta.name}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{meta.name} Leaderboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} players</p>
      <div className="mt-6"><RegionSwitcher regions={regions} current={lbParams.region} /></div>

      <table className="mt-6 hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Player</th>
            <th className="py-2 pr-3">Region</th>
            <th className="py-2 pr-3 text-right">Level</th>
            <th className="py-2 text-right">XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entityId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{r.rank}</td>
              <td className="py-2 pr-3"><Link href={`/players/${r.entityId}`} className="hover:underline">{r.username}</Link></td>
              <td className="py-2 pr-3 text-muted-foreground">{r.region}</td>
              <td className="py-2 pr-3 text-right">{r.level}</td>
              <td className="py-2 text-right font-mono">{Number(r.xp).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No players yet.</td></tr>}
        </tbody>
      </table>

      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r) => (
          <MobileCard
            key={r.entityId}
            href={`/players/${r.entityId}`}
            rank={r.rank}
            title={r.username}
            subtitle={r.region}
            stats={[
              { label: "Level", value: r.level },
              { label: "XP", value: Number(r.xp).toLocaleString() },
            ]}
          />
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No players yet.</li>}
      </ul>

      <Pager page={lbParams.page} total={total} pageSize={LB_PAGE_SIZE} searchParams={pagerParams} basePath={`/leaderboards/skills/${skillId}`} />
    </main>
  );
}
