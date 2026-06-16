import { getRegionEvents, pickNextEvent } from "@/lib/queries/region-events";
import { EventCountdown } from "./EventCountdown";

/** Site-wide banner: soonest Hexite Sealed Vault across temp regions. Renders
 * nothing when there is no upcoming/live event (e.g. after Aug 20). */
export async function EventBanner() {
  const rows = await getRegionEvents();
  // eslint-disable-next-line react-hooks/purity -- per-render timestamp is the intended semantics; no client re-renders here
  const next = pickNextEvent(rows, Date.now());
  if (!next) return null;
  return (
    <EventCountdown
      data={{ region: next.region, endsAtMs: next.endsAt.getTime(), state: next.state, x: next.x, z: next.z }}
    />
  );
}
