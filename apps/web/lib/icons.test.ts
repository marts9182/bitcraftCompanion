import { describe, it, expect } from "vitest";
import { buildIconUrl, normalizeIconAsset, monogram } from "./icons";

describe("normalizeIconAsset", () => {
  it("keeps a clean GeneratedIcons path", () => {
    expect(normalizeIconAsset("GeneratedIcons/Items/AncientGear")).toBe("GeneratedIcons/Items/AncientGear");
  });
  it("strips a trailing [params] suffix and adds the prefix when missing", () => {
    expect(normalizeIconAsset("Items/HexCoin[,3,10,500]")).toBe("GeneratedIcons/Items/HexCoin");
  });
  it("takes the segment after the LAST GeneratedIcons/ for nested paths", () => {
    expect(normalizeIconAsset("GeneratedIcons/Other/GeneratedIcons/Items/OutpostResearch")).toBe(
      "GeneratedIcons/Items/OutpostResearch",
    );
  });
  it("returns null for blank input", () => {
    expect(normalizeIconAsset("")).toBeNull();
    expect(normalizeIconAsset(null)).toBeNull();
    expect(normalizeIconAsset("   ")).toBeNull();
  });
});

describe("buildIconUrl", () => {
  const available = new Set(["GeneratedIcons/Items/AncientGear", "GeneratedIcons/Cargo/Log"]);

  it("returns null when base is missing", () => {
    expect(buildIconUrl(undefined, "GeneratedIcons/Items/AncientGear", available)).toBeNull();
  });
  it("returns null when the icon is not in the manifest", () => {
    expect(buildIconUrl("/icons", "GeneratedIcons/Items/DoesNotExist", available)).toBeNull();
  });
  it("builds a .webp url for an available icon (normalizing the asset name)", () => {
    expect(buildIconUrl("/icons", "Items/AncientGear[,1,2]", available)).toBe(
      "/icons/GeneratedIcons/Items/AncientGear.webp",
    );
  });
  it("encodes path segments but keeps slashes; trims trailing slash on base", () => {
    const avail = new Set(["GeneratedIcons/Cargo/Animal Body"]);
    expect(buildIconUrl("https://cdn/icons/", "GeneratedIcons/Cargo/Animal Body", avail)).toBe(
      "https://cdn/icons/GeneratedIcons/Cargo/Animal%20Body.webp",
    );
  });
  it("skips the manifest check when no available set is given", () => {
    expect(buildIconUrl("/icons", "GeneratedIcons/Items/Anything")).toBe("/icons/GeneratedIcons/Items/Anything.webp");
  });
});

describe("monogram", () => {
  it("uses the first letters of the first two words", () => {
    expect(monogram("Ancient Gear")).toBe("AG");
  });
  it("uses up to two letters of a single word", () => {
    expect(monogram("Stone")).toBe("ST");
  });
  it("returns ? for blank input", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });
});
