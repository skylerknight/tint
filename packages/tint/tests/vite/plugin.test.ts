import { EventEmitter } from "node:events";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import type { Plugin } from "vite";
import { generate } from "../../src/engine/generate.js";
import { loadConfig } from "../../src/loader/index.js";
import { tint } from "../../src/vite/index.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const TOKENS = `{
  surface: { DEFAULT: { ls: 1 } },
  text: { $on: "surface", body: { lc: 75 } },
}`;

function configSource(brand = "#3366ff"): string {
  return `export default {
  name: "light",
  mode: "light",
  colors: { base: "#ffffff", brand: "${brand}" },
  tokens: ${TOKENS},
};
`;
}

const CONFIG_WITH_IMPORT = `import { tokens } from "./theme/tokens";
export default { name: "light", mode: "light", colors: { base: "#fff", brand: "#3366ff" }, tokens };
`;
const TOKENS_MODULE = `export const tokens = ${TOKENS} as const;`;

interface FakeContext {
  addWatchFile: ReturnType<typeof vi.fn>;
  error: (message: string | Error) => never;
}

function createContext(): FakeContext {
  return {
    addWatchFile: vi.fn(),
    error: (message) => {
      throw message instanceof Error ? message : new Error(message);
    },
  };
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

type TransformFn = (
  this: FakeContext,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | null>;
type LoadFn = (this: FakeContext, id: string) => Promise<string | null>;
type ResolveIdFn = (id: string) => string | null;

function hooks(plugin: Plugin) {
  return {
    transform: plugin.transform as unknown as TransformFn,
    load: plugin.load as unknown as LoadFn,
    resolveId: plugin.resolveId as unknown as ResolveIdFn,
    configResolved: plugin.configResolved as unknown as (config: unknown) => void,
    configureServer: plugin.configureServer as unknown as (server: unknown) => void,
  };
}

function createPlugin(root: string, options?: Parameters<typeof tint>[0]) {
  const logger = createLogger();
  const plugin = tint(options);
  const h = hooks(plugin);
  h.configResolved({ root, logger });
  return { plugin, logger, ...h };
}

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "tint-vite-")));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────
// Plugin shape
// ─────────────────────────────────────────────────────────────

describe("plugin object", () => {
  it("is named and enforced pre", () => {
    const plugin = tint();
    expect(plugin.name).toBe("vite-plugin-tint");
    expect(plugin.enforce).toBe("pre");
  });
});

// ─────────────────────────────────────────────────────────────
// transform
// ─────────────────────────────────────────────────────────────

describe("transform", () => {
  it("returns null for non-CSS ids", async () => {
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@tint "./tint.config.ts";`,
      join(dir, "main.ts"),
    );
    expect(result).toBeNull();
  });

  it("returns null for CSS without a directive", async () => {
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@import "tailwindcss";`,
      join(dir, "app.css"),
    );
    expect(result).toBeNull();
  });

  it("replaces the directive with the tint Tailwind output", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@import "tailwindcss";\n@tint "./tint.config.ts";\n`,
      join(dir, "app.css"),
    );
    expect(result).not.toBeNull();
    expect(result!.code).not.toContain("@tint");
    expect(result!.code).toContain(`@import "tailwindcss";`);
    expect(result!.code).toContain("@theme static");
    expect(result!.code).toContain("@utility tint-brand");
    expect(result!.code).toContain("--base-surface:");
  });

  it("handles single quotes, no semicolon, and ids with a query string", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@tint './tint.config.ts'\nbody { color: red }`,
      join(dir, "app.css") + "?direct",
    );
    expect(result!.code).toContain("@theme static");
    expect(result!.code).toContain("body { color: red }");
    expect(result!.code).not.toContain("@tint");
  });

  it("replaces two directives in one file", async () => {
    writeFileSync(join(dir, "a.config.ts"), configSource("#ff0000"));
    writeFileSync(join(dir, "b.config.ts"), configSource("#00ff00"));
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@tint "./a.config.ts";\n/* between */\n@tint "./b.config.ts";`,
      join(dir, "app.css"),
    );
    const code = result!.code;
    expect(code).not.toContain("@tint");
    expect(code.match(/@theme static/g)).toHaveLength(2);
    expect(code).toContain("/* between */");
    const [first, second] = code.split("/* between */");
    expect(first).not.toEqual(second);
  });

  it("resolves the config path relative to a nested CSS file", async () => {
    mkdirSync(join(dir, "src", "styles"), { recursive: true });
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir);
    const result = await transform.call(
      createContext(),
      `@tint "../../tint.config.ts";`,
      join(dir, "src", "styles", "app.css"),
    );
    expect(result!.code).toContain("@theme static");
  });

  it("caches per config path and does not reload without a change event", async () => {
    const configPath = join(dir, "tint.config.ts");
    writeFileSync(configPath, configSource("#3366ff"));
    const { transform } = createPlugin(dir);
    const css = `@tint "./tint.config.ts";`;

    const first = await transform.call(createContext(), css, join(dir, "app.css"));
    writeFileSync(configPath, configSource("#ff0000"));
    const second = await transform.call(createContext(), css, join(dir, "other.css"));

    expect(second!.code).toBe(first!.code);
  });

  it("registers the config and its imported dependencies as watch files", async () => {
    mkdirSync(join(dir, "theme"));
    writeFileSync(join(dir, "theme", "tokens.ts"), TOKENS_MODULE);
    writeFileSync(join(dir, "tint.config.ts"), CONFIG_WITH_IMPORT);
    const { transform } = createPlugin(dir);
    const context = createContext();
    await transform.call(context, `@tint "./tint.config.ts";`, join(dir, "app.css"));

    const watched = context.addWatchFile.mock.calls.map((call) => call[0]);
    expect(watched).toContain(join(dir, "tint.config.ts"));
    expect(watched).toContain(join(dir, "theme", "tokens.ts"));
  });

  it("surfaces load errors through this.error with the config path", async () => {
    const configPath = join(dir, "tint.config.ts");
    writeFileSync(
      configPath,
      `export default { name: "x", mode: "sideways", colors: { base: "#fff" }, tokens: ${TOKENS} };`,
    );
    const { transform } = createPlugin(dir);
    await expect(
      transform.call(createContext(), `@tint "./tint.config.ts";`, join(dir, "app.css")),
    ).rejects.toThrow(configPath);
  });

  it("reports a missing config with its path", async () => {
    const { transform } = createPlugin(dir);
    await expect(
      transform.call(createContext(), `@tint "./missing.ts";`, join(dir, "app.css")),
    ).rejects.toThrow(/missing\.ts/);
  });

  it("logs generation diagnostics once per load via the Vite logger", async () => {
    // A palette named like a Tailwind utility prefix triggers a warning diagnostic.
    writeFileSync(
      join(dir, "tint.config.ts"),
      `export default { name: "light", mode: "light", colors: { base: "#fff", text: "#333" }, tokens: ${TOKENS} };`,
    );
    const { transform, logger } = createPlugin(dir);
    const css = `@tint "./tint.config.ts";`;
    await transform.call(createContext(), css, join(dir, "a.css"));
    await transform.call(createContext(), css, join(dir, "b.css"));

    const warnings = logger.warn.mock.calls.map((call) => String(call[0]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[tint\] tint\.config\.ts: /);
    expect(warnings[0]).toContain("text");
  });

  it("forwards only utility options to the formatter", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir, {
      generateTintUtilities: false,
      intellisense: false,
    });
    const result = await transform.call(
      createContext(),
      `@tint "./tint.config.ts";`,
      join(dir, "app.css"),
    );
    expect(result!.code).toContain("@theme {");
    expect(result!.code).not.toContain("@theme static");
    expect(result!.code).not.toContain("@utility tint-brand");
  });
});

// ─────────────────────────────────────────────────────────────
// IntelliSense file
// ─────────────────────────────────────────────────────────────

describe("intellisense", () => {
  const intellisensePath = () => join(dir, "node_modules", ".tint", "intellisense.css");

  it("writes node_modules/.tint/intellisense.css with static hex values", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir);
    await transform.call(
      createContext(),
      `@tint "./tint.config.ts";`,
      join(dir, "app.css"),
    );

    expect(existsSync(intellisensePath())).toBe(true);
    const content = readFileSync(intellisensePath(), "utf8");
    expect(content).toContain("@import 'tailwindcss';");
    expect(content).toContain("--color-base-surface: #");
    expect(content).toContain("/* Unprefixed colors (for tint-* utility classes) */");
  });

  it("concatenates the output of every loaded config", async () => {
    writeFileSync(join(dir, "a.config.ts"), configSource("#ff0000"));
    writeFileSync(join(dir, "b.config.ts"), configSource("#00ff00"));
    const { transform } = createPlugin(dir);
    await transform.call(createContext(), `@tint "./a.config.ts";`, join(dir, "a.css"));
    await transform.call(createContext(), `@tint "./b.config.ts";`, join(dir, "b.css"));

    const content = readFileSync(intellisensePath(), "utf8");
    expect(content.match(/@theme \{/g)).toHaveLength(2);
  });

  it("skips the file when intellisense is false", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { transform } = createPlugin(dir, { intellisense: false });
    await transform.call(
      createContext(),
      `@tint "./tint.config.ts";`,
      join(dir, "app.css"),
    );
    expect(existsSync(intellisensePath())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Virtual module
// ─────────────────────────────────────────────────────────────

describe("virtual module", () => {
  it("resolves virtual:tint and virtual:tint/<path>", () => {
    const { resolveId } = createPlugin(dir);
    expect(resolveId("virtual:tint")).toBe("\0virtual:tint");
    expect(resolveId("virtual:tint/tint.config.ts")).toBe(
      "\0virtual:tint/tint.config.ts",
    );
    expect(resolveId("virtual:tinted")).toBeNull();
    expect(resolveId("./app.css")).toBeNull();
  });

  it("returns null from load for unrelated ids", async () => {
    const { load } = createPlugin(dir);
    expect(await load.call(createContext(), join(dir, "main.ts"))).toBeNull();
  });

  it("loads the first @tint config as JSON matching generate()", async () => {
    writeFileSync(join(dir, "a.config.ts"), configSource("#ff0000"));
    writeFileSync(join(dir, "b.config.ts"), configSource("#00ff00"));
    const { transform, load } = createPlugin(dir);
    await transform.call(createContext(), `@tint "./a.config.ts";`, join(dir, "a.css"));
    await transform.call(createContext(), `@tint "./b.config.ts";`, join(dir, "b.css"));

    const code = await load.call(createContext(), "\0virtual:tint");
    expect(code).toMatch(/^export default /);
    const exported: unknown = JSON.parse(
      code!.replace(/^export default /, "").replace(/;$/, ""),
    );

    const loaded = await loadConfig({ root: dir, configPath: "a.config.ts" });
    expect(exported).toEqual(JSON.parse(JSON.stringify(generate(loaded.configs))));
  });

  it("loads a specific config via virtual:tint/<path> relative to the root", async () => {
    mkdirSync(join(dir, "config"));
    writeFileSync(join(dir, "config", "tint.config.ts"), configSource("#123456"));
    const { load } = createPlugin(dir);
    const context = createContext();

    const code = await load.call(context, "\0virtual:tint/config/tint.config.ts");
    const exported = JSON.parse(code!.replace(/^export default /, "").replace(/;$/, ""));
    const loaded = await loadConfig({ root: dir, configPath: "config/tint.config.ts" });
    expect(exported).toEqual(JSON.parse(JSON.stringify(generate(loaded.configs))));
    expect(context.addWatchFile).toHaveBeenCalledWith(
      join(dir, "config", "tint.config.ts"),
    );
  });

  it("falls back to the default config when nothing has been transformed yet", async () => {
    writeFileSync(join(dir, "tint.config.ts"), configSource());
    const { load } = createPlugin(dir);
    const code = await load.call(createContext(), "\0virtual:tint");
    expect(code).toContain('"name":"light"');
  });

  it("errors helpfully when no config can be found", async () => {
    const { load } = createPlugin(dir);
    await expect(load.call(createContext(), "\0virtual:tint")).rejects.toThrow(
      /virtual:tint.*@tint/s,
    );
  });

  it("includes the config path in load errors", async () => {
    const configPath = join(dir, "tint.config.ts");
    writeFileSync(configPath, `export default { name: "x" };`);
    const { load } = createPlugin(dir);
    await expect(
      load.call(createContext(), "\0virtual:tint/tint.config.ts"),
    ).rejects.toThrow(configPath);
  });
});

// ─────────────────────────────────────────────────────────────
// Dev server wiring
// ─────────────────────────────────────────────────────────────

function createFakeServer(logger = createLogger()) {
  const watcher = new EventEmitter();
  const modules = new Map<string, { id: string }>();
  const moduleGraph = {
    getModuleById: vi.fn((id: string) => modules.get(id)),
    invalidateModule: vi.fn(),
  };
  const ws = { send: vi.fn() };
  return {
    server: { watcher, moduleGraph, ws, config: { logger } },
    watcher,
    moduleGraph,
    modules,
    ws,
    logger,
  };
}

describe("configureServer", () => {
  it("regenerates, invalidates importers and reloads when a dependency changes", async () => {
    mkdirSync(join(dir, "theme"));
    const tokensPath = join(dir, "theme", "tokens.ts");
    writeFileSync(tokensPath, TOKENS_MODULE);
    // A `text` palette produces a warning diagnostic, which is logged once per load.
    writeFileSync(
      join(dir, "tint.config.ts"),
      `import { tokens } from "./theme/tokens";
export default { name: "light", mode: "light", colors: { base: "#fff", text: "#333" }, tokens };`,
    );

    const { transform, load, configureServer, logger } = createPlugin(dir);
    const fake = createFakeServer(logger);
    configureServer(fake.server);

    const cssId = join(dir, "app.css");
    writeFileSync(cssId, "");
    fake.modules.set(cssId, { id: cssId });
    fake.modules.set("\0virtual:tint", { id: "\0virtual:tint" });

    const css = `@tint "./tint.config.ts";`;
    await transform.call(createContext(), css, cssId);
    await load.call(createContext(), "\0virtual:tint");
    expect(logger.warn).toHaveBeenCalledTimes(1);

    // Unrelated file: nothing happens.
    fake.watcher.emit("change", join(dir, "README.md"));
    expect(fake.ws.send).not.toHaveBeenCalled();
    expect(fake.moduleGraph.invalidateModule).not.toHaveBeenCalled();

    // A change to the file imported by the config (not the config itself).
    fake.watcher.emit("change", tokensPath);

    expect(fake.moduleGraph.invalidateModule).toHaveBeenCalledWith({ id: cssId });
    expect(fake.moduleGraph.invalidateModule).toHaveBeenCalledWith({
      id: "\0virtual:tint",
    });
    expect(fake.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
    expect(logger.info).toHaveBeenCalledWith(
      "[tint] tint.config.ts changed, regenerating",
    );

    // The cache was dropped: the next transform loads (and logs diagnostics) again.
    await transform.call(createContext(), css, cssId);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("serves fresh output after the config file itself changes", async () => {
    const configPath = join(dir, "tint.config.ts");
    writeFileSync(configPath, configSource("#3366ff"));
    const { transform, configureServer } = createPlugin(dir);
    const fake = createFakeServer();
    configureServer(fake.server);

    const cssId = join(dir, "app.css");
    const css = `@tint "./tint.config.ts";`;
    const before = await transform.call(createContext(), css, cssId);

    // Ensure a distinct mtime for the rewritten config.
    await new Promise((resolve) => setTimeout(resolve, 10));
    writeFileSync(configPath, configSource("#ff0000"));
    fake.watcher.emit("change", configPath);
    expect(fake.ws.send).toHaveBeenCalledWith({ type: "full-reload" });

    const after = await transform.call(createContext(), css, cssId);
    expect(after!.code).not.toBe(before!.code);
    expect(after!.code).toContain("--brand-surface:");
  });

  it("handles unlink of the config itself", async () => {
    const configPath = join(dir, "tint.config.ts");
    writeFileSync(configPath, configSource());
    const { transform, configureServer } = createPlugin(dir);
    const fake = createFakeServer();
    configureServer(fake.server);

    const cssId = join(dir, "app.css");
    await transform.call(createContext(), `@tint "./tint.config.ts";`, cssId);

    rmSync(configPath);
    fake.watcher.emit("unlink", configPath);
    expect(fake.ws.send).toHaveBeenCalledWith({ type: "full-reload" });

    await expect(
      transform.call(createContext(), `@tint "./tint.config.ts";`, cssId),
    ).rejects.toThrow(/Config not found/);
  });
});

// ─────────────────────────────────────────────────────────────
// Integration: real vite build
// ─────────────────────────────────────────────────────────────

describe("vite build", () => {
  it("emits the generated CSS in the built asset", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tint.config.ts"), configSource("#3366ff"));
    writeFileSync(join(dir, "src", "app.css"), `@tint "../tint.config.ts";\n`);
    writeFileSync(
      join(dir, "index.html"),
      `<!doctype html><html><head><link rel="stylesheet" href="/src/app.css"></head><body></body></html>`,
    );

    const output = await build({
      root: dir,
      logLevel: "silent",
      configFile: false,
      plugins: [tint({ intellisense: false })],
      build: { write: false, cssMinify: false, minify: false },
    });

    const bundle = Array.isArray(output) ? output[0] : output;
    const chunks = "output" in bundle! ? bundle.output : [];
    const cssAsset = chunks.find(
      (item) => item.type === "asset" && item.fileName.endsWith(".css"),
    );
    expect(cssAsset).toBeDefined();
    const css = String((cssAsset as { source: string | Uint8Array }).source);
    expect(css).toContain("--base-surface:");
    expect(css).toContain("--brand-surface:");
    expect(css).toContain("@theme static");
    expect(css).not.toContain("@tint");
  }, 10_000);
});
