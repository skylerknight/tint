import { describe, expect, it } from "vitest";
import { toCSS } from "../../../src/v4/output/css.js";
import { toFlat } from "../../../src/v4/output/flat.js";
import { toDTCG } from "../../../src/v4/output/dtcg.js";
import { light } from "./_fixture.js";

describe("output.format", () => {
  it("defaults CSS and flat to oklch", () => {
    expect(toCSS(light)).toContain("--neutral-tint-ink: oklch(25.00% 0.0200 250.00);");
    expect(toCSS(light)).not.toContain("#");
    expect(toFlat(light)["brand.action.hover"]).toBe("oklch(48.00% 0.2000 300.00)");
  });

  it("emits hex for CSS and flat", () => {
    const css = toCSS(light, { format: "hex", comments: false });
    expect(css).toContain("  --neutral-tint-ink: #112233;");
    expect(css).toContain("  --brand-action-hover: #7c3aed;");
    expect(css).toContain("  --neutral-text-strong: #0a0a0a;");
    expect(css).toContain("  --neutral-border-firm: #3f3f46;");
    expect(css).not.toContain("oklch(");
    expect(css).not.toContain("rgb(");
    expect(toFlat(light, { format: "hex" })).toMatchObject({
      "neutral.tint.ink": "#112233",
      "brand.action.hover": "#7c3aed",
      "neutral.border.firm": "#3f3f46",
    });
  });

  it("emits space-separated rgb() for CSS and flat", () => {
    const css = toCSS(light, { format: "rgb", comments: false });
    expect(css).toContain("  --neutral-tint-ink: rgb(17 34 51);");
    expect(css).toContain("  --brand-action: rgb(139 92 246);");
    expect(css).toContain("  --neutral-text-strong: rgb(10 10 10);");
    expect(css).not.toContain("#");
    expect(css).not.toContain("oklch(");
    expect(toFlat(light, { format: "rgb" })["neutral.action.hover"]).toBe(
      "rgb(109 40 217)",
    );
    expect(toFlat(light, { format: "rgb" })["brand.border.firm"]).toBe("rgb(76 29 149)");
  });

  it("leaves DTCG on the oklch object when CSS format changes", () => {
    const doc = toDTCG(light);
    expect(doc.neutral?.tint?.ink?.$value).toEqual({
      colorSpace: "oklch",
      components: [0.25, 0.02, 250],
      hex: "#112233",
    });
  });
});
