import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { listAllItemSlugs } from "@/lib/queries/items";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const slugs = await listAllItemSlugs();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/items`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/items/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
