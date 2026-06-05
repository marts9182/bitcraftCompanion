export function TierBadge({ tier }: { tier: number | null }) {
  if (tier == null || tier < 0) return null;
  return (
    <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
      Tier {tier}
    </span>
  );
}
