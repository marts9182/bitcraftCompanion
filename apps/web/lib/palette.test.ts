import { describe, it, expect } from "vitest";
import {
  buildPaletteResults,
  PALETTE_PAGES,
  PALETTE_PAGE_CAP,
  PALETTE_KIND_CAP,
  PALETTE_KIND_LABEL,
  type PaletteCatalogs,
} from "./palette";
import type { SuggestEntry } from "./suggest";

const e = (name: string, tier: number | null = null, verb?: string): SuggestEntry => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  tier,
  ...(verb ? { verb } : {}),
});

const pages = [
  { href: "/map", label: "Map" },
  { href: "/market", label: "Market" },
  { href: "/market/deals", label: "Market deals" },
  { href: "/calculator", label: "Calculator" },
];

const catalogs: PaletteCatalogs = {
  items: [e("Iron Axe", 3), e("Iron Ingot", 3), e("Map Fragment", 1)],
  cargo: [e("Iron Ore Cargo", 2)],
  recipes: [e("Iron Ingot", 3, "Smelt")],
  resources: [e("Iron Vein", 3)],
  creatures: [e("Iron Golem", 5)],
};

describe("buildPaletteResults", () => {
  it("returns the full page list in browse mode (empty / whitespace query)", () => {
    for (const q of ["", "   "]) {
      const res = buildPaletteResults(q, catalogs, pages);
      expect(res.map((r) => r.href)).toEqual(["/map", "/market", "/market/deals", "/calculator"]);
      expect(res.every((r) => r.kind === "page")).toBe(true);
    }
  });

  it("filters pages from a single character (prefix before mid-string), catalogs stay silent", () => {
    const res = buildPaletteResults("m", catalogs, pages);
    expect(res.map((r) => r.label)).toEqual(["Map", "Market", "Market deals"]);
    expect(res.every((r) => r.kind === "page")).toBe(true);
  });

  it("merges pages first, then catalog kinds in canonical order, at >= 2 chars", () => {
    const res = buildPaletteResults("iron", catalogs, pages);
    expect(res.map((r) => [r.kind, r.label])).toEqual([
      ["items", "Iron Axe"],
      ["items", "Iron Ingot"],
      ["cargo", "Iron Ore Cargo"],
      ["recipes", "Iron Ingot"],
      ["resources", "Iron Vein"],
      ["creatures", "Iron Golem"],
    ]);
  });

  it("pages rank ahead of catalog hits and build hrefs from kind + slug", () => {
    const res = buildPaletteResults("map", catalogs, pages);
    expect(res[0]).toMatchObject({ kind: "page", label: "Map", href: "/map" });
    expect(res[1]).toMatchObject({ kind: "items", label: "Map Fragment", href: "/items/map-fragment" });
  });

  it("carries tier and verb through to results", () => {
    const res = buildPaletteResults("iron ingot", catalogs, pages);
    const recipe = res.find((r) => r.kind === "recipes");
    expect(recipe).toMatchObject({ label: "Iron Ingot", tier: 3, verb: "Smelt", href: "/recipes/iron-ingot" });
    const item = res.find((r) => r.kind === "items");
    expect(item).toMatchObject({ tier: 3 });
    expect(item?.verb).toBeUndefined();
  });

  it("skips catalogs that have not loaded yet", () => {
    const res = buildPaletteResults("iron", { items: catalogs.items }, pages);
    expect(res.map((r) => r.kind)).toEqual(["items", "items"]);
  });

  it("caps pages and each catalog kind independently", () => {
    const manyPages = Array.from({ length: 20 }, (_, i) => ({
      href: `/p${i}`,
      label: `Iron Page ${String(i).padStart(2, "0")}`,
    }));
    const manyItems: PaletteCatalogs = {
      items: Array.from({ length: 20 }, (_, i) => e(`Iron Thing ${String(i).padStart(2, "0")}`, 1)),
    };
    const res = buildPaletteResults("iron", manyItems, manyPages);
    expect(res.filter((r) => r.kind === "page")).toHaveLength(PALETTE_PAGE_CAP);
    expect(res.filter((r) => r.kind === "items")).toHaveLength(PALETTE_KIND_CAP);
  });

  it("returns nothing when nothing matches", () => {
    expect(buildPaletteResults("zzzznope", catalogs, pages)).toEqual([]);
  });
});

describe("PALETTE_PAGES", () => {
  it("derives from the header nav plus palette-only extras, deduped", () => {
    const hrefs = PALETTE_PAGES.map((p) => p.href);
    // Extras not present in the header nav.
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/market/guide");
    // Canonical nav sections come straight from nav-items.
    for (const h of ["/map", "/market", "/market/deals", "/calculator", "/items", "/recipes", "/settlements", "/empires", "/players", "/leaderboards", "/blog"]) {
      expect(hrefs).toContain(h);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("disambiguates the group 'Overview' entry", () => {
    const compendium = PALETTE_PAGES.find((p) => p.href === "/compendium");
    expect(compendium?.label).toBe("Compendium overview");
  });
});

describe("PALETTE_KIND_LABEL", () => {
  it("has a badge label for every palette kind", () => {
    expect(PALETTE_KIND_LABEL).toEqual({
      page: "Page",
      items: "Item",
      cargo: "Cargo",
      recipes: "Recipe",
      resources: "Resource",
      creatures: "Creature",
    });
  });
});
