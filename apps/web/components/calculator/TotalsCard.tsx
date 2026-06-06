import { formatDuration } from "@/lib/calculator/format";
import type { CalcTotals } from "@/lib/calculator/types";

export function TotalsCard({ totals }: { totals: CalcTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-md border border-border p-4 text-sm">
      <div>
        <dt className="text-muted-foreground">Total time</dt>
        <dd className="text-lg font-semibold">{formatDuration(totals.timeRequirement)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Total stamina</dt>
        <dd className="text-lg font-semibold">{totals.staminaRequirement ? Math.round(totals.staminaRequirement) : "—"}</dd>
      </div>
    </dl>
  );
}
