/**
 * Static-hex `@theme` block for the Tailwind CSS IntelliSense extension.
 *
 * The runtime stylesheet points `--color-*` at `var()` aliases. The
 * extension cannot resolve those, so this file writes the default
 * palette's theme colors as hex. Only the first theme is used.
 */

import type { GenerationResultV4 } from "./engine.js";
import { authoredTokens, defaultPalette, themeColorVar } from "./output/names.js";

const IMPORT = "@import 'tailwindcss';";

export function toTailwindIntelliSense(
  result: GenerationResultV4 | readonly GenerationResultV4[],
): string {
  const first = Array.isArray(result) ? result[0] : result;
  const lines = [IMPORT, "", "@theme {"];
  const palette = first === undefined ? undefined : defaultPalette(first);
  if (palette !== undefined) {
    const tokens = authoredTokens(palette);
    if (tokens.length > 0) {
      lines.push("  /* Unprefixed colors (for tint-* utility classes) */");
    }
    for (const token of tokens) {
      lines.push(`  ${themeColorVar(token.group, token.name)}: ${token.color.hex};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}
