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
  } catch {
    // Transient game/WS failure — do NOT cache; the client simply shows no dots.
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
