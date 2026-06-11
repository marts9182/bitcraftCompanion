"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns false on the server (and during hydration's first render) and true
 * on the client thereafter. Replaces the `useEffect(() => setMounted(true), [])`
 * pattern without the setState-in-effect re-render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
