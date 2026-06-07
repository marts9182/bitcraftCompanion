import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import { getPost, getAllSlugs } from "@/lib/blog/posts";
import { mdxComponents } from "@/components/blog/mdx-components";
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  const { title, description } = post.meta.frontmatter;
  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title, description, type: "article", url: `${SITE_URL}/blog/${slug}` },
  };
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content } = await compileMDX({ source: post.body, components: mdxComponents });
  const fm = post.meta.frontmatter;
  const url = `${SITE_URL}/blog/${slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", url: `${SITE_URL}/` },
      { name: "Blog", url: `${SITE_URL}/blog` },
      { name: fm.title, url },
    ]),
    articleJsonLd({ title: fm.title, description: fm.description, date: fm.date, author: fm.author }, url),
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="text-sm text-muted-foreground">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>{" "}
        / <span>{fm.title}</span>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{fm.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {fmtDate(fm.date)} · {post.meta.readingTime} min read · {fm.author}
      </p>
      <article className="prose dark:prose-invert mt-6 max-w-none">{content}</article>
    </main>
  );
}
