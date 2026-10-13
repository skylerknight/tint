/**
 * Kind lints for the numeric-scale prototype.
 *
 * Text under the minimum for any text, solid emphasis and firm borders under WCAG 3:1,
 * surfaces that share a lightness, and page lightness too far into the middle
 * for body text to pass.
 */

import { oklchToRGBGamut } from "../color/gamut.js";
import type { RGB } from "../color/types.js";
import { calcAPCAabs } from "../contrast/apca.js";
import { wcag2Ratio } from "../contrast/wcag2.js";
import {
  BODY_TEXT_RULE,
  MIN_TEXT_RULE,
  NON_TEXT_RATIO,
  SOLID_EMPHASIS_SCALE,
  SURFACE_DISTINCT_DELTA,
  TEXT_MIN_SCALE,
  bodyTextTarget,
} from "./ladders.js";
import type { EngineDiagnosticV4 } from "./diagnostics.js";
import { PAGE } from "./graph.js";
import type { PaletteResultV4, SolvedTokenV4 } from "./engine.js";
import type { ContrastAlgorithm, Mode } from "./types.js";

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

export function isDisabledName(name: string): boolean {
  return name === "disabled" || name.endsWith("-disabled");
}

/** Best of black or white against a neutral page at `lightness` (0..100). */
export function maxPageContrast(lightness: number, algorithm: ContrastAlgorithm): number {
  const page = oklchToRGBGamut({ l: clamp01(lightness / 100), c: 0, h: 0 });
  if (algorithm === "wcag2") {
    return Math.max(wcag2Ratio(BLACK, page), wcag2Ratio(WHITE, page));
  }
  return Math.max(calcAPCAabs(BLACK, page), calcAPCAabs(WHITE, page));
}

export function pageCanHostBody(
  lightness: number,
  algorithm: ContrastAlgorithm,
): boolean {
  return maxPageContrast(lightness, algorithm) + 1e-6 >= bodyTextTarget(algorithm);
}

export function pageLightnessLint(input: {
  theme: string;
  lightness: number;
  algorithm: ContrastAlgorithm;
  palette: string;
}): EngineDiagnosticV4 | undefined {
  const rule = BODY_TEXT_RULE[input.algorithm];
  const best = maxPageContrast(input.lightness, input.algorithm);
  if (best + 1e-6 >= rule.value) return undefined;
  const shown = input.algorithm === "apca" ? best.toFixed(0) : best.toFixed(2);
  return {
    severity: "warning",
    code: "page-lightness",
    path: `themes.${input.theme}.lightness`,
    theme: input.theme,
    palette: input.palette,
    message: `Theme "${input.theme}" page lightness ${input.lightness} cannot host body text (${rule.name} ${rule.unit} ${rule.value}; best available is ${shown}).`,
    hint: "Move lightness toward 0 or 100. The middle of the range has no polarity that passes body text.",
    data: { target: rule.value, achieved: best },
  };
}

export function modeLightnessLint(input: {
  theme: string;
  lightness: number;
  mode: Mode;
  authoredMode: Mode;
  palette: string;
}): EngineDiagnosticV4 {
  return {
    severity: "warning",
    code: "mode-lightness",
    path: `themes.${input.theme}`,
    theme: input.theme,
    palette: input.palette,
    message: `Theme "${input.theme}" sets mode "${input.authoredMode}" and lightness ${input.lightness}. Lightness wins, so this theme is "${input.mode}".`,
    hint: "Drop mode, or set lightness on the same side (light ≥ 50, dark < 50). mode alone is shorthand for lightness 96 or 15.",
    data: { target: input.lightness },
  };
}

export function kindLints(
  theme: string,
  algorithm: ContrastAlgorithm,
  palette: PaletteResultV4,
): EngineDiagnosticV4[] {
  const lints: EngineDiagnosticV4[] = [];
  lints.push(...textLints(theme, algorithm, palette));
  lints.push(...nonTextLints(theme, palette));
  lints.push(...surfaceLints(theme, palette));
  return lints;
}

function textLints(
  theme: string,
  algorithm: ContrastAlgorithm,
  palette: PaletteResultV4,
): EngineDiagnosticV4[] {
  const rule = MIN_TEXT_RULE[algorithm];
  const lints: EngineDiagnosticV4[] = [];
  for (const token of palette.tokens) {
    if (token.generated || token.kind !== "text") continue;
    if (isDisabledName(token.name) || token.states.includes("disabled")) continue;
    if (token.mode !== "contrast" || token.target === undefined) continue;
    if (token.target + 1e-6 >= rule.value) continue;
    lints.push({
      severity: "warning",
      code: "text-below-body",
      path: `${palette.name}.${token.id}`,
      theme,
      palette: palette.name,
      message: `${palette.name}.${token.id} is below the minimum for text (${rule.name} ${rule.unit} ${rule.value}). Lowest passing scale is ${TEXT_MIN_SCALE}.`,
      hint: `This token targets ${rule.unit} ${formatTarget(algorithm, token.target)}. Use text(${TEXT_MIN_SCALE}) or higher. Muted text above that floor is allowed. Disabled text is exempt.`,
      data: { target: rule.value, achieved: token.target },
    });
  }
  return lints;
}

function nonTextLints(theme: string, palette: PaletteResultV4): EngineDiagnosticV4[] {
  const lints: EngineDiagnosticV4[] = [];
  for (const token of palette.tokens) {
    if (token.generated || isDisabledName(token.name)) continue;
    const emphasis = token.kind === "emphasis" && token.scale >= SOLID_EMPHASIS_SCALE;
    const border = token.kind === "border" && token.scale >= 4;
    if (!emphasis && !border) continue;
    const ratio = worstRatio(token, palette);
    if (ratio + 1e-6 >= NON_TEXT_RATIO) continue;
    const code = emphasis ? "emphasis-non-text" : "border-non-text";
    lints.push({
      severity: "warning",
      code,
      path: `${palette.name}.${token.id}`,
      theme,
      palette: palette.name,
      message: `${palette.name}.${token.id} is below non-text contrast (WCAG 3:1) against ${token.worst ?? PAGE} (${ratio.toFixed(2)}:1).`,
      hint: emphasis
        ? `Emphasis at scale ${SOLID_EMPHASIS_SCALE} or above is treated as a solid control. Raise the scale, or keep it under ${SOLID_EMPHASIS_SCALE} for a tint.`
        : "border(4) is the 3:1 rung. A lower scale is decorative and is not held to non-text contrast.",
      data: { target: NON_TEXT_RATIO, achieved: ratio },
    });
  }
  return lints;
}

function surfaceLints(theme: string, palette: PaletteResultV4): EngineDiagnosticV4[] {
  const surfaces = palette.tokens.filter(
    (token) => !token.generated && token.kind === "surface",
  );
  const ordered = [...surfaces].sort((a, b) => a.color.oklch.l - b.color.oklch.l);
  const lints: EngineDiagnosticV4[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const left = ordered[i - 1];
    const right = ordered[i];
    if (left === undefined || right === undefined) continue;
    const delta = Math.abs(right.color.oklch.l - left.color.oklch.l);
    if (delta + 1e-9 >= SURFACE_DISTINCT_DELTA) continue;
    lints.push({
      severity: "warning",
      code: "surface-indistinguishable",
      path: `${palette.name}.${right.id}`,
      theme,
      palette: palette.name,
      message: `${palette.name}.${left.id} and ${palette.name}.${right.id} differ by ${delta.toFixed(3)} OKLCH lightness.`,
      hint: `Adjacent surfaces need at least ${SURFACE_DISTINCT_DELTA} lightness between them (half a light-mode step).`,
      data: { delta, tokens: [left.id, right.id] },
    });
  }
  return lints;
}

function worstRatio(token: SolvedTokenV4, palette: PaletteResultV4): number {
  const ids = token.backdrop.length > 0 ? token.backdrop : [PAGE];
  let min = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const background = id === PAGE ? palette.page.rgb : colorRgb(palette, id);
    if (background === undefined) continue;
    const ratio = wcag2Ratio(token.color.rgb, background);
    if (ratio < min) min = ratio;
  }
  return min;
}

function colorRgb(palette: PaletteResultV4, id: string): RGB | undefined {
  return palette.tokens.find((token) => token.id === id)?.color.rgb;
}

function formatTarget(algorithm: ContrastAlgorithm, value: number): string {
  return algorithm === "apca" ? value.toFixed(0) : value.toFixed(2);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
