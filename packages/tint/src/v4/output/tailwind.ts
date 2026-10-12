/**
 * Tailwind v4 output (docs/v4-spec.md §7, §8.2).
 *
 * `@theme static` maps `--color-<group>[-<token>]` onto the alias layer.
 * `output.prefix` is included in those `var()` references. `@utility tint-<palette>`
 * re-points that layer (and the theme color variables) for every palette
 * except the default. The utility name stays `tint-<palette>`.
 * Groups that share a Tailwind prefix also get shortcuts (`text-strong`,
 * `border-firm`). `DEFAULT` becomes `<prefix>-default` (`text-default`).
 */

import type { GenerationResultV4, PaletteResultV4, SolvedTokenV4 } from "../engine.js";
import { DEFAULT_INDENT } from "../../output/css.js";
import { toCSS, type CSSOptions } from "./css.js";
import {
  TAILWIND_UTILITY_PREFIXES,
  aliasVarName,
  authoredTokens,
  defaultPalette,
  themeColorVar,
  tokenVarName,
  variantSegment,
} from "./names.js";

export interface TailwindOptions extends CSSOptions {
  /** `@utility tint-<palette>` for every non-default palette. Default true. */
  tintUtilities?: boolean;
  /** Prefix shortcuts (`text-strong`, `border-firm`). Default true. */
  shortcuts?: boolean;
}

interface ResolvedTailwindOptions {
  indent: string;
  tintUtilities: boolean;
  shortcuts: boolean;
  css: CSSOptions;
}

/**
 * CSS declaration for a shortcut utility.
 * A string is one property. A function builds a nested rule.
 */
const SHORTCUT_PROPERTIES: Record<string, string | ((value: string) => string[])> = {
  text: "color",
  bg: "background-color",
  background: "background-color",
  border: "border-color",
  outline: "outline-color",
  accent: "accent-color",
  caret: "caret-color",
  fill: "fill",
  stroke: "stroke",
  decoration: "text-decoration-color",
  ring: "--tw-ring-color",
  shadow: "--tw-shadow-color",
  divide: (value) => ["& > * + * {", `border-color: ${value};`, "}"],
  placeholder: (value) => ["&::placeholder {", `color: ${value};`, "}"],
};

function resolveOptions(options: TailwindOptions | undefined): ResolvedTailwindOptions {
  const css: CSSOptions = {};
  if (options?.format !== undefined) css.format = options.format;
  if (options?.indent !== undefined) css.indent = options.indent;
  if (options?.comments !== undefined) css.comments = options.comments;
  if (options?.selector !== undefined) css.selector = options.selector;
  if (options?.aliases !== undefined) css.aliases = options.aliases;
  if (options?.prefix !== undefined && options.prefix !== "") css.prefix = options.prefix;
  return {
    indent: options?.indent ?? DEFAULT_INDENT,
    tintUtilities: options?.tintUtilities ?? true,
    shortcuts: options?.shortcuts ?? true,
    css,
  };
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

function tokenIds(palette: PaletteResultV4): string[] {
  return authoredTokens(palette).map((token) => token.id);
}

/**
 * Tailwind emits one shared `@theme` and one alias layer. Every theme and
 * every palette color has to define the same authored tokens.
 */
export function assertConsistentStructure(results: readonly GenerationResultV4[]): void {
  const first = results[0];
  const reference = first?.palettes[0];
  if (first === undefined || reference === undefined) return;
  const expected = tokenIds(reference);

  for (const result of results) {
    for (const palette of result.palettes) {
      const actual = tokenIds(palette);
      const same =
        actual.length === expected.length &&
        actual.every((id, index) => id === expected[index]);
      if (same) continue;
      throw new Error(
        [
          "Tailwind output requires every palette to share the same authored tokens,",
          "because one @theme block and one alias layer serve every theme.",
          "",
          `  "${first.name}.${reference.name}": ${expected.join(", ") || "(none)"}`,
          `  "${result.name}.${palette.name}": ${actual.join(", ") || "(none)"}`,
        ].join("\n"),
      );
    }
  }
}

function shortcutName(token: SolvedTokenV4): string | undefined {
  const prefix = token.group.toLowerCase();
  if (!Object.hasOwn(TAILWIND_UTILITY_PREFIXES, prefix)) return undefined;
  if (SHORTCUT_PROPERTIES[prefix] === undefined) return undefined;
  const segment = variantSegment(token.name);
  return `${prefix}-${segment || "default"}`;
}

function assertUniqueShortcuts(tokens: readonly SolvedTokenV4[]): void {
  const seen = new Map<string, string>();
  for (const token of tokens) {
    const utility = shortcutName(token);
    if (utility === undefined) continue;
    const previous = seen.get(utility);
    if (previous !== undefined) {
      throw new Error(
        `Shortcut utility "${utility}" would be defined twice: "${previous}" and "${token.id}". ` +
          "Rename one of them, or set shortcuts: false.",
      );
    }
    seen.set(utility, token.id);
  }
}

function themeBlock(
  tokens: readonly SolvedTokenV4[],
  indent: string,
  prefix: string | undefined,
): string {
  const lines = ["@theme static {"];
  for (const token of tokens) {
    const color = themeColorVar(token.group, token.name);
    const alias = aliasVarName(token.group, token.name, prefix);
    lines.push(`${indent}${color}: var(${alias});`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Re-point the plain alias and the `@theme` color variable.
 *
 * `--color-*` is substituted on the element where `@theme` declared it.
 * Setting only `--tint-ink` on a descendant does not change an inherited
 * `--color-tint-ink`, so the utility sets both to the palette variable.
 */
function tintBlock(
  palette: PaletteResultV4,
  tokens: readonly SolvedTokenV4[],
  indent: string,
  prefix: string | undefined,
): string {
  const lines = [`@utility tint-${palette.name} {`];
  for (const token of tokens) {
    const source = tokenVarName(palette.name, token.group, token.name, prefix);
    lines.push(
      `${indent}${aliasVarName(token.group, token.name, prefix)}: var(${source});`,
    );
    lines.push(`${indent}${themeColorVar(token.group, token.name)}: var(${source});`);
  }
  lines.push("}");
  return lines.join("\n");
}

function shortcutBlock(
  token: SolvedTokenV4,
  indent: string,
  prefix: string | undefined,
): string | undefined {
  const name = shortcutName(token);
  const property = SHORTCUT_PROPERTIES[token.group.toLowerCase()];
  if (name === undefined || property === undefined) return undefined;
  const value = `var(${aliasVarName(token.group, token.name, prefix)})`;
  const lines = [`@utility ${name} {`];
  if (typeof property === "string") {
    lines.push(`${indent}${property}: ${value};`);
  } else {
    lines.push(...property(value).map((line) => indent + line));
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * `@theme static`, `tint-<palette>` utilities, and prefix shortcuts.
 * CSS variables come from {@link toCSS}; this block only references them.
 */
export function toTailwind(
  result: GenerationResultV4 | readonly GenerationResultV4[],
  options?: TailwindOptions,
): string {
  const results = listResults(result);
  const resolved = resolveOptions(options);
  const first = results[0];
  if (first === undefined) return "@theme static {\n}";

  assertConsistentStructure(results);
  const fallback = defaultPalette(first);
  const tokens = fallback === undefined ? [] : authoredTokens(fallback);
  if (resolved.shortcuts) assertUniqueShortcuts(tokens);

  const prefix = resolved.css.prefix;
  const sections = [themeBlock(tokens, resolved.indent, prefix)];
  if (resolved.tintUtilities && fallback !== undefined) {
    for (const palette of first.palettes) {
      if (palette === fallback || tokens.length === 0) continue;
      sections.push(tintBlock(palette, tokens, resolved.indent, prefix));
    }
  }
  if (resolved.shortcuts) {
    for (const token of tokens) {
      const block = shortcutBlock(token, resolved.indent, prefix);
      if (block !== undefined) sections.push(block);
    }
  }
  return sections.join("\n\n");
}

/**
 * One stylesheet: scoped variables and aliases, then the Tailwind block.
 * Alias emission stays on, because `@theme` references those names.
 */
export function toCSSWithTailwind(
  result: GenerationResultV4 | readonly GenerationResultV4[],
  options?: TailwindOptions,
): string {
  const results = listResults(result);
  if (results.length === 0) return "";
  const resolved = resolveOptions(options);
  // `@theme` references the alias layer, so the combined file always emits it.
  const css = toCSS(results, { ...resolved.css, aliases: true });
  const tailwind = toTailwind(results, options);
  if (css === "") return tailwind;
  return `${css}\n\n${tailwind}`;
}
