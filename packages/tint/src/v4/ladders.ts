/**
 * Numeric-scale ladders (proto/numeric-scale-calibrated).
 *
 * One file on purpose: these are the numbers to tune by feel.
 * Decimals interpolate. Values past the last stop continue the end segment
 * (APCA linear, WCAG geometric).
 *
 * Text 1 is the minimum for any text. Text 3 is body text.
 * Border 4 is the WCAG non-text 3:1 rung.
 *
 * Emphasis is one scale with three regimes:
 * - {@link EMPHASIS_FLOOR_SCALE} is a per-mode contrast floor (the disabled spot).
 * - Through {@link EMPHASIS_TINT_MAX}, lightness tints. One integer is two tint
 *   steps (ΔL 0.05 light, 0.075 dark): a clearly visible fill change.
 * - From {@link EMPHASIS_SOLID_MIN} up, the per-mode {@link EMPHASIS_LADDER}.
 *   Scales between the tint max and that solid blend lightness, so the step
 *   stays about the same size instead of jumping.
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

/** `text(1)` / the minimum for any text. Below this, text lints. Disabled text does not. */
export const TEXT_MIN_SCALE = 1;

/** `text(3)` / the body-text stop. */
export const TEXT_BODY_SCALE = 3;

/**
 * Disabled spot. Per-mode contrast, not a tint: Lc 15 is about ΔL 0.09 on a
 * light page and about ΔL 0.29 on a dark page, so no single tint step matches.
 */
export const EMPHASIS_FLOOR_SCALE = 1;

/** APCA |Lc| and WCAG ratio for {@link EMPHASIS_FLOOR_SCALE}. */
export const EMPHASIS_FLOOR = { apca: 15, wcag2: 1.5 } as const;

/**
 * Tint steps represented by one emphasis integer in the lightness region.
 * Two tint steps is ΔL 0.05 (light) / 0.075 (dark): the soft resting→pressed
 * jump, large enough to see, small enough that a half step is a hover.
 */
export const EMPHASIS_TINT_PER_SCALE = 2;

/**
 * Last pure tint.
 * `emphasis(2)` is two tint steps, `emphasis(2.5)` three, `emphasis(3)` four.
 */
export const EMPHASIS_TINT_MAX = 3;

/**
 * First solid fill on {@link EMPHASIS_LADDER}.
 *
 * The gap from the tint at {@link EMPHASIS_TINT_MAX} (about L 0.86 light /
 * 0.30 dark) to the first body-capable fill (about L 0.57 / 0.84) is several
 * tint-integers wide. Six scale steps (3 → 9) keep each integer near ΔL 0.05
 * light and ΔL 0.09 dark instead of spending the whole gap on one number.
 * Scales between the two blend lightness.
 */
export const EMPHASIS_SOLID_MIN = 9;

/**
 * Fill-vs-backdrop contrast for `emphasis(9)` … `emphasis(11)`.
 *
 * APCA is mode-aware. A light page needs only ~Lc 62 before white text can
 * hit body contrast (Lc 75); a dark page needs ~Lc 75 before black text can.
 * The same number cannot do both: Lc 60–72 sits in APCA's mid-tone dead zone
 * on a dark page (label tops out near Lc 65). WCAG 4.5:1 has no such gap, so
 * both modes share the solid rungs (3 / 4.5 / 7).
 *
 * Stops are scales 9, 10, 11. Halves are the button ramp: light Lc 62 / 68 / 74
 * and dark Lc 75 / 81 / 87 at scales 9 / 9.5 / 10. Decimals interpolate
 * (APCA linear, WCAG geometric). Past 11 the last segment continues.
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

/** Minimum contrast for any non-disabled text. Scale {@link TEXT_MIN_SCALE}. */
export const MIN_TEXT_RULE = {
  apca: { name: "APCA minimum text", unit: "Lc" as const, value: TEXT_LADDER.apca[0] },
  wcag2: {
    name: "WCAG 2 minimum text",
    unit: "ratio" as const,
    value: TEXT_LADDER.wcag2[0],
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

/**
 * Tint-step count for a scale in the lightness region.
 * `emphasis(2)` is 2, `emphasis(2.5)` is 3, `emphasis(3)` is 4.
 * Below scale 1 the count is negative; the caller clamps that to the page.
 */
export function emphasisTintSteps(scale: number): number {
  const origin = EMPHASIS_TINT_MAX - EMPHASIS_TINT_PER_SCALE;
  return EMPHASIS_TINT_PER_SCALE * (scale - origin);
}

/** 0 at {@link EMPHASIS_TINT_MAX}, 1 at {@link EMPHASIS_SOLID_MIN}. */
export function emphasisBlend(scale: number): number {
  const span = EMPHASIS_SOLID_MIN - EMPHASIS_TINT_MAX;
  if (span <= 0) return 0;
  return (scale - EMPHASIS_TINT_MAX) / span;
}

export function isEmphasisFloor(scale: number): boolean {
  return Math.abs(scale - EMPHASIS_FLOOR_SCALE) < 1e-6;
}

/** Contrast target for a solid emphasis scale ({@link EMPHASIS_SOLID_MIN} and up). */
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
