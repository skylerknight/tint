import type { GenerationResult } from "../engine/types.js";
import { DEFAULT_INDENT } from "./css.js";
import { cssVar, simplifyTailwindParts, variantSegment } from "./names.js";
import { DEFAULT_PALETTE, detectTailwindConflicts } from "./tailwind.js";
import type { TintUtilitiesOptions } from "./tailwind.js";

/**
 * Static-hex `@theme` block for the Tailwind CSS IntelliSense extension,
 * which cannot resolve `var()` references. Only the first result (typically
 * the light theme) is used; the runtime file keeps the `var()` indirection.
 *
 * With `generateTintUtilities: true` the names match the tint path (full
 * names plus the unprefixed default-palette colors); otherwise names are
 * simplified like `toTailwind`.
 */
export function toTailwindIntelliSense(
  result: GenerationResult | GenerationResult[],
  options?: TintUtilitiesOptions,
): string {
  const first = Array.isArray(result) ? result[0] : result;
  const indent = options?.indent ?? DEFAULT_INDENT;
  const simplifyNames = options?.simplifyNames ?? true;
  const tintPath = options?.generateTintUtilities === true;
  const defaultPaletteName = options?.defaultPalette ?? DEFAULT_PALETTE;

  const lines = ["@import 'tailwindcss';", "", "@theme {"];
  if (!first) {
    lines.push("}");
    return lines.join("\n");
  }

  if (!tintPath) detectTailwindConflicts(first, simplifyNames);

  for (const palette of first.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const [variant, token] of Object.entries(variants)) {
        const parts =
          !tintPath && simplifyNames
            ? simplifyTailwindParts(palette.name, group, variant)
            : [palette.name, group, variantSegment(variant)];
        lines.push(`${indent}${cssVar("color", ...parts)}: ${token.hex};`);
      }
    }
  }

  const defaultPalette = tintPath
    ? first.palettes.find((palette) => palette.name === defaultPaletteName)
    : undefined;
  if (defaultPalette) {
    lines.push("");
    lines.push(`${indent}/* Unprefixed colors (for tint-* utility classes) */`);
    for (const [group, variants] of Object.entries(defaultPalette.tokens)) {
      for (const [variant, token] of Object.entries(variants)) {
        const colorVar = cssVar("color", group, variantSegment(variant));
        lines.push(`${indent}${colorVar}: ${token.hex};`);
      }
    }
  }

  lines.push("}");
  return lines.join("\n");
}
