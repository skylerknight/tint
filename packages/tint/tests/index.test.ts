import { describe, expect, it } from "vitest";
import * as tint from "../src/index.js";

describe("public API", () => {
  it("exposes the documented surface", () => {
    const expected = [
      "defineConfig",
      "generate",
      "validateConfig",
      "assertConfig",
      "ConfigError",
      "resolveConfig",
      "audit",
      "formatAuditTable",
      "toCSS",
      "toJSON",
      "toDTCG",
      "toFlatMap",
      "toTailwind",
      "toCSSWithTailwind",
      "toCSSWithTailwindAndTint",
      "toTailwindIntelliSense",
      "parseColor",
      "tryParseColor",
      "rgbToHex",
      "rgbToOKLCH",
      "oklchToRGB",
      "oklchToRGBGamut",
      "toGamut",
      "formatOKLCH",
      "calcAPCA",
      "calcAPCAabs",
      "calcAPCAraw",
      "meetsContrast",
      "APCA_THRESHOLDS",
      "solveContrast",
      "maxContrast",
      "preferredPolarity",
      "LC_SHORTCUTS",
      "TAILWIND_UTILITY_PREFIXES",
      "loadConfig",
      "findDefaultConfig",
    ];
    for (const name of expected) {
      expect(tint, name).toHaveProperty(name);
    }
  });

  it("round-trips a config end to end", () => {
    const config = tint.defineConfig({
      name: "light",
      mode: "light",
      colors: { base: "#ffffff", brand: "#7c3aed" },
      tokens: {
        surface: { DEFAULT: { ls: 1 }, raised: { ls: 2 } },
        text: { $on: "surface", heading: { lc: 90 }, body: { lc: 75 } },
      },
    });
    const result = tint.generate(config);
    const css = tint.toCSS(result);
    expect(css).toContain("--brand-text-heading:");
    expect(css).toContain("--base-surface:");
    const report = tint.audit(result);
    expect(report.summary.fail).toBe(0);
    expect(tint.toFlatMap(result)["brand.text.body"]).toMatch(/^#[0-9a-f]{6}$/);
    const tailwind = tint.toCSSWithTailwindAndTint(result);
    expect(tailwind).toContain("@utility tint-brand");
    expect(tailwind).toContain("@utility text-heading");
  });
});
