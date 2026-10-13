import { beforeAll, describe, expect, it } from "vitest";
import type { GenerationResultV4 } from "../../src/v4/engine.js";
import { toCSS } from "../../src/v4/output/css.js";
import { generateExample } from "./_example.js";

describe("playground golden output", () => {
  let themes: GenerationResultV4[] = [];

  beforeAll(async () => {
    themes = await generateExample("examples/vite-playground/tint.config.ts");
  });

  it("emits light and dark", () => {
    expect(themes.map((theme) => theme.name)).toEqual(["light", "dark"]);
  });

  it("still emits the playground token names", () => {
    const light = themes.find((theme) => theme.name === "light");
    const ids = light?.palettes[0]?.tokens.map((token) => token.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining([
        "surface.DEFAULT",
        "surface.raised",
        "text.body",
        "action.DEFAULT",
        "action.hover",
        "action.pressed",
        "action.disabled",
        "soft.DEFAULT",
        "soft.hover",
        "soft.pressed",
      ]),
    );
  });

  it("excludes the other theme's class from the automatic block", () => {
    const css = toCSS(themes);
    expect(css).toContain("@media (prefers-color-scheme: light) {\n  :root:not(.dark) {");
    expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {");
  });
});
