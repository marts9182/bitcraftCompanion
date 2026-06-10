// Mappers for the resource/creature finder (Phase A). Live row shapes verified
// 2026-06-10 against bitcraft-live-7 — see docs/superpowers/plans/2026-06-10-resource-finder-map.md.

export const RARITY_NAMES = ["Default", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"] as const;

/** Tagged enums arrive as [variantIndex, {}] over the v1.json subprotocol. */
export function decodeRarity(v: unknown): string {
  if (Array.isArray(v) && typeof v[0] === "number") return RARITY_NAMES[v[0]] ?? "Default";
  return "Default";
}

export function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Suffix repeated slugs -2, -3, … preserving input order (live data has trailing-space dupes). */
export function dedupeSlugs(slugs: string[]): string[] {
  const seen = new Map<string, number>();
  return slugs.map((s) => {
    const n = (seen.get(s) ?? 0) + 1;
    seen.set(s, n);
    return n === 1 ? s : `${s}-${n}`;
  });
}

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
        .map((s) => ({ itemId: s[0] as number, qty: (s[1] as number) ?? 1 }))
    : [];
  return {
    id: r.id as number,
    name: String(r.name ?? "").trim(),
    description: String(r.description ?? ""),
    category: (r.tag as string) || null,
    tier: (r.tier as number) ?? null,
    rarity: decodeRarity(r.rarity),
    maxHealth: (r.max_health as number) ?? null,
    respawnSeconds: (r.scheduled_respawn_time as number) || null,
    notRespawning: Boolean(r.not_respawning),
    compendiumEntry: Boolean(r.compendium_entry),
    iconAssetName: (r.icon_asset_name as string) || null,
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
    enemyType: r.enemy_type as number,
    name: String(r.name ?? "").trim(),
    description: String(r.description ?? ""),
    tier: (r.tier as number) ?? null,
    rarity: decodeRarity(r.rarity),
    huntable: Boolean(r.huntable),
    maxHealth: (r.max_health as number) ?? null,
    minDamage: (r.min_damage as number) ?? null,
    maxDamage: (r.max_damage as number) ?? null,
    armor: (r.armor as number) ?? null,
    accuracy: (r.accuracy as number) ?? null,
    evasion: (r.evasion as number) ?? null,
    attackLevel: (r.attack_level as number) ?? null,
    defenseLevel: (r.defense_level as number) ?? null,
    healthRegen: (r.health_regen_quantity as number) ?? null,
    dayDetectRange: (r.daytime_detect_range as number) ?? null,
    dayAggroRange: (r.daytime_aggro_range as number) ?? null,
    nightDetectRange: (r.nighttime_detect_range as number) ?? null,
    nightAggroRange: (r.nighttime_aggro_range as number) ?? null,
    iconAssetName: (r.icon_address as string) || null,
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
