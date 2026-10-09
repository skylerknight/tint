import type { GenerationResult, GeneratedPalette } from "../engine/types.js";
import { DEFAULT_INDENT, resultToCSS, wrapInMediaQuery } from "./css.js";
import {
  TAILWIND_UTILITY_PREFIXES,
  cssVar,
  simplifyTailwindParts,
  tokenVarName,
  variantSegment,
} from "./names.js";

export interface TailwindOptions {
  indent?: string;
  /** Drop redundant group names (`text-heading` instead of `text-text-heading`). Default true. */
  simplifyNames?: boolean;
  /** Emit `@utility` shortcut classes for utility-prefix groups. Default true. */
  generateShortcuts?: boolean;
}

export interface TintUtilitiesOptions extends TailwindOptions {
  /** Emit the alias layer and `tint-*` palette-switching utilities. */
  generateTintUtilities?: boolean;
  /** Palette the unprefixed variables default to. Default "base". */
  defaultPalette?: string;
  includeOKLCH?: boolean;
}

export const DEFAULT_PALETTE = "base";

interface ResolvedOptions {
  indent: string;
  simplifyNames: boolean;
  generateShortcuts: boolean;
  defaultPalette: string;
  includeOKLCH: boolean;
}

function resolveOptions(options: TintUtilitiesOptions | undefined): ResolvedOptions {
  return {
    indent: options?.indent ?? DEFAULT_INDENT,
    simplifyNames: options?.simplifyNames ?? true,
    generateShortcuts: options?.generateShortcuts ?? true,
    defaultPalette: options?.defaultPalette ?? DEFAULT_PALETTE,
    includeOKLCH: options?.includeOKLCH ?? false,
  };
}

/**
 * CSS declaration emitted by a shortcut utility for each utility prefix.
 * A string is a plain property; a function builds a nested rule.
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Every `palette.group.variant` path of a result, in order. */
function tokenPaths(result: GenerationResult): string[] {
  const paths: string[] = [];
  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const variant of Object.keys(variants)) {
        paths.push(`${palette.name}.${group}.${variant}`);
      }
    }
  }
  return paths;
}

/**
 * Assert that every result shares the same palette / group / variant
 * structure. The Tailwind formatters derive one shared `@theme` block (and
 * the `tint-*` utilities) from the first result, so a mismatch would emit
 * variables that some themes never define.
 */
export function assertConsistentStructure(results: GenerationResult[]): void {
  const reference = results[0];
  if (!reference) return;
  const referencePaths = new Set(tokenPaths(reference));

  for (const other of results.slice(1)) {
    const otherPaths = new Set(tokenPaths(other));
    const missing = [...referencePaths].filter((p) => !otherPaths.has(p));
    const extra = [...otherPaths].filter((p) => !referencePaths.has(p));
    if (missing.length === 0 && extra.length === 0) continue;

    const lines = [
      "Tailwind output requires every theme to share the same token structure " +
        "(palette, group, and variant names), because one @theme block is shared by all themes.",
      "",
    ];
    if (missing.length > 0) {
      lines.push(`  Defined in "${reference.name}" but missing from "${other.name}":`);
      lines.push(...missing.map((p) => `    - ${p}`));
    }
    if (extra.length > 0) {
      lines.push(`  Defined in "${other.name}" but missing from "${reference.name}":`);
      lines.push(...extra.map((p) => `    - ${p}`));
    }
    lines.push(
      "",
      "Use the same `colors` and `tokens` keys in every theme config, " +
        "or format each theme separately.",
    );
    throw new Error(lines.join("\n"));
  }
}

/**
 * Throw when name simplification would map two tokens of one palette to the
 * same Tailwind color name (for example `text.heading` and `heading.text`).
 */
export function detectTailwindConflicts(
  result: GenerationResult,
  simplifyNames: boolean,
): void {
  if (!simplifyNames) return;

  for (const palette of result.palettes) {
    const byName = new Map<string, string[]>();
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const variant of Object.keys(variants)) {
        const name = simplifyTailwindParts(palette.name, group, variant).join("-");
        const paths = byName.get(name) ?? [];
        paths.push(`${palette.name}.${group}.${variant}`);
        byName.set(name, paths);
      }
    }

    const conflicts = [...byName.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([name, paths]) => `  - "${name}" maps to: ${paths.join(", ")}`);

    if (conflicts.length > 0) {
      throw new Error(
        `Tailwind name simplification conflicts detected in palette "${palette.name}":\n` +
          conflicts.join("\n") +
          "\n\nTo fix this:\n" +
          "  1. Rename the conflicting tokens so they simplify to unique names\n" +
          "  2. Or disable simplification: { simplifyNames: false }",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function findPalette(
  result: GenerationResult,
  name: string,
): GeneratedPalette | undefined {
  return result.palettes.find((palette) => palette.name === name);
}

/** `@theme { --color-<simplified>: var(--<full>); }` */
function themeBlock(result: GenerationResult, opts: ResolvedOptions): string {
  const lines = ["@theme {"];
  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const variant of Object.keys(variants)) {
        const parts = opts.simplifyNames
          ? simplifyTailwindParts(palette.name, group, variant)
          : [palette.name, group, variantSegment(variant)];
        const colorVar = cssVar("color", ...parts);
        lines.push(
          `${opts.indent}${colorVar}: var(${tokenVarName(palette.name, group, variant)});`,
        );
      }
    }
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * `@theme static { … }` for the tint path: full (unsimplified) names for
 * every palette, then the unprefixed names the `tint-*` utilities swap.
 */
function themeBlockWithTint(result: GenerationResult, opts: ResolvedOptions): string {
  const lines = ["@theme static {"];
  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const variant of Object.keys(variants)) {
        const colorVar = cssVar("color", palette.name, group, variantSegment(variant));
        lines.push(
          `${opts.indent}${colorVar}: var(${tokenVarName(palette.name, group, variant)});`,
        );
      }
    }
  }

  const defaultPalette = findPalette(result, opts.defaultPalette);
  if (defaultPalette) {
    lines.push("");
    lines.push(`${opts.indent}/* Unprefixed colors (for tint-* utility classes) */`);
    for (const [group, variants] of Object.entries(defaultPalette.tokens)) {
      for (const variant of Object.keys(variants)) {
        const segment = variantSegment(variant);
        const colorVar = cssVar("color", group, segment);
        lines.push(`${opts.indent}${colorVar}: var(${cssVar(group, segment)});`);
      }
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Alias layer: `<selector> { --text-heading: var(--base-text-heading); … }`,
 * wrapped in the result's media query. Returns `undefined` when the default
 * palette is absent.
 */
function aliasLayer(result: GenerationResult, opts: ResolvedOptions): string | undefined {
  const defaultPalette = findPalette(result, opts.defaultPalette);
  if (!defaultPalette) return undefined;

  const body = [`/* Unprefixed variables (default to ${opts.defaultPalette}) */`];
  for (const [group, variants] of Object.entries(defaultPalette.tokens)) {
    for (const variant of Object.keys(variants)) {
      const alias = cssVar(group, variantSegment(variant));
      body.push(`${alias}: var(${tokenVarName(opts.defaultPalette, group, variant)});`);
    }
  }

  const block = [`${result.selector} {`, ...body.map((line) => opts.indent + line), "}"];
  return wrapInMediaQuery(block, result, opts.indent).join("\n");
}

/** One `@utility tint-<palette> { … }` per non-default palette. */
function tintUtilities(result: GenerationResult, opts: ResolvedOptions): string[] {
  const defaultPalette = findPalette(result, opts.defaultPalette);
  if (!defaultPalette) return [];

  const blocks: string[] = [];
  for (const palette of result.palettes) {
    if (palette.name === opts.defaultPalette) continue;
    const lines = [`@utility tint-${palette.name} {`];
    for (const [group, variants] of Object.entries(defaultPalette.tokens)) {
      for (const variant of Object.keys(variants)) {
        const colorVar = cssVar("color", group, variantSegment(variant));
        lines.push(
          `${opts.indent}${colorVar}: var(${tokenVarName(palette.name, group, variant)});`,
        );
      }
    }
    lines.push("}");
    blocks.push(lines.join("\n"));
  }
  return blocks;
}

/** One `@utility <group>-<variant> { … }` per token of a utility-prefix group. */
function shortcutUtilities(result: GenerationResult, opts: ResolvedOptions): string[] {
  const defaultPalette = findPalette(result, opts.defaultPalette);
  if (!defaultPalette) return [];

  const blocks: string[] = [];
  for (const [group, variants] of Object.entries(defaultPalette.tokens)) {
    const prefix = group.toLowerCase();
    if (!(prefix in TAILWIND_UTILITY_PREFIXES)) continue;
    const property = SHORTCUT_PROPERTIES[prefix];
    if (!property) continue;

    for (const variant of Object.keys(variants)) {
      const segment = variantSegment(variant);
      const value = `var(${cssVar("color", group, segment)})`;
      const lines = [`@utility ${prefix}-${segment || "default"} {`];
      if (typeof property === "string") {
        lines.push(`${opts.indent}${property}: ${value};`);
      } else {
        lines.push(...property(value).map((line) => opts.indent + line));
      }
      lines.push("}");
      blocks.push(lines.join("\n"));
    }
  }
  return blocks;
}

function cssBlocks(results: GenerationResult[], opts: ResolvedOptions): string[] {
  return results.map((res) =>
    resultToCSS(res, { indent: opts.indent, includeOKLCH: opts.includeOKLCH }),
  );
}

// ---------------------------------------------------------------------------
// Public formatters
// ---------------------------------------------------------------------------

/**
 * Tailwind v4 `@theme` block mapping `--color-*` names to the CSS variables
 * produced by `toCSS`. One block serves every theme since the variables
 * themselves change per selector / media query.
 */
export function toTailwind(
  result: GenerationResult | GenerationResult[],
  options?: TailwindOptions,
): string {
  const results = Array.isArray(result) ? result : [result];
  const opts = resolveOptions(options);
  const first = results[0];
  if (!first) return "@theme {\n}";

  assertConsistentStructure(results);
  detectTailwindConflicts(first, opts.simplifyNames);
  return themeBlock(first, opts);
}

/** `toCSS` blocks for every result followed by one shared `@theme` block. */
export function toCSSWithTailwind(
  result: GenerationResult | GenerationResult[],
  options?: TailwindOptions & { includeOKLCH?: boolean },
): string {
  const results = Array.isArray(result) ? result : [result];
  const opts = resolveOptions(options);
  const first = results[0];
  if (!first) return "";

  assertConsistentStructure(results);
  detectTailwindConflicts(first, opts.simplifyNames);
  return [...cssBlocks(results, opts), themeBlock(first, opts)].join("\n\n");
}

/**
 * Complete single-file Tailwind output with the tint utility system:
 *
 * 1. CSS variable block per theme
 * 2. Unprefixed alias layer per theme (`--text-heading: var(--base-text-heading)`)
 * 3. `@theme static` with full names plus the unprefixed colors
 * 4. `@utility tint-<palette>` for every non-default palette
 * 5. `@utility <group>-<variant>` shortcuts for utility-prefix groups
 *
 * With `generateTintUtilities: false` only sections 1 and a plain `@theme`
 * (simplified names) are emitted.
 */
export function toCSSWithTailwindAndTint(
  result: GenerationResult | GenerationResult[],
  options?: TintUtilitiesOptions,
): string {
  const results = Array.isArray(result) ? result : [result];
  const opts = resolveOptions(options);
  const tintEnabled = options?.generateTintUtilities ?? true;
  const first = results[0];
  if (!first) return "";

  assertConsistentStructure(results);

  const sections = cssBlocks(results, opts);

  if (!tintEnabled) {
    detectTailwindConflicts(first, opts.simplifyNames);
    sections.push(themeBlock(first, opts));
    return sections.join("\n\n");
  }

  for (const res of results) {
    const aliases = aliasLayer(res, opts);
    if (aliases) sections.push(aliases);
  }
  sections.push(themeBlockWithTint(first, opts));
  sections.push(...tintUtilities(first, opts));
  if (opts.generateShortcuts) sections.push(...shortcutUtilities(first, opts));

  return sections.join("\n\n");
}
