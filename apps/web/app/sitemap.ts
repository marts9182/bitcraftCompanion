import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { listAllItemSlugs } from "@/lib/queries/items";
import { listAllCargoSlugs } from "@/lib/queries/cargo";
import { listAllBuildingSlugs } from "@/lib/queries/buildings";
import { listAllRecipeSlugs } from "@/lib/queries/recipes";
import { listAllResourceSlugs } from "@/lib/queries/resources";
import { listAllCreatureSlugs } from "@/lib/queries/creatures";
import { getAllSlugs as getAllPostSlugs, getAllTags } from "@/lib/blog/posts";
import { listCraftableTargets } from "@/lib/queries/calculator-graph";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [items, cargo, buildings, recipes, resources, creatures, craftable] = await Promise.all([
    listAllItemSlugs(),
    listAllCargoSlugs(),
    listAllBuildingSlugs(),
    listAllRecipeSlugs(),
    listAllResourceSlugs(),
    listAllCreatureSlugs(),
    listCraftableTargets(),
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
    { url: `${SITE_URL}/resources`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/creatures`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/calculator`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/leaderboards`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/leaderboards/skills`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/leaderboards/empires`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/leaderboards/activity`, lastModified: now, changeFrequency: "hourly", priority: 0.6 },
    { url: `${SITE_URL}/map`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/empires`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/players`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...detail("items", items),
    ...detail("cargo", cargo),
    ...detail("buildings", buildings),
    ...detail("recipes", recipes),
    ...detail("resources", resources),
    ...detail("creatures", creatures),
    ...craftable.map((t) => ({
      url: `${SITE_URL}/calculator/${t.refType}/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
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
