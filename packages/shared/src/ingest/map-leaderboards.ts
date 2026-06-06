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
  signedIn: boolean;
}
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
      signedIn: online.has(id),
    };
  });
}

export interface EmpireRow {
  entityId: string;
  region: string;
  name: string;
  numClaims: number;
  treasury: number;
  leaderPlayerEntityId: string | null;
  memberCount: number;
}
export interface EmpireMemberRow {
  empireEntityId: string;
  playerEntityId: string;
  region: string;
  rank: number;
}
export function mapEmpireData(empireRows: Raw[], memberRows: Raw[], region: string): { empires: EmpireRow[]; members: EmpireMemberRow[] } {
  const members: EmpireMemberRow[] = memberRows.map((m) => ({
    empireEntityId: idStr(m.empire_entity_id),
    playerEntityId: idStr(m.entity_id),
    region,
    rank: toInt(m.rank) ?? 0,
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
      leaderPlayerEntityId: leader?.playerEntityId ?? null,
      memberCount: mem.length,
    };
  });
  return { empires, members };
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
