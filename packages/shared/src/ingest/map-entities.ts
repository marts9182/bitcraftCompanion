import { decodeRarity, toInt } from "./decode";
import type { NewItem } from "../db/schema";

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export function mapItemRow(raw: Raw, slug: string): NewItem {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    tier: toInt(raw.tier),
    rarity: decodeRarity(raw.rarity),
    tag: raw.tag == null ? null : str(raw.tag),
    volume: toInt(raw.volume),
    durability: toInt(raw.durability),
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    compendiumEntry: raw.compendium_entry === undefined ? true : Boolean(raw.compendium_entry),
    raw,
  };
}

export function mapCargoRow(raw: Raw, slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    tier: toInt(raw.tier),
    rarity: decodeRarity(raw.rarity),
    tag: raw.tag == null ? null : str(raw.tag),
    volume: toInt(raw.volume),
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    raw,
  };
}

export function mapBuildingRow(raw: Raw, slug: string) {
  return {
    id: toInt(raw.id)!,
    slug,
    name: str(raw.name),
    description: str(raw.description),
    functions: (raw.functions ?? null) as unknown,
    iconAssetName: raw.icon_asset_name == null ? null : str(raw.icon_asset_name),
    showInCompendium: raw.show_in_compendium === undefined ? true : Boolean(raw.show_in_compendium),
    raw,
  };
}
