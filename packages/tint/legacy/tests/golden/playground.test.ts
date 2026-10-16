import { beforeAll, describe, expect, it } from "vitest";
import type { GenerationResultV4 } from "../../src/v4/engine.js";
import { toCSS } from "../../src/v4/output/css.js";
import { expectGolden, generateExample, warningLines } from "./_example.js";

describe("playground golden output", () => {
  let themes: GenerationResultV4[] = [];

  beforeAll(async () => {
    themes = await generateExample("examples/vite-playground/tint.config.ts");
  });

  it("emits light and dark", () => {
    expect(themes.map((theme) => theme.name)).toEqual(["light", "dark"]);
  });

  it("matches the committed CSS, Tailwind, and DTCG fixtures", () => {
    expectGolden("playground", themes);
  });

  it("has no warnings for tint check --strict", () => {
    expect(warningLines(themes)).toEqual([]);
  });

  it("excludes the other theme's class from the automatic block", () => {
    const css = toCSS(themes);
    expect(css).toContain("@media (prefers-color-scheme: light) {\n  :root:not(.dark) {");
    expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {");
  });
});
