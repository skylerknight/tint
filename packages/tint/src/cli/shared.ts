import { relative } from "node:path";
import { ConfigError } from "../v4/errors.js";
import { generateV4 } from "../v4/engine.js";
import type { GenerationResultV4 } from "../v4/engine.js";
import type { Config } from "../v4/types.js";
import { findDefaultConfig, loadConfig, DEFAULT_CONFIG_FILES } from "../loader/index.js";
import { formatDiagnostic, type IO } from "./ui.js";

/** A user-facing failure: printed as a single friendly message, never a stack trace. */
export class CLIError extends Error {
  override readonly name = "CLIError";
}

export interface Loaded {
  config: Config;
  results: GenerationResultV4[];
  /** Config path, absolute. */
  path: string;
}

/**
 * Locate, load, validate and generate every theme. Throws `CLIError` with a friendly
 * message for every expected failure (missing config, invalid config, bad module).
 */
export async function loadAndGenerate(
  io: IO,
  configFlag: string | undefined,
): Promise<Loaded> {
  const configPath = configFlag ?? findDefaultConfig(io.cwd);
  if (!configPath) {
    throw new CLIError(
      `No tint config found in ${io.cwd}.\n` +
        `  Looked for: ${DEFAULT_CONFIG_FILES.join(", ")}\n` +
        `  Run \`tint init\` to create one, or pass --config <path>.`,
    );
  }

  let loaded;
  try {
    loaded = await loadConfig({ root: io.cwd, configPath });
  } catch (error) {
    throw toCLIError(error);
  }

  try {
    const results = generateV4(loaded.config);
    return { config: loaded.config, results, path: loaded.path };
  } catch (error) {
    throw toCLIError(error);
  }
}

export function toCLIError(error: unknown): CLIError {
  if (error instanceof CLIError) return error;
  if (error instanceof ConfigError) return new CLIError(error.message);
  if (error instanceof Error) return new CLIError(error.message);
  return new CLIError(String(error));
}

/**
 * Print warning and error diagnostics. Info lints stay out of the summary
 * so `--strict` fails on warnings only.
 */
export function printDiagnostics(io: IO, results: readonly GenerationResultV4[]): number {
  let count = 0;
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === "info") continue;
      io.err(formatDiagnostic(diagnostic, io.color));
      count += 1;
    }
  }
  return count;
}

export function countTokens(results: readonly GenerationResultV4[]): number {
  let total = 0;
  for (const result of results) {
    for (const palette of result.palettes) {
      for (const token of palette.tokens) {
        if (!token.generated) total += 1;
      }
    }
  }
  return total;
}

/** Path relative to `cwd` for display, falling back to the absolute path outside it. */
export function displayPath(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return rel === "" ? "." : rel.startsWith("..") ? path : rel;
}
