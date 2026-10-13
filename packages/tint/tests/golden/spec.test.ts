import { beforeAll, describe, expect, it } from "vitest";
import type { GenerationResultV4 } from "../../src/v4/engine.js";
import { toCSS } from "../../src/v4/output/css.js";
import { toDTCGJSON } from "../../src/v4/output/dtcg.js";
import { toTailwind } from "../../src/v4/output/tailwind.js";
import { expectGolden, generateExample, warningLines } from "./_example.js";

/**
 * §8.1 names, with `DEFAULT` dropped. Repeated for brand, danger, and warning.
 * 29 tokens × 4 palette colors = 116 variables per theme.
 */
const TOKEN_NAMES = [
  "surface-sunken",
  "surface",
  "surface-raised",
  "surface-floating",
  "action",
  "action-hover",
  "action-pressed",
  "action-disabled",
  "action-on",
  "action-on-disabled",
  "soft",
  "soft-hover",
  "soft-pressed",
  "soft-on",
  "border-hairline",
  "border",
  "border-firm",
  "border-focus",
  "text",
  "text-strong",
  "text-muted",
  "text-faint",
  "text-disabled",
  "text-link",
  "row",
  "row-hover",
  "row-selected",
  "row-selected-hover",
  "row-on",
] as const;

const PALETTES = ["neutral", "brand", "danger", "warning"] as const;

function paletteVariables(): string[] {
  return PALETTES.flatMap((palette) => TOKEN_NAMES.map((name) => `--${palette}-${name}`));
}

function occurrences(css: string, name: string): number {
  return css.split(`${name}:`).length - 1;
}

describe("spec example golden output", () => {
  let fromTs: GenerationResultV4[] = [];
  let fromJson: GenerationResultV4[] = [];

  beforeAll(async () => {
    fromTs = await generateExample("examples/v4-spec/tint.config.ts");
    fromJson = await generateExample("examples/v4-spec/tint.config.json");
  });

  it("emits light, dark, and light-hc", () => {
    expect(fromTs.map((theme) => theme.name)).toEqual(["light", "dark", "light-hc"]);
  });

  it("matches the committed CSS, Tailwind, and DTCG fixtures", () => {
    expectGolden("spec", fromTs);
  });

  it("produces byte-identical output from the TypeScript and JSON configs", () => {
    expect(toCSS(fromJson)).toBe(toCSS(fromTs));
    expect(toTailwind(fromJson)).toBe(toTailwind(fromTs));
    expect(fromJson.map((theme) => theme.name)).toEqual(
      fromTs.map((theme) => theme.name),
    );
    for (const theme of fromTs) {
      const jsonTheme = fromJson.find((entry) => entry.name === theme.name);
      expect(jsonTheme).toBeDefined();
      if (jsonTheme === undefined) continue;
      expect(toDTCGJSON(jsonTheme)).toBe(toDTCGJSON(theme));
    }
  });

  it("emits the §8.1 variable list, 116 per theme", () => {
    const names = paletteVariables();
    expect(names).toHaveLength(116);
    expect(TOKEN_NAMES).toHaveLength(29);
    const combined = toCSS(fromTs);
    for (const theme of fromTs) {
      const css = toCSS(theme);
      for (const name of names) {
        // Selector block plus the automatic media block.
        expect(occurrences(css, name), `${theme.name} ${name}`).toBe(2);
        expect(occurrences(combined, name), name).toBe(fromTs.length * 2);
      }
    }
  });

  it("emits the §8.2 Tailwind class names", () => {
    const css = toTailwind(fromTs);
    const colors = [
      "surface",
      "surface-raised",
      "surface-floating",
      "surface-sunken",
      "action",
      "action-hover",
      "action-pressed",
      "action-disabled",
      "action-on",
      "action-on-disabled",
      "soft",
      "soft-hover",
      "soft-pressed",
      "soft-on",
      "border-focus",
      "row",
      "row-hover",
      "row-selected",
      "row-selected-hover",
      "row-on",
      "text",
      "text-strong",
    ];
    for (const name of colors) {
      expect(css, name).toContain(`--color-${name}:`);
    }
    const utilities = [
      "text-default",
      "text-strong",
      "text-muted",
      "text-faint",
      "text-disabled",
      "text-link",
      "border-hairline",
      "border-default",
      "border-firm",
      "border-focus",
      "tint-brand",
      "tint-danger",
      "tint-warning",
    ];
    for (const name of utilities) {
      expect(css, name).toContain(`@utility ${name} {`);
    }
    expect(css).not.toContain("@utility tint-neutral");
  });

  it("scopes themes the way the engine resolves extends", () => {
    const css = toCSS(fromTs);
    // light-hc extends light and inherits `.light`, so the light scheme block
    // excludes that sibling selector as well as `.dark`.
    expect(css).toContain(
      "@media (prefers-color-scheme: light) {\n  :root:not(.dark):not(.light) {",
    );
    expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {");
    // light-hc keeps the inherited `.light` block beside the contrast query.
    expect(css).toContain(".light {");
    expect(css).toContain(
      "@media (prefers-contrast: more) {\n  :root:not(.light):not(.dark) {",
    );
  });

  it("keeps the §8 warnings that --strict reports", () => {
    expect(warningLines(fromTs)).toEqual([
      "light warning contrast-unreachable neutral.border.focus",
      "light warning contrast-unreachable brand.border.focus",
      "light warning contrast-unreachable danger.border.focus",
      "dark warning contrast-unreachable neutral.border.focus",
      "dark warning contrast-unreachable brand.border.focus",
      "dark warning exact-rejected brand.action.DEFAULT",
      "dark warning contrast-unreachable danger.border.focus",
      "light-hc warning exact-rejected brand.action.DEFAULT",
    ]);
  });
});
