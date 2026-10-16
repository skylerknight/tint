import { describe, expect, it } from "vitest";
import * as tint from "../src/index.js";

describe("public API", () => {
  it("exposes the scaffold surface", () => {
    const expected = [
      "APCA_THRESHOLDS",
      "TAILWIND_UTILITY_PREFIXES",
      "assertConsistentStructure",
      "calcAPCA",
      "calcAPCAabs",
      "calcAPCAraw",
      "detectTailwindConflicts",
      "formatOKLCH",
      "generate",
      "isOKLCHInGamut",
      "maxContrast",
      "meetsContrast",
      "oklchToRGB",
      "oklchToRGBGamut",
      "parseColor",
      "preferredPolarity",
      "rgbToHex",
      "rgbToOKLCH",
      "solveContrast",
      "toCSS",
      "toCSSWithTailwind",
      "toCSSWithTailwindAndTint",
      "toDTCG",
      "toFlatMap",
      "toGamut",
      "toJSON",
      "toTailwind",
      "toTailwindIntelliSense",
      "tryParseColor",
    ];
    expect(Object.keys(tint).sort()).toEqual(expected);
  });

  it("re-exports the v5 engine placeholder", () => {
    expect(tint.generate()).toEqual({ version: 5 });
  });
});
