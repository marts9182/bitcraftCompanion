import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, ilike, sql, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { SETTLEMENT_PAGE_SIZE, type SettlementListParams } from "@/lib/settlements/params";
import { depletionBadgeDays, DEPLETION_WINDOW_DAYS } from "@/lib/settlements/depletion";

const { settlements, settlementSupplyHistory, claimMembers, players, empires } = schema;

/**
 * claimEntityId → supplies/day slope over the trailing 7 days, NEGATIVE slopes
 * only (draining settlements). One grouped regr_slope scan covers every
 * settlement, so the list never runs per-row history queries; unstable_cache'd
 * at the worker snapshot cadence (30 min) like the map fetchers.
 */
const getSupplyDepletionSlopes = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const db = getDb();
    const slopePerSec = sql<number | null>`regr_slope(${settlementSupplyHistory.supplies}, extract(epoch from ${settlementSupplyHistory.snapshotAt}))`;
    const cutoff = new Date(Date.now() - DEPLETION_WINDOW_DAYS * 86_400_000);
    const rows = await db
      .select({ id: settlementSupplyHistory.settlementEntityId, slopePerSec })
      .from(settlementSupplyHistory)
      .where(gte(settlementSupplyHistory.snapshotAt, cutoff))
      .groupBy(settlementSupplyHistory.settlementEntityId)
      .having(sql`${slopePerSec} < 0`);
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.slopePerSec !== null) out[r.id] = Number(r.slopePerSec) * 86_400;
    }
    return out;
  },
  ["settlement-depletion-slopes"],
  { revalidate: 1800 },
);

export interface SettlementListRow {
  entityId: string;
  name: string;
  region: string;
  ownerPlayerEntityId: string | null;
  ownerName: string | null;
  empireEntityId: string | null;
  empireName: string | null;
  numTiles: number;
  supplies: number;
  treasury: number;
  memberCount: number;
  /** Whole days until projected supply depletion — only set when under 14 days (amber badge), else null. */
  runsOutDays: number | null;
}

export async function getSettlementsList(params: SettlementListParams): Promise<{ rows: SettlementListRow[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (params.q) conds.push(ilike(settlements.name, `%${params.q}%`));
  if (params.region) conds.push(eq(settlements.region, params.region));
  const where = conds.length ? and(...conds) : undefined;

  const orderBy =
    params.sort === "supplies" ? desc(settlements.supplies) :
    params.sort === "treasury" ? desc(settlements.treasury) :
    params.sort === "members" ? desc(settlements.memberCount) :
    params.sort === "name" ? asc(settlements.name) :
    desc(settlements.numTiles);

  const [{ total }] = await db.select({ total: count() }).from(settlements).where(where);
  const slopesPromise = getSupplyDepletionSlopes(); // cached at snapshot cadence; overlaps the row fetch
  const rows = await db
    .select({
      entityId: settlements.entityId,
      name: settlements.name,
      region: settlements.region,
      ownerPlayerEntityId: settlements.ownerPlayerEntityId,
      ownerName: players.username,
      empireEntityId: settlements.empireEntityId,
      empireName: empires.name,
      numTiles: settlements.numTiles,
      supplies: settlements.supplies,
      treasury: settlements.treasury,
      memberCount: settlements.memberCount,
    })
    .from(settlements)
    .leftJoin(players, eq(players.entityId, settlements.ownerPlayerEntityId))
    .leftJoin(empires, eq(empires.entityId, settlements.empireEntityId))
    .where(where)
    .orderBy(orderBy, asc(settlements.name))
    .limit(SETTLEMENT_PAGE_SIZE)
    .offset((params.page - 1) * SETTLEMENT_PAGE_SIZE);
  const slopes = await slopesPromise;
  const withEta = rows.map((r) => {
    const slope = slopes[r.entityId];
    return { ...r, runsOutDays: slope !== undefined ? depletionBadgeDays(r.supplies / -slope) : null };
  });
  return { rows: withEta, total: Number(total) };
}

export type SettlementDetail = typeof settlements.$inferSelect & { ownerName: string | null; empireName: string | null };

export async function getSettlement(id: string): Promise<SettlementDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      s: settlements,
      ownerName: players.username,
      empireName: empires.name,
    })
    .from(settlements)
    .leftJoin(players, eq(players.entityId, settlements.ownerPlayerEntityId))
    .leftJoin(empires, eq(empires.entityId, settlements.empireEntityId))
    .where(eq(settlements.entityId, id))
    .limit(1);
  if (!row) return null;
  return { ...row.s, ownerName: row.ownerName, empireName: row.empireName };
}

export interface SettlementMemberRow {
  playerEntityId: string;
  username: string | null;
  coOwner: boolean;
  officer: boolean;
  build: boolean;
  inventory: boolean;
}

export async function getSettlementMembers(id: string): Promise<SettlementMemberRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      playerEntityId: claimMembers.playerEntityId,
      username: players.username,
      coOwner: claimMembers.coOwner,
      officer: claimMembers.officer,
      build: claimMembers.build,
      inventory: claimMembers.inventory,
    })
    .from(claimMembers)
    .leftJoin(players, eq(players.entityId, claimMembers.playerEntityId))
    .where(eq(claimMembers.claimEntityId, id))
    .orderBy(desc(claimMembers.coOwner), desc(claimMembers.officer));
  return rows;
}

export interface SupplyPoint {
  snapshotAt: Date;
  supplies: number;
  treasury: number;
  numTiles: number;
}

export async function getSettlementHistory(id: string): Promise<SupplyPoint[]> {
  const db = getDb();
  return db
    .select({
      snapshotAt: settlementSupplyHistory.snapshotAt,
      supplies: settlementSupplyHistory.supplies,
      treasury: settlementSupplyHistory.treasury,
      numTiles: settlementSupplyHistory.numTiles,
    })
    .from(settlementSupplyHistory)
    .where(eq(settlementSupplyHistory.settlementEntityId, id))
    .orderBy(asc(settlementSupplyHistory.snapshotAt));
}

export async function listSettlementIds(limit = 200): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: settlements.entityId })
    .from(settlements)
    .orderBy(desc(settlements.numTiles))
    .limit(limit);
  return rows.map((r) => r.id);
}
