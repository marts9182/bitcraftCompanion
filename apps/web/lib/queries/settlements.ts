import "server-only";
import { and, asc, desc, eq, ilike, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { SETTLEMENT_PAGE_SIZE, type SettlementListParams } from "@/lib/settlements/params";

const { settlements, settlementSupplyHistory, claimMembers, players, empires } = schema;

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
  return { rows, total: Number(total) };
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
