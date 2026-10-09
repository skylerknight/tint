import type { GenerationResult, GeneratedPalette } from "../engine/types.js";
import { formatOKLCH } from "../color/oklch.js";
import { tokenVarName } from "./names.js";

export interface CSSOptions {
  /** Overrides `result.selector` for every result. */
  selector?: string;
  /** Value format (default `"hex"`). */
  format?: "hex" | "oklch";
  /** Emit an `oklch(…)` comment above each hex value. */
  includeOKLCH?: boolean;
  /** Indentation string (default two spaces). */
  indent?: string;
  /** Emit a `<palette> palette` comment per palette (default true). */
  comments?: boolean;
}

export const DEFAULT_INDENT = "  ";

/**
 * Media query prelude for a result (`@media (prefers-color-scheme: dark)`),
 * or `undefined` when the result has no media preferences.
 */
export function mediaQueryFor(result: GenerationResult): string | undefined {
  const queries: string[] = [];
  if (result.prefersColorScheme) {
    queries.push(`(prefers-color-scheme: ${result.prefersColorScheme})`);
  }
  if (result.prefersContrast) {
    queries.push(`(prefers-contrast: ${result.prefersContrast})`);
  }
  return queries.length > 0 ? `@media ${queries.join(" and ")}` : undefined;
}

/** Wrap already-formatted CSS lines in the result's media query, if any. */
export function wrapInMediaQuery(
  lines: readonly string[],
  result: GenerationResult,
  indent: string,
): string[] {
  const query = mediaQueryFor(result);
  if (!query) return [...lines];
  return [`${query} {`, ...lines.map((line) => (line ? indent + line : line)), "}"];
}

/** Comment form of an OKLCH color, used when `includeOKLCH` is set. */
function oklchComment(token: { oklch: { l: number; c: number; h: number } }): string {
  const { l, c, h } = token.oklch;
  return `/* oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}) */`;
}

function paletteLines(
  palette: GeneratedPalette,
  format: "hex" | "oklch",
  includeOKLCH: boolean,
): string[] {
  const lines: string[] = [];
  for (const [group, variants] of Object.entries(palette.tokens)) {
    for (const [variant, token] of Object.entries(variants)) {
      const name = tokenVarName(palette.name, group, variant);
      if (format === "oklch") {
        lines.push(`${name}: ${formatOKLCH(token.oklch)};`);
      } else {
        if (includeOKLCH) lines.push(oklchComment(token));
        lines.push(`${name}: ${token.hex};`);
      }
    }
  }
  return lines;
}

/** Format one result as a selector block, wrapped in its media query. */
export function resultToCSS(result: GenerationResult, options: CSSOptions = {}): string {
  const selector = options.selector ?? result.selector;
  const format = options.format ?? "hex";
  const includeOKLCH = options.includeOKLCH ?? false;
  const indent = options.indent ?? DEFAULT_INDENT;
  const comments = options.comments ?? true;

  const body: string[] = [];
  result.palettes.forEach((palette, index) => {
    if (index > 0) body.push("");
    if (comments) body.push(`/* ${palette.name} palette */`);
    body.push(...paletteLines(palette, format, includeOKLCH));
  });

  const block = [
    `${selector} {`,
    ...body.map((line) => (line ? indent + line : line)),
    "}",
  ];
  return wrapInMediaQuery(block, result, indent).join("\n");
}

/**
 * Convert one or more generation results to CSS custom properties.
 *
 * Variables are named `--<palette>-<group>-<variant>` (`DEFAULT` is dropped).
 * Each result is scoped to its selector and wrapped in a media query when it
 * declares `prefersColorScheme` / `prefersContrast`.
 */
export function toCSS(
  result: GenerationResult | GenerationResult[],
  options?: CSSOptions,
): string {
  const results = Array.isArray(result) ? result : [result];
  return results.map((res) => resultToCSS(res, options)).join("\n\n");
}
