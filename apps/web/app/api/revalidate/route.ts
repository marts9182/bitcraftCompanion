import { revalidatePath } from "next/cache";

/**
 * On-demand ISR revalidation. The worker POSTs here after an ingestion run.
 * Guarded by a shared secret in the `x-revalidate-secret` header.
 * Body: { all?: boolean, slugs?: string[] }.
 * - `all`: revalidate every compendium section (list + detail).
 * - `slugs`: revalidate specific item detail pages (items only, this iteration).
 */
const SECTIONS = ["items", "cargo", "buildings", "recipes"];

// Live-data pages whose content changes only when a snapshot lands. Their
// time-based ISR window is a long fallback; this on-demand flush is what
// keeps them fresh, so it must cover every page that reads snapshot tables.
const LIVE_PATHS = [
  "/",
  "/map",
  "/leaderboards",
  "/leaderboards/activity",
  "/leaderboards/skills",
  "/market",
  "/players",
  "/empires",
  "/settlements",
];
const LIVE_DYNAMIC = [
  "/leaderboards/skills/[skill]",
  "/market/[key]",
  "/players/[id]",
  "/empires/[id]",
  "/settlements/[id]",
];

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; slugs?: string[] };

  if (body.all) {
    revalidatePath("/compendium");
    for (const s of SECTIONS) {
      revalidatePath(`/${s}`);
      revalidatePath(`/${s}/[slug]`, "page");
    }
    for (const p of LIVE_PATHS) revalidatePath(p);
    for (const p of LIVE_DYNAMIC) revalidatePath(p, "page");
    return Response.json({ revalidated: "all" });
  }

  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  for (const slug of slugs) revalidatePath(`/items/${slug}`);
  revalidatePath("/items");
  return Response.json({ revalidated: slugs.length });
}
