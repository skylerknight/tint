import { describe, expect, it } from "vitest";
import * as tint from "../src/index.js";

describe("public API", () => {
  it("exposes the documented surface", () => {
    const expected = [
      "APCA_THRESHOLDS",
      "COLOR_FORMATS",
      "ConfigError",
      "DEFAULT_CONFIG_FILES",
      "OUTPUT_FORMATS",
      "TAILWIND_UTILITY_PREFIXES",
      "assertConfig",
      "assertConsistentStructure",
      "audit",
      "border",
      "calcAPCA",
      "calcAPCAabs",
      "calcAPCAraw",
      "defineConfig",
      "disabled",
      "emphasis",
      "findDefaultConfig",
      "formatAuditTable",
      "formatColor",
      "formatConfigIssues",
      "formatOKLCH",
      "generate",
      "isOKLCHInGamut",
      "loadConfig",
      "maxContrast",
      "mediaQueryFor",
      "meetsContrast",
      "oklchToRGB",
      "oklchToRGBGamut",
      "parseColor",
      "preferredPolarity",
      "resolveConfig",
      "rgbToHex",
      "rgbToOKLCH",
      "solveContrast",
      "surface",
      "text",
      "toCSS",
      "toCSSWithTailwind",
      "toDTCG",
      "toDTCGJSON",
      "toFlat",
      "toFlatJSON",
      "toGamut",
      "toTailwind",
      "tryParseColor",
      "validateConfig",
    ];
    expect(Object.keys(tint).sort()).toEqual(expected);
  });

  it("does not re-export the v3 config API", () => {
    const removed = [
      "LC_SHORTCUTS",
      "PURE",
      "TOKEN_ROLES",
      "V4_SCAFFOLD",
      "parseOn",
      "toCSSWithTailwindAndTint",
      "toFlatMap",
      "toJSON",
      "toTailwindIntelliSense",
    ];
    for (const name of removed) {
      expect(tint, name).not.toHaveProperty(name);
    }
  });

  it("round-trips a config end to end", () => {
    const config = tint.defineConfig({
      palette: { neutral: "#71717a", brand: "#7c3aed" },
      tokens: {
        surface: { DEFAULT: tint.surface(0) },
        text: { strong: tint.text(8) },
      },
    });
    const result = tint.generate(config)[0];
    if (result === undefined) throw new Error("expected a theme");
    const css = tint.toCSS(result);
    expect(css).toContain("--brand-text-strong:");
    expect(css).toContain("--neutral-surface:");
    const report = tint.audit(result);
    expect(report.summary.fail).toBe(0);
    expect(tint.toFlat(result)["brand.text.strong"]).toMatch(/^oklch\(/);
    const tailwind = tint.toCSSWithTailwind(result);
    expect(tailwind).toContain("@utility tint-brand");
    expect(tailwind).toContain("@utility text-strong");
  });
});
