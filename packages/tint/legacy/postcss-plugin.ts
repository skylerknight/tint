import postcss from "postcss";
import type { AtRule, Plugin, PluginCreator, Result } from "postcss";
import { resolve } from "node:path";
import { loadConfig } from "../loader/index.js";
import { withConfigOutput } from "../v4/emit-options.js";
import { generateV4 } from "../v4/engine.js";
import { toTailwindIntelliSense } from "../v4/intellisense.js";
import { toCSSWithTailwind } from "../v4/output/tailwind.js";
import type { TailwindOptions } from "../v4/output/tailwind.js";
import { cachePath, intellisensePath, readQuietly, writeQuietly } from "./files.js";

export interface TintPostCSSOptions extends TailwindOptions {
  /** Directory config paths resolve against (default `process.cwd()`). */
  root?: string;
}

const PLUGIN_NAME = "postcss-tint";

const FORMATTER_KEYS = [
  "format",
  "indent",
  "comments",
  "selector",
  "aliases",
  "prefix",
  "tintUtilities",
  "shortcuts",
] as const satisfies ReadonlyArray<keyof TailwindOptions>;

/** Keep only the known formatter options that were explicitly set. */
function pickFormatterOptions(options: TintPostCSSOptions): TailwindOptions {
  const picked: Record<string, unknown> = {};
  for (const key of FORMATTER_KEYS) {
    if (options[key] !== undefined) picked[key] = options[key];
  }
  return picked as TailwindOptions;
}

/** `@tint "./tint.config.ts"` → `./tint.config.ts` (either quote style, or none). */
function parseConfigPath(params: string): string {
  return params
    .trim()
    .replace(/^(['"])(.*)\1$/s, "$2")
    .trim();
}

/** Replace the at-rule with parsed CSS so downstream plugins see real nodes. */
function replaceWithCSS(atRule: AtRule, css: string): void {
  const parsed = postcss.parse(css, { from: atRule.source?.input.file });
  atRule.replaceWith(...parsed.nodes);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addDependency(result: Result, seen: Set<string>, file: string): void {
  if (seen.has(file)) return;
  seen.add(file);
  result.messages.push({
    type: "dependency",
    plugin: PLUGIN_NAME,
    file,
    parent: result.opts.from,
  });
}

/**
 * PostCSS plugin: replaces every `@tint "<path>";` at-rule with the generated
 * Tailwind-ready CSS for that config.
 *
 * ```css
 * @tint "./tint.config.ts";
 * ```
 */
export const tintPostCSS: PluginCreator<TintPostCSSOptions> = (options = {}) => {
  const root = options.root ?? process.cwd();
  const formatterOptions = pickFormatterOptions(options);
  const writeIntelliSense = options.tintUtilities !== false;

  async function processAtRule(atRule: AtRule, result: Result): Promise<void> {
    const configPath = parseConfigPath(atRule.params);
    if (!configPath) {
      throw atRule.error("Missing config path in @tint directive");
    }

    const absoluteConfigPath = resolve(root, configPath);
    const cacheFile = cachePath(root, absoluteConfigPath);

    // Register the config before loading so the bundler keeps watching it even
    // when this load fails and the user has to fix the file.
    const dependencies = new Set<string>();
    addDependency(result, dependencies, absoluteConfigPath);

    try {
      const loaded = await loadConfig({ root, configPath: absoluteConfigPath });
      for (const file of loaded.dependencies) addDependency(result, dependencies, file);

      const results = generateV4(loaded.config);
      for (const res of results) {
        for (const diagnostic of res.diagnostics) {
          if (diagnostic.severity === "info") continue;
          result.warn(`[tint] ${diagnostic.path}: ${diagnostic.message}`, {
            node: atRule,
            plugin: PLUGIN_NAME,
          });
        }
      }

      const css = toCSSWithTailwind(
        results,
        withConfigOutput(formatterOptions, loaded.config.output),
      );

      if (writeIntelliSense) {
        writeQuietly(intellisensePath(root), toTailwindIntelliSense(results));
      }

      replaceWithCSS(atRule, css);
      writeQuietly(cacheFile, css);
    } catch (error) {
      const message = errorMessage(error);
      const cached = readQuietly(cacheFile);
      if (cached === null) {
        throw atRule.error(`Failed to load tint config: ${message}`);
      }

      result.warn(`[tint] Config error (serving cached output): ${message}`, {
        node: atRule,
        plugin: PLUGIN_NAME,
      });
      const safeMessage = message.split("*/").join("* /");
      replaceWithCSS(atRule, `/* [tint] Error: ${safeMessage} */\n${cached}`);
    }
  }

  return {
    postcssPlugin: PLUGIN_NAME,

    async Once(cssRoot, { result }) {
      const pending: Promise<void>[] = [];
      cssRoot.walkAtRules("tint", (atRule) => {
        pending.push(processAtRule(atRule, result));
      });
      await Promise.all(pending);
    },
  } satisfies Plugin;
};

tintPostCSS.postcss = true;
