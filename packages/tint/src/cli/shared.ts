import { relative } from "node:path";
import { ConfigError } from "../config/validate.js";
import type { Config } from "../config/types.js";
import { generate } from "../engine/generate.js";
import type { GenerationResult } from "../engine/types.js";
import { findDefaultConfig, loadConfig, DEFAULT_CONFIG_FILES } from "../loader/index.js";
import { formatDiagnostic, type IO } from "./ui.js";

/** A user-facing failure: printed as a single friendly message, never a stack trace. */
export class CLIError extends Error {
  override readonly name = "CLIError";
}

export interface Loaded {
  configs: Config[];
  results: GenerationResult[];
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
    const results = generate(loaded.configs);
    return { configs: loaded.configs, results, path: loaded.path };
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

export function printDiagnostics(io: IO, results: readonly GenerationResult[]): number {
  let count = 0;
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      io.err(formatDiagnostic(diagnostic, io.color));
      count += 1;
    }
  }
  return count;
}

export function countTokens(results: readonly GenerationResult[]): number {
  let total = 0;
  for (const result of results) {
    for (const palette of result.palettes) {
      for (const group of Object.values(palette.tokens)) {
        total += Object.keys(group).length;
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
