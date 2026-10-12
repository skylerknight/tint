import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postcss, { CssSyntaxError } from "postcss";
import type { Message } from "postcss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import tintPostCSS, { tint } from "../../src/postcss/index.js";
import type { TintPostCSSOptions } from "../../src/postcss/index.js";

const TOKENS = `export const tokens = {
  surface: { DEFAULT: { kind: "surface" }, raised: { kind: "surface", level: "raised" } },
  text: { strong: { kind: "text", level: "strong" }, body: { kind: "text" } },
  action: { DEFAULT: { kind: "emphasis" } },
};`;

const CONFIG = `import { tokens } from "./tokens";
export default {
  palette: { neutral: "#ffffff", brand: "#3b82f6" },
  themes: {
    light: { mode: "light" },
    dark: { mode: "dark" },
  },
  tokens,
};`;

let dir: string;
let from: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "tint-postcss-")));
  from = join(dir, "app.css");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFixture(config = CONFIG, tokens = TOKENS): void {
  writeFileSync(join(dir, "tokens.ts"), tokens);
  writeFileSync(join(dir, "tint.config.ts"), config);
}

function run(css: string, options: TintPostCSSOptions = {}) {
  return postcss([tintPostCSS({ root: dir, ...options })]).process(css, { from });
}

function dependencies(messages: Message[]): string[] {
  return messages
    .filter((m) => m.type === "dependency")
    .map((m) => (m as Message & { file: string }).file);
}

function cacheFile(configPath: string): string {
  const hash = createHash("md5").update(configPath).digest("hex");
  return join(dir, "node_modules", ".tint", "cache", `${hash}.css`);
}

const intellisenseFile = () => join(dir, "node_modules", ".tint", "intellisense.css");

describe("tint PostCSS plugin", () => {
  it("exports the plugin as default and as `tint`", () => {
    expect(tint).toBe(tintPostCSS);
    expect(tintPostCSS.postcss).toBe(true);
  });

  it("replaces the @tint at-rule with generated Tailwind CSS", async () => {
    writeFixture();
    const result = await run(`@tint "./tint.config.ts";\n.app { color: red; }`);

    expect(result.css).not.toContain("@tint");
    expect(result.css).toContain("@theme static");
    expect(result.css).toContain("--neutral-surface:");
    expect(result.css).toContain("--brand-text-strong:");
    expect(result.css).toContain("@utility tint-brand");
    expect(result.css).toContain(".app { color: red; }");
    expect(result.warnings()).toHaveLength(0);
  });

  it("accepts single quotes, double quotes, and bare paths", async () => {
    writeFixture();
    for (const params of [
      `"./tint.config.ts"`,
      `'./tint.config.ts'`,
      `./tint.config.ts`,
    ]) {
      const result = await run(`@tint ${params};`);
      expect(result.css).not.toContain("@tint");
      expect(result.css).toContain("@theme static");
    }
  });

  it("registers dependency messages for the config and its imports", async () => {
    writeFixture();
    const result = await run(`@tint "./tint.config.ts";`);

    const deps = dependencies(result.messages);
    expect(deps).toContain(join(dir, "tint.config.ts"));
    expect(deps).toContain(join(dir, "tokens.ts"));
    expect(new Set(deps).size).toBe(deps.length);

    const message = result.messages.find((m) => m.type === "dependency") as
      (Message & { parent?: string }) | undefined;
    expect(message?.parent).toBe(from);
    expect(message?.plugin).toBe("postcss-tint");
  });

  it("turns generation diagnostics into PostCSS warnings", async () => {
    writeFixture(
      CONFIG,
      `export const tokens = {
        surface: { DEFAULT: { kind: "surface" } },
        ink: { impossible: { kind: "text", direction: "lighter", lc: 108 } },
      };`,
    );
    const result = await run(`@tint "./tint.config.ts";`);

    const warnings = result.warnings();
    expect(warnings.length).toBeGreaterThan(0);
    const unreachable = warnings.find((w) => /neutral\.ink\.impossible/.test(w.text));
    expect(unreachable).toBeDefined();
    expect(unreachable!.text).toMatch(/^\[tint\] neutral\.ink\.impossible: /);
    expect(unreachable!.text).toMatch(/Lc 108/);
    expect(unreachable!.plugin).toBe("postcss-tint");
    expect(unreachable!.node?.type).toBe("atrule");
    expect(result.css).toContain("@theme static");
  });

  it("writes the IntelliSense file with static hex values on the tint path", async () => {
    writeFixture();
    await run(`@tint "./tint.config.ts";`);

    expect(existsSync(intellisenseFile())).toBe(true);
    const contents = readFileSync(intellisenseFile(), "utf8");
    expect(contents).toContain("@import 'tailwindcss';");
    expect(contents).toContain("@theme {");
    expect(contents).toMatch(/--color-surface: #[0-9a-f]{6};/);
    expect(contents).toContain("/* Unprefixed colors (for tint-* utility classes) */");
    expect(contents).toMatch(/--color-text-strong: #[0-9a-f]{6};/);
    expect(contents).not.toContain("var(");
  });

  it("writes the generated CSS to the cache", async () => {
    writeFixture();
    const result = await run(`@tint "./tint.config.ts";`);

    const cache = cacheFile(join(dir, "tint.config.ts"));
    expect(existsSync(cache)).toBe(true);
    const cached = readFileSync(cache, "utf8");
    expect(cached).toContain("@theme static");
    expect(result.css).toContain(cached.split("\n")[0]!);
  });

  it("throws a CssSyntaxError naming the config when loading fails with no cache", async () => {
    const promise = run(`@tint "./missing.config.ts";`);
    await expect(promise).rejects.toBeInstanceOf(CssSyntaxError);
    await expect(promise).rejects.toThrow(/Failed to load tint config/);
    await expect(promise).rejects.toThrow(/missing\.config\.ts/);
  });

  it("serves the cached output with a comment and a warning when loading fails", async () => {
    writeFixture();
    const good = await run(`@tint "./tint.config.ts";`);
    expect(good.warnings()).toHaveLength(0);

    writeFileSync(join(dir, "tint.config.ts"), `export default { name: "broken" };`);
    const result = await run(`@tint "./tint.config.ts";\n.app { color: red; }`);

    expect(result.css).toMatch(/^\/\* \[tint\] Error: /);
    expect(result.css).toContain("@theme static");
    expect(result.css).toContain(".app { color: red; }");
    expect(result.css).not.toContain("@tint");

    const warnings = result.warnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.text).toMatch(
      /^\[tint\] Config error \(serving cached output\): /,
    );
    expect(warnings[0]!.text).toMatch(/Invalid tint config/);

    // The config stays registered so the bundler re-runs once it is fixed.
    expect(dependencies(result.messages)).toContain(join(dir, "tint.config.ts"));
  });

  it("sanitizes comment terminators in the error message", async () => {
    writeFixture();
    await run(`@tint "./tint.config.ts";`);

    writeFileSync(
      join(dir, "tint.config.ts"),
      `throw new Error("boom */ .evil { color: red }");`,
    );
    const result = await run(`@tint "./tint.config.ts";`);

    const [head, ...rest] = result.css.split("\n");
    expect(head).toMatch(/^\/\* \[tint\] Error: .*\*\/$/);
    expect(head).not.toContain("boom */");
    expect(rest.join("\n")).toContain("@theme static");
  });

  it("errors when the at-rule has no path", async () => {
    for (const css of [`@tint;`, `@tint "";`, `@tint '';`]) {
      const promise = run(css);
      await expect(promise).rejects.toBeInstanceOf(CssSyntaxError);
      await expect(promise).rejects.toThrow(/Missing config path in @tint directive/);
    }
  });

  it("processes multiple @tint at-rules in one file", async () => {
    writeFixture();
    mkdirSync(join(dir, "other"));
    writeFileSync(
      join(dir, "other", "tint.config.ts"),
      `export default { palette: { neutral: "#fff" }, tokens: { surface: { DEFAULT: { kind: "surface" } } } };`,
    );
    const result = await run(
      `@tint "./tint.config.ts";\n@tint "./other/tint.config.ts";`,
    );

    expect(result.css).not.toContain("@tint");
    expect(result.css.match(/@theme static/g)).toHaveLength(2);
    const deps = dependencies(result.messages);
    expect(deps).toContain(join(dir, "tint.config.ts"));
    expect(deps).toContain(join(dir, "other", "tint.config.ts"));
  });

  it("omits tint utilities and the IntelliSense file when tintUtilities is false", async () => {
    writeFixture();
    const result = await run(`@tint "./tint.config.ts";`, {
      tintUtilities: false,
    });

    expect(result.css).not.toContain("@tint");
    expect(result.css).toContain("@theme static");
    expect(result.css).not.toContain("@utility tint-");
    expect(result.css).toContain("--neutral-surface:");
    expect(existsSync(intellisenseFile())).toBe(false);
  });

  it("forwards formatter options such as format", async () => {
    writeFixture();
    const result = await run(`@tint "./tint.config.ts";`, { format: "hex" });

    expect(result.css).toMatch(/--neutral-surface: #[0-9a-f]{6};/);
    expect(result.css).toContain("@utility tint-brand");

    const contents = readFileSync(intellisenseFile(), "utf8");
    expect(contents).toMatch(/--color-surface: #[0-9a-f]{6};/);
    expect(contents).not.toContain("var(");
  });

  it("defaults root to process.cwd()", async () => {
    writeFixture();
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const result = await postcss([tintPostCSS()]).process(`@tint "./tint.config.ts";`, {
        from,
      });
      expect(result.css).toContain("@theme static");
      expect(dependencies(result.messages)).toContain(join(dir, "tint.config.ts"));
    } finally {
      process.chdir(previous);
    }
  });
});
