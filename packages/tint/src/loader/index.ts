import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigError } from "../v4/errors.js";
import type { Config } from "../v4/types.js";
import { assertConfig } from "../v4/validate.js";

export interface LoadOptions {
  /** Directory config paths resolve against (default `process.cwd()`). */
  root?: string;
  configPath: string;
}

export interface LoadedConfig {
  /** Validated v4 config. A v3-shaped document throws {@link ConfigError}. */
  config: Config;
  /** Absolute path of the config file. */
  path: string;
  /** Absolute paths of every file bundled into the config (including itself). */
  dependencies: string[];
}

/** File names probed, in order, when no explicit config path is given. */
export const DEFAULT_CONFIG_FILES = [
  "tint.config.ts",
  "tint.config.mts",
  "tint.config.js",
  "tint.config.mjs",
  "tint.config.json",
] as const;

const TINT_DIR = "node_modules/.tint";
const TS_EXTENSIONS = new Set([".ts", ".mts", ".cts"]);
let loadCounter = 0;

/** Return the first default config file that exists in `root`, or null. */
export function findDefaultConfig(root = process.cwd()): string | null {
  for (const name of DEFAULT_CONFIG_FILES) {
    const full = resolve(root, name);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * Load a tint v4 config file (`.ts`, `.mts`, `.js`, `.mjs`, `.cjs`, or `.json`)
 * and validate it. A v3 theme array or v3-shaped object fails with the
 * migration error from the v4 validator.
 */
export async function loadConfig(options: LoadOptions): Promise<LoadedConfig> {
  const root = resolve(options.root ?? process.cwd());
  const path = isAbsolute(options.configPath)
    ? options.configPath
    : resolve(root, options.configPath);

  if (!existsSync(path)) {
    throw new Error(`Config not found: ${path}`);
  }

  const ext = extname(path).toLowerCase();
  let exported: unknown;
  let dependencies: string[] = [path];
  let isModule = true;

  if (ext === ".json") {
    exported = JSON.parse(readFileSync(path, "utf8"));
    isModule = false;
  } else if (TS_EXTENSIONS.has(ext)) {
    ({ exported, dependencies } = await loadWithEsbuild(path, root));
  } else {
    try {
      exported = await importFresh(path);
    } catch (error) {
      // Plain JS that still needs bundling (e.g. imports a .ts file) — fall back to esbuild.
      if (!isEsbuildWorthRetrying(error)) throw error;
      ({ exported, dependencies } = await loadWithEsbuild(path, root));
    }
  }

  const config = unwrapExport(exported, path, isModule);
  return { config, path, dependencies };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function unwrapExport(exported: unknown, path: string, isModule: boolean): Config {
  let value = exported;
  if (isModule) {
    value = unwrapModule(value);
  }
  if (value === undefined || value === null) {
    throw new Error(
      `${path} must export a tint config as its default export (or a named "config" export).\n` +
        `Example: export default defineConfig({ ... })`,
    );
  }
  try {
    return assertConfig(value);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new ConfigError(error.issues, `Invalid tint config in ${path}`);
    }
    throw error;
  }
}

/**
 * Pick the config out of a module namespace. Handles ESM (`default` / `config`) and
 * CommonJS, where `import()` yields `{ default: module.exports }` so the real export
 * may sit one level deeper.
 */
function unwrapModule(value: unknown): unknown {
  const mod = (value ?? {}) as { default?: unknown; config?: unknown };
  let candidate = mod.default ?? mod.config;
  if (looksLikeModuleWrapper(candidate)) {
    const inner = candidate as { default?: unknown; config?: unknown };
    candidate = inner.default ?? inner.config;
  }
  return candidate;
}

function looksLikeModuleWrapper(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const isConfigShaped = "palette" in obj || "tokens" in obj || "colors" in obj;
  return !isConfigShaped && ("default" in obj || "config" in obj);
}

async function importFresh(path: string): Promise<unknown> {
  const mtime = statSync(path).mtimeMs;
  const url = `${pathToFileURL(path).href}?t=${mtime}`;
  return import(url);
}

function isEsbuildWorthRetrying(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === "ERR_UNKNOWN_FILE_EXTENSION" ||
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "ERR_REQUIRE_ESM" ||
    error instanceof SyntaxError
  );
}

async function loadEsbuild(): Promise<typeof import("esbuild")> {
  try {
    return await import("esbuild");
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      "Loading a TypeScript tint config requires esbuild, an optional peer dependency of " +
        `@skylerknight/tint. Install it with: npm install -D esbuild${detail}`,
    );
  }
}

async function loadWithEsbuild(
  path: string,
  root: string,
): Promise<{ exported: unknown; dependencies: string[] }> {
  const { build } = await loadEsbuild();
  const dir = resolve(root, TINT_DIR);
  mkdirSync(dir, { recursive: true });

  const hash = createHash("md5").update(path).digest("hex").slice(0, 12);
  // The name must change on every load: imported dependencies can change without the
  // config's own mtime moving, and module caches key on the file path.
  const stamp = `${Date.now().toString(36)}${(loadCounter++).toString(36)}`;
  const outfile = join(dir, `config.${hash}.${stamp}.${process.pid}.mjs`);

  try {
    const result = await build({
      entryPoints: [path],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node18",
      absWorkingDir: root,
      plugins: [tintStubPlugin()],
      // The bundle runs from node_modules/.tint, so pin location-dependent globals to
      // the real config file and shim `require` for bundled CommonJS dependencies.
      define: {
        "import.meta.url": JSON.stringify(pathToFileURL(path).href),
        "import.meta.filename": JSON.stringify(path),
        "import.meta.dirname": JSON.stringify(dirname(path)),
        __filename: JSON.stringify(path),
        __dirname: JSON.stringify(dirname(path)),
      },
      banner: {
        js: 'import { createRequire as __tintCreateRequire } from "node:module";\nconst require = __tintCreateRequire(import.meta.url);',
      },
      metafile: true,
      write: true,
      logLevel: "silent",
    });

    const dependencies = new Set<string>([path]);
    for (const input of Object.keys(result.metafile.inputs)) {
      // Skip plugin namespaces (e.g. "tint-stub:@skylerknight/tint") and packages.
      if (/^[a-z][a-z0-9-]*:/i.test(input) || input.includes("node_modules")) continue;
      dependencies.add(isAbsolute(input) ? input : resolve(root, input));
    }

    const exported = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
    return { exported, dependencies: [...dependencies] };
  } catch (error) {
    throw decorateEsbuildError(error, path);
  } finally {
    try {
      unlinkSync(outfile);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

/**
 * Stand-in for `@skylerknight/tint` when the package cannot be resolved.
 * Kind functions match the v4 return shape so the loaded object validates.
 * Validation still happens in the loader, against the real validator.
 */
const TINT_STUB = `function __tintKind(kind) {
  return function (scale, options) {
    const token = { kind: kind, scale: scale };
    if (options && typeof options === "object") Object.assign(token, options);
    return token;
  };
}
export const defineConfig = (config) => config;
export const surface = __tintKind("surface");
export const text = __tintKind("text");
export const border = __tintKind("border");
export const emphasis = __tintKind("emphasis");
export function disabled(token, options) {
  const next = Object.assign({}, token, { disabled: true });
  if (options && typeof options === "object") Object.assign(next, options);
  return next;
}
export default { defineConfig, surface, text, border, emphasis, disabled };
`;

/**
 * Replace `@skylerknight/tint` imports inside config files with a tiny stub so the
 * config bundles even when the package is not resolvable from the config's location
 * (monorepos, pnpm strictness, unbuilt dist). Validation happens in the loader.
 */
function tintStubPlugin(): import("esbuild").Plugin {
  return {
    name: "tint-config-stub",
    setup(build) {
      build.onResolve({ filter: /^@skylerknight\/tint$/ }, async (args) => {
        if (args.pluginData === "tint-stub-probe") return null;
        // Prefer the real package when it resolves; keep it external so the config
        // shares the host's copy. Fall back to the stub otherwise.
        const probe = await build.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir,
          importer: args.importer,
          pluginData: "tint-stub-probe",
        });
        if (probe.errors.length === 0 && probe.path) {
          // The bundle is imported from node_modules/.tint, which cannot see a
          // package that only resolves from the config file. Keep the package
          // external, but by its absolute path so Node can load it anyway.
          return { path: probe.path, external: true };
        }
        return { path: args.path, namespace: "tint-stub" };
      });
      build.onLoad({ filter: /.*/, namespace: "tint-stub" }, () => ({
        contents: TINT_STUB,
        loader: "js",
      }));
    },
  };
}

function decorateEsbuildError(error: unknown, path: string): Error {
  if (error instanceof ConfigError) return error;
  const errors = (
    error as {
      errors?: Array<{
        text: string;
        location?: { file: string; line: number; column: number } | null;
      }>;
    } | null
  )?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map((e) => {
      const loc = e.location
        ? `${e.location.file}:${e.location.line}:${e.location.column}: `
        : "";
      return `  - ${loc}${e.text}`;
    });
    return new Error(`Failed to compile ${path}:\n${lines.join("\n")}`);
  }
  if (error instanceof Error) {
    error.message = `Failed to load ${path}: ${error.message}`;
    return error;
  }
  return new Error(`Failed to load ${path}: ${String(error)}`);
}

/** Directory used for temp bundles, caches and the IntelliSense file. */
export function tintCacheDir(root = process.cwd()): string {
  return resolve(root, TINT_DIR);
}
