// Site-wide display formatting helpers.

/**
 * Game-format claim coordinates, e.g. "N8618, E8710" — the convention the game
 * itself displays. Entity locations (claim_local_state etc.) are SMALL-HEX
 * units; the game shows large-tile coords, exactly 3 small hexes per tile:
 * N = floor(z / 3), E = floor(x / 3).
 *
 * Verified against live claims (bitjita.com/claims/{id}) in regions 9, 18, 19:
 *   Stormhollow    (26130, 25854) → N 8618, E 8710
 *   Blackfen       (27654, 10764) → N 3588, E 9218
 *   Istanbullfrog  (22859, 26533) → N 8844, E 7619  (x/3 = 7619.67 ⇒ floor, not round)
 */
export function formatGameCoords(x: number, z: number): string {
  return `N${Math.floor(z / 3)}, E${Math.floor(x / 3)}`;
}

/**
 * Relative "time ago" phrase for freshness stamps: "just now", "23m ago",
 * "1h 2m ago", "3d ago". Future timestamps (clock skew between the server
 * that wrote the row and the viewer's clock) read as "just now". `nowMs` is
 * injected so callers compute against a known instant (and tests are pure).
 */
export function formatTimeAgo(thenMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - thenMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

/** "4:23:17" or "1d 1:01:05"; clamps negative to "0:00:00". */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hms = `${h}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}
