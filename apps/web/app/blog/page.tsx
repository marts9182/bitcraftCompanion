import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog/posts";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog & Guides",
  description: "Guides, how-tos, and updates for BitCraft Online.",
  alternates: { canonical: "/blog" },
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogIndex() {
  const posts = getAllPosts();
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Blog", url: `${SITE_URL}/blog` },
    ]),
    itemListJsonLd(
      posts.map((p) => ({ name: p.frontmatter.title, url: `${SITE_URL}/blog/${p.slug}` })),
      `${SITE_URL}/blog`,
    ),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <h1 className="text-3xl font-bold tracking-tight">Blog &amp; Guides</h1>
      <p className="mt-2 text-muted-foreground">Guides, how-tos, and updates.</p>
      {posts.length === 0 && <p className="mt-8 text-muted-foreground">No posts yet.</p>}
      <ul className="mt-8 space-y-6">
        {posts.map((p) => (
          <li key={p.slug} className="border-b border-border/50 pb-6">
            <Link href={`/blog/${p.slug}`} className="text-xl font-semibold hover:underline">
              {p.frontmatter.title}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtDate(p.frontmatter.date)} · {p.readingTime} min read
            </p>
            <p className="mt-2 text-muted-foreground">{p.frontmatter.description}</p>
            {p.frontmatter.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {p.frontmatter.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/blog/tags/${encodeURIComponent(t)}`}
                    className="rounded border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
