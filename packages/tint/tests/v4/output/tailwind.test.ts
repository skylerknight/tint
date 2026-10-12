import { describe, expect, it } from "vitest";
import {
  toCSSWithTailwind,
  toTailwind,
  assertConsistentStructure,
} from "../../../src/v4/output/tailwind.js";
import { toCSS } from "../../../src/v4/output/css.js";
import { brand, ink, light, neutral, palette, theme, token } from "./_fixture.js";

const THEME = [
  "@theme static {",
  "  --color-tint-ink: var(--tint-ink);",
  "  --color-action: var(--action);",
  "  --color-action-hover: var(--action-hover);",
  "  --color-text-strong: var(--text-strong);",
  "  --color-border-firm: var(--border-firm);",
  "}",
].join("\n");

const TINT_BRAND = [
  "@utility tint-brand {",
  "  --tint-ink: var(--brand-tint-ink);",
  "  --color-tint-ink: var(--brand-tint-ink);",
  "  --action: var(--brand-action);",
  "  --color-action: var(--brand-action);",
  "  --action-hover: var(--brand-action-hover);",
  "  --color-action-hover: var(--brand-action-hover);",
  "  --text-strong: var(--brand-text-strong);",
  "  --color-text-strong: var(--brand-text-strong);",
  "  --border-firm: var(--brand-border-firm);",
  "  --color-border-firm: var(--brand-border-firm);",
  "}",
].join("\n");

describe("toTailwind", () => {
  it("emits @theme static, tint-<palette>, and prefix shortcuts", () => {
    expect(toTailwind(light)).toBe(
      [
        THEME,
        "",
        TINT_BRAND,
        "",
        "@utility text-strong {",
        "  color: var(--text-strong);",
        "}",
        "",
        "@utility border-firm {",
        "  border-color: var(--border-firm);",
        "}",
      ].join("\n"),
    );
  });

  it("does not emit a swap utility for the default palette", () => {
    const css = toTailwind(light);
    expect(css).not.toContain("tint-neutral");
    expect(css).not.toContain("@utility action-");
    expect(css).not.toContain("@utility tint-ink");
  });

  it("names DEFAULT shortcuts <prefix>-default", () => {
    const body = token({
      group: "text",
      name: "DEFAULT",
      kind: "text",
      ordinal: 3,
      color: ink,
      target: 75,
    });
    const css = toTailwind(
      theme({
        name: "light",
        palettes: [palette("neutral", true, [body])],
      }),
    );
    expect(css).toContain("@utility text-default {\n  color: var(--text);\n}");
    expect(css).toContain("--color-text: var(--text);");
  });

  it("nests placeholder shortcuts one indent, matching v3", () => {
    const muted = token({
      group: "placeholder",
      name: "muted",
      kind: "text",
      ordinal: 2,
      color: ink,
      target: 45,
    });
    expect(
      toTailwind(theme({ name: "light", palettes: [palette("neutral", true, [muted])] })),
    ).toContain(
      "@utility placeholder-muted {\n  &::placeholder {\n  color: var(--placeholder-muted);\n  }\n}",
    );
  });

  it("swaps every palette except the default, even when default is not first", () => {
    const neutralSecond = palette("neutral", true, neutral.tokens);
    const brandFirst = palette("brand", false, brand.tokens);
    const css = toTailwind(
      theme({ name: "light", palettes: [brandFirst, neutralSecond] }),
    );
    expect(css).toContain("@utility tint-brand {");
    expect(css).toContain("--tint-ink: var(--brand-tint-ink);");
    expect(css).not.toContain("tint-neutral");
    expect(css).toContain("--color-tint-ink: var(--tint-ink);");
  });

  it("is deterministic and has no trailing whitespace", () => {
    const css = toTailwind(light);
    expect(css).toBe(toTailwind(light));
    for (const line of css.split("\n")) expect(line).not.toMatch(/\s$/);
  });

  it("rejects palettes whose authored tokens differ", () => {
    const other = palette("brand", false, brand.tokens.slice(0, 2));
    const broken = theme({ name: "light", palettes: [neutral, other] });
    expect(() => toTailwind(broken)).toThrow(/same authored tokens/);
    expect(() => assertConsistentStructure([broken])).toThrow(/neutral/);
  });

  it("rejects shortcut names that collide", () => {
    const tokens = [
      token({
        group: "text",
        name: "DEFAULT",
        kind: "text",
        ordinal: 3,
        color: ink,
        target: 75,
      }),
      token({
        group: "text",
        name: "default",
        kind: "text",
        ordinal: 3,
        color: ink,
        target: 75,
      }),
    ];
    expect(() =>
      toTailwind(theme({ name: "light", palettes: [palette("neutral", true, tokens)] })),
    ).toThrow(/text-default/);
  });
});

describe("toCSSWithTailwind", () => {
  it("puts scoped variables before the Tailwind block", () => {
    expect(toCSSWithTailwind(light)).toBe(`${toCSS(light)}\n\n${toTailwind(light)}`);
  });

  it("still emits aliases when the option turns them off", () => {
    const css = toCSSWithTailwind(light, { aliases: false });
    expect(css).toContain("--tint-ink: var(--neutral-tint-ink);");
    expect(css).toContain("@theme static {");
  });
});
