import { describe, expect, it } from "vitest";
import { toCSS } from "../../../src/v4/output/css.js";
import { toDTCG } from "../../../src/v4/output/dtcg.js";
import { toFlat } from "../../../src/v4/output/flat.js";
import { toCSSWithTailwind, toTailwind } from "../../../src/v4/output/tailwind.js";
import { light } from "./_fixture.js";

describe("output.prefix", () => {
  it("leaves variables unprefixed when prefix is omitted", () => {
    const css = toCSS(light, { comments: false });
    expect(css).toContain("--brand-action-hover:");
    expect(css).toContain("--action-hover: var(--neutral-action-hover);");
    expect(css).not.toContain("--tint-brand-action-hover");
    expect(css).not.toContain("--tint-action-hover:");
    expect(toCSS(light)).toBe(toCSS(light, {}));
    expect(toCSS(light)).toBe(toCSS(light, { prefix: "" }));
  });

  it("prefixes palette variables and the alias layer", () => {
    const css = toCSS(light, { prefix: "tint", comments: false });
    expect(css).toContain("--tint-neutral-action: oklch(50.00% 0.2000 300.00);");
    expect(css).toContain("--tint-brand-action-hover: oklch(48.00% 0.2000 300.00);");
    expect(css).toContain("--tint-neutral-text-strong:");
    expect(css).toContain("--tint-action-hover: var(--tint-neutral-action-hover);");
    expect(css).toContain("--tint-border-firm: var(--tint-neutral-border-firm);");
    expect(css).not.toMatch(/(^|\n)  --brand-action-hover:/);
    expect(css).not.toMatch(/(^|\n)  --action-hover:/);
  });

  it("points @theme var() at the prefix and keeps tint-<palette>", () => {
    const css = toTailwind(light, { prefix: "tint" });
    expect(css).toContain("--color-action-hover: var(--tint-action-hover);");
    expect(css).toContain("--color-text-strong: var(--tint-text-strong);");
    expect(css).not.toContain("--color-tint-action");
    expect(css).not.toContain("--tint-color-");
    expect(css).toContain("@utility tint-brand {");
    expect(css).not.toContain("@utility tint-tint-");
    expect(css).toContain("--tint-action-hover: var(--tint-brand-action-hover);");
    expect(css).toContain("--color-action-hover: var(--tint-brand-action-hover);");
    expect(css).toContain("@utility text-strong {\n  color: var(--tint-text-strong);\n}");
    expect(css).toContain(
      "@utility border-firm {\n  border-color: var(--tint-border-firm);\n}",
    );
  });

  it("uses the same prefix in the combined stylesheet", () => {
    const css = toCSSWithTailwind(light, { prefix: "tint", comments: false });
    expect(css).toContain("--tint-brand-action-hover:");
    expect(css).toContain("--color-action: var(--tint-action);");
    expect(css).toContain("@utility tint-brand {");
  });

  it("does not prefix DTCG or flat names", () => {
    const doc = toDTCG(light);
    expect(doc.brand?.action?.hover?.$value.hex).toBe("#7c3aed");
    expect(Object.keys(doc)).toEqual(["neutral", "brand"]);
    expect(toFlat(light, { format: "hex" })["brand.action.hover"]).toBe("#7c3aed");
    expect(toFlat(light)).not.toHaveProperty("tint.brand.action.hover");
  });
});
