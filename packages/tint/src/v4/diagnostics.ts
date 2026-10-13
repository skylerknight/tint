/**
 * v4 lints (docs/v4-spec.md §6.4, §6.5, §6.6).
 *
 * Contrast failures stay on the engine. This module names the codes added
 * by auto-nudge, `exact`, and the info/warn lints that run after solving.
 */

import { isOKLCHInGamut } from "../color/convert.js";
import { parseOKLCH } from "../color/parse.js";
import type { Polarity } from "../contrast/types.js";
import { NUDGE_MAX_LEVELS } from "./constants.js";
import type { PaletteResultV4 } from "./engine.js";

export const DIAGNOSTIC_CODES = [
  "contrast-unreachable",
  "label-unreachable",
  "emphasis-nudged",
  "exact-rejected",
  "duplicate-token",
  "hue-identity-lost",
  "expert-value",
  "color-out-of-gamut",
  "text-below-body",
  "emphasis-non-text",
  "border-non-text",
  "surface-indistinguishable",
  "page-lightness",
  "mode-lightness",
] as const;

export type DiagnosticCodeV4 = (typeof DIAGNOSTIC_CODES)[number];

export type DiagnosticSeverityV4 = "info" | "warning" | "error";

/**
 * Extra fields vary by code. Absent keys are omitted
 * (`exactOptionalPropertyTypes`).
 */
export interface EngineDiagnosticDataV4 {
  readonly target?: number;
  readonly achieved?: number;
  readonly polarity?: Polarity;
  readonly worst?: string;
  /** OKLCH lightness the emphasis rest moved. Always positive. */
  readonly delta?: number;
  readonly from?: string;
  readonly to?: string;
  readonly emphasis?: string;
  /** Foreground id, then the backdrop id it failed against. */
  readonly pair?: readonly [string, string];
  readonly tokens?: readonly [string, string];
  readonly fields?: readonly string[];
  readonly requested?: string;
  readonly mapped?: string;
}

export interface EngineDiagnosticV4 {
  readonly severity: DiagnosticSeverityV4;
  readonly code: DiagnosticCodeV4;
  readonly path: string;
  readonly message: string;
  readonly hint: string;
  readonly theme: string;
  readonly palette: string;
  readonly data?: EngineDiagnosticDataV4;
}

/**
 * |ΔL| from the palette color that counts as losing the hue (§6.6).
 * The spec gives the example (yellow → olive) and no number. 0.35 OKLCH L
 * is far enough that a default emphasis step does not trip it, and close
 * enough that a loud yellow solved down to olive does.
 */
export const HUE_IDENTITY_LIGHTNESS_DELTA = 0.35;

/**
 * Palette chroma below this has no hue to lose. Neutral seeds sit under it.
 */
export const HUE_IDENTITY_MIN_CHROMA = 0.08;

export function emphasisNudged(input: {
  theme: string;
  palette: string;
  id: string;
  delta: number;
  from: string;
  to: string;
  labels: readonly string[];
}): EngineDiagnosticV4 {
  const who = input.labels.length === 0 ? "its label" : input.labels.join(", ");
  return {
    severity: "info",
    code: "emphasis-nudged",
    path: `${input.palette}.${input.id}`,
    theme: input.theme,
    palette: input.palette,
    message: `${input.palette}.${input.id} moved ${input.delta.toFixed(3)} in OKLCH lightness so ${who} can pass.`,
    hint: `The move is capped at +${NUDGE_MAX_LEVELS} levels. Set nudge: false on the emphasis token to keep the solved color.`,
    data: {
      delta: input.delta,
      from: input.from,
      to: input.to,
      emphasis: input.id,
    },
  };
}

export function labelUnreachable(input: {
  theme: string;
  palette: string;
  label: string;
  emphasis: string;
  target: number;
  achieved: number;
  unit: "Lc" | "ratio";
  nudgeDisabled: boolean;
  pair: readonly [string, string];
}): EngineDiagnosticV4 {
  const shown = input.achieved.toFixed(1);
  const hint = input.nudgeDisabled
    ? `nudge: false kept ${input.emphasis} where it was. Remove it, or lower ${input.label}'s level.`
    : `${input.emphasis} already moved as far as +${NUDGE_MAX_LEVELS} levels allows. Lower ${input.label}'s level, or pick a palette color with more room against its backdrop.`;
  return {
    severity: "warning",
    code: "label-unreachable",
    path: `${input.palette}.${input.label}`,
    theme: input.theme,
    palette: input.palette,
    message: `${input.palette}.${input.label} on ${input.emphasis} needs ${input.unit} ${input.target} and can reach ${input.unit} ${shown}.`,
    hint,
    data: {
      target: input.target,
      achieved: input.achieved,
      emphasis: input.emphasis,
      pair: input.pair,
    },
  };
}

export function exactRejected(input: {
  theme: string;
  palette: string;
  token: string;
  color: string;
  pair: readonly [string, string];
  unit: "Lc" | "ratio";
  target?: number;
  achieved?: number;
}): EngineDiagnosticV4 {
  const [foreground, background] = input.pair;
  const detail =
    input.target !== undefined && input.achieved !== undefined
      ? ` (${input.unit} ${input.achieved.toFixed(1)}, target ${input.target})`
      : "";
  const data: EngineDiagnosticDataV4 = { pair: input.pair };
  const withNumbers: EngineDiagnosticDataV4 =
    input.target !== undefined && input.achieved !== undefined
      ? { ...data, target: input.target, achieved: input.achieved }
      : data;
  return {
    severity: "warning",
    code: "exact-rejected",
    path: `${input.palette}.${input.token}`,
    theme: input.theme,
    palette: input.palette,
    message: `exact ${input.color} on ${input.palette}.${input.token} fails ${foreground} × ${background}${detail}.`,
    hint: "The palette color stays the hue and chroma. Lightness stays solved unless every pair passes.",
    data: withNumbers,
  };
}

interface ExpansionColors {
  readonly name: string;
  readonly palettes: readonly PaletteResultV4[];
}

/** Same published hex for two authored tokens in every theme × palette color. */
export function duplicateTokenLints(
  results: readonly ExpansionColors[],
): EngineDiagnosticV4[] {
  const expansions: Map<string, string>[] = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const paletteNames: string[] = [];
  for (const result of results) {
    for (const palette of result.palettes) {
      if (!paletteNames.includes(palette.name)) paletteNames.push(palette.name);
      const map = new Map<string, string>();
      for (const token of palette.tokens) {
        if (token.generated) continue;
        map.set(token.id, token.color.hex);
        if (!seen.has(token.id)) {
          seen.add(token.id);
          ids.push(token.id);
        }
      }
      expansions.push(map);
    }
  }
  if (expansions.length === 0) return [];

  const palette = paletteNames.length === 1 ? (paletteNames[0] ?? "*") : "*";
  const shared: EngineDiagnosticV4[] = [];
  for (let i = 0; i < ids.length; i++) {
    const left = ids[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const right = ids[j];
      if (right === undefined) continue;
      const same = expansions.every((map) => {
        const a = map.get(left);
        const b = map.get(right);
        return a !== undefined && a === b;
      });
      if (!same) continue;
      const hex = expansions[0]?.get(left) ?? "";
      shared.push({
        severity: "info",
        code: "duplicate-token",
        path: `${left}+${right}`,
        theme: "",
        palette,
        message: `${left} and ${right} both resolve to ${hex} in every theme and palette color.`,
        hint: "Drop one token, or reuse a single token for both roles. A ref() alias is still an open question (§11).",
        data: { tokens: [left, right] },
      });
    }
  }

  const stamped: EngineDiagnosticV4[] = [];
  for (const result of results) {
    for (const lint of shared) stamped.push({ ...lint, theme: result.name });
  }
  return stamped;
}

/**
 * Emphasis whose lightness left the palette color.
 *
 * Surfaces, text, and borders are allowed to leave the seed: elevation and
 * contrast targets are supposed to move them. The spec's example is the
 * palette hue itself turning into a different color (yellow → olive), which
 * is the emphasis fill.
 */
export function hueIdentityLints(
  theme: string,
  palette: PaletteResultV4,
): EngineDiagnosticV4[] {
  if (palette.seed.oklch.c < HUE_IDENTITY_MIN_CHROMA) return [];
  const lints: EngineDiagnosticV4[] = [];
  for (const token of palette.tokens) {
    if (token.generated || token.kind !== "emphasis") continue;
    const delta = Math.abs(token.color.oklch.l - palette.seed.oklch.l);
    if (delta < HUE_IDENTITY_LIGHTNESS_DELTA) continue;
    lints.push({
      severity: "info",
      code: "hue-identity-lost",
      path: `${palette.name}.${token.id}`,
      theme,
      palette: palette.name,
      message: `${palette.name}.${token.id} drifted ${delta.toFixed(3)} in OKLCH lightness from ${palette.seed.hex} to ${token.color.hex}. A hue like yellow can read as olive that far from the palette color.`,
      hint: "Use a level closer to the palette color's lightness, or exact when the palette color itself passes.",
      data: { delta, from: palette.seed.hex, to: token.color.hex },
    });
  }
  return lints;
}

export function expertValueLints(
  theme: string,
  palette: string,
  tokens: readonly {
    id: string;
    lc?: number;
    ratio?: number;
    step?: number;
  }[],
  seen: Set<string>,
): EngineDiagnosticV4[] {
  const lints: EngineDiagnosticV4[] = [];
  for (const token of tokens) {
    const fields: string[] = [];
    if (token.lc !== undefined) fields.push("lc");
    if (token.ratio !== undefined) fields.push("ratio");
    if (token.step !== undefined) fields.push("step");
    if (fields.length === 0) continue;
    const key = `${token.id}:${fields.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lints.push({
      severity: "info",
      code: "expert-value",
      path: `tokens.${token.id}`,
      theme,
      palette,
      message: `tokens.${token.id} sets expert ${fields.join(", ")}.`,
      hint: "Prefer a level. lc, ratio, and step skip the contrast table.",
      data: { fields },
    });
  }
  return lints;
}

/** Palette `oklch()` outside sRGB. Hex, rgb(), and hsl() are already in gamut. */
export function colorOutOfGamutLint(
  theme: string,
  palette: string,
  color: string,
  mappedHex: string,
): EngineDiagnosticV4 | undefined {
  const trimmed = color.trim().toLowerCase();
  if (!trimmed.startsWith("oklch(")) return undefined;
  let requested;
  try {
    requested = parseOKLCH(trimmed);
  } catch {
    return undefined;
  }
  if (isOKLCHInGamut(requested)) return undefined;
  return {
    severity: "warning",
    code: "color-out-of-gamut",
    path: palette,
    theme,
    palette,
    message: `Palette color "${color}" for "${palette}" is outside sRGB and was mapped to ${mappedHex}.`,
    hint: "Lower the chroma so the palette color fits in sRGB.",
    data: { requested: trimmed, mapped: mappedHex },
  };
}
