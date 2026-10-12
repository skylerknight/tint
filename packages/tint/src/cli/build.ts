import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { GenerationResultV4 } from "../v4/engine.js";
import { withConfigOutput } from "../v4/emit-options.js";
import { toCSS } from "../v4/output/css.js";
import { toFlatJSON } from "../v4/output/flat.js";
import { toDTCGJSON } from "../v4/output/dtcg.js";
import { toCSSWithTailwind, toTailwind } from "../v4/output/tailwind.js";
import { OUTPUT_FORMATS, type OutputFormat, type OutputOptions } from "../v4/types.js";
import {
  CLIError,
  countTokens,
  displayPath,
  loadAndGenerate,
  printDiagnostics,
  toCLIError,
} from "./shared.js";
import { paint, plural, type IO } from "./ui.js";

export interface BuildFlags {
  config?: string | undefined;
  out?: string | undefined;
  formats?: string | undefined;
  tailwindTint?: boolean | undefined;
  quiet?: boolean | undefined;
}

export const DEFAULT_OUT_DIR = "./tint";
export const DEFAULT_FORMATS: readonly OutputFormat[] = ["css"];

export function parseFormats(input: string): OutputFormat[] {
  const names = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new CLIError(`--formats needs at least one of: ${OUTPUT_FORMATS.join(", ")}`);
  }
  const formats: OutputFormat[] = [];
  for (const name of names) {
    if (name === "json") {
      throw new CLIError(
        `Unknown format "json". v3 "json" split into "dtcg" and "flat". Expected one of: ${OUTPUT_FORMATS.join(", ")}`,
      );
    }
    if (!(OUTPUT_FORMATS as readonly string[]).includes(name)) {
      throw new CLIError(
        `Unknown format "${name}". Expected one of: ${OUTPUT_FORMATS.join(", ")}`,
      );
    }
    if (!formats.includes(name as OutputFormat)) formats.push(name as OutputFormat);
  }
  return formats;
}

const FILE_NAMES: Record<OutputFormat, string> = {
  css: "tokens.css",
  tailwind: "tailwind.css",
  dtcg: "tokens.dtcg.json",
  flat: "tokens.flat.json",
};

function render(
  format: OutputFormat,
  result: GenerationResultV4,
  output: OutputOptions | undefined,
): string {
  const style = withConfigOutput({}, output);
  const flat = style.format === undefined ? undefined : { format: style.format };
  switch (format) {
    case "css":
      return toCSS(result, style);
    case "dtcg":
      return toDTCGJSON(result);
    case "tailwind":
      return toTailwind(result, style);
    case "flat":
      return toFlatJSON(result, flat);
  }
}

export async function build(io: IO, flags: BuildFlags): Promise<number> {
  const { config, results } = await loadAndGenerate(io, flags.config);

  const configured = config.output;
  const outDir = resolve(io.cwd, flags.out ?? configured?.path ?? DEFAULT_OUT_DIR);
  const formats = flags.formats
    ? parseFormats(flags.formats)
    : configured?.formats && configured.formats.length > 0
      ? [...new Set(configured.formats)]
      : [...DEFAULT_FORMATS];
  const tailwindTint = flags.tailwindTint === true;
  if (tailwindTint && !formats.includes("tailwind")) formats.push("tailwind");

  const written: string[] = [];
  const write = (path: string, content: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content.endsWith("\n") ? content : content + "\n");
    written.push(path);
    if (!flags.quiet)
      io.out(`${paint.green(io.color)("write")} ${displayPath(io.cwd, path)}`);
  };

  try {
    for (const result of results) {
      const themeDir = join(outDir, result.name);
      for (const format of formats) {
        if (format === "tailwind" && tailwindTint) continue;
        write(join(themeDir, FILE_NAMES[format]), render(format, result, configured));
      }
    }
    if (tailwindTint) {
      write(
        join(outDir, FILE_NAMES.tailwind),
        toCSSWithTailwind(results, withConfigOutput({}, configured)),
      );
    }
  } catch (error) {
    throw toCLIError(error);
  }

  const warnings = flags.quiet ? 0 : printDiagnostics(io, results);
  if (!flags.quiet) {
    const summary =
      `Wrote ${plural(written.length, "file")} to ${displayPath(io.cwd, outDir)} ` +
      `(${plural(results.length, "theme")}, ${plural(countTokens(results), "token")})`;
    io.out(
      warnings > 0
        ? `${paint.yellow(io.color)("⚠")} ${summary}, ${plural(warnings, "warning")}`
        : `${paint.green(io.color)("✓")} ${summary}`,
    );
  }
  return 0;
}
