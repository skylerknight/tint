/**
 * Flat color map (docs/v4-spec.md §7).
 *
 * `{ "brand.action.hover": "…" }` for one theme. `DEFAULT` is dropped, so
 * `brand.action.DEFAULT` is `brand.action`. Values use `output.format`
 * (`oklch` by default, or `hex` / `rgb`).
 */

import type { ColorFormat } from "../types.js";
import type { GenerationResultV4 } from "../engine.js";
import { formatColor } from "./css.js";
import { authoredTokens, flatTokenKey } from "./names.js";

export interface FlatOptions {
  /** Default `oklch`, the same default as `output.format`. */
  format?: ColorFormat;
}

/** `"palette.group[.token]"` → color string, in palette and token order. */
export function toFlat(
  result: GenerationResultV4,
  options?: FlatOptions,
): Record<string, string> {
  const format = options?.format ?? "oklch";
  const out: Record<string, string> = {};
  for (const palette of result.palettes) {
    for (const token of authoredTokens(palette)) {
      const key = flatTokenKey(palette.name, token.group, token.name);
      out[key] = formatColor(token.color, format);
    }
  }
  return out;
}

/** `toFlat` serialized with `JSON.stringify`. Indent defaults to 2. */
export function toFlatJSON(result: GenerationResultV4, options?: FlatOptions): string {
  const space = 2;
  return JSON.stringify(toFlat(result, options), null, space);
}
