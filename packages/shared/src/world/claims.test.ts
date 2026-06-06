import { describe, it, expect } from "vitest";
import { classifyClaim } from "./claims";

describe("classifyClaim", () => {
  it("classifies a templated landmark and extracts the display name", () => {
    expect(classifyClaim("{0} (N: {1}, E: {2})|~Ancient Crumbled Pillar|~6851|~8543")).toEqual({
      kind: "landmark",
      label: "Ancient Crumbled Pillar",
    });
  });

  it("classifies an interpolated landmark and strips the coord suffix", () => {
    expect(classifyClaim("Ferralith Cave (N: 6836, E: 4396)")).toEqual({
      kind: "landmark",
      label: "Ferralith Cave",
    });
  });

  it("classifies a plain name as a settlement", () => {
    expect(classifyClaim("Ravenmoor")).toEqual({ kind: "settlement", label: "Ravenmoor" });
    expect(classifyClaim("Far Horizon")).toEqual({ kind: "settlement", label: "Far Horizon" });
  });

  it("falls back to the raw name if the template has no display part", () => {
    expect(classifyClaim("|~").label).toBe("|~");
  });
});
