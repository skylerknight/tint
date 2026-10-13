import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeHex } from "../../src/cli/init.js";
import { loadConfig } from "../../src/loader/index.js";
import { capture, type Capture } from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
});
afterEach(() => {
  c.cleanup();
});

describe("tint init", () => {
  it("--yes --brand --dark writes a config that loads and builds", async () => {
    expect(await c.run(["init", "--yes", "--brand", "#7c3aed", "--dark"])).toBe(0);
    const path = join(c.dir, "tint.config.ts");
    const source = readFileSync(path, "utf8");
    expect(source).toContain('from "@skylerknight/tint"');
    expect(source).toContain("defineConfig");
    expect(source).toContain('color: "#7c3aed"');
    expect(source).toContain('selector: ".dark"');
    expect(source).toContain("media: true");
    expect(source).not.toContain('"light-hc"');
    expect(source).toContain("surface(0)");
    expect(source).toContain("emphasis(5)");
    expect(source).toContain("emphasis(4.5)");
    expect(source).toContain("emphasis(6)");
    expect(source).toContain("disabled.emphasis(5)");
    expect(source).not.toContain("disabled(emphasis");
    expect(c.out()).toContain("Next steps");

    const loaded = await loadConfig({ root: c.dir, configPath: path });
    expect(Object.keys(loaded.config.themes ?? {})).toEqual(["light", "dark"]);
    const dark = loaded.config.themes?.dark;
    expect(dark?.palette?.brand).toBe("#a78bfa");

    c.stdout.length = 0;
    expect(await c.run(["build", "-f", "css,tailwind", "--tailwind-tint"])).toBe(0);
    expect(existsSync(join(c.dir, "tint", "dark", "tokens.css"))).toBe(true);
    expect(existsSync(join(c.dir, "tint", "tailwind.css"))).toBe(true);
    expect(await c.run(["check"])).toBe(0);
  });

  it("--yes without --dark writes a single-theme config", async () => {
    expect(await c.run(["init", "--yes"])).toBe(0);
    const source = readFileSync(join(c.dir, "tint.config.ts"), "utf8");
    expect(source).toContain("export default defineConfig({");
    expect(source).not.toContain('selector: ".dark"');
    const loaded = await loadConfig({ root: c.dir, configPath: "tint.config.ts" });
    expect(Object.keys(loaded.config.themes ?? {})).toEqual(["light"]);
  });

  it("refuses a bad --brand", async () => {
    expect(await c.run(["init", "--yes", "--brand", "blue"])).toBe(1);
    expect(c.err()).toContain('Invalid --brand color "blue"');
    expect(existsSync(join(c.dir, "tint.config.ts"))).toBe(false);
  });

  it("walks the interactive path with a scripted prompt", async () => {
    const asked: string[] = [];
    const answers = ["nope", "abc", "n"];
    const prompt = async (q: string) => {
      asked.push(q);
      return answers.shift() ?? "";
    };
    expect(await c.run(["init"], prompt)).toBe(0);
    expect(asked[0]).toContain("Brand color");
    expect(asked[1]).toContain("Brand color"); // re-asked after an invalid answer
    expect(asked[2]).toContain("dark");
    expect(c.err()).toContain('"nope" is not a hex color');
    const source = readFileSync(join(c.dir, "tint.config.ts"), "utf8");
    expect(source).toContain('color: "#aabbcc"');
    expect(source).not.toContain('selector: ".dark"');
  });

  it("uses the prompt default and asks before overwriting", async () => {
    c.write("tint.config.ts", "export default {}\n");
    let overwriteAsked = false;
    const prompt = async (q: string, def?: string) => {
      if (q.includes("Overwrite")) {
        overwriteAsked = true;
        return "";
      }
      return def ?? "";
    };
    expect(await c.run(["init"], prompt)).toBe(0);
    expect(overwriteAsked).toBe(true);
    expect(readFileSync(join(c.dir, "tint.config.ts"), "utf8")).toBe(
      "export default {}\n",
    );
    expect(c.out()).toContain("Aborted");

    expect(
      await c.run(["init"], async (q, def) =>
        q.includes("Overwrite") ? "y" : (def ?? ""),
      ),
    ).toBe(0);
    const source = readFileSync(join(c.dir, "tint.config.ts"), "utf8");
    expect(source).toContain('color: "#2563eb"');
    expect(source).toContain('selector: ".dark"'); // "Include a dark theme?" defaults to yes
  });
});

describe("normalizeHex", () => {
  it("accepts 3/6 digit hex with or without #", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("2563eb")).toBe("#2563eb");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });
});
