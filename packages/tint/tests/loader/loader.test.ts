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
  name: "light",
  mode: "light",
  colors: { base: "#ffffff" },
  tokens: { surface: { DEFAULT: { ls: 1 } }, text: { $on: "surface", body: { lc: 75 } } },
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
        name: "light",
        mode: "light",
        colors: { base: "#fff" },
        tokens: { surface: { DEFAULT: { ls: 1 } } },
      }),
    );
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.json" });
    expect(loaded.configs).toHaveLength(1);
    expect(loaded.configs[0]!.name).toBe("light");
    expect(loaded.dependencies).toEqual([join(dir, "tint.config.json")]);
  });

  it("loads an ESM .mjs config via native import", async () => {
    writeFileSync(join(dir, "tint.config.mjs"), `export default ${minimal};`);
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.mjs" });
    expect(loaded.configs[0]!.mode).toBe("light");
  });

  it("loads a TypeScript config with imports via esbuild and reports dependencies", async () => {
    mkdirSync(join(dir, "theme"));
    writeFileSync(
      join(dir, "theme", "tokens.ts"),
      `export const tokens = { surface: { DEFAULT: { ls: 1 } } } as const;`,
    );
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { tokens } from "./theme/tokens";\nconst name: string = "light";\nexport default [{ name, mode: "light", colors: { base: "#fff" }, tokens }, { name: "dark", mode: "dark", colors: { base: "#000" }, tokens }];`,
    );
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(loaded.configs.map((c) => c.name)).toEqual(["light", "dark"]);
    expect(loaded.dependencies).toContain(join(dir, "tint.config.ts"));
    expect(loaded.dependencies).toContain(join(dir, "theme", "tokens.ts"));
  });

  it("accepts a named config export", async () => {
    writeFileSync(join(dir, "tint.config.mjs"), `export const config = ${minimal};`);
    const loaded = await loadConfig({ root: dir, configPath: "tint.config.mjs" });
    expect(loaded.configs[0]!.name).toBe("light");
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
      `export default { name: "x", mode: "sideways", colors: {}, tokens: {} };`,
    );
    await expect(loadConfig({ root: dir, configPath: "bad.mjs" })).rejects.toThrow(
      /Invalid tint config in .*bad\.mjs/,
    );
    writeFileSync(join(dir, "syntax.ts"), `export default {{{`);
    await expect(loadConfig({ root: dir, configPath: "syntax.ts" })).rejects.toThrow(
      /Failed to compile/,
    );
  });

  it("picks up changes to the same file across loads", async () => {
    const file = join(dir, "tint.config.ts");
    writeFileSync(file, `export default ${minimal};`);
    const first = await loadConfig({ root: dir, configPath: file });
    writeFileSync(file, `export default ${minimal.replace('"light"', '"changed"')};`);
    const second = await loadConfig({ root: dir, configPath: file });
    expect(first.configs[0]!.name).toBe("light");
    expect(second.configs[0]!.name).toBe("changed");
  });
});

describe("loadConfig — dependency edits", () => {
  it("reflects changes to an imported file even when the config itself is untouched", async () => {
    mkdirSync(join(dir, "theme"));
    const dep = join(dir, "theme", "name.ts");
    writeFileSync(dep, `export const name = "first";`);
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { name } from "./theme/name";\nexport default { name, mode: "light", colors: { base: "#fff" }, tokens: { surface: { DEFAULT: { ls: 1 } } } };`,
    );
    const first = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    writeFileSync(dep, `export const name = "second";`);
    const second = await loadConfig({ root: dir, configPath: "tint.config.ts" });
    expect(first.configs[0]!.name).toBe("first");
    expect(second.configs[0]!.name).toBe("second");
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
