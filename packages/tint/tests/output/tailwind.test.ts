import { describe, it, expect } from "vitest";
import {
  toTailwind,
  toCSSWithTailwind,
  toCSSWithTailwindAndTint,
  assertConsistentStructure,
  detectTailwindConflicts,
} from "../../src/output/tailwind.js";
import { toCSS } from "../../src/output/css.js";
import {
  light,
  dark,
  withBg,
  allPrefixes,
  inconsistent,
  conflicting,
  highContrast,
} from "./_fixtures.js";

const WITH_BG_CSS = [
  ":root {",
  "  /* base palette */",
  "  --base-bg: #f9fafb;",
  "  --base-bg-muted: #eef0f3;",
  "  --base-text: #2f3338;",
  "  --base-text-heading: #15181c;",
  "",
  "  /* brand palette */",
  "  --brand-bg: #faf7ff;",
  "  --brand-bg-muted: #efe9fb;",
  "  --brand-text: #3a2d5c;",
  "  --brand-text-heading: #1b1233;",
  "}",
].join("\n");

const WITH_BG_THEME = [
  "@theme {",
  "  --color-base-bg: var(--base-bg);",
  "  --color-base-muted: var(--base-bg-muted);",
  "  --color-base-text: var(--base-text);",
  "  --color-base-heading: var(--base-text-heading);",
  "  --color-brand-bg: var(--brand-bg);",
  "  --color-brand-muted: var(--brand-bg-muted);",
  "  --color-brand-text: var(--brand-text);",
  "  --color-brand-heading: var(--brand-text-heading);",
  "}",
].join("\n");

const WITH_BG_TINT = [
  WITH_BG_CSS,
  "",
  ":root {",
  "  /* Unprefixed variables (default to base) */",
  "  --bg: var(--base-bg);",
  "  --bg-muted: var(--base-bg-muted);",
  "  --text: var(--base-text);",
  "  --text-heading: var(--base-text-heading);",
  "}",
  "",
  "@theme static {",
  "  --color-base-bg: var(--base-bg);",
  "  --color-base-bg-muted: var(--base-bg-muted);",
  "  --color-base-text: var(--base-text);",
  "  --color-base-text-heading: var(--base-text-heading);",
  "  --color-brand-bg: var(--brand-bg);",
  "  --color-brand-bg-muted: var(--brand-bg-muted);",
  "  --color-brand-text: var(--brand-text);",
  "  --color-brand-text-heading: var(--brand-text-heading);",
  "",
  "  /* Unprefixed colors (for tint-* utility classes) */",
  "  --color-bg: var(--bg);",
  "  --color-bg-muted: var(--bg-muted);",
  "  --color-text: var(--text);",
  "  --color-text-heading: var(--text-heading);",
  "}",
  "",
  "@utility tint-brand {",
  "  --color-bg: var(--brand-bg);",
  "  --color-bg-muted: var(--brand-bg-muted);",
  "  --color-text: var(--brand-text);",
  "  --color-text-heading: var(--brand-text-heading);",
  "}",
  "",
  "@utility bg-default {",
  "  background-color: var(--color-bg);",
  "}",
  "",
  "@utility bg-muted {",
  "  background-color: var(--color-bg-muted);",
  "}",
  "",
  "@utility text-default {",
  "  color: var(--color-text);",
  "}",
  "",
  "@utility text-heading {",
  "  color: var(--color-text-heading);",
  "}",
].join("\n");

describe("toTailwind", () => {
  it("emits a @theme block with simplified names by default", () => {
    expect(toTailwind(withBg)).toBe(WITH_BG_THEME);
  });

  it("keeps non-prefix groups intact and drops DEFAULT", () => {
    const theme = toTailwind(light);
    expect(theme).toContain("  --color-base-surface: var(--base-surface);");
    expect(theme).toContain("  --color-base-surface-raised: var(--base-surface-raised);");
    expect(theme).toContain("  --color-base-heading: var(--base-text-heading);");
    expect(theme).toContain("  --color-base-action: var(--base-action);");
    expect(theme).toContain("  --color-brand-on-action: var(--brand-on-action);");
    expect(theme).not.toContain("DEFAULT");
  });

  it("option simplifyNames: false keeps full group names", () => {
    const theme = toTailwind(withBg, { simplifyNames: false });
    expect(theme).toContain("  --color-base-bg-muted: var(--base-bg-muted);");
    expect(theme).toContain("  --color-base-text-heading: var(--base-text-heading);");
    expect(theme).not.toContain("--color-base-muted");
  });

  it("option indent is applied", () => {
    expect(toTailwind(highContrast, { indent: "    " })).toBe(
      "@theme {\n    --color-base-text: var(--base-text);\n}",
    );
  });

  it("emits a single block for multiple consistent themes", () => {
    expect(toTailwind([light, dark])).toBe(toTailwind(light));
  });

  it("throws on inconsistent themes", () => {
    expect(() => toTailwind([dark, inconsistent])).toThrow(/same token structure/);
  });

  it("throws on simplification conflicts unless simplification is off", () => {
    expect(() => toTailwind(conflicting)).toThrow(/conflicts/);
    expect(() => toTailwind(conflicting, { simplifyNames: false })).not.toThrow();
  });
});

describe("toCSSWithTailwind", () => {
  it("emits the CSS blocks followed by one @theme block", () => {
    expect(toCSSWithTailwind(withBg)).toBe(`${WITH_BG_CSS}\n\n${WITH_BG_THEME}`);
  });

  it("emits one CSS block per theme and a single shared @theme", () => {
    const out = toCSSWithTailwind([light, dark]);
    expect(out).toBe(`${toCSS(light)}\n\n${toCSS(dark)}\n\n${toTailwind(light)}`);
    expect(out.match(/@theme \{/g)).toHaveLength(1);
  });

  it("option includeOKLCH adds oklch comments to the CSS blocks only", () => {
    const out = toCSSWithTailwind(highContrast, { includeOKLCH: true });
    expect(out).toContain("    /* oklch(0.000 0.000 0.0) */\n    --base-text: #000000;");
    expect(out.split("@theme {")[1]).not.toContain("oklch");
  });

  it("validates structure and conflicts", () => {
    expect(() => toCSSWithTailwind([dark, inconsistent])).toThrow(/same token structure/);
    expect(() => toCSSWithTailwind(conflicting)).toThrow(/conflicts/);
  });
});

describe("toCSSWithTailwindAndTint", () => {
  it("emits all five sections in order", () => {
    expect(toCSSWithTailwindAndTint(withBg)).toBe(WITH_BG_TINT);
  });

  it("wraps the alias layer in the same media query as the theme block", () => {
    const out = toCSSWithTailwindAndTint(dark);
    expect(out).toContain(
      [
        "@media (prefers-color-scheme: dark) {",
        "  .dark {",
        "    /* Unprefixed variables (default to base) */",
        "    --surface: var(--base-surface);",
        "    --surface-raised: var(--base-surface-raised);",
        "    --text-heading: var(--base-text-heading);",
      ].join("\n"),
    );
    expect(out.match(/@media \(prefers-color-scheme: dark\)/g)).toHaveLength(2);
  });

  it("emits per-theme CSS and alias blocks but shared @theme/@utility sections", () => {
    const out = toCSSWithTailwindAndTint([light, dark]);
    const lightAlias = ":root {\n  /* Unprefixed variables (default to base) */";
    const darkAlias =
      "@media (prefers-color-scheme: dark) {\n  .dark {\n    /* Unprefixed variables";
    const order = [
      out.indexOf(toCSS(light)),
      out.indexOf(toCSS(dark)),
      out.indexOf(lightAlias),
      out.indexOf(darkAlias),
      out.indexOf("@theme static {"),
      out.indexOf("@utility tint-brand {"),
      out.indexOf("@utility text-heading {"),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(out.match(/@theme static/g)).toHaveLength(1);
    expect(out.match(/@utility tint-brand/g)).toHaveLength(1);
    expect(out.match(/\/\* Unprefixed variables/g)).toHaveLength(2);
  });

  it("never simplifies names in the tint path, even when tokens would conflict", () => {
    const out = toCSSWithTailwindAndTint(conflicting);
    expect(out).toContain("  --color-base-text-muted: var(--base-text-muted);");
    expect(out).toContain("  --color-base-bg-muted: var(--base-bg-muted);");
  });

  it("emits tint utilities for every non-default palette, from the default palette's structure", () => {
    const out = toCSSWithTailwindAndTint(light);
    expect(out).toContain(
      [
        "@utility tint-brand {",
        "  --color-surface: var(--brand-surface);",
        "  --color-surface-raised: var(--brand-surface-raised);",
        "  --color-text-heading: var(--brand-text-heading);",
        "  --color-text-body: var(--brand-text-body);",
        "  --color-text-muted: var(--brand-text-muted);",
        "  --color-action: var(--brand-action);",
        "  --color-on-action: var(--brand-on-action);",
        "}",
      ].join("\n"),
    );
    expect(out).not.toContain("@utility tint-base");
  });

  it("option defaultPalette picks the alias target and utility set", () => {
    const out = toCSSWithTailwindAndTint(withBg, { defaultPalette: "brand" });
    expect(out).toContain(
      "  /* Unprefixed variables (default to brand) */\n  --bg: var(--brand-bg);",
    );
    expect(out).toContain("@utility tint-base {\n  --color-bg: var(--base-bg);");
    expect(out).not.toContain("@utility tint-brand");
  });

  it("omits alias layer, unprefixed colors, tint utilities and shortcuts when the default palette is missing", () => {
    const out = toCSSWithTailwindAndTint(withBg, { defaultPalette: "nope" });
    expect(out).toBe(
      [
        WITH_BG_CSS,
        "",
        "@theme static {",
        "  --color-base-bg: var(--base-bg);",
        "  --color-base-bg-muted: var(--base-bg-muted);",
        "  --color-base-text: var(--base-text);",
        "  --color-base-text-heading: var(--base-text-heading);",
        "  --color-brand-bg: var(--brand-bg);",
        "  --color-brand-bg-muted: var(--brand-bg-muted);",
        "  --color-brand-text: var(--brand-text);",
        "  --color-brand-text-heading: var(--brand-text-heading);",
        "}",
      ].join("\n"),
    );
  });

  it("option generateTintUtilities: false falls back to CSS + simplified @theme", () => {
    expect(toCSSWithTailwindAndTint(withBg, { generateTintUtilities: false })).toBe(
      `${WITH_BG_CSS}\n\n${WITH_BG_THEME}`,
    );
    expect(() =>
      toCSSWithTailwindAndTint(conflicting, { generateTintUtilities: false }),
    ).toThrow(/conflicts/);
  });

  it("option generateShortcuts: false drops only the shortcut section", () => {
    const out = toCSSWithTailwindAndTint(withBg, { generateShortcuts: false });
    expect(out).toBe(WITH_BG_TINT.split("\n\n@utility bg-default")[0]);
    expect(out).toContain("@utility tint-brand");
    expect(out).not.toContain("@utility bg-");
    expect(out).not.toContain("@utility text-");
  });

  it("option includeOKLCH and indent apply to the whole output", () => {
    const out = toCSSWithTailwindAndTint(highContrast, {
      includeOKLCH: true,
      indent: "\t",
    });
    expect(out).toContain(
      "\t:root {\n\t\t/* base palette */\n\t\t/* oklch(0.000 0.000 0.0) */\n\t\t--base-text: #000000;",
    );
    expect(out).toContain(
      "\t:root {\n\t\t/* Unprefixed variables (default to base) */\n\t\t--text: var(--base-text);",
    );
    expect(out).toContain("@theme static {\n\t--color-base-text: var(--base-text);");
    expect(out).toContain("@utility text-default {\n\tcolor: var(--color-text);\n}");
  });

  it("maps every utility prefix to its CSS declaration", () => {
    const out = toCSSWithTailwindAndTint(allPrefixes);
    const expectations: Record<string, string> = {
      text: "color: var(--color-text);",
      bg: "background-color: var(--color-bg);",
      background: "background-color: var(--color-background);",
      border: "border-color: var(--color-border);",
      outline: "outline-color: var(--color-outline);",
      ring: "--tw-ring-color: var(--color-ring);",
      accent: "accent-color: var(--color-accent);",
      caret: "caret-color: var(--color-caret);",
      fill: "fill: var(--color-fill);",
      stroke: "stroke: var(--color-stroke);",
      decoration: "text-decoration-color: var(--color-decoration);",
      shadow: "--tw-shadow-color: var(--color-shadow);",
    };
    for (const [prefix, declaration] of Object.entries(expectations)) {
      expect(out).toContain(`@utility ${prefix}-default {\n  ${declaration}\n}`);
    }
    expect(out).toContain(
      "@utility divide-default {\n  & > * + * {\n  border-color: var(--color-divide);\n  }\n}",
    );
    expect(out).toContain(
      "@utility placeholder-default {\n  &::placeholder {\n  color: var(--color-placeholder);\n  }\n}",
    );
  });

  it("does not emit shortcuts for non-prefix groups", () => {
    const out = toCSSWithTailwindAndTint(light);
    expect(out).toContain("@utility text-heading {");
    expect(out).not.toContain("@utility surface-");
    expect(out).not.toContain("@utility action-");
    expect(out).not.toContain("@utility on-");
  });

  it("has no trailing whitespace on any line", () => {
    for (const line of toCSSWithTailwindAndTint([light, dark]).split("\n")) {
      expect(line).not.toMatch(/\s$/);
    }
  });
});

describe("assertConsistentStructure", () => {
  it("accepts zero, one, or structurally identical results", () => {
    expect(() => assertConsistentStructure([])).not.toThrow();
    expect(() => assertConsistentStructure([light])).not.toThrow();
    expect(() => assertConsistentStructure([light, dark])).not.toThrow();
  });

  it("names both themes and lists the differing token paths", () => {
    let message = "";
    try {
      assertConsistentStructure([dark, inconsistent]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("same token structure");
    expect(message).toContain(
      'Defined in "dark" but missing from "dark-alt":\n    - brand.text.muted',
    );
    expect(message).toContain(
      'Defined in "dark-alt" but missing from "dark":\n    - brand.text.subtle',
    );
    expect(message).toContain("Use the same `colors` and `tokens` keys");
    expect(message).not.toContain("base.");
  });

  it("reports a missing palette as all of its tokens", () => {
    const onlyBase = { ...light, name: "partial", palettes: light.palettes.slice(0, 1) };
    expect(() => assertConsistentStructure([light, onlyBase])).toThrow(
      /Defined in "light" but missing from "partial":\n {4}- brand\.surface\.DEFAULT\n/,
    );
  });
});

describe("detectTailwindConflicts", () => {
  it("is a no-op when simplification is disabled", () => {
    expect(() => detectTailwindConflicts(conflicting, false)).not.toThrow();
  });

  it("passes conflict-free results", () => {
    expect(() => detectTailwindConflicts(light, true)).not.toThrow();
    expect(() => detectTailwindConflicts(withBg, true)).not.toThrow();
  });

  it("names the palette, the colliding name, both paths, and the fixes", () => {
    expect(() => detectTailwindConflicts(conflicting, true)).toThrow(
      [
        'Tailwind name simplification conflicts detected in palette "base":',
        '  - "base-muted" maps to: base.text.muted, base.bg.muted',
        "",
        "To fix this:",
        "  1. Rename the conflicting tokens so they simplify to unique names",
        "  2. Or disable simplification: { simplifyNames: false }",
      ].join("\n"),
    );
  });
});
