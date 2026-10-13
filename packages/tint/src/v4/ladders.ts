/**
 * Numeric-scale ladders (proto/numeric-scale).
 *
 * One file on purpose: these are the numbers to tune by feel.
 * Scale 1 is the first stop. Decimals interpolate. Values outside 1..5
 * continue the end segment (APCA linear, WCAG geometric).
 *
 * Text 3 is body text. Border 4 is the WCAG non-text 3:1 rung.
 * Emphasis 1–2 are tint steps; emphasis 3–5 are {@link EMPHASIS_LADDER}.
 */

import type { ContrastAlgorithm, Kind, Mode } from "./types.js";

/** APCA |Lc| and WCAG ratio for `text(1)` … `text(5)`. */
export const TEXT_LADDER = {
  apca: [45, 60, 75, 90, 100],
  wcag2: [3, 3.75, 4.5, 7, 12],
} as const;

/** APCA |Lc| and WCAG ratio for `border(1)` … `border(5)`. */
export const BORDER_LADDER = {
  apca: [15, 30, 45, 60, 75],
  wcag2: [1.25, 1.6, 2, 3, 4.5],
} as const;

/** `text(3)` / the body-text stop. Below this, text lints. */
export const TEXT_BODY_SCALE = 3;

/**
 * Emphasis at or below this scale is a lightness tint.
 * One step is {@link TINT_STEP} in `lower.ts` (mode-aware).
 */
export const EMPHASIS_TINT_MAX = 2;

/**
 * Emphasis at or above this scale is a solid fill on {@link EMPHASIS_LADDER}.
 * Scales between {@link EMPHASIS_TINT_MAX} and this blend lightness.
 */
export const EMPHASIS_SOLID_MIN = 3;

/**
 * Fill-vs-backdrop contrast for `emphasis(3)` … `emphasis(5)`.
 *
 * APCA is mode-aware. A light page needs only ~Lc 62 before white text can
 * hit body contrast (Lc 75); a dark page needs ~Lc 75 before black text can.
 * The same number cannot do both: Lc 60–72 sits in APCA's mid-tone dead zone
 * on a dark page (label tops out near Lc 65). WCAG 4.5:1 has no such gap, so
 * both modes share the old solid rungs (3 / 4.5 / 7).
 *
 * Stops are scales 3, 4, 5. Decimals interpolate (APCA linear, WCAG geometric).
 * Past 5 the last segment continues.
 */
export const EMPHASIS_LADDER = {
  apca: {
    light: [62, 74, 90],
    dark: [75, 87, 100],
  },
  wcag2: [3, 4.5, 7],
} as const;

/**
 * Emphasis at or above this scale is treated as a solid control fill.
 * Below it, the token is a tint and is not held to non-text 3:1.
 */
export const SOLID_EMPHASIS_SCALE = EMPHASIS_SOLID_MIN;

/** WCAG non-text contrast for UI components (SC 1.4.11). */
export const NON_TEXT_RATIO = 3;

/**
 * Surfaces closer than this in OKLCH lightness are treated as indistinguishable.
 * Half of the light-mode surface step (0.02).
 */
export const SURFACE_DISTINCT_DELTA = 0.01;

/** Page lightness (0..100) that `mode` is shorthand for. */
export const MODE_PAGE_LIGHTNESS = { light: 96, dark: 15 } as const;

/**
 * Lightness at or above this is a light page (text goes darker).
 * Below it, the page is dark.
 */
export const POLARITY_SPLIT = 50;

export const BODY_TEXT_RULE = {
  apca: { name: "APCA body text", unit: "Lc" as const, value: TEXT_LADDER.apca[2] },
  wcag2: {
    name: "WCAG 2 body text",
    unit: "ratio" as const,
    value: TEXT_LADDER.wcag2[2],
  },
} as const;

export function ladderFor(
  kind: "text" | "border",
  algorithm: ContrastAlgorithm,
): readonly number[] {
  return kind === "text" ? TEXT_LADDER[algorithm] : BORDER_LADDER[algorithm];
}

/**
 * Contrast target for a scale.
 * APCA interpolates in a straight line. WCAG interpolates by ratio.
 */
export function ladderValue(
  stops: readonly number[],
  scale: number,
  geometric: boolean,
): number {
  const first = stops[0];
  const second = stops[1];
  if (first === undefined || second === undefined) {
    throw new Error("a contrast ladder needs at least two stops");
  }
  const index = scale - 1;
  const last = stops.length - 1;
  if (index <= 0) return extrapolate(first, second, index, geometric);
  if (index >= last) {
    const left = stops[last - 1];
    const right = stops[last];
    if (left === undefined || right === undefined) {
      throw new Error("missing contrast ladder stop");
    }
    return extrapolate(left, right, index - (last - 1), geometric);
  }
  const i = Math.floor(index);
  const left = stops[i];
  const right = stops[i + 1];
  if (left === undefined || right === undefined) {
    throw new Error("missing contrast ladder stop");
  }
  return extrapolate(left, right, index - i, geometric);
}

/** Body-text target for the active algorithm. Scale {@link TEXT_BODY_SCALE}. */
export function bodyTextTarget(algorithm: ContrastAlgorithm): number {
  return ladderValue(TEXT_LADDER[algorithm], TEXT_BODY_SCALE, algorithm === "wcag2");
}

export function contrastAt(
  kind: Kind,
  algorithm: ContrastAlgorithm,
  scale: number,
): number | undefined {
  if (kind !== "text" && kind !== "border") return undefined;
  return ladderValue(ladderFor(kind, algorithm), scale, algorithm === "wcag2");
}

/** Contrast target for a solid emphasis scale (3 and up). */
export function emphasisContrast(
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  const stops = algorithm === "apca" ? EMPHASIS_LADDER.apca[mode] : EMPHASIS_LADDER.wcag2;
  return ladderValue(stops, scale - (EMPHASIS_SOLID_MIN - 1), algorithm === "wcag2");
}

function extrapolate(a: number, b: number, t: number, geometric: boolean): number {
  if (!geometric || a <= 0 || b <= 0) return a + (b - a) * t;
  return a * (b / a) ** t;
}
