// Mappers for the resource/creature finder (Phase A). Live row shapes verified
// 2026-06-10 against bitcraft-live-7 — see docs/superpowers/plans/2026-06-10-resource-finder-map.md.
// Slugs: use slugify/makeUniqueSlug from ingest (catalog consumers call makeUniqueSlug).

import { decodeRarity, toInt } from "../ingest/decode";

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export interface ResourceCatalogRow {
  id: number; name: string; description: string; category: string | null;
  tier: number | null; rarity: string; maxHealth: number | null;
  respawnSeconds: number | null; notRespawning: boolean; compendiumEntry: boolean;
  iconAssetName: string | null; yields: Array<{ itemId: number; qty: number }>;
  raw: unknown;
}

export function mapResourceDescRow(r: Record<string, unknown>): ResourceCatalogRow {
  const yields = Array.isArray(r.on_destroy_yield)
    ? (r.on_destroy_yield as unknown[][])
        .filter((s) => Array.isArray(s) && typeof s[0] === "number")
        .map((s) => ({ itemId: toInt(s[0])!, qty: toInt(s[1]) ?? 1 }))
    : [];
  return {
    id: toInt(r.id)!,
    name: str(r.name).trim(),
    description: str(r.description),
    category: str(r.tag) || null,
    tier: toInt(r.tier),
    rarity: decodeRarity(r.rarity),
    maxHealth: toInt(r.max_health),
    respawnSeconds: toInt(r.scheduled_respawn_time) || null,
    notRespawning: Boolean(r.not_respawning),
    compendiumEntry: Boolean(r.compendium_entry),
    iconAssetName: str(r.icon_asset_name) || null,
    yields,
    raw: r,
  };
}

export interface CreatureCatalogRow {
  enemyType: number; name: string; description: string; tier: number | null;
  rarity: string; huntable: boolean; maxHealth: number | null;
  minDamage: number | null; maxDamage: number | null; armor: number | null;
  accuracy: number | null; evasion: number | null;
  attackLevel: number | null; defenseLevel: number | null; healthRegen: number | null;
  dayDetectRange: number | null; dayAggroRange: number | null;
  nightDetectRange: number | null; nightAggroRange: number | null;
  iconAssetName: string | null; lootStacks: unknown; raw: unknown;
}

export function mapEnemyDescRow(r: Record<string, unknown>): CreatureCatalogRow {
  return {
    enemyType: toInt(r.enemy_type)!,
    name: str(r.name).trim(),
    description: str(r.description),
    tier: toInt(r.tier),
    rarity: decodeRarity(r.rarity),
    huntable: Boolean(r.huntable),
    maxHealth: toInt(r.max_health),
    minDamage: toInt(r.min_damage),
    maxDamage: toInt(r.max_damage),
    armor: toInt(r.armor),
    accuracy: toInt(r.accuracy),
    evasion: toInt(r.evasion),
    attackLevel: toInt(r.attack_level),
    defenseLevel: toInt(r.defense_level),
    healthRegen: toInt(r.health_regen_quantity),
    dayDetectRange: toInt(r.daytime_detect_range),
    dayAggroRange: toInt(r.daytime_aggro_range),
    nightDetectRange: toInt(r.nighttime_detect_range),
    nightAggroRange: toInt(r.nighttime_aggro_range),
    iconAssetName: str(r.icon_address) || null,
    lootStacks: r.extracted_item_stacks ?? [],
    raw: r,
  };
}

/** location_state rows → flat [x,z,…] small-hex ints; overworld (dimension 1) only. */
export function packPositions(rows: Array<{ x: number; z: number; dimension: number }>): number[] {
  const out: number[] = [];
  for (const r of rows) {
    if (r.dimension !== 1) continue;
    out.push(r.x, r.z);
  }
  return out;
}

/** mobile_entity_state rows → { enemyType: [x,z,…] } small-hex ints (location_x/z are milli). */
export function packMobilePositions(
  rows: Array<{ entity_id: string | number; location_x: number; location_z: number; dimension: number }>,
  enemyTypeByEntity: Map<string, number>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    if (r.dimension !== 1) continue;
    const t = enemyTypeByEntity.get(String(r.entity_id));
    if (t === undefined) continue;
    (out[String(t)] ??= []).push(Math.round(r.location_x / 1000), Math.round(r.location_z / 1000));
  }
  return out;
}
