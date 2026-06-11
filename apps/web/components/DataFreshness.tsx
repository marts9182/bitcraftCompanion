"use client";

import { useSyncExternalStore } from "react";
import { formatTimeAgo } from "@/lib/format";

// Module-scope minute ticker exposed as an external store: the snapshot is
// stable between ticks (useSyncExternalStore requires a cached snapshot) and
// subscribers re-render once a minute, so the stamp stays honest on pages
// left open. The interval only runs while at least one stamp is mounted.
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    nowMs = Date.now();
    listeners.forEach((l) => l());
  }, 60_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Minute-granularity "now" on the client; null during SSR/hydration. */
function useNowMinute(): number | null {
  return useSyncExternalStore<number | null>(
    subscribe,
    () => nowMs,
    () => null,
  );
}

/**
 * Footer freshness stamp: "Game data updated {relative} ago".
 *
 * Rendering decision (documented per the freshness-stamp design): most pages
 * are ISR-cached (revalidate 1800–86400), so a server-rendered relative
 * string would freeze into the cached HTML and read absurdly stale on
 * long-cached routes. Instead the server footer embeds only the ISO timestamp
 * (unstable_cache, 300 s) and this client component computes the relative
 * display at VIEW time — honest relative to the embedded timestamp, with the
 * absolute local time in the title tooltip. No client fetching: the
 * page-render-time timestamp is the accepted staleness.
 *
 * The relative text is gated on hydration (server snapshot is null) so the
 * server and first client render agree — no hydration mismatch despite the
 * server's "now" and locale differing from the viewer's. Until hydrated (and
 * for crawlers) it renders an ellipsis.
 */
export function DataFreshness({ updatedAtIso }: { updatedAtIso: string | null }) {
  const now = useNowMinute();
  if (!updatedAtIso) return <p>Game data updated —</p>;
  if (now === null) return <p>Game data updated …</p>;
  const then = new Date(updatedAtIso);
  return <p title={then.toLocaleString()}>Game data updated {formatTimeAgo(then.getTime(), now)}</p>;
}
