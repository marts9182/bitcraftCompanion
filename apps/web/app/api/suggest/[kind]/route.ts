import { isSuggestKind, type SuggestPayload } from "@/lib/suggest";
import { getSuggestCatalog } from "@/lib/queries/suggest";

/**
 * Slim suggestion catalog for the TypeaheadSearch inputs:
 * GET /api/suggest/{items|cargo|recipes|resources|creatures}
 * → { v: 1, entries: [{ name, slug, tier }] } — recipe entries also carry an
 * optional `verb` ("Craft", "Bake", …) to disambiguate duplicate output names.
 * DB work is unstable_cache'd per kind (30 min); browsers/CDN may hold the
 * response for 15 min on top.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!isSuggestKind(kind)) {
    return Response.json({ error: "Unknown suggest kind" }, { status: 404 });
  }
  const entries = await getSuggestCatalog(kind);
  const payload: SuggestPayload = { v: 1, entries };
  return Response.json(payload, {
    headers: { "Cache-Control": "public, max-age=900" },
  });
}
