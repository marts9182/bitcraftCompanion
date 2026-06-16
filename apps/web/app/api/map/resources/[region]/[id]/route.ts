import { NextResponse } from "next/server";
import { parseParams } from "@/lib/map/region-params";
import { getResourcePoints } from "@/lib/map/resource-points-service";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ region: string; id: string }> },
) {
  const { region, id } = await ctx.params;
  const parsed = parseParams(region, id);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid region or id" }, { status: 400 });
  }
  try {
    const data = await getResourcePoints(parsed.region, parsed.id);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (err) {
    // Log so a real bug (e.g. SpacetimeDB schema drift) is distinguishable from a
    // transient WS blip. Send no-store so a future CDN rule can never cache the 502.
    console.error(`[map/resources] r${parsed.region} id${parsed.id} upstream error:`, err);
    return NextResponse.json(
      { error: "upstream unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
