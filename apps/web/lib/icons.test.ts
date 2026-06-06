import { describe, it, expect } from "vitest";
import { buildIconUrl, monogram } from "./icons";

describe("buildIconUrl", () => {
  it("returns null when base is missing", () => {
    expect(buildIconUrl(undefined, "GeneratedIcons/Items/AncientGear")).toBeNull();
    expect(buildIconUrl("", "GeneratedIcons/Items/AncientGear")).toBeNull();
  });

  it("returns null when assetName is missing", () => {
    expect(buildIconUrl("https://cdn/icons", null)).toBeNull();
    expect(buildIconUrl("https://cdn/icons", "")).toBeNull();
  });

  it("builds a .webp url, trimming trailing slash and encoding segments but keeping slashes", () => {
    expect(buildIconUrl("https://cdn/icons/", "GeneratedIcons/Items/Ancient Gear")).toBe(
      "https://cdn/icons/GeneratedIcons/Items/Ancient%20Gear.webp",
    );
  });

  it("supports a relative base (public dir)", () => {
    expect(buildIconUrl("/icons", "GeneratedIcons/Cargo/Log")).toBe("/icons/GeneratedIcons/Cargo/Log.webp");
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
