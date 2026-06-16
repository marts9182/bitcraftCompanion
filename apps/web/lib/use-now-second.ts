"use client";

import { useSyncExternalStore } from "react";

// Per-second "now" ticker as an external store (one shared interval, runs only
// while subscribed). Mirrors use-now-minute.ts but at 1s for live countdowns.
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  nowMs = Date.now();
  timer ??= setInterval(() => {
    nowMs = Date.now();
    listeners.forEach((l) => l());
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Second-granularity "now" on the client; null during SSR/hydration. */
export function useNowSecond(): number | null {
  return useSyncExternalStore<number | null>(subscribe, () => nowMs, () => null);
}
