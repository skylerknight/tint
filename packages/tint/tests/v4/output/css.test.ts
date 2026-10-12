import { describe, expect, it } from "vitest";
import { border, emphasis, text } from "../../../src/v4/kinds.js";
import { generateV4 } from "../../../src/v4/engine.js";
import { mediaQueryFor, toCSS } from "../../../src/v4/output/css.js";
import { light, paint, single, theme } from "./_fixture.js";

const LIGHT_CSS = [
  ":root {",
  "  /* neutral palette */",
  "  --neutral-tint-ink: oklch(25.00% 0.0200 250.00);",
  "  --neutral-action: oklch(50.00% 0.2000 300.00);",
  "  --neutral-action-hover: oklch(45.00% 0.1800 300.00);",
  "  --neutral-text-strong: oklch(10.00% 0.0100 250.00);",
  "  --neutral-border-firm: oklch(40.00% 0.0300 250.00);",
  "",
  "  /* brand palette */",
  "  --brand-tint-ink: oklch(40.00% 0.1600 300.00);",
  "  --brand-action: oklch(55.00% 0.2200 300.00);",
  "  --brand-action-hover: oklch(48.00% 0.2000 300.00);",
  "  --brand-text-strong: oklch(12.00% 0.0500 300.00);",
  "  --brand-border-firm: oklch(42.00% 0.0800 300.00);",
  "",
  "  /* Unprefixed aliases (neutral) */",
  "  --tint-ink: var(--neutral-tint-ink);",
  "  --action: var(--neutral-action);",
  "  --action-hover: var(--neutral-action-hover);",
  "  --text-strong: var(--neutral-text-strong);",
  "  --border-firm: var(--neutral-border-firm);",
  "}",
].join("\n");

describe("toCSS", () => {
  it("emits every palette, drops DEFAULT, and aliases the default palette", () => {
    expect(toCSS(light)).toBe(LIGHT_CSS);
  });

  it("omits generated rests", () => {
    expect(toCSS(light)).not.toContain("__rest");
  });

  it("is deterministic", () => {
    expect(toCSS(light)).toBe(toCSS(light));
  });

  it("has no trailing whitespace", () => {
    for (const line of toCSS(light).split("\n")) expect(line).not.toMatch(/\s$/);
  });

  it("can drop comments and the alias layer", () => {
    const css = toCSS(light, { comments: false, aliases: false });
    expect(css).not.toContain("/*");
    expect(css).not.toContain("--tint-ink:");
    expect(css).toContain("  --neutral-action: oklch(50.00% 0.2000 300.00);");
  });

  it("scopes a class selector with no media", () => {
    const css = toCSS(
      theme({
        name: "app",
        selector: ".app",
        palettes: [
          single("neutral", paint("#111111", { r: 17, g: 17, b: 17 }, 0.2, 0, 0), true),
        ],
      }),
      { comments: false },
    );
    expect(css).toBe(
      [
        ".app {",
        "  --neutral-tint-ink: oklch(20.00% 0.0000 0.00);",
        "",
        "  --tint-ink: var(--neutral-tint-ink);",
        "}",
      ].join("\n"),
    );
  });
});

describe("theme scoping", () => {
  const neutralLight = single(
    "neutral",
    paint("#111111", { r: 17, g: 17, b: 17 }, 0.2, 0, 0),
    true,
  );
  const brandLight = single(
    "brand",
    paint("#7c3aed", { r: 124, g: 58, b: 237 }, 0.5, 0.2, 300),
    false,
  );
  const neutralDark = single(
    "neutral",
    paint("#eeeeee", { r: 238, g: 238, b: 238 }, 0.95, 0, 0),
    true,
  );
  const brandDark = single(
    "brand",
    paint("#c4b5fd", { r: 196, g: 181, b: 253 }, 0.8, 0.1, 300),
    false,
  );
  const neutralHc = single(
    "neutral",
    paint("#000000", { r: 0, g: 0, b: 0 }, 0, 0, 0),
    true,
  );
  const brandHc = single(
    "brand",
    paint("#4c1d95", { r: 76, g: 29, b: 149 }, 0.35, 0.15, 300),
    false,
  );

  const themes = [
    theme({
      name: "light",
      mode: "light",
      selector: ".light",
      media: true,
      palettes: [neutralLight, brandLight],
    }),
    theme({
      name: "dark",
      mode: "dark",
      selector: ".dark",
      media: true,
      palettes: [neutralDark, brandDark],
    }),
    theme({
      name: "light-hc",
      mode: "light",
      selector: ":root",
      media: "(prefers-contrast: more)",
      palettes: [neutralHc, brandHc],
    }),
  ];

  it("emits the §8 selector, scheme, and prefers-contrast blocks", () => {
    expect(toCSS(themes, { format: "hex", comments: false })).toBe(
      [
        ".light {",
        "  --neutral-tint-ink: #111111;",
        "",
        "  --brand-tint-ink: #7c3aed;",
        "",
        "  --tint-ink: var(--neutral-tint-ink);",
        "}",
        "",
        "@media (prefers-color-scheme: light) {",
        "  :root:not(.dark) {",
        "    --neutral-tint-ink: #111111;",
        "",
        "    --brand-tint-ink: #7c3aed;",
        "",
        "    --tint-ink: var(--neutral-tint-ink);",
        "  }",
        "}",
        "",
        ".dark {",
        "  --neutral-tint-ink: #eeeeee;",
        "",
        "  --brand-tint-ink: #c4b5fd;",
        "",
        "  --tint-ink: var(--neutral-tint-ink);",
        "}",
        "",
        "@media (prefers-color-scheme: dark) {",
        "  :root:not(.light) {",
        "    --neutral-tint-ink: #eeeeee;",
        "",
        "    --brand-tint-ink: #c4b5fd;",
        "",
        "    --tint-ink: var(--neutral-tint-ink);",
        "  }",
        "}",
        "",
        "@media (prefers-contrast: more) {",
        "  :root:not(.light):not(.dark) {",
        "    --neutral-tint-ink: #000000;",
        "",
        "    --brand-tint-ink: #4c1d95;",
        "",
        "    --tint-ink: var(--neutral-tint-ink);",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("keeps an inherited class selector beside a custom media query", () => {
    const css = toCSS(
      [
        theme({
          name: "light-hc",
          selector: ".light",
          media: "(prefers-contrast: more)",
          palettes: [neutralHc],
        }),
        theme({
          name: "dark",
          mode: "dark",
          selector: ".dark",
          media: false,
          palettes: [neutralDark],
        }),
      ],
      { format: "hex", comments: false },
    );
    expect(css).toContain(".light {\n  --neutral-tint-ink: #000000;");
    expect(css).toContain(
      "@media (prefers-contrast: more) {\n  :root:not(.dark) {\n    --neutral-tint-ink: #000000;",
    );
  });

  it("scopes an arbitrary media string the same way", () => {
    const css = toCSS(
      theme({
        name: "wide",
        selector: ".wide",
        media: "(min-width: 80rem)",
        palettes: [neutralLight],
      }),
      { format: "hex", comments: false },
    );
    expect(css).toBe(
      [
        ".wide {",
        "  --neutral-tint-ink: #111111;",
        "",
        "  --tint-ink: var(--neutral-tint-ink);",
        "}",
        "",
        "@media (min-width: 80rem) {",
        "  :root {",
        "    --neutral-tint-ink: #111111;",
        "",
        "    --tint-ink: var(--neutral-tint-ink);",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("describes media queries", () => {
    expect(mediaQueryFor({ mode: "dark", media: true })).toBe(
      "@media (prefers-color-scheme: dark)",
    );
    expect(mediaQueryFor({ mode: "light", media: "(prefers-contrast: more)" })).toBe(
      "@media (prefers-contrast: more)",
    );
    expect(mediaQueryFor({ mode: "light", media: false })).toBeUndefined();
    expect(mediaQueryFor({ mode: "light" })).toBeUndefined();
  });
});

describe("generateV4 themes", () => {
  const config = {
    palette: {
      neutral: "#71717a",
      brand: "#7c3aed",
      danger: "#dc2626",
    },
    themes: {
      light: { mode: "light" as const, selector: ".light", media: true },
      dark: { mode: "dark" as const, selector: ".dark", media: true },
      "light-hc": {
        mode: "light" as const,
        extends: "light",
        media: "(prefers-contrast: more)",
      },
    },
    tokens: {
      tint: { ink: text("strong") },
      action: {
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
      },
      text: { strong: text("strong") },
      border: { firm: border("firm") },
    },
  };

  const themes = generateV4(config);

  it("repeats the full token set for every palette color", () => {
    const lightTheme = themes[0];
    expect(lightTheme?.palettes.map((palette) => palette.name)).toEqual([
      "neutral",
      "brand",
      "danger",
    ]);
    const css = toCSS(themes, { comments: false });
    const names = [
      "--neutral-tint-ink",
      "--neutral-action",
      "--neutral-action-hover",
      "--neutral-text-strong",
      "--neutral-border-firm",
      "--brand-tint-ink",
      "--brand-action-hover",
      "--danger-border-firm",
      "--tint-ink",
      "--action",
      "--action-hover",
      "--text-strong",
      "--border-firm",
    ];
    for (const name of names) expect(css).toContain(name);
    expect(css).not.toContain("__");
    expect(css).toContain(".light {");
    expect(css).toContain(
      "@media (prefers-color-scheme: light) {\n  :root:not(.dark):not(.light) {",
    );
    expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {");
    expect(css).toContain("@media (prefers-contrast: more) {");
    expect(toCSS(themes)).toBe(toCSS(themes));
  });

  it("uses the selector extends resolved, which is .light for light-hc", () => {
    const hc = themes.find((result) => result.name === "light-hc");
    expect(hc?.selector).toBe(".light");
    expect(hc?.media).toBe("(prefers-contrast: more)");
  });
});
