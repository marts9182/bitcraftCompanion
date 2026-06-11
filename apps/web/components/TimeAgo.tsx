"use client";

import { formatTimeAgo } from "@/lib/format";
import { useNowMinute } from "@/lib/use-now-minute";

/**
 * Relative timestamp computed at VIEW time — same rationale as DataFreshness:
 * most pages are ISR-cached, so a server-rendered relative string would freeze
 * into the cached HTML and read stale. The text is gated on hydration (server
 * snapshot is null) so SSR and the first client render agree — until hydrated
 * (and for crawlers) it renders an ellipsis. The absolute time in the title
 * tooltip is computed client-side in the viewer's locale.
 */
export function TimeAgo({ at }: { at: Date }) {
  const now = useNowMinute();
  if (now === null) return <span>…</span>;
  return <span title={at.toLocaleString()}>{formatTimeAgo(at.getTime(), now)}</span>;
}
