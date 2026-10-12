/**
 * v4 token names (docs/v4-spec.md §2.4, §7, §8.1).
 *
 * CSS is `--<palette>-<group>[-<token>]`. `DEFAULT` drops its segment.
 * The unprefixed alias is `--<group>[-<token>]` (`--tint-ink`, `--action`).
 * DTCG uses `$root` for `DEFAULT`. Flat keys are `palette.group[.token]`.
 */

import type { GenerationResultV4, PaletteResultV4, SolvedTokenV4 } from "../engine.js";
import {
  TAILWIND_UTILITY_PREFIXES,
  cssVar,
  tokenVarName,
  variantSegment,
} from "../../output/names.js";

export { TAILWIND_UTILITY_PREFIXES, cssVar, tokenVarName, variantSegment };

/** DTCG 2025.10 group root token. `DEFAULT` is written under this key. */
export const DTCG_ROOT = "$root";

/** `DEFAULT` → `$root`. Every other token name is unchanged. */
export function dtcgTokenKey(name: string): string {
  return name === "DEFAULT" ? DTCG_ROOT : name;
}

/** Unprefixed alias: `--<group>[-<token>]`. */
export function aliasVarName(group: string, token: string): string {
  return cssVar(group, variantSegment(token));
}

/** Tailwind v4 theme color: `--color-<group>[-<token>]`. */
export function themeColorVar(group: string, token: string): string {
  return cssVar("color", group, variantSegment(token));
}

/** `palette.group` or `palette.group.token`, with `DEFAULT` dropped. */
export function flatTokenKey(palette: string, group: string, token: string): string {
  return [palette, group, variantSegment(token)].filter((part) => part !== "").join(".");
}

/** Authored tokens in output order. Generated rests stay internal. */
export function authoredTokens(palette: PaletteResultV4): SolvedTokenV4[] {
  return palette.tokens.filter((token) => !token.generated);
}

/**
 * Palette the unprefixed aliases point at.
 * The first `isDefault` palette wins. Otherwise the first palette.
 */
export function defaultPalette(result: GenerationResultV4): PaletteResultV4 | undefined {
  return result.palettes.find((palette) => palette.isDefault) ?? result.palettes[0];
}
