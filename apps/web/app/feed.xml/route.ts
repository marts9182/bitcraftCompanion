import { getAllPosts } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** RSS 2.0 feed of blog/guide posts. */
export function GET() {
  const items = getAllPosts()
    .map(
      (p) => `    <item>
      <title>${esc(p.frontmatter.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid>${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.frontmatter.date).toUTCString()}</pubDate>
      <description>${esc(p.frontmatter.description)}</description>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>BitCraft Companion — Blog &amp; Guides</title>
    <link>${SITE_URL}/blog</link>
    <description>Guides, how-tos, and updates for BitCraft Online.</description>
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
