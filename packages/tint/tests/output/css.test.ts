import { describe, it, expect } from "vitest";
import { toCSS } from "../../src/output/css.js";
import { light, dark, highContrast, withBg } from "./_fixtures.js";

describe("toCSS", () => {
  it("emits one block per palette, separated by a blank line", () => {
    expect(toCSS(withBg)).toBe(
      [
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
      ].join("\n"),
    );
  });

  it("drops the DEFAULT segment and keeps config order for the standard theme", () => {
    const css = toCSS(light);
    const names = css.match(/--[a-z-]+(?=:)/g);
    expect(names).toEqual([
      "--base-surface",
      "--base-surface-raised",
      "--base-text-heading",
      "--base-text-body",
      "--base-text-muted",
      "--base-action",
      "--base-on-action",
      "--brand-surface",
      "--brand-surface-raised",
      "--brand-text-heading",
      "--brand-text-body",
      "--brand-text-muted",
      "--brand-action",
      "--brand-on-action",
    ]);
    expect(css).toContain("  --brand-action: #7048e8;");
  });

  it("emits a manual selector block and an automatic :root media block", () => {
    const css = toCSS(dark);
    expect(
      css.startsWith(".dark {\n  /* base palette */\n  --base-surface: #1c1d20;"),
    ).toBe(true);
    expect(css).toContain("}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n");
    expect(css).toContain("    /* base palette */\n    --base-surface: #1c1d20;");
    expect(css.endsWith("\n  }\n}")).toBe(true);
    expect(css.match(/--base-surface: #1c1d20;/g)).toHaveLength(2);
  });

  it("emits only the automatic block when the selector is :root", () => {
    const css = toCSS({ ...dark, selector: ":root" });
    expect(css.startsWith("@media (prefers-color-scheme: dark) {\n  :root {\n")).toBe(
      true,
    );
    expect(css.match(/--base-surface: #1c1d20;/g)).toHaveLength(1);
  });

  it("joins multiple media preferences with `and`", () => {
    expect(toCSS(highContrast)).toBe(
      [
        "@media (prefers-color-scheme: light) and (prefers-contrast: more) {",
        "  :root {",
        "    /* base palette */",
        "    --base-text: #000000;",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("joins multiple results with a blank line", () => {
    const css = toCSS([light, dark]);
    expect(css).toBe(`${toCSS(light)}\n\n${toCSS(dark)}`);
  });

  it("option selector overrides every result's selector", () => {
    const css = toCSS([light, dark], { selector: ":host" });
    expect(css).toContain(":host {");
    expect(css).not.toContain(":root {");
    expect(css).not.toContain(".dark {");
  });

  it("option comments: false omits palette comments", () => {
    const css = toCSS(highContrast, { comments: false });
    expect(css).not.toContain("/*");
    expect(css).toContain("  :root {\n    --base-text: #000000;\n  }");
  });

  it("option indent changes nesting including inside media queries", () => {
    expect(toCSS(highContrast, { indent: "\t" })).toBe(
      [
        "@media (prefers-color-scheme: light) and (prefers-contrast: more) {",
        "\t:root {",
        "\t\t/* base palette */",
        "\t\t--base-text: #000000;",
        "\t}",
        "}",
      ].join("\n"),
    );
  });

  it("option format: oklch delegates to formatOKLCH", () => {
    const css = toCSS(withBg, { format: "oklch", comments: false });
    expect(css).toContain("  --base-bg: oklch(98.00% 0.0100 250.00);");
    expect(css).toContain("  --brand-text-heading: oklch(18.00% 0.0300 295.00);");
    expect(css).not.toContain("#");
  });

  it("option includeOKLCH adds a comment above each hex value", () => {
    const css = toCSS(highContrast, { includeOKLCH: true, comments: false });
    expect(css).toContain("    /* oklch(0.000 0.000 0.0) */\n    --base-text: #000000;");
  });

  it("includeOKLCH is ignored when format is oklch", () => {
    const css = toCSS(highContrast, {
      format: "oklch",
      includeOKLCH: true,
      comments: false,
    });
    expect(css.match(/oklch\(/g)).toHaveLength(1);
  });

  it("has no trailing whitespace on any line", () => {
    for (const css of [
      toCSS(light),
      toCSS(dark),
      toCSS(withBg, { includeOKLCH: true }),
    ]) {
      for (const line of css.split("\n")) expect(line).not.toMatch(/\s$/);
    }
  });

  it("handles a result with no palettes", () => {
    expect(toCSS({ ...light, palettes: [] })).toBe(":root {\n}");
  });
});
