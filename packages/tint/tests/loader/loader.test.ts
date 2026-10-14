import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadConfig,
  findDefaultConfig,
  DEFAULT_CONFIG_FILES,
} from "../../src/loader/index.js";

const minimal = `{
  palette: { neutral: "#ffffff" },
  themes: { light: { mode: "light" } },
  tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } },
}`;

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "tint-loader-")));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("loads a JSON config", async () => {
    writeFileSync(
      join(dir, "tint.config.json"),
      JSON.stringify({
        palette: { neutral: "#fff" },
        themes: { light: { mode: "light" } },
        tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } },
      }),
    );
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.json" });
    expect(loaded.config.themes?.light?.mode).toBe("light");
    expect(loaded.config.palette.neutral).toBe("#fff");
    expect(loaded.dependencies).toEqual([join(dir, "tint.config.json")]);
  });

  it("loads an ESM .mjs config via native import", async () => {
    writeFileSync(join(dir, "tint.config.mjs"), `export default ${minimal};`);
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.mjs" });
    expect(loaded.config.themes?.light?.mode).toBe("light");
  });

  it("loads a TypeScript config with imports via esbuild and reports dependencies", async () => {
    mkdirSync(join(dir, "theme"));
    writeFileSync(
      join(dir, "theme", "tokens.ts"),
      `export const tokens = { surface: { DEFAULT: { kind: "surface", scale: 0 } } } as const;`,
    );
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { tokens } from "./theme/tokens";\nexport default { palette: { neutral: "#fff" }, themes: { light: { mode: "light" }, dark: { mode: "dark" } }, tokens };`,
    );
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(Object.keys(loaded.config.themes ?? {})).toEqual(["light", "dark"]);
    expect(loaded.dependencies).toContain(join(dir, "tint.config.ts"));
    expect(loaded.dependencies).toContain(join(dir, "theme", "tokens.ts"));
  });

  it("accepts a named config export", async () => {
    writeFileSync(join(dir, "tint.config.mjs"), `export const config = ${minimal};`);
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.mjs" });
    expect(loaded.config.themes?.light?.mode).toBe("light");
  });

  it("reports missing files, missing exports, and invalid configs clearly", async () => {
    await expect(loadConfig({ root: dir, configPath: "nope.ts" })).rejects.toThrow(
      /Config not found/,
    );
    writeFileSync(join(dir, "empty.mjs"), `export const other = 1;`);
    await expect(loadConfig({ root: dir, configPath: "empty.mjs" })).rejects.toThrow(
      /default export/,
    );
    writeFileSync(
      join(dir, "bad.mjs"),
      `export default { palette: { neutral: "#fff" }, tokens: { surface: { DEFAULT: { kind: "nope" } } } };`,
    );
    await expect(loadConfig({ root: dir, configPath: "bad.mjs" })).rejects.toThrow(
      /Invalid tint config in .*bad\.mjs/,
    );
    writeFileSync(join(dir, "syntax.ts"), `export default {{{`);
    await expect(loadConfig({ root: dir, configPath: "syntax.ts" })).rejects.toThrow(
      /Failed to compile/,
    );
  });

  it("points a v3-shaped config at the migration table", async () => {
    writeFileSync(
      join(dir, "v3.mjs"),
      `export default { name: "light", mode: "light", colors: { base: "#fff" }, tokens: { surface: { DEFAULT: { ls: 1 } } } };`,
    );
    await expect(loadConfig({ root: dir, configPath: "v3.mjs" })).rejects.toThrow(
      /migration table/,
    );
  });

  it("picks up changes to the same file across loads", async () => {
    const file = join(dir, "tint.config.ts");
    writeFileSync(file, `export default ${minimal};`);
    const first = await loadConfig({ root: dir, configPath: file });
    writeFileSync(file, `export default ${minimal.replace("#ffffff", "#000000")};`);
    const second = await loadConfig({ root: dir, configPath: file });
    expect(first.config.palette.neutral).toBe("#ffffff");
    expect(second.config.palette.neutral).toBe("#000000");
  });
});

describe("loadConfig — dependency edits", () => {
  it("reflects changes to an imported file even when the config itself is untouched", async () => {
    mkdirSync(join(dir, "theme"));
    const dep = join(dir, "theme", "name.ts");
    writeFileSync(dep, `export const color = "#111111";`);
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { color } from "./theme/name";\nexport default { palette: { neutral: color }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } };`,
    );
    const first = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    writeFileSync(dep, `export const color = "#222222";`);
    const second = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(first.config.palette.neutral).toBe("#111111");
    expect(second.config.palette.neutral).toBe("#222222");
  });
});

describe("findDefaultConfig", () => {
  it("returns null when nothing exists and the first match otherwise", () => {
    expect(findDefaultConfig(dir)).toBeNull();
    writeFileSync(join(dir, "tint.config.js"), "export default {}");
    writeFileSync(join(dir, "tint.config.ts"), "export default {}");
    expect(findDefaultConfig(dir)).toBe(join(dir, DEFAULT_CONFIG_FILES[0]));
  });
});

describe("loadConfig — bundling details", () => {
  const base = `{ palette: { neutral: "#fff" }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } }`;

  it("pins import.meta.url and __dirname to the real config location", async () => {
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "name.json"), JSON.stringify({ color: "#abcabc" }));
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\n` +
        `const a = JSON.parse(readFileSync(new URL("./data/name.json", import.meta.url), "utf8"));\n` +
        `const b = JSON.parse(readFileSync(join(__dirname, "data", "name.json"), "utf8"));\n` +
        `if (a.color !== b.color) throw new Error("mismatch");\n` +
        `export default { palette: { neutral: a.color }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } };`,
    );
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(loaded.config.palette.neutral).toBe("#abcabc");
    expect(loaded.dependencies.every((d) => d.startsWith("/"))).toBe(true);
    expect(loaded.dependencies.some((d) => d.includes("tint-stub"))).toBe(false);
  });

  it("rejects a v3 theme array with the migration hint", async () => {
    writeFileSync(
      join(dir, "tint.config.mjs"),
      `export default [{ name: "same", ...${base} }, { name: "same", ...${base} }];`,
    );
    await expect(
      loadConfig({ root: dir, configPath: "tint.config.mjs" }),
    ).rejects.toThrow(/v3 config array/);
    await expect(
      loadConfig({ root: dir, configPath: "tint.config.mjs" }),
    ).rejects.toThrow(/migration table/);
  });

  it("accepts a relative root", async () => {
    writeFileSync(join(dir, "tint.config.ts"), `export default ${base};`);
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const loaded = await loadConfig({ root: ".", configPath: "tint.config.ts" });
      expect(loaded.config.palette.neutral).toBe("#fff");
    } finally {
      process.chdir(previous);
    }
  });

  it("unwraps CommonJS named and default exports", async () => {
    writeFileSync(
      join(dir, "named.cjs"),
      `exports.config = { palette: { neutral: "#111111" }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } };`,
    );
    writeFileSync(
      join(dir, "def.cjs"),
      `module.exports = { default: { palette: { neutral: "#222222" }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } } };`,
    );
    writeFileSync(
      join(dir, "plain.cjs"),
      `module.exports = { palette: { neutral: "#333333" }, tokens: { surface: { DEFAULT: { kind: "surface", scale: 0 } } } };`,
    );
    expect(
      (await loadConfig({ root: dir, configPath: "named.cjs" })).config.palette.neutral,
    ).toBe("#111111");
    expect(
      (await loadConfig({ root: dir, configPath: "def.cjs" })).config.palette.neutral,
    ).toBe("#222222");
    expect(
      (await loadConfig({ root: dir, configPath: "plain.cjs" })).config.palette.neutral,
    ).toBe("#333333");
  });

  it("stubs @skylerknight/tint when it is not resolvable, and otherwise uses the real package", async () => {
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { defineConfig, surface } from "@skylerknight/tint";\nexport default defineConfig({ palette: { neutral: "#abcdef" }, tokens: { surface: { DEFAULT: surface(0) } } });`,
    );
    const stubbed = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(stubbed.config.palette.neutral).toBe("#abcdef");
    expect(stubbed.config.tokens.surface?.DEFAULT).toEqual({ kind: "surface", scale: 0 });

    // The playground resolves the real (built) package when dist exists, and the
    // stub otherwise. Either way the file is a v4 config.
    const playground = join(import.meta.dirname, "../../../../examples/vite-playground");
    const real = await loadConfig({ root: playground, configPath: "tint.config.ts" });
    expect(Object.keys(real.config.themes ?? {})).toEqual(["light", "dark"]);
    expect(real.config.palette.neutral).toBe("#ffffff");
    expect(real.config.tokens.action?.on).toEqual({
      kind: "text",
      scale: 5,
      on: "action",
    });
  });

  it("loads an open contrast scale and still rejects surface outside -10..10", async () => {
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { defineConfig, decorative, emphasis } from "@skylerknight/tint";
export default defineConfig({
  palette: { neutral: "#abcdef" },
  tokens: {
    action: { DEFAULT: emphasis(11) },
    hint: { DEFAULT: decorative(1.5) },
  },
});`,
    );
    const open = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(open.config.tokens.action?.DEFAULT).toEqual({ kind: "emphasis", scale: 11 });
    expect(open.config.tokens.hint?.DEFAULT).toEqual({
      kind: "decorative",
      scale: 1.5,
    });
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { defineConfig, surface } from "@skylerknight/tint";
export default defineConfig({
  palette: { neutral: "#abcdef" },
  tokens: { surface: { DEFAULT: surface(-11) } },
});`,
    );
    await expect(loadConfig({ root: dir, configPath: "tint.config.ts" })).rejects.toThrow(
      /scale -11 is outside -10\.\.10/,
    );
  });
});
