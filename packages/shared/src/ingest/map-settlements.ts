import { toInt } from "./decode";
import { decodeLocationSum } from "../world/coords";
import { classifyClaim } from "../world/claims";

type Raw = Record<string, unknown>;
const idStr = (v: unknown): string => (v == null ? "" : String(v));
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === "true";

export interface SettlementRow {
  entityId: string;
  region: string;
  name: string;
  ownerPlayerEntityId: string | null;
  empireEntityId: string | null;
  x: number;
  z: number;
  dimension: number;
  numTiles: number;
  numTileNeighbors: number;
  supplies: number;
  suppliesPurchaseThreshold: number;
  suppliesPurchasePrice: number;
  treasury: number;
  xpSinceMinting: number;
  canHouseStorehouse: boolean;
  membersDonations: number;
  memberCount: number;
}

/**
 * Join the per-region claim tables into settlement rows (player claims only).
 * Landmarks/ruins are dropped via classifyClaim. Settlements present in
 * claim_state but missing claim_local_state are kept with zeroed economy/location.
 */
export function mapSettlements(
  claimStateRows: Raw[],
  claimLocalRows: Raw[],
  settlementStateRows: Raw[],
  memberRows: Raw[],
  region: string,
): SettlementRow[] {
  const localByClaim = new Map<string, Raw>();
  for (const r of claimLocalRows) localByClaim.set(idStr(r.entity_id), r);

  const settlementByClaim = new Map<string, Raw>();
  for (const r of settlementStateRows) settlementByClaim.set(idStr(r.claim_entity_id), r);

  const memberCountByClaim = new Map<string, number>();
  for (const r of memberRows) {
    const cid = idStr(r.claim_entity_id);
    memberCountByClaim.set(cid, (memberCountByClaim.get(cid) ?? 0) + 1);
  }

  const out: SettlementRow[] = [];
  for (const c of claimStateRows) {
    const name = str(c.name);
    if (classifyClaim(name).kind !== "settlement") continue;
    const id = idStr(c.entity_id);
    const local = localByClaim.get(id);
    const loc = local ? decodeLocationSum(local.location) : null;
    const settlement = settlementByClaim.get(id);
    const owner = idStr(c.owner_player_entity_id);
    const empire = settlement ? idStr(settlement.empire_entity_id) : "";
    out.push({
      entityId: id,
      region,
      name,
      ownerPlayerEntityId: owner && owner !== "0" ? owner : null,
      empireEntityId: empire && empire !== "0" ? empire : null,
      x: loc?.x ?? 0,
      z: loc?.z ?? 0,
      dimension: loc?.dimension ?? 0,
      numTiles: toInt(local?.num_tiles) ?? 0,
      numTileNeighbors: toInt(local?.num_tile_neighbors) ?? 0,
      supplies: toInt(local?.supplies) ?? 0,
      suppliesPurchaseThreshold: toInt(local?.supplies_purchase_threshold) ?? 0,
      suppliesPurchasePrice: toInt(local?.supplies_purchase_price) ?? 0,
      treasury: toInt(local?.treasury) ?? 0,
      xpSinceMinting: toInt(local?.xp_gained_since_last_coin_minting) ?? 0,
      canHouseStorehouse: settlement ? bool(settlement.can_house_empire_storehouse) : false,
      membersDonations: toInt(settlement?.members_donations) ?? 0,
      memberCount: memberCountByClaim.get(id) ?? 0,
    });
  }
  return out;
}
