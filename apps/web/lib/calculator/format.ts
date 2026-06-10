/** Format a duration in seconds as "1h 2m", "3m 30s", or "45s". */
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec && !h) parts.push(`${sec}s`);
  return parts.join(" ") || "—";
}
