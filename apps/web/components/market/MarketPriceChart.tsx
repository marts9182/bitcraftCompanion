import type { PricePoint } from "@/lib/queries/market";

/** Minimal lowest-ask / highest-bid line chart. Sparse at launch; fills in over time. */
export function MarketPriceChart({ points }: { points: PricePoint[] }) {
  const data = points.filter((p) => p.lowestAsk != null || p.highestBid != null);
  if (data.length < 2) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Not enough history yet — price history accrues from launch forward.
      </p>
    );
  }
  const W = 640, H = 200, P = 32;
  const vals = data.flatMap((p) => [p.lowestAsk, p.highestBid].filter((v): v is number => v != null));
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = (key: "lowestAsk" | "highestBid") =>
    data.map((p, i) => (p[key] == null ? null : `${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`)).filter(Boolean).join(" ");

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label="Price history (lowest ask and highest bid over time)">
        <polyline fill="none" stroke="#D5BB72" strokeWidth="2" points={line("lowestAsk")} />
        <polyline fill="none" stroke="#747184" strokeWidth="2" points={line("highestBid")} />
        <text x={4} y={14} className="fill-current text-[10px]">{max.toLocaleString()}</text>
        <text x={4} y={H - 4} className="fill-current text-[10px]">{min.toLocaleString()}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#D5BB72" }} /> Lowest ask</span>
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: "#747184" }} /> Highest bid</span>
      </figcaption>
    </figure>
  );
}
