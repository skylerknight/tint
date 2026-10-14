/**
 * Unified scale (proto/unified).
 *
 * `emphasis`, `text`, and `border` are pure functions of a 0–10 contrast
 * scale. Higher n is more contrast against the token's backdrop. Decimals
 * interpolate: APCA in a straight line, WCAG by ratio. Nothing inside those
 * kinds switches to a tint or the other polarity. The solver stays on the
 * backdrop's preferred side, so the lightness move never reverses as n grows.
 *
 * `surface` is not on that curve. It is signed lightness steps from the page
 * (−10..10). See {@link SURFACE_STEP} in `lower.ts`. `surface(0)` is the page.
 *
 * `text(0)` is the lowest compliant text (APCA Lc 45, WCAG 3:1).
 * `text(5)` is body text (APCA Lc 75, WCAG 4.5:1). `text(10)` is the top of
 * the curve. A request at exactly 10 is clamped to the contrast the backdrop
 * can actually reach, so that step does not warn for being past the gamut.
 */

import type { ContrastAlgorithm, Kind, Mode } from "./types.js";

/** Inclusive range for `emphasis`, `text`, and `border`. */
export const SCALE_MIN = 0;
export const SCALE_MAX = 10;

/**
 * Inclusive range for `surface`.
 * Negative is sunken, 0 is the page, positive is raised.
 */
export const SURFACE_SCALE_MIN = -10;
export const SURFACE_SCALE_MAX = 10;

/**
 * `text(5)` / the body-text stop.
 * Scales below this are muted or faint. They are compliant text, not a lint.
 */
export const TEXT_BODY_SCALE = 5;

/** APCA: text(n) = 45 + 6n. text(0) = Lc 45, text(5) = Lc 75, text(10) = Lc 105. */
export const TEXT_APCA_AT_0 = 45;
export const TEXT_APCA_UNIT = 6;

/**
 * WCAG: text(n) = 4.5 × (4.5/3)^((n−5)/5), which is 3:1 at n = 0.
 * text(0) = 3:1 (the minimum for text), text(5) = 4.5:1, text(10) = 6.75:1.
 * One unit multiplies the ratio by (4.5/3)^(1/5). Anchoring on 4.5 keeps
 * text(5) exact; raising 3 to the fifth power does not.
 */
export const TEXT_WCAG_AT_0 = 3;
export const TEXT_WCAG_BODY = 4.5;
export const TEXT_WCAG_UNIT = (TEXT_WCAG_BODY / TEXT_WCAG_AT_0) ** (1 / TEXT_BODY_SCALE);

/** APCA: border(n) = 15 + 6n. border(0) = Lc 15, border(5) = Lc 45, border(10) = Lc 75. */
export const BORDER_APCA_AT_0 = 15;
export const BORDER_APCA_UNIT = 6;

/**
 * WCAG: border(n) = 1.5 × (2^0.2)^n.
 * border(0) = 1.5:1, border(5) = 3:1, border(10) = 6:1.
 * One unit multiplies the ratio by 2^0.2.
 */
export const BORDER_WCAG_AT_0 = 1.5;
export const BORDER_WCAG_UNIT = 2 ** 0.2;

/**
 * WCAG non-text contrast for UI components (SC 1.4.11).
 * The emphasis lint uses this floor. `emphasis(0)` targets it.
 */
export const NON_TEXT_RATIO = 3;

/**
 * APCA emphasis is a straight line in Lc, mode-aware at both ends.
 * `emphasis(0)` is the Lc at which a fill on that mode's page first clears
 * the non-text lint (WCAG 3:1). Lc 45 does not: on the light page it is about
 * 2.6:1. The measured floors are Lc 53.5 in light and Lc 22 in dark.
 * `emphasis(10)` stays the previous maximum: Lc 90 in light, Lc 100 in dark.
 * One step is (max − floor) / 10: 3.65 Lc in light, 7.8 Lc in dark.
 */
export const EMPHASIS_APCA_AT_0 = { light: 53.5, dark: 22 } as const;
export const EMPHASIS_APCA_AT_10 = { light: 90, dark: 100 } as const;
export const EMPHASIS_APCA_UNIT = {
  light: (EMPHASIS_APCA_AT_10.light - EMPHASIS_APCA_AT_0.light) / SCALE_MAX,
  dark: (EMPHASIS_APCA_AT_10.dark - EMPHASIS_APCA_AT_0.dark) / SCALE_MAX,
} as const;

/**
 * WCAG emphasis is geometric in the ratio, the same in both modes.
 * `emphasis(0)` is {@link NON_TEXT_RATIO} (3:1). `emphasis(10)` is 7:1.
 * One step multiplies by (7/3)^0.1.
 */
export const EMPHASIS_WCAG_AT_0 = NON_TEXT_RATIO;
export const EMPHASIS_WCAG_AT_10 = 7;
export const EMPHASIS_WCAG_UNIT =
  (EMPHASIS_WCAG_AT_10 / EMPHASIS_WCAG_AT_0) ** (1 / SCALE_MAX);

/**
 * Every emphasis scale is a solid fill. The curve starts at the non-text floor,
 * so the whole 0–10 range is held to WCAG 3:1.
 */
export const SOLID_EMPHASIS_SCALE = 0;

/** Border scale whose WCAG target is the non-text 3:1 rung. */
export const BORDER_NON_TEXT_SCALE = 5;

/**
 * Surfaces closer than this in OKLCH lightness are treated as indistinguishable.
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
  apca: { name: "APCA body text", unit: "Lc" as const, value: 75 },
  wcag2: { name: "WCAG 2 body text", unit: "ratio" as const, value: TEXT_WCAG_BODY },
} as const;

export function textTarget(algorithm: ContrastAlgorithm, scale: number): number {
  if (algorithm === "apca") return TEXT_APCA_AT_0 + TEXT_APCA_UNIT * scale;
  return TEXT_WCAG_BODY * TEXT_WCAG_UNIT ** (scale - TEXT_BODY_SCALE);
}

export function borderTarget(algorithm: ContrastAlgorithm, scale: number): number {
  if (algorithm === "apca") return BORDER_APCA_AT_0 + BORDER_APCA_UNIT * scale;
  return BORDER_WCAG_AT_0 * BORDER_WCAG_UNIT ** scale;
}

export function emphasisTarget(
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (algorithm === "apca")
    return EMPHASIS_APCA_AT_0[mode] + EMPHASIS_APCA_UNIT[mode] * scale;
  return EMPHASIS_WCAG_AT_0 * EMPHASIS_WCAG_UNIT ** scale;
}

/**
 * Contrast target for emphasis, text, or border.
 * Surface is a lightness step, not a contrast target.
 */
export function contrastAt(
  kind: Exclude<Kind, "surface">,
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (kind === "emphasis") return emphasisTarget(algorithm, mode, scale);
  if (kind === "border") return borderTarget(algorithm, scale);
  return textTarget(algorithm, scale);
}

/** Body-text target for the active algorithm. Scale {@link TEXT_BODY_SCALE}. */
export function bodyTextTarget(algorithm: ContrastAlgorithm): number {
  return textTarget(algorithm, TEXT_BODY_SCALE);
}
