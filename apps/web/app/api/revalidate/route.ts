import { revalidatePath } from "next/cache";

/**
 * On-demand ISR revalidation. The worker POSTs here after an ingestion run.
 * Guarded by a shared secret in the `x-revalidate-secret` header.
 * Body: { all?: boolean, slugs?: string[] }.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; slugs?: string[] };

  if (body.all) {
    revalidatePath("/items");
    revalidatePath("/items/[slug]", "page");
    return Response.json({ revalidated: "all" });
  }

  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  for (const slug of slugs) revalidatePath(`/items/${slug}`);
  revalidatePath("/items");
  return Response.json({ revalidated: slugs.length });
}
