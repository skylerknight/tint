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

  it("emits the sample-card tokens and drops the removed demo groups", () => {
    const light = themes.find((theme) => theme.name === "light");
    const ids = light?.palettes[0]?.tokens.map((token) => token.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining([
        "surface.DEFAULT",
        "surface.raised",
        "text.body",
        "text.muted",
        "text.strong",
        "action.DEFAULT",
        "action.hover",
        "action.disabled",
        "action.on",
        "soft.DEFAULT",
        "soft.hover",
        "soft.on",
        "input.DEFAULT",
        "card.DEFAULT",
        "divider.DEFAULT",
      ]),
    );
    expect(ids).not.toContain("ramp.n0");
    expect(ids).not.toContain("surface.sunken");
    expect(ids).not.toContain("icon.DEFAULT");
  });

  it("excludes the other theme's radio selector from the automatic block", () => {
    const css = toCSS(themes);
    expect(css).toContain(
      "@media (prefers-color-scheme: light) {\n  :root:not(:root:has(#scheme-dark:checked)) {",
    );
    expect(css).toContain(
      "@media (prefers-color-scheme: dark) {\n  :root:not(:root:has(#scheme-light:checked)) {",
    );
  });
});
