import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** llms.txt — a concise, machine-readable site guide for AI answer engines (AEO). */
export function GET() {
  const body = `# BitCraft Companion
> A fast, comprehensive companion for BitCraft Online: a searchable compendium of items, cargo, buildings, and crafting/construction recipes, with their relationships.

## Compendium
- Hub: ${SITE_URL}/compendium
- Items: ${SITE_URL}/items
- Cargo: ${SITE_URL}/cargo
- Buildings: ${SITE_URL}/buildings
- Recipes: ${SITE_URL}/recipes
- Calculator: ${SITE_URL}/calculator

## Blog & Guides
- Blog: ${SITE_URL}/blog
- RSS: ${SITE_URL}/feed.xml

## Notes
- Every item, cargo, building, and recipe has its own page with details and crafting relationships (made-by / used-in, inputs / outputs).
- Data is sourced from BitCraft's SpacetimeDB descriptor tables and refreshed on game patches.
- Full URL list: ${SITE_URL}/sitemap.xml
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
