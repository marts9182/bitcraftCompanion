import { describe, it, expect } from "vitest";
import { breadcrumbJsonLd, itemJsonLd, itemListJsonLd } from "./jsonld";

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
