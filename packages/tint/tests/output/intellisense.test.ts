import { describe, it, expect } from "vitest";
import { toTailwindIntelliSense } from "../../src/output/intellisense.js";
import { light, dark, withBg, conflicting, highContrast } from "./_fixtures.js";

describe("toTailwindIntelliSense", () => {
  it("emits an import and a static-hex @theme with simplified names", () => {
    expect(toTailwindIntelliSense(withBg)).toBe(
      [
        "@import 'tailwindcss';",
        "",
        "@theme {",
        "  --color-base-bg: #f9fafb;",
        "  --color-base-muted: #eef0f3;",
        "  --color-base-text: #2f3338;",
        "  --color-base-heading: #15181c;",
        "  --color-brand-bg: #faf7ff;",
        "  --color-brand-muted: #efe9fb;",
        "  --color-brand-text: #3a2d5c;",
        "  --color-brand-heading: #1b1233;",
        "}",
      ].join("\n"),
    );
  });

  it("uses only the first result of an array", () => {
    expect(toTailwindIntelliSense([light, dark])).toBe(toTailwindIntelliSense(light));
    expect(toTailwindIntelliSense([dark, light])).toContain(
      "--color-base-surface: #1c1d20;",
    );
  });

  it("option simplifyNames: false keeps full names", () => {
    const out = toTailwindIntelliSense(withBg, { simplifyNames: false });
    expect(out).toContain("  --color-base-bg-muted: #eef0f3;");
    expect(out).toContain("  --color-base-text-heading: #15181c;");
    expect(out).not.toContain("--color-base-muted");
  });

  it("tint path uses full names and appends the unprefixed default palette", () => {
    expect(toTailwindIntelliSense(withBg, { generateTintUtilities: true })).toBe(
      [
        "@import 'tailwindcss';",
        "",
        "@theme {",
        "  --color-base-bg: #f9fafb;",
        "  --color-base-bg-muted: #eef0f3;",
        "  --color-base-text: #2f3338;",
        "  --color-base-text-heading: #15181c;",
        "  --color-brand-bg: #faf7ff;",
        "  --color-brand-bg-muted: #efe9fb;",
        "  --color-brand-text: #3a2d5c;",
        "  --color-brand-text-heading: #1b1233;",
        "",
        "  /* Unprefixed colors (for tint-* utility classes) */",
        "  --color-bg: #f9fafb;",
        "  --color-bg-muted: #eef0f3;",
        "  --color-text: #2f3338;",
        "  --color-text-heading: #15181c;",
        "}",
      ].join("\n"),
    );
  });

  it("tint path honors defaultPalette and skips the unprefixed section when it is missing", () => {
    const brand = toTailwindIntelliSense(withBg, {
      generateTintUtilities: true,
      defaultPalette: "brand",
    });
    expect(brand).toContain(
      "  /* Unprefixed colors (for tint-* utility classes) */\n  --color-bg: #faf7ff;",
    );

    const none = toTailwindIntelliSense(withBg, {
      generateTintUtilities: true,
      defaultPalette: "nope",
    });
    expect(none).not.toContain("Unprefixed");
    expect(none.endsWith("  --color-brand-text-heading: #1b1233;\n}")).toBe(true);
  });

  it("tint path ignores simplifyNames and skips conflict detection", () => {
    const out = toTailwindIntelliSense(conflicting, { generateTintUtilities: true });
    expect(out).toContain("  --color-base-text-muted: #111111;");
    expect(out).toContain("  --color-base-bg-muted: #eeeeee;");
  });

  it("standalone path detects simplification conflicts", () => {
    expect(() => toTailwindIntelliSense(conflicting)).toThrow(/conflicts/);
    expect(() =>
      toTailwindIntelliSense(conflicting, { simplifyNames: false }),
    ).not.toThrow();
  });

  it("option indent is applied", () => {
    expect(toTailwindIntelliSense(highContrast, { indent: "\t" })).toBe(
      "@import 'tailwindcss';\n\n@theme {\n\t--color-base-text: #000000;\n}",
    );
  });

  it("never emits media queries or var() references", () => {
    const out = toTailwindIntelliSense(dark, { generateTintUtilities: true });
    expect(out).not.toContain("@media");
    expect(out).not.toContain("var(");
  });
});
