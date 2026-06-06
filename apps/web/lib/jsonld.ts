export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function itemJsonLd(item: { name: string; description: string }, url: string) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: item.name,
    url,
  };
  if (item.description) ld.description = item.description;
  return ld;
}

export function itemListJsonLd(items: Crumb[], listUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: listUrl,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

/** Serialize data as JSON safe to embed inside an inline <script> tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Generic schema.org Thing for any compendium entity detail page. */
export function thingJsonLd(name: string, description: string, url: string) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name,
    url,
  };
  if (description) ld.description = description;
  return ld;
}

/** schema.org Article for a blog/guide post. */
export function articleJsonLd(
  a: { title: string; description: string; date: string; author: string },
  url: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.date,
    author: { "@type": "Person", name: a.author },
    url,
  };
}
