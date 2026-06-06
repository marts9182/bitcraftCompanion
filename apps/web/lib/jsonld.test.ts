import { describe, it, expect } from "vitest";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  itemJsonLd,
  itemListJsonLd,
  jsonLdScript,
  thingJsonLd,
} from "./jsonld";

describe("articleJsonLd", () => {
  it("builds an Article with author and date", () => {
    expect(
      articleJsonLd({ title: "T", description: "D", date: "2026-06-01", author: "Me" }, "https://x.com/blog/t"),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "T",
      description: "D",
      datePublished: "2026-06-01",
      author: { "@type": "Person", name: "Me" },
      url: "https://x.com/blog/t",
    });
  });
});

describe("jsonld builders", () => {
  it("builds a BreadcrumbList with positions", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: "https://x.com/" },
      { name: "Items", url: "https://x.com/items" },
      { name: "Nail", url: "https://x.com/items/nail" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Nail",
      item: "https://x.com/items/nail",
    });
  });

  it("builds a Thing for an item", () => {
    const ld = itemJsonLd({ name: "Nail", description: "A small nail." }, "https://x.com/items/nail");
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Nail",
      description: "A small nail.",
      url: "https://x.com/items/nail",
    });
  });

  it("omits description when empty", () => {
    const ld = itemJsonLd({ name: "Nail", description: "" }, "https://x.com/items/nail");
    expect(ld.description).toBeUndefined();
  });

  it("builds an ItemList", () => {
    const ld = itemListJsonLd(
      [{ name: "Nail", url: "https://x.com/items/nail" }],
      "https://x.com/items",
    );
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.url).toBe("https://x.com/items");
    expect(ld.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Nail",
      url: "https://x.com/items/nail",
    });
  });
});

describe("jsonLdScript", () => {
  it("escapes < so embedded </script> cannot break out of the tag", () => {
    const out = jsonLdScript({ name: "foo</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("round-trips through JSON.parse unchanged", () => {
    const data = { name: "Iron </script> Ingot", n: 3 };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });
});

describe("thingJsonLd", () => {
  it("builds a Thing with description", () => {
    expect(thingJsonLd("Nail", "A small nail.", "https://x.com/items/nail")).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Nail",
      description: "A small nail.",
      url: "https://x.com/items/nail",
    });
  });

  it("omits description when empty", () => {
    expect(thingJsonLd("Nail", "", "https://x.com/items/nail").description).toBeUndefined();
  });
});
