import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  capture,
  CLEAN_JSON_WITH_OUTPUT,
  CLEAN_TS,
  WARNING_JSON,
  type Capture,
} from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
});
afterEach(() => {
  c.cleanup();
});

describe("tint build", () => {
  it("writes tokens.css per theme by default and reports each file", async () => {
    c.write("tint.config.ts", CLEAN_TS);
    expect(await c.run(["build"])).toBe(0);

    expect(readdirSync(join(c.dir, "tint", "light"))).toEqual(["tokens.css"]);
    expect(readdirSync(join(c.dir, "tint", "dark"))).toEqual(["tokens.css"]);
    const light = readFileSync(join(c.dir, "tint", "light", "tokens.css"), "utf8");
    expect(light).toContain(":root {");
    expect(light).toContain("--brand-text-strong:");
    const dark = readFileSync(join(c.dir, "tint", "dark", "tokens.css"), "utf8");
    expect(dark).toContain("@media (prefers-color-scheme: dark)");
    expect(dark).toContain(".dark {");

    expect(c.out()).toContain("write tint/light/tokens.css");
    expect(c.out()).toContain("write tint/dark/tokens.css");
    expect(c.out()).toMatch(/Wrote 2 files to tint \(2 themes, \d+ tokens\)/);
    expect(c.err()).toBe("");
  });

  it("honours --formats and --out", async () => {
    c.write("tint.config.ts", CLEAN_TS);
    expect(
      await c.run(["build", "--formats", "css,dtcg,tailwind,flat", "-o", "out/tokens"]),
    ).toBe(0);

    const files = readdirSync(join(c.dir, "out", "tokens", "light")).sort();
    expect(files).toEqual([
      "tailwind.css",
      "tokens.css",
      "tokens.dtcg.json",
      "tokens.flat.json",
    ]);

    const json = JSON.parse(
      readFileSync(join(c.dir, "out/tokens/light/tokens.dtcg.json"), "utf8"),
    );
    expect(json.brand.text.strong.$type).toBe("color");
    const flat = JSON.parse(
      readFileSync(join(c.dir, "out/tokens/light/tokens.flat.json"), "utf8"),
    );
    expect(flat["brand.text.strong"]).toMatch(/^oklch\(/);
    const tw = readFileSync(join(c.dir, "out/tokens/light/tailwind.css"), "utf8");
    expect(tw).toContain("@theme static {");
    expect(c.out()).toContain("Wrote 8 files to out/tokens");
  });

  it("passes output.prefix through to CSS and Tailwind", async () => {
    c.write(
      "tint.config.json",
      JSON.stringify({
        palette: { neutral: "#ffffff", brand: "#2563eb" },
        tokens: {
          surface: { DEFAULT: { kind: "surface", scale: 0 } },
          text: { strong: { kind: "text", scale: 4 } },
        },
        output: { prefix: "tint", formats: ["css", "tailwind", "dtcg", "flat"] },
      }),
    );
    expect(await c.run(["build"])).toBe(0);

    const css = readFileSync(join(c.dir, "tint", "light", "tokens.css"), "utf8");
    expect(css).toContain("--tint-neutral-surface:");
    expect(css).toContain("--tint-brand-text-strong:");
    expect(css).not.toMatch(/^ {2}--neutral-surface:/m);

    const tw = readFileSync(join(c.dir, "tint", "light", "tailwind.css"), "utf8");
    expect(tw).toContain("--color-text-strong: var(--tint-text-strong);");
    expect(tw).toContain("@utility tint-brand");
    expect(tw).not.toContain("@utility tint-tint-");

    const flat = JSON.parse(
      readFileSync(join(c.dir, "tint", "light", "tokens.flat.json"), "utf8"),
    );
    expect(flat["brand.text.strong"]).toMatch(/^oklch\(/);
    expect(flat).not.toHaveProperty("tint.brand.text.strong");

    const dtcg = JSON.parse(
      readFileSync(join(c.dir, "tint", "light", "tokens.dtcg.json"), "utf8"),
    );
    expect(dtcg.brand.text.strong.$type).toBe("color");
    expect(dtcg).not.toHaveProperty("tint");
  });

  it("falls back to config.output path and formats", async () => {
    c.write("tint.config.json", CLEAN_JSON_WITH_OUTPUT);
    expect(await c.run(["build"])).toBe(0);
    expect(readdirSync(join(c.dir, "generated", "light")).sort()).toEqual([
      "tokens.dtcg.json",
      "tokens.flat.json",
    ]);
    expect(existsSync(join(c.dir, "tint"))).toBe(false);
  });

  it("--tailwind-tint writes a single <out>/tailwind.css across themes", async () => {
    c.write("tint.config.ts", CLEAN_TS);
    expect(await c.run(["build", "--tailwind-tint"])).toBe(0);

    const tw = readFileSync(join(c.dir, "tint", "tailwind.css"), "utf8");
    expect(tw).toContain("@theme static {");
    expect(tw).toContain("@utility tint-brand");
    expect(tw).toContain(".dark {");
    expect(existsSync(join(c.dir, "tint", "light", "tailwind.css"))).toBe(false);
    // The default css format is still written per theme.
    expect(existsSync(join(c.dir, "tint", "light", "tokens.css"))).toBe(true);
    expect(c.out()).toContain("write tint/tailwind.css");
  });

  it("rejects an invalid format", async () => {
    c.write("tint.config.ts", CLEAN_TS);
    expect(await c.run(["build", "-f", "css,scss"])).toBe(1);
    expect(c.err()).toContain('Unknown format "scss"');
    expect(c.err()).toContain("css, tailwind, dtcg, flat");
    expect(existsSync(join(c.dir, "tint"))).toBe(false);
  });

  it("fails with a hint to run tint init when no config exists", async () => {
    expect(await c.run(["build"])).toBe(1);
    expect(c.err()).toContain("No tint config found");
    expect(c.err()).toContain("tint init");
    expect(c.err()).not.toContain("    at ");
  });

  it("fails when --config points at a missing file", async () => {
    expect(await c.run(["build", "-c", "nope.ts"])).toBe(1);
    expect(c.err()).toContain("Config not found");
  });

  it("prints diagnostics as warn lines and still exits 0", async () => {
    c.write("tint.config.json", WARNING_JSON);
    expect(await c.run(["build"])).toBe(0);
    expect(c.err()).toMatch(/^warn neutral: /m);
    expect(c.err()).toContain("outside sRGB");
    expect(c.out()).toContain("1 warning");
  });

  it("--quiet suppresses everything but errors", async () => {
    c.write("tint.config.json", WARNING_JSON);
    expect(await c.run(["build", "--quiet"])).toBe(0);
    expect(c.out()).toBe("");
    expect(c.err()).toBe("");
    expect(existsSync(join(c.dir, "tint", "light", "tokens.css"))).toBe(true);
  });

  it("prints a ConfigError without a stack trace", async () => {
    c.write(
      "tint.config.json",
      JSON.stringify({ name: "x", mode: "sideways", colors: {}, tokens: {} }),
    );
    expect(await c.run(["build"])).toBe(1);
    expect(c.err()).toContain("Invalid tint config");
    expect(c.err()).toContain("mode");
    expect(c.err()).not.toContain("    at ");
    expect(c.err()).not.toContain("ConfigError:");
  });
});
