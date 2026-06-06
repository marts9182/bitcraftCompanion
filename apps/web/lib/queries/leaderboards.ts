import "server-only";
import { and, asc, desc, eq, ilike, sql, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { LB_PAGE_SIZE, type LeaderboardParams } from "@/lib/leaderboards/params";

const { players, playerSkills, skills, empires, empireMembers, empireTowers, regions } = schema;

export async function listRegions() {
  const db = getDb();
  // Project only what the (client) RegionSwitcher needs — avoids shipping a Date
  // (updatedAt) + unused module field across the server→client boundary.
  return db.select({ region: regions.region, name: regions.name }).from(regions).orderBy(regions.region);
}

export async function listSkills() {
  const db = getDb();
  return db.select().from(skills).orderBy(skills.name);
}

export interface SkillLeaderRow {
  entityId: string;
  username: string;
  region: string;
  level: number;
  xp: number;
  rank: number;
}

export async function getSkillLeaderboard(skillId: number, params: LeaderboardParams): Promise<{ rows: SkillLeaderRow[]; total: number }> {
  const db = getDb();
  const conds = [eq(playerSkills.skillId, skillId)];
  if (params.region !== "all") conds.push(eq(playerSkills.region, params.region));
  const where = and(...conds);

  const [{ total }] = await db.select({ total: count() }).from(playerSkills).where(where);
  const rows = await db
    .select({
      entityId: players.entityId,
      username: players.username,
      region: players.region,
      level: playerSkills.level,
      xp: playerSkills.xp,
    })
    .from(playerSkills)
    .innerJoin(players, eq(players.entityId, playerSkills.playerEntityId))
    .where(where)
    // Secondary key makes ties deterministic → stable pagination across pages/ISR.
    .orderBy(desc(playerSkills.xp), playerSkills.playerEntityId)
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);

  const base = (params.page - 1) * LB_PAGE_SIZE;
  return { rows: rows.map((r, i) => ({ ...r, rank: base + i + 1 })), total: Number(total) };
}

export interface TotalLeaderRow {
  entityId: string;
  username: string;
  region: string;
  totalXp: number;
  totalLevel: number;
  highestLevel: number;
  rank: number;
}

export async function getTotalLeaderboard(params: LeaderboardParams): Promise<{ rows: TotalLeaderRow[]; total: number }> {
  const db = getDb();
  const regionWhere = params.region === "all" ? undefined : eq(playerSkills.region, params.region);

  const agg = db
    .select({
      playerEntityId: playerSkills.playerEntityId,
      totalXp: sql<number>`sum(${playerSkills.xp})`.as("total_xp"),
      totalLevel: sql<number>`sum(${playerSkills.level})`.as("total_level"),
      highestLevel: sql<number>`max(${playerSkills.level})`.as("highest_level"),
    })
    .from(playerSkills)
    .where(regionWhere)
    .groupBy(playerSkills.playerEntityId)
    .as("agg");

  const orderCol =
    params.sort === "totalLevel" ? agg.totalLevel :
    params.sort === "highestLevel" ? agg.highestLevel :
    agg.totalXp;

  const [{ total }] = await db.select({ total: count() }).from(agg);
  const rows = await db
    .select({
      entityId: players.entityId,
      username: players.username,
      region: players.region,
      totalXp: agg.totalXp,
      totalLevel: agg.totalLevel,
      highestLevel: agg.highestLevel,
    })
    .from(agg)
    .innerJoin(players, eq(players.entityId, agg.playerEntityId))
    .orderBy(desc(orderCol), agg.playerEntityId)
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);

  const base = (params.page - 1) * LB_PAGE_SIZE;
  return { rows: rows.map((r, i) => ({ ...r, rank: base + i + 1 })), total: Number(total) };
}

export async function getEmpireLeaderboard(params: LeaderboardParams) {
  const db = getDb();
  const where = params.region === "all" ? undefined : eq(empires.region, params.region);
  const orderCol =
    params.sort === "totalLevel" ? empires.treasury :
    params.sort === "highestLevel" ? empires.memberCount :
    empires.numClaims;
  const [{ total }] = await db.select({ total: count() }).from(empires).where(where);
  const rows = await db
    .select()
    .from(empires)
    .where(where)
    .orderBy(desc(orderCol), empires.entityId)
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export async function getActivityLeaderboard(params: LeaderboardParams) {
  const db = getDb();
  const where = params.region === "all" ? undefined : eq(players.region, params.region);
  const [{ total }] = await db.select({ total: count() }).from(players).where(where);
  const [{ online }] = await db
    .select({ online: count() })
    .from(players)
    .where(params.region === "all" ? eq(players.signedIn, true) : and(eq(players.signedIn, true), eq(players.region, params.region)));
  const rows = await db
    .select({ entityId: players.entityId, username: players.username, region: players.region, timePlayed: players.timePlayed, signedIn: players.signedIn })
    .from(players)
    .where(where)
    .orderBy(desc(players.timePlayed), players.entityId)
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);
  return { rows, total: Number(total), online: Number(online) };
}

export async function getPlayer(entityId: string) {
  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.entityId, entityId)).limit(1);
  if (!player) return null;
  const sk = await db
    .select({ skillId: playerSkills.skillId, name: skills.name, level: playerSkills.level, xp: playerSkills.xp })
    .from(playerSkills)
    .innerJoin(skills, eq(skills.id, playerSkills.skillId))
    .where(eq(playerSkills.playerEntityId, entityId))
    .orderBy(desc(playerSkills.xp));
  return { player, skills: sk };
}

export async function getEmpire(entityId: string) {
  const db = getDb();
  const [empire] = await db.select().from(empires).where(eq(empires.entityId, entityId)).limit(1);
  if (!empire) return null;
  const members = await db
    .select({ playerEntityId: schema.empireMembers.playerEntityId, rank: schema.empireMembers.rank, username: players.username })
    .from(schema.empireMembers)
    .leftJoin(players, eq(players.entityId, schema.empireMembers.playerEntityId))
    .where(eq(schema.empireMembers.empireEntityId, entityId))
    .orderBy(schema.empireMembers.rank);
  return { empire, members };
}

export type EmpireSort = "claims" | "treasury" | "hexcoin" | "members" | "towers";

export interface EmpiresListParams {
  q?: string;
  sort?: EmpireSort;
  region: string;
  page: number;
}

export async function getEmpiresList(params: EmpiresListParams) {
  const db = getDb();
  const conds = [];
  if (params.region !== "all") conds.push(eq(empires.region, params.region));
  const q = params.q?.trim();
  if (q) conds.push(ilike(empires.name, `%${q}%`));
  const where = conds.length ? and(...conds) : undefined;

  const orderCol =
    params.sort === "treasury" ? empires.treasury :
    params.sort === "hexcoin" ? empires.currencyTreasury :
    params.sort === "members" ? empires.memberCount :
    params.sort === "towers" ? empires.towerCount :
    empires.numClaims;

  const [{ total }] = await db.select({ total: count() }).from(empires).where(where);
  const rows = await db
    .select({
      entityId: empires.entityId,
      name: empires.name,
      color: empires.color,
      region: empires.region,
      memberCount: empires.memberCount,
      numClaims: empires.numClaims,
      currencyTreasury: empires.currencyTreasury,
      treasury: empires.treasury,
      towerCount: empires.towerCount,
    })
    .from(empires)
    .where(where)
    // Tiebreak by name asc for deterministic, stable pagination.
    .orderBy(desc(orderCol), asc(empires.name), empires.entityId)
    .limit(LB_PAGE_SIZE)
    .offset((params.page - 1) * LB_PAGE_SIZE);
  return { rows, total: Number(total) };
}

export async function getEmpireDetail(id: string) {
  const db = getDb();
  const [empire] = await db.select().from(empires).where(eq(empires.entityId, id)).limit(1);
  if (!empire) return null;

  const towers = await db
    .select()
    .from(empireTowers)
    .where(eq(empireTowers.empireEntityId, id))
    .orderBy(desc(empireTowers.energy))
    .limit(200);

  // Empires are region-replicated; member rows for one empire may live under a
  // single region. Query by empireEntityId across regions and dedupe by player.
  const memberRows = await db
    .select({
      playerEntityId: empireMembers.playerEntityId,
      rank: empireMembers.rank,
      noble: empireMembers.noble,
      donatedShards: empireMembers.donatedShards,
      donatedCurrency: empireMembers.donatedCurrency,
      username: players.username,
    })
    .from(empireMembers)
    .leftJoin(players, eq(players.entityId, empireMembers.playerEntityId))
    .where(eq(empireMembers.empireEntityId, id))
    .orderBy(asc(empireMembers.rank), desc(empireMembers.donatedShards));

  const seen = new Set<string>();
  const members = memberRows.filter((m) => {
    if (seen.has(m.playerEntityId)) return false;
    seen.add(m.playerEntityId);
    return true;
  });

  return { empire, towers, members };
}

export async function listTopPlayerIds(limit = 200): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: players.entityId }).from(players).orderBy(desc(players.timePlayed)).limit(limit);
  return rows.map((r) => r.id);
}

export async function listEmpireIds(limit = 500): Promise<string[]> {
  const db = getDb();
  // Seed the top empires for SSG; the long tail renders on-demand via dynamicParams.
  const rows = await db.select({ id: empires.entityId }).from(empires).orderBy(desc(empires.numClaims)).limit(limit);
  return rows.map((r) => r.id);
}
