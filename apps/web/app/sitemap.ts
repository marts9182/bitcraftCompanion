import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { listAllItemSlugs } from "@/lib/queries/items";
import { listAllCargoSlugs } from "@/lib/queries/cargo";
import { listAllBuildingSlugs } from "@/lib/queries/buildings";
import { listAllRecipeSlugs } from "@/lib/queries/recipes";
import { getAllSlugs as getAllPostSlugs, getAllTags } from "@/lib/blog/posts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [items, cargo, buildings, recipes] = await Promise.all([
    listAllItemSlugs(),
    listAllCargoSlugs(),
    listAllBuildingSlugs(),
    listAllRecipeSlugs(),
  ]);
  const postSlugs = getAllPostSlugs();
  const tags = getAllTags();

  const detail = (section: string, slugs: string[]) =>
    slugs.map((slug) => ({
      url: `${SITE_URL}/${section}/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/compendium`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/items`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/cargo`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/buildings`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/recipes`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...detail("items", items),
    ...detail("cargo", cargo),
    ...detail("buildings", buildings),
    ...detail("recipes", recipes),
    ...postSlugs.map((slug) => ({
      url: `${SITE_URL}/blog/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...tags.map((tag) => ({
      url: `${SITE_URL}/blog/tags/${encodeURIComponent(tag)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
