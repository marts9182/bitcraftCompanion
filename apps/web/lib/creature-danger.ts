/**
 * Plain-language danger hint for a creature detail page, derived from its
 * combat levels. The effective combat level is the higher of attack/defense
 * (either may be missing on partial data); null when neither is recorded —
 * callers render nothing rather than guessing from health alone.
 */
export function dangerHint(c: { attackLevel: number | null; defenseLevel: number | null }): string | null {
  const levels = [c.attackLevel, c.defenseLevel].filter((l): l is number => l != null);
  if (levels.length === 0) return null;
  const combat = Math.max(...levels);
  return `Combat level ${combat} — bring gear around level ${combat} or higher.`;
}
