import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Logger, Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { generate } from "../engine/generate.js";
import type { GenerationResult } from "../engine/types.js";
import { findDefaultConfig, loadConfig, tintCacheDir } from "../loader/index.js";
import { toTailwindIntelliSense } from "../output/intellisense.js";
import { toCSSWithTailwindAndTint } from "../output/tailwind.js";
import type { TintUtilitiesOptions } from "../output/tailwind.js";

export interface TintVitePluginOptions extends TintUtilitiesOptions {
  /** Write `node_modules/.tint/intellisense.css`. Default true. */
  intellisense?: boolean;
}

/** `@tint "./path";` — single or double quotes, optional semicolon. */
const TINT_DIRECTIVE_REGEX = /@tint\s+["']([^"']+)["']\s*;?/g;
const VIRTUAL_ID = "virtual:tint";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const INTELLISENSE_FILE = "intellisense.css";

const UTILITY_OPTION_KEYS = [
  "indent",
  "simplifyNames",
  "generateShortcuts",
  "generateTintUtilities",
  "defaultPalette",
  "includeOKLCH",
] as const satisfies readonly (keyof TintUtilitiesOptions)[];

interface CacheEntry {
  css: string;
  intellisense: string;
  results: GenerationResult[];
  /** Absolute paths of every file bundled into the config (including itself). */
  dependencies: string[];
}

/** Minimal slice of the Rollup plugin context the hooks rely on. */
interface HookContext {
  addWatchFile(id: string): void;
  error(error: string | Error): never;
}

const silentLogger: Pick<Logger, "info" | "warn" | "error"> = {
  info() {},
  warn() {},
  error() {},
};

/** Keep only the known formatter options (drops `intellisense` and undefined values). */
function pickUtilityOptions(options: TintVitePluginOptions): TintUtilitiesOptions {
  const picked: Record<string, unknown> = {};
  for (const key of UTILITY_OPTION_KEYS) {
    if (options[key] !== undefined) picked[key] = options[key];
  }
  return picked as TintUtilitiesOptions;
}

function isCSSRequest(id: string): boolean {
  return id.endsWith(".css") || id.includes(".css?");
}

function stripQuery(id: string): string {
  const index = id.indexOf("?");
  return index === -1 ? id : id.slice(0, index);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function tint(options: TintVitePluginOptions = {}): Plugin {
  const tintOptions = pickUtilityOptions(options);
  const intellisenseOptions: TintUtilitiesOptions = {
    ...tintOptions,
    generateTintUtilities: options.generateTintUtilities !== false,
  };
  const writeIntelliSense = options.intellisense !== false;

  let root = process.cwd();
  let logger: Pick<Logger, "info" | "warn" | "error"> = silentLogger;
  let server: ViteDevServer | undefined;

  /** Absolute config path -> generated output. */
  const cache = new Map<string, CacheEntry>();
  /** In-flight loads, so concurrent transforms share one load per config. */
  const pending = new Map<string, Promise<CacheEntry>>();
  /** CSS module id -> absolute config paths it inlined. */
  const importers = new Map<string, Set<string>>();
  /** Absolute config path -> resolved virtual module ids that exported it. */
  const virtualImporters = new Map<string, Set<string>>();
  /** The first config loaded through an `@tint` directive (serves plain `virtual:tint`). */
  let firstConfigPath: string | undefined;

  function logDiagnostics(configPath: string, results: GenerationResult[]): void {
    const seen = new Set<string>();
    const label = relative(root, configPath) || configPath;
    for (const result of results) {
      for (const diagnostic of result.diagnostics) {
        if (seen.has(diagnostic.message)) continue;
        seen.add(diagnostic.message);
        logger.warn(`[tint] ${label}: ${diagnostic.message}`);
      }
    }
  }

  async function loadAndGenerate(configPath: string): Promise<CacheEntry> {
    const loaded = await loadConfig({ root, configPath });
    const results = generate(loaded.configs);
    const entry: CacheEntry = {
      css: toCSSWithTailwindAndTint(results, tintOptions),
      intellisense: toTailwindIntelliSense(results, intellisenseOptions),
      results,
      dependencies: loaded.dependencies,
    };
    logDiagnostics(configPath, results);
    return entry;
  }

  /** Cached load; concurrent callers for the same path share one promise. */
  function getEntry(configPath: string): Promise<CacheEntry> {
    const cached = cache.get(configPath);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(configPath);
    if (inFlight) return inFlight;

    const promise = loadAndGenerate(configPath)
      .then((entry) => {
        cache.set(configPath, entry);
        return entry;
      })
      .finally(() => pending.delete(configPath));
    pending.set(configPath, promise);
    return promise;
  }

  function writeIntelliSenseFile(): void {
    if (!writeIntelliSense || cache.size === 0) return;
    try {
      const dir = tintCacheDir(root);
      mkdirSync(dir, { recursive: true });
      const content = [...cache.values()].map((entry) => entry.intellisense).join("\n");
      writeFileSync(join(dir, INTELLISENSE_FILE), content);
    } catch {
      // IntelliSense output is best-effort; never fail the build over it.
    }
  }

  function watchDependencies(context: HookContext, entry: CacheEntry): void {
    for (const dependency of entry.dependencies) context.addWatchFile(dependency);
  }

  function configsDependingOn(file: string): string[] {
    const affected: string[] = [];
    for (const [configPath, entry] of cache) {
      if (entry.dependencies.includes(file)) affected.push(configPath);
    }
    return affected;
  }

  function handleFileChange(filePath: string): void {
    const file = resolve(filePath);
    const affected = configsDependingOn(file);
    if (affected.length === 0) return;

    const affectedSet = new Set(affected);
    const cssImporters = new Set<string>();
    const virtualIds = new Set<string>();

    for (const configPath of affected) {
      logger.info(
        `[tint] ${relative(root, configPath) || configPath} changed, regenerating`,
      );
      cache.delete(configPath);
      for (const id of virtualImporters.get(configPath) ?? []) virtualIds.add(id);
    }
    for (const [id, configPaths] of importers) {
      for (const configPath of configPaths) {
        if (affectedSet.has(configPath)) {
          cssImporters.add(id);
          break;
        }
      }
    }

    if (!server) return;
    const { moduleGraph } = server;

    // Touch the importing CSS files so downstream plugins that cache by mtime
    // (e.g. @tailwindcss/vite) recompile them.
    const now = new Date();
    for (const id of cssImporters) {
      try {
        utimesSync(stripQuery(id), now, now);
      } catch {
        // The file may have been removed; nothing to touch.
      }
    }

    for (const id of [...cssImporters, ...virtualIds]) {
      const mod = moduleGraph.getModuleById(id);
      if (mod) moduleGraph.invalidateModule(mod);
    }

    // Frameworks wrap CSS in JS modules, so Vite's CSS-only HMR is not enough.
    server.ws.send({ type: "full-reload" });
  }

  function resolveVirtualTarget(resolvedId: string): string | undefined {
    if (resolvedId === RESOLVED_VIRTUAL_ID) {
      return firstConfigPath ?? findDefaultConfig(root) ?? undefined;
    }
    const prefix = `${RESOLVED_VIRTUAL_ID}/`;
    if (resolvedId.startsWith(prefix)) {
      return resolve(root, resolvedId.slice(prefix.length));
    }
    return undefined;
  }

  return {
    name: "vite-plugin-tint",
    enforce: "pre",

    configResolved(config: ResolvedConfig) {
      root = config.root;
      logger = config.logger;
    },

    configureServer(devServer: ViteDevServer) {
      server = devServer;
      logger = devServer.config.logger;
      // Config files are loaded outside Vite's module graph (via esbuild), so
      // watch them directly rather than relying on handleHotUpdate.
      devServer.watcher.on("change", handleFileChange);
      devServer.watcher.on("unlink", handleFileChange);
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      if (id.startsWith(`${VIRTUAL_ID}/`)) return `\0${id}`;
      return null;
    },

    async load(this: HookContext, id: string) {
      if (id !== RESOLVED_VIRTUAL_ID && !id.startsWith(`${RESOLVED_VIRTUAL_ID}/`)) {
        return null;
      }

      const configPath = resolveVirtualTarget(id);
      if (!configPath) {
        return this.error(
          `[tint] Cannot resolve "${VIRTUAL_ID}": no config has been loaded through an ` +
            `@tint directive yet and no default tint.config.{ts,mts,js,mjs,json} exists in ${root}. ` +
            `Add \`@tint "./tint.config.ts";\` to your CSS or import "${VIRTUAL_ID}/<path-to-config>".`,
        );
      }

      let entry: CacheEntry;
      try {
        entry = await getEntry(configPath);
      } catch (error) {
        return this.error(`[tint] Failed to load ${configPath}: ${errorMessage(error)}`);
      }

      watchDependencies(this, entry);
      let ids = virtualImporters.get(configPath);
      if (!ids) {
        ids = new Set();
        virtualImporters.set(configPath, ids);
      }
      ids.add(id);
      writeIntelliSenseFile();

      return `export default ${JSON.stringify(entry.results)};`;
    },

    async transform(this: HookContext, code: string, id: string) {
      if (!isCSSRequest(id)) return null;

      const directives = [...code.matchAll(TINT_DIRECTIVE_REGEX)];
      if (directives.length === 0) return null;

      const cssDir = dirname(stripQuery(id));
      const used = new Set<string>();
      for (const match of directives) {
        used.add(resolve(cssDir, match[1] ?? ""));
      }

      const entries = new Map<string, CacheEntry>();
      for (const configPath of used) {
        try {
          entries.set(configPath, await getEntry(configPath));
        } catch (error) {
          return this.error(
            `[tint] Failed to load ${configPath}: ${errorMessage(error)}`,
          );
        }
        firstConfigPath ??= configPath;
      }

      for (const entry of entries.values()) watchDependencies(this, entry);
      importers.set(id, used);
      writeIntelliSenseFile();

      const transformed = code.replace(TINT_DIRECTIVE_REGEX, (_match, path: string) => {
        return entries.get(resolve(cssDir, path))?.css ?? "";
      });
      return { code: transformed, map: null };
    },
  };
}
