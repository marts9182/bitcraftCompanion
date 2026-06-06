/**
 * Discover deployed region modules by probing the SpacetimeDB HTTP schema
 * endpoint. This is a READ-ONLY schema HEAD request (no auth, no SQL, no
 * WebSocket, no reducer) — it cannot affect the live game. A `bitcraft-live-{i}`
 * module is "present" when its schema responds 2xx.
 *
 * Returns the module names (`bitcraft-live-${i}`) for i in 1..maxRegion that
 * responded ok. There is no region-0 grid, so we start at 1. Probes run
 * concurrently (cheap no-auth HEADs); individual failures are treated as absent.
 */
export async function discoverRegionModules(httpBase: string, maxRegion = 40): Promise<string[]> {
  const base = httpBase.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
  const probes = Array.from({ length: maxRegion }, (_, k) => k + 1).map(async (i) => {
    const module = `bitcraft-live-${i}`;
    try {
      const res = await fetch(`${base}/v1/database/${module}/schema?version=9`, { method: "HEAD" });
      return res.ok ? module : null;
    } catch {
      return null;
    }
  });
  const results = await Promise.all(probes);
  return results.filter((m): m is string => m != null);
}
