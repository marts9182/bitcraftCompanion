export const LB_PAGE_SIZE = 100;
export const SKILL_SORTS = ["totalXp", "totalLevel", "highestLevel"] as const;
export type SkillSort = (typeof SKILL_SORTS)[number];

export interface LeaderboardParams {
  region: string;
  sort: SkillSort;
  page: number;
}

export function parseLeaderboardParams(sp: Record<string, string | string[] | undefined>): LeaderboardParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const region = one(sp.region)?.trim() || "all";
  const sortRaw = one(sp.sort) as SkillSort | undefined;
  const sort = sortRaw && (SKILL_SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "totalXp";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { region, sort, page };
}
