import { describe, it, expect } from "vitest";
import { recipeVerb } from "./recipes";

describe("recipeVerb", () => {
  it("takes the text before the first placeholder", () => {
    expect(recipeVerb("Craft {0}")).toBe("Craft");
    expect(recipeVerb("Recraft {1}")).toBe("Recraft");
    expect(recipeVerb("Forge {0}")).toBe("Forge");
    expect(recipeVerb("Package {1} into {0}")).toBe("Package");
    expect(recipeVerb("Braid {0} from {1}")).toBe("Braid");
  });

  it("falls back to the trimmed whole string when there is no placeholder", () => {
    expect(recipeVerb("Smelt")).toBe("Smelt");
    expect(recipeVerb("  Mix  ")).toBe("Mix");
  });

  it("falls back to the trimmed template when the placeholder is first", () => {
    expect(recipeVerb("{0} Assembly")).toBe("{0} Assembly");
  });
});
