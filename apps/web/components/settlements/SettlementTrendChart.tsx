/** Minimal single-series SVG line chart. Sparse at launch; fills in over time.
 *  Rendered once per metric (supplies, treasury) since magnitudes differ. */
export function SettlementTrendChart({
  points,
  label,
  color,
}: {
  points: { snapshotAt: Date; value: number }[];
  label: string;
  color: string;
}) {
  const data = points.filter((p) => Number.isFinite(p.value));
  if (data.length < 2) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Not enough history yet — {label.toLowerCase()} history accrues from launch forward.
      </p>
    );
  }
  const W = 640, H = 200, P = 32;
  const vals = data.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = data.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label={`${label} over time`}>
        <polyline fill="none" stroke={color} strokeWidth="2" points={line} />
        <text x={4} y={14} className="fill-current text-[10px]">{max.toLocaleString()}</text>
        <text x={4} y={H - 4} className="fill-current text-[10px]">{min.toLocaleString()}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-3 align-middle" style={{ backgroundColor: color }} /> {label}</span>
      </figcaption>
    </figure>
  );
}
