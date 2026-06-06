import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllTags, getPostsByTag } from "@/lib/blog/posts";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const t = decodeURIComponent(tag);
  return { title: `#${t}`, description: `Posts tagged ${t}.`, alternates: { canonical: `/blog/tags/${tag}` } };
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const t = decodeURIComponent(tag);
  const posts = getPostsByTag(t);
  if (posts.length === 0) notFound();
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Blog", url: `${SITE_URL}/blog` },
    { name: `#${t}`, url: `${SITE_URL}/blog/tags/${tag}` },
  ]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>{" "}
        / <span>#{t}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">#{t}</h1>
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
          </li>
        ))}
      </ul>
    </main>
  );
}
