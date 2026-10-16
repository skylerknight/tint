/**
 * DTCG 2025.10 color tokens (docs/v4-spec.md §7).
 *
 * One document per theme:
 * `{ <palette>: { <group>: { $root | <token>: { $type, $value, $description, $extensions } } } }`.
 *
 * `$value` is `{ colorSpace: "oklch", components, hex }`. Components are
 * OKLCH lightness (0..1), chroma, and hue `[0, 360)`. `hex` is the sRGB
 * fallback (`#rrggbb`). Alpha is omitted; DTCG treats that as fully opaque.
 * `output.format` does not change this object.
 */

import type { OKLCH } from "../../color/types.js";
import { PAGE } from "../graph.js";
import type { ContrastAlgorithm, Kind, LevelOrdinal } from "../types.js";
import type { GenerationResultV4, SolvedTokenV4 } from "../engine.js";
import { authoredTokens, dtcgTokenKey } from "./names.js";

export interface DTCGColorValue {
  readonly colorSpace: "oklch";
  /** `[lightness, chroma, hue]`. Lightness is 0..1. Hue is `[0, 360)`. */
  readonly components: readonly [number, number, number];
  /** 6-digit sRGB fallback. */
  readonly hex: string;
}

/**
 * `dev.tint` metadata.
 *
 * `on` is the resolved backdrop id list (`page` is the theme page). The
 * solved token does not keep the authored `on` string. `state` is omitted
 * for a rest token. `target` is omitted when the solver did not record one.
 */
export interface TintTokenExtension {
  readonly kind: Kind;
  readonly level: LevelOrdinal;
  readonly state?: string;
  readonly on: readonly string[];
  readonly algorithm: ContrastAlgorithm;
  readonly target?: number;
  readonly achieved: number;
}

export interface DTCGColorToken {
  readonly $type: "color";
  readonly $value: DTCGColorValue;
  readonly $description: string;
  readonly $extensions: { readonly "dev.tint": TintTokenExtension };
}

/** Palette → group → `$root` or token name. */
export type DTCGFile = Record<string, Record<string, Record<string, DTCGColorToken>>>;

/** Hue in `[0, 360)`, matching the DTCG OKLCH range. */
export function oklchComponents(color: OKLCH): [number, number, number] {
  const hue = ((color.h % 360) + 360) % 360;
  return [color.l, color.c, hue];
}

function backdropIds(token: SolvedTokenV4): string[] {
  return token.backdrop.length > 0 ? [...token.backdrop] : [PAGE];
}

function description(token: SolvedTokenV4, on: readonly string[]): string {
  const parts = [`${token.kind} level ${token.ordinal}`];
  if (token.states.length > 0) parts.push(`state ${token.states.join("-")}`);
  parts.push(`on ${on.join(", ")}`);
  return parts.join(", ");
}

function extension(
  token: SolvedTokenV4,
  algorithm: ContrastAlgorithm,
  on: readonly string[],
): TintTokenExtension {
  const base: TintTokenExtension = {
    kind: token.kind,
    level: token.ordinal,
    on,
    algorithm,
    achieved: token.achieved,
  };
  const state = token.states.length > 0 ? token.states.join("-") : undefined;
  if (state !== undefined && token.target !== undefined) {
    return { ...base, state, target: token.target };
  }
  if (state !== undefined) return { ...base, state };
  if (token.target !== undefined) return { ...base, target: token.target };
  return base;
}

function colorToken(token: SolvedTokenV4, algorithm: ContrastAlgorithm): DTCGColorToken {
  const on = backdropIds(token);
  return {
    $type: "color",
    $value: {
      colorSpace: "oklch",
      components: oklchComponents(token.color.oklch),
      hex: token.color.hex,
    },
    $description: description(token, on),
    $extensions: { "dev.tint": extension(token, algorithm, on) },
  };
}

/**
 * DTCG document for one theme. Palette, group, and token order follow the
 * result. `DEFAULT` is the group's `$root`.
 */
export function toDTCG(result: GenerationResultV4): DTCGFile {
  const file: DTCGFile = {};
  for (const palette of result.palettes) {
    const groups: Record<string, Record<string, DTCGColorToken>> = {};
    for (const token of authoredTokens(palette)) {
      const group = groups[token.group] ?? {};
      group[dtcgTokenKey(token.name)] = colorToken(token, result.algorithm);
      groups[token.group] = group;
    }
    file[palette.name] = groups;
  }
  return file;
}

/** `toDTCG` serialized with `JSON.stringify`. Indent defaults to 2. */
export function toDTCGJSON(result: GenerationResultV4, space = 2): string {
  return JSON.stringify(toDTCG(result), null, space);
}
