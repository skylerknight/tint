/**
 * v4 CSS variables (docs/v4-spec.md §2.3, §7, §8.1).
 *
 * Every palette color emits the full authored token set. The default
 * palette also emits an alias layer (`--action`, or `--tint-action` when
 * `prefix` is set) inside the same theme scope. `tint-<palette>` re-points
 * those aliases. The utility name does not take `prefix`.
 *
 * Theme scoping matches v3: selector block, media block, or both. Sibling
 * class selectors are excluded from the automatic block. `media: true` is
 * `prefers-color-scheme` for the theme mode. A string is the media query
 * (`(prefers-contrast: more)`). `extends` is already flattened into
 * `selector` and `media` by the engine.
 */

import type { GenerationResult as V3Result } from "../../engine/types.js";
import { formatOKLCH } from "../../color/oklch.js";
import { DEFAULT_INDENT, automaticSelector, scopeBlock } from "../../output/css.js";
import type { ColorFormat } from "../types.js";
import type { GeneratedColorV4, GenerationResultV4, PaletteResultV4 } from "../engine.js";
import {
  aliasVarName,
  authoredTokens,
  cssPrefix,
  defaultPalette,
  tokenVarName,
} from "./names.js";

export interface CSSOptions {
  /** Emitted notation. Default `oklch`. Internal colors stay OKLCH. */
  format?: ColorFormat;
  /** Indentation string. Default two spaces. */
  indent?: string;
  /** Palette and alias comments. Default true. */
  comments?: boolean;
  /**
   * Overrides every theme's manual selector and the automatic block's base.
   * Sibling exclusions still use each theme's own selector.
   */
  selector?: string;
  /** Unprefixed alias layer for the default palette. Default true. */
  aliases?: boolean;
  /**
   * Prepended to every custom property (`"tint"` → `--tint-brand-action`).
   * Default: none. Does not change `tint-<palette>` utility names.
   */
  prefix?: string;
}

interface ResolvedCSSOptions {
  format: ColorFormat;
  indent: string;
  comments: boolean;
  selector?: string;
  aliases: boolean;
  prefix?: string;
}

const V3_CONTRAST = {
  "(prefers-contrast: more)": "more",
  "(prefers-contrast: less)": "less",
  "(prefers-contrast: custom)": "custom",
} as const;

/**
 * `@media` prelude for a v4 theme, or `undefined` when it has no media.
 *
 * `true` follows `mode`. A string is the query body (`(prefers-contrast: more)`).
 * `false` and a blank string emit no query.
 */
export function mediaQueryFor(
  result: Pick<GenerationResultV4, "media" | "mode">,
): string | undefined {
  const media = result.media;
  if (media === undefined || media === false) return undefined;
  if (media === true) return `@media (prefers-color-scheme: ${result.mode})`;
  const text = media.trim();
  if (text === "") return undefined;
  if (text.startsWith("@media")) return text;
  return `@media ${text}`;
}

/** `oklch()`, `#rrggbb`, or `rgb(R G B)`. Channels are 8-bit integers. */
export function formatColor(color: GeneratedColorV4, format: ColorFormat): string {
  if (format === "hex") return color.hex;
  if (format === "rgb") {
    return `rgb(${channel(color.rgb.r)} ${channel(color.rgb.g)} ${channel(color.rgb.b)})`;
  }
  return formatOKLCH(color.oklch);
}

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function resolveOptions(options: CSSOptions | undefined): ResolvedCSSOptions {
  let resolved: ResolvedCSSOptions = {
    format: options?.format ?? "oklch",
    indent: options?.indent ?? DEFAULT_INDENT,
    comments: options?.comments ?? true,
    aliases: options?.aliases ?? true,
  };
  if (options?.selector !== undefined)
    resolved = { ...resolved, selector: options.selector };
  const prefix = cssPrefix(options?.prefix);
  if (prefix !== undefined) resolved = { ...resolved, prefix };
  return resolved;
}

function isThemeList(
  result: GenerationResultV4 | readonly GenerationResultV4[],
): result is readonly GenerationResultV4[] {
  return Array.isArray(result);
}

function listResults(
  result: GenerationResultV4 | readonly GenerationResultV4[],
): GenerationResultV4[] {
  return isThemeList(result) ? [...result] : [result];
}

function contrastKeyword(
  media: string,
): (typeof V3_CONTRAST)[keyof typeof V3_CONTRAST] | undefined {
  const text = media.trim();
  if (text === "(prefers-contrast: more)") return V3_CONTRAST[text];
  if (text === "(prefers-contrast: less)") return V3_CONTRAST[text];
  if (text === "(prefers-contrast: custom)") return V3_CONTRAST[text];
  return undefined;
}

/**
 * v3 `scopeBlock` reads `prefersColorScheme` / `prefersContrast`.
 * `media: true` and the three `prefers-contrast` strings map onto those.
 * Any other media string is applied by {@link scopeCustom}, which copies
 * the same block shape.
 */
function toScopeView(result: GenerationResultV4): V3Result {
  const view: V3Result = {
    name: result.name,
    mode: result.mode,
    selector: result.selector,
    palettes: [],
    diagnostics: [],
    warnings: [],
  };
  if (result.media === true) return { ...view, prefersColorScheme: result.mode };
  if (typeof result.media === "string") {
    const contrast = contrastKeyword(result.media);
    if (contrast !== undefined) return { ...view, prefersContrast: contrast };
  }
  return view;
}

function scopeViews(
  results: readonly GenerationResultV4[],
): Map<GenerationResultV4, V3Result> {
  const views = new Map<GenerationResultV4, V3Result>();
  for (const result of results) {
    if (!views.has(result)) views.set(result, toScopeView(result));
  }
  return views;
}

/**
 * Automatic selector from v3, with duplicate sibling selectors collapsed.
 * A theme that `extends` another can share `.light`; one `:not(.light)` is enough.
 */
function automaticFor(
  result: GenerationResultV4,
  siblings: readonly GenerationResultV4[],
  views: ReadonlyMap<GenerationResultV4, V3Result>,
  base: string,
): string {
  const current = views.get(result);
  if (current === undefined) {
    throw new Error(`Internal error: missing scope view for "${result.name}".`);
  }
  const list: V3Result[] = [current];
  const seen = new Set<string>();
  for (const sibling of siblings) {
    if (
      sibling === result ||
      sibling.selector === ":root" ||
      seen.has(sibling.selector)
    ) {
      continue;
    }
    seen.add(sibling.selector);
    const view = views.get(sibling);
    if (view !== undefined) list.push(view);
  }
  return automaticSelector(current, list, base);
}

/** Same nesting as v3 `scopeBlock` for a media query v3 cannot represent. */
function scopeCustom(
  body: readonly string[],
  query: string,
  selector: string,
  indent: string,
  autoSelector: string,
): string[] {
  const block = (sel: string): string[] => [`${sel} {`, ...body, "}"];
  const automatic = [
    `${query} {`,
    ...block(autoSelector).map((line) => (line ? indent + line : line)),
    "}",
  ];
  if (selector === autoSelector) return automatic;
  return [...block(selector), "", ...automatic];
}

function paletteLines(
  palette: PaletteResultV4,
  format: ColorFormat,
  comments: boolean,
  prefix: string | undefined,
): string[] {
  const tokens = authoredTokens(palette);
  if (tokens.length === 0 && !comments) return [];
  const lines: string[] = [];
  if (comments) lines.push(`/* ${palette.name} palette */`);
  for (const token of tokens) {
    const name = tokenVarName(palette.name, token.group, token.name, prefix);
    lines.push(`${name}: ${formatColor(token.color, format)};`);
  }
  return lines;
}

function aliasLines(
  palette: PaletteResultV4,
  comments: boolean,
  prefix: string | undefined,
): string[] {
  const tokens = authoredTokens(palette);
  if (tokens.length === 0) return [];
  const lines: string[] = [];
  if (comments) {
    lines.push(
      prefix === undefined
        ? `/* Unprefixed aliases (${palette.name}) */`
        : `/* Aliases (${palette.name}) */`,
    );
  }
  for (const token of tokens) {
    const alias = aliasVarName(token.group, token.name, prefix);
    const source = tokenVarName(palette.name, token.group, token.name, prefix);
    lines.push(`${alias}: var(${source});`);
  }
  return lines;
}

function resultBody(result: GenerationResultV4, options: ResolvedCSSOptions): string[] {
  const body: string[] = [];
  const blocks = result.palettes
    .map((palette) =>
      paletteLines(palette, options.format, options.comments, options.prefix),
    )
    .filter((lines) => lines.length > 0);
  blocks.forEach((lines, index) => {
    if (index > 0) body.push("");
    body.push(...lines);
  });

  if (!options.aliases) return body;
  const fallback = defaultPalette(result);
  if (fallback === undefined) return body;
  const aliases = aliasLines(fallback, options.comments, options.prefix);
  if (aliases.length === 0) return body;
  if (body.length > 0) body.push("");
  body.push(...aliases);
  return body;
}

function themeCSS(
  result: GenerationResultV4,
  siblings: readonly GenerationResultV4[],
  views: ReadonlyMap<GenerationResultV4, V3Result>,
  options: ResolvedCSSOptions,
): string {
  const manual = options.selector ?? result.selector;
  const base = options.selector ?? ":root";
  const automatic = automaticFor(result, siblings, views, base);
  const query = mediaQueryFor(result);
  // A `:root` theme with media is media-only (§2.3). Sibling exclusions stay
  // inside that query (`:root:not(.dark)`), with no extra unconditional block.
  const selector = query !== undefined && manual === ":root" ? automatic : manual;
  const indented = resultBody(result, options).map((line) =>
    line ? options.indent + line : line,
  );
  const view = views.get(result);
  if (view === undefined) {
    throw new Error(`Internal error: missing scope view for "${result.name}".`);
  }

  const v3Media =
    result.media === true ||
    (typeof result.media === "string" && contrastKeyword(result.media) !== undefined);
  if (query === undefined || v3Media) {
    return scopeBlock(indented, view, selector, options.indent, automatic).join("\n");
  }
  return scopeCustom(indented, query, selector, options.indent, automatic).join("\n");
}

/**
 * CSS custom properties for one theme or every theme.
 *
 * Variables are `--<palette>-<group>[-<token>]` (`DEFAULT` is dropped).
 * The default palette's aliases (`--<group>[-<token>]`) sit in the same
 * scoped block. Themes are joined by a blank line.
 */
export function toCSS(
  result: GenerationResultV4 | readonly GenerationResultV4[],
  options?: CSSOptions,
): string {
  const results = listResults(result);
  if (results.length === 0) return "";
  const resolved = resolveOptions(options);
  const views = scopeViews(results);
  return results.map((theme) => themeCSS(theme, results, views, resolved)).join("\n\n");
}
