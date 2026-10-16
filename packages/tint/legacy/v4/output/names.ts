/**
 * v4 token names (docs/v4-spec.md §2.4, §7, §8.1).
 *
 * CSS is `--[<prefix>-]<palette>-<group>[-<token>]`. `DEFAULT` drops its segment.
 * The alias is `--[<prefix>-]<group>[-<token>]` (`--action`, or `--tint-action`
 * when `output.prefix` is `"tint"`). DTCG uses `$root` for `DEFAULT`.
 * Flat keys are `palette.group[.token]` and do not take the prefix.
 */

import type { GenerationResultV4, PaletteResultV4, SolvedTokenV4 } from "../engine.js";
import {
  TAILWIND_UTILITY_PREFIXES,
  cssVar,
  tokenVarName as unprefixedTokenVarName,
  variantSegment,
} from "../../output/names.js";

export { TAILWIND_UTILITY_PREFIXES, cssVar, variantSegment };

/** `output.prefix` when it should be emitted. Blank is the same as omitted. */
export function cssPrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined || prefix === "") return undefined;
  return prefix;
}

/** DTCG 2025.10 group root token. `DEFAULT` is written under this key. */
export const DTCG_ROOT = "$root";

/** `DEFAULT` → `$root`. Every other token name is unchanged. */
export function dtcgTokenKey(name: string): string {
  return name === "DEFAULT" ? DTCG_ROOT : name;
}

/** Alias: `--[<prefix>-]<group>[-<token>]`. */
export function aliasVarName(group: string, token: string, prefix?: string): string {
  return cssVar(cssPrefix(prefix) ?? "", group, variantSegment(token));
}

/** Palette variable: `--[<prefix>-]<palette>-<group>[-<token>]`. */
export function tokenVarName(
  palette: string,
  group: string,
  token: string,
  prefix?: string,
): string {
  const active = cssPrefix(prefix);
  if (active === undefined) return unprefixedTokenVarName(palette, group, token);
  return cssVar(active, palette, group, variantSegment(token));
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
