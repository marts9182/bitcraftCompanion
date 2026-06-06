import { toInt } from "./decode";
import { levelForXp } from "../leaderboards/levels";

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const idStr = (v: unknown): string => (v == null ? "" : String(v));

export interface SkillRow {
  id: number;
  name: string;
  category: string;
  maxLevel: number;
}
export function mapSkillRow(raw: Raw): SkillRow {
  return {
    id: toInt(raw.id)!,
    name: str(raw.name),
    category: str(raw.skill_category),
    maxLevel: toInt(raw.max_level) ?? 0,
  };
}

export interface PlayerSkillRow {
  playerEntityId: string;
  skillId: number;
  region: string;
  xp: number;
  level: number;
}
export function mapExperienceRows(rows: Raw[], region: string, maxLevelBySkill?: Map<number, number>): PlayerSkillRow[] {
  const out: PlayerSkillRow[] = [];
  for (const r of rows) {
    const pid = idStr(r.entity_id);
    const stacks = r.experience_stacks;
    if (!Array.isArray(stacks)) continue;
    for (const s of stacks) {
      let skillId: number | null;
      let xp: number;
      if (Array.isArray(s)) {
        skillId = toInt(s[0]);
        xp = toInt(s[1]) ?? 0;
      } else if (s && typeof s === "object") {
        const o = s as Raw;
        skillId = toInt(o.skill_id);
        xp = toInt(o.quantity) ?? 0;
      } else {
        continue;
      }
      if (skillId == null) continue;
      out.push({ playerEntityId: pid, skillId, region, xp, level: levelForXp(xp, maxLevelBySkill?.get(skillId)) });
    }
  }
  return out;
}

export interface PlayerRow {
  entityId: string;
  region: string;
  username: string;
  timePlayed: number;
  timeSignedIn: number;
  signInTimestamp: number;
  signedIn: boolean;
}
const bool = (v: unknown): boolean => v === true || v === 1 || v === "true";
export function buildPlayerRows(usernameRows: Raw[], stateRows: Raw[], signedInRows: Raw[], region: string): PlayerRow[] {
  const online = new Set(signedInRows.map((r) => idStr(r.entity_id)));
  const state = new Map(stateRows.map((r) => [idStr(r.entity_id), r] as const));
  return usernameRows.map((u) => {
    const id = idStr(u.entity_id);
    const st = state.get(id);
    return {
      entityId: id,
      region,
      username: str(u.username),
      timePlayed: toInt(st?.time_played) ?? 0,
      timeSignedIn: toInt(st?.time_signed_in) ?? 0,
      signInTimestamp: toInt(st?.sign_in_timestamp) ?? 0,
      signedIn: online.has(id),
    };
  });
}

/** entity_id → username map, from the GLOBAL module's player_username_state. */
export function usernamesById(usernameRows: Raw[]): Map<string, string> {
  return new Map(usernameRows.map((u) => [idStr(u.entity_id), str(u.username)] as const));
}

/** Set of currently-online entity ids, from the GLOBAL module's signed_in_player_state. */
export function onlineEntityIds(signedInRows: Raw[]): Set<string> {
  return new Set(signedInRows.map((r) => idStr(r.entity_id)));
}

/**
 * Distinct region ids that currently have players, from the GLOBAL module's
 * user_region_state (`{ identity, region_id }`). Drives dynamic region discovery
 * so the snapshot adapts as game state changes — no hardcoded region list.
 */
export function activeRegionIds(userRegionRows: Raw[]): number[] {
  const ids = new Set<number>();
  for (const r of userRegionRows) {
    const rid = toInt(r.region_id);
    if (rid != null) ids.add(rid);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Build player rows for one region from that region module's player_state
 * (the resident roster, carrying time_played), enriched with the global
 * username map + online set. Players with no global username get a placeholder.
 */
export function buildRegionPlayerRows(
  stateRows: Raw[],
  region: string,
  usernameById: Map<string, string>,
  onlineIds: Set<string>,
): PlayerRow[] {
  return stateRows.map((s) => {
    const id = idStr(s.entity_id);
    return {
      entityId: id,
      region,
      username: usernameById.get(id) ?? `Player ${id}`,
      timePlayed: toInt(s.time_played) ?? 0,
      timeSignedIn: toInt(s.time_signed_in) ?? 0,
      signInTimestamp: toInt(s.sign_in_timestamp) ?? 0,
      signedIn: onlineIds.has(id),
    };
  });
}

export interface EmpireRow {
  entityId: string;
  region: string;
  name: string;
  color?: string | null;
  numClaims: number;
  treasury: number;
  currencyTreasury: number;
  nobilityThreshold: number;
  ownerType: number | null;
  towerCount?: number;
  towerEnergy?: number;
  towerUpkeep?: number;
  foundryCapsules?: number;
  foundryQueued?: number;
  foundryCount?: number;
  leaderPlayerEntityId: string | null;
  memberCount: number;
}
export interface EmpireMemberRow {
  empireEntityId: string;
  playerEntityId: string;
  region: string;
  rank: number;
  noble: boolean;
  donatedShards: number;
  donatedCurrency: number;
}
export function mapEmpireData(empireRows: Raw[], memberRows: Raw[], region: string): { empires: EmpireRow[]; members: EmpireMemberRow[] } {
  const members: EmpireMemberRow[] = memberRows.map((m) => ({
    empireEntityId: idStr(m.empire_entity_id),
    playerEntityId: idStr(m.entity_id),
    region,
    rank: toInt(m.rank) ?? 0,
    noble: bool(m.noble),
    donatedShards: toInt(m.donated_shards) ?? 0,
    donatedCurrency: toInt(m.donated_empire_currency) ?? 0,
  }));
  const byEmpire = new Map<string, EmpireMemberRow[]>();
  for (const m of members) {
    const arr = byEmpire.get(m.empireEntityId) ?? [];
    arr.push(m);
    byEmpire.set(m.empireEntityId, arr);
  }
  const empires: EmpireRow[] = empireRows.map((e) => {
    const id = idStr(e.entity_id);
    const mem = byEmpire.get(id) ?? [];
    const leader = mem.length ? mem.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
    return {
      entityId: id,
      region,
      name: str(e.name),
      numClaims: toInt(e.num_claims) ?? 0,
      treasury: toInt(e.shard_treasury) ?? 0,
      currencyTreasury: toInt(e.empire_currency_treasury) ?? 0,
      nobilityThreshold: toInt(e.nobility_threshold) ?? 0,
      ownerType: toInt(e.owner_type),
      leaderPlayerEntityId: leader?.playerEntityId ?? null,
      memberCount: mem.length,
    };
  });
  return { empires, members };
}

export interface EmpireTowerRow {
  entityId: string;
  empireEntityId: string;
  region: string;
  chunkIndex: string;
  energy: number;
  upkeep: number;
  active: boolean;
}
export interface EmpireTowerAgg { count: number; energy: number; upkeep: number; }
/** Map empire_node_state rows to tower rows + per-empire aggregates (count/energy/upkeep). */
export function mapEmpireNodes(rows: Raw[], region: string): { towers: EmpireTowerRow[]; agg: Map<string, EmpireTowerAgg> } {
  const towers: EmpireTowerRow[] = rows.map((r) => ({
    entityId: idStr(r.entity_id),
    empireEntityId: idStr(r.empire_entity_id),
    region,
    chunkIndex: idStr(r.chunk_index),
    energy: toInt(r.energy) ?? 0,
    upkeep: toInt(r.upkeep) ?? 0,
    active: bool(r.active),
  }));
  const agg = new Map<string, EmpireTowerAgg>();
  for (const t of towers) {
    const a = agg.get(t.empireEntityId) ?? { count: 0, energy: 0, upkeep: 0 };
    a.count += 1; a.energy += t.energy; a.upkeep += t.upkeep;
    agg.set(t.empireEntityId, a);
  }
  return { towers, agg };
}

export interface EmpireFoundryAgg { capsules: number; queued: number; count: number; }
/**
 * Aggregate empire_foundry_state (GLOBAL module) per empire: total Hexite Capsules
 * crafted-and-waiting (`hexite_capsules`), total currently crafting (`queued`), and
 * foundry count. An empire can have several foundries; sum across them.
 */
export function aggregateEmpireFoundries(rows: Raw[]): Map<string, EmpireFoundryAgg> {
  const m = new Map<string, EmpireFoundryAgg>();
  for (const r of rows) {
    const id = idStr(r.empire_entity_id);
    const a = m.get(id) ?? { capsules: 0, queued: 0, count: 0 };
    a.capsules += toInt(r.hexite_capsules) ?? 0;
    a.queued += toInt(r.queued) ?? 0;
    a.count += 1;
    m.set(id, a);
  }
  return m;
}

export const HEXITE_CAPSULE_ITEM_ID = 2000000;
/**
 * Sum Hexite Capsules (item 2000000) sitting collected inside Hexite Reserve
 * buildings, per empire, for ONE region. Inventory rows are owned by reserve
 * buildings; link building→claim (building_state) → empire (empire_settlement_state).
 * Pocket format: [volume, [tag, [itemId, qty, …]], locked] — tag 0 = occupied slot.
 * Caller accumulates the per-region maps across regions (an empire's reserves can
 * span regions).
 */
export function aggregateReserveCapsules(inventory: Raw[], reserves: Raw[], settlements: Raw[]): Map<string, number> {
  const buildingClaim = new Map<string, string>();
  for (const b of reserves) buildingClaim.set(idStr(b.entity_id), idStr(b.claim_entity_id));
  const claimEmpire = new Map<string, string>();
  for (const s of settlements) claimEmpire.set(idStr(s.claim_entity_id), idStr(s.empire_entity_id));
  const out = new Map<string, number>();
  for (const inv of inventory) {
    const empire = claimEmpire.get(buildingClaim.get(idStr(inv.owner_entity_id)) ?? "");
    if (!empire) continue;
    let caps = 0;
    for (const p of (inv.pockets as unknown[]) ?? []) {
      const contents = (p as unknown[])?.[1];
      if (Array.isArray(contents) && contents[0] === 0 && Array.isArray(contents[1]) && Number(contents[1][0]) === HEXITE_CAPSULE_ITEM_ID) {
        caps += Number(contents[1][1]) || 0;
      }
    }
    if (caps) out.set(empire, (out.get(empire) ?? 0) + caps);
  }
  return out;
}

export interface ClaimMemberRow {
  claimEntityId: string;
  playerEntityId: string;
  region: string;
  claimName: string;
  coOwner: boolean;
  officer: boolean;
  build: boolean;
  inventory: boolean;
}
/** Map claim_member_state rows to player↔claim membership rows with permission flags. */
export function mapClaimMembers(rows: Raw[], region: string, claimNameById?: Map<string, string>): ClaimMemberRow[] {
  return rows.map((r) => {
    const claimId = idStr(r.claim_entity_id);
    return {
      claimEntityId: claimId,
      playerEntityId: idStr(r.player_entity_id),
      region,
      claimName: claimNameById?.get(claimId) ?? "",
      coOwner: bool(r.co_owner_permission),
      officer: bool(r.officer_permission),
      build: bool(r.build_permission),
      inventory: bool(r.inventory_permission),
    };
  });
}

export interface ClaimRow {
  entityId: string;
  region: string;
  name: string;
  ownerPlayerEntityId: string | null;
}
export function mapClaimRows(rows: Raw[], region: string): ClaimRow[] {
  return rows.map((c) => {
    const owner = idStr(c.owner_player_entity_id);
    return {
      entityId: idStr(c.entity_id),
      region,
      name: str(c.name),
      ownerPlayerEntityId: owner && owner !== "0" ? owner : null,
    };
  });
}
