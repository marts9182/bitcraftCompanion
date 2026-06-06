export interface RevalidateConfig {
  url?: string;
  secret?: string;
}

/**
 * Notify the web app to revalidate all compendium pages after an ingestion run.
 * No-op when url/secret are not configured. Never throws — a revalidation
 * failure must not fail the snapshot.
 */
export async function triggerRevalidate(
  config: RevalidateConfig,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!config.url || !config.secret) {
    console.log("[snapshot] revalidate skipped (REVALIDATE_URL/REVALIDATE_SECRET not set)");
    return;
  }
  try {
    const res = await fetchFn(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": config.secret },
      body: JSON.stringify({ all: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) console.log("[snapshot] revalidate triggered");
    else console.warn(`[snapshot] revalidate failed: HTTP ${res.status}`);
  } catch (err) {
    console.warn("[snapshot] revalidate error (non-fatal):", err instanceof Error ? err.message : err);
  }
}
