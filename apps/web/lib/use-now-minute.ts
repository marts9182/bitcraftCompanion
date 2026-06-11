"use client";

import { useSyncExternalStore } from "react";

// Module-scope minute ticker exposed as an external store: the snapshot is
// stable between ticks (useSyncExternalStore requires a cached snapshot) and
// subscribers re-render once a minute, so relative timestamps stay honest on
// pages left open. The interval only runs while at least one subscriber is
// mounted. Shared by DataFreshness and TimeAgo so all relative stamps tick
// off one interval.
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Refresh before (re)starting the ticker: a subscriber arriving after a
  // zero-listener gap must not read a snapshot as stale as that gap.
  nowMs = Date.now();
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
export function useNowMinute(): number | null {
  return useSyncExternalStore<number | null>(
    subscribe,
    () => nowMs,
    () => null,
  );
}
