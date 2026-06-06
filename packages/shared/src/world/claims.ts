// The game's claim_local_state table mixes two very different things under one
// table: real player SETTLEMENTS (plain names, owners, big footprints) and
// LANDMARKS / points-of-interest (ruins, caves, temples) whose names are a
// localization template carrying coordinates. classifyClaim splits them and
// cleans the landmark display name.
//
// Landmark name shapes seen live:
//   "{0} (N: {1}, E: {2})|~Ancient Crumbled Pillar|~6851|~8543"  (template + parts)
//   "Ferralith Cave (N: 6836, E: 4396)"                          (interpolated)
// Settlement names are plain: "Ravenmoor", "Far Horizon".

export type ClaimKind = "settlement" | "landmark";
export interface ClaimClass {
  kind: ClaimKind;
  label: string;
}

const COORD_SUFFIX = /^(.*?)\s*\(N:\s*\d+,\s*E:\s*\d+\)\s*$/;

export function classifyClaim(name: string): ClaimClass {
  if (name.includes("|~")) {
    // "{0} (N: {1}, E: {2})|~Display Name|~North|~East" → the display name is part 1.
    const parts = name.split("|~");
    const label = (parts[1] ?? "").trim();
    return { kind: "landmark", label: label || name };
  }
  const m = COORD_SUFFIX.exec(name);
  if (m) {
    const label = (m[1] ?? "").trim();
    return { kind: "landmark", label: label || name };
  }
  return { kind: "settlement", label: name };
}
