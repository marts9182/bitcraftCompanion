"use client";

import Link from "next/link";
import { useState } from "react";
import { useNowSecond } from "@/lib/use-now-second";
import { useHydrated } from "@/lib/use-hydrated";
import { formatCountdown, formatGameCoords } from "@/lib/format";

export interface EventBannerData {
  region: string;
  endsAtMs: number;
  state: "upcoming" | "live";
  x: number | null;
  z: number | null;
}

export function EventCountdown({ data }: { data: EventBannerData }) {
  const hydrated = useHydrated();
  const nowMs = useNowSecond() ?? data.endsAtMs;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const key = `evt-dismiss-${data.region}-${data.endsAtMs}`;
  const dismissed = hydrated && (dismissedKey === key || (typeof localStorage !== "undefined" && localStorage.getItem(key) === "1"));
  if (dismissed) return null;

  const coords = data.x != null && data.z != null ? formatGameCoords(data.x, data.z) : null;
  const mapHref = coords
    ? `/map?regions=${data.region}&ev=${data.x},${data.z}`
    : `/map?regions=${data.region}`;

  const remaining = data.endsAtMs - nowMs;
  const label = data.state === "live" || remaining <= 0
    ? `Happening now in Region ${data.region}`
    : `Next Hexite Vault · Region ${data.region} · in ${formatCountdown(remaining)}`;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-border bg-primary/10 px-4 py-1.5 text-sm">
      <span aria-hidden>⚡</span>
      <span className="font-medium">{label}</span>
      <Link href={mapHref} className="underline underline-offset-2 hover:text-primary">
        📍 {coords ? `${coords} · ` : ""}View on map
      </Link>
      <button
        type="button"
        aria-label="Dismiss event banner"
        className="ml-2 text-muted-foreground hover:text-foreground"
        onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setDismissedKey(key); }}
      >
        ✕
      </button>
    </div>
  );
}
