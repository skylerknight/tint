import type { GenerationResult, GeneratedPalette } from "../engine/types.js";
import { formatOKLCH } from "../color/oklch.js";
import { tokenVarName } from "./names.js";

export interface CSSOptions {
  /**
   * Other themes emitted alongside this one. Their custom selectors are excluded
   * from this theme's automatic media block. `toCSS` fills this in for arrays.
   */
  siblings?: readonly GenerationResult[];
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

/**
 * Scope a theme's declarations the way its config asks for:
 *
 * - no media preference: `<selector> { … }`
 * - media preference and `:root` selector: `@media (…) { :root { … } }` (automatic only)
 * - media preference and a custom selector (for example `.dark`): a manual block
 *   `<selector> { … }` followed by an automatic `@media (…) { :root { … } }` block,
 *   so the theme applies either when the class is present or when the OS prefers it.
 *
 * `body` lines are already indented one level.
 */
/**
 * Selector for a theme's automatic (media query) block. It excludes the custom
 * selectors of every sibling theme so a class like `.light` can force a mode even
 * when the OS prefers the other one.
 */
export function automaticSelector(
  result: GenerationResult,
  siblings: readonly GenerationResult[] = [],
  base = ":root",
): string {
  const exclusions = siblings
    .filter((other) => other !== result && other.selector !== ":root")
    .map((other) => `:not(${other.selector})`);
  return base + exclusions.join("");
}

export function scopeBlock(
  body: readonly string[],
  result: GenerationResult,
  selector: string,
  indent: string,
  autoSelector = ":root",
): string[] {
  const query = mediaQueryFor(result);
  const block = (sel: string): string[] => [`${sel} {`, ...body, "}"];
  if (!query) return block(selector);
  const automatic = wrapInMediaQuery(block(autoSelector), result, indent);
  if (selector === autoSelector) return automatic;
  return [...block(selector), "", ...automatic];
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

/** Format one result as a scoped declaration block (see `scopeBlock`). */
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

  const indented = body.map((line) => (line ? indent + line : line));
  // An explicit selector override also scopes the automatic (media query) block.
  const automatic = automaticSelector(
    result,
    options.siblings,
    options.selector ?? ":root",
  );
  return scopeBlock(indented, result, selector, indent, automatic).join("\n");
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
  return results
    .map((res) => resultToCSS(res, { ...options, siblings: results }))
    .join("\n\n");
}
