/**
 * Unified 0–10 scale (proto/scale-0-10).
 *
 * Each kind is one pure function of n. Higher n is more contrast against the
 * token's backdrop. Decimals interpolate: APCA in a straight line, WCAG by
 * ratio. Nothing inside a kind switches to a tint, a softness branch, or the
 * other polarity. The solver stays on the backdrop's preferred side, so the
 * lightness move never reverses as n grows.
 *
 * `text(5)` is body text (APCA Lc 75, WCAG 4.5:1). `surface(0)` matches the page.
 */

import type { ContrastAlgorithm, Kind, Mode } from "./types.js";

export const SCALE_MIN = 0;
export const SCALE_MAX = 10;

/** `text(5)` / the body-text stop. Below this, text lints. */
export const TEXT_BODY_SCALE = 5;

/** APCA: text(n) = 45 + 6n. text(0) = Lc 45, text(5) = Lc 75, text(10) = Lc 105. */
export const TEXT_APCA_AT_0 = 45;
export const TEXT_APCA_UNIT = 6;

/** WCAG: text(n) = 4.5 × 1.15^(n−5). One unit multiplies the ratio by 1.15. */
export const TEXT_WCAG_BODY = 4.5;
export const TEXT_WCAG_UNIT = 1.15;

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
 * APCA emphasis is linear and mode-aware. The dark unit is steeper so the
 * same n can hold body text in both modes (APCA's mid-tone dead zone).
 * Light: 9 Lc per unit (emphasis(10) = 90). Dark: 10 Lc per unit (emphasis(10) = 100).
 */
export const EMPHASIS_APCA_UNIT = { light: 9, dark: 10 } as const;

/**
 * WCAG emphasis: emphasis(n) = 7^(n/10).
 * emphasis(0) = 1:1, emphasis(10) = 7:1. One unit multiplies by 7^0.1.
 */
export const EMPHASIS_WCAG_AT_10 = 7;
export const EMPHASIS_WCAG_UNIT = 7 ** 0.1;

/**
 * Surface is the same shape of curve, with a smaller step, measured against
 * the page. Light +3 Lc, dark +4 Lc. WCAG runs from 1:1 at 0 to 2:1 at 10.
 */
export const SURFACE_APCA_UNIT = { light: 3, dark: 4 } as const;
export const SURFACE_WCAG_AT_10 = 2;
export const SURFACE_WCAG_UNIT = 2 ** 0.1;

/**
 * Emphasis at or above this scale is held to non-text 3:1.
 * WCAG emphasis crosses 3:1 between 6 and 7 (7^0.7 ≈ 3.9).
 */
export const SOLID_EMPHASIS_SCALE = 7;

/** Border scale whose WCAG target is the non-text 3:1 rung. */
export const BORDER_NON_TEXT_SCALE = 5;

/** WCAG non-text contrast for UI components (SC 1.4.11). */
export const NON_TEXT_RATIO = 3;

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
  if (algorithm === "apca") return Math.max(0, EMPHASIS_APCA_UNIT[mode] * scale);
  return EMPHASIS_WCAG_AT_10 ** (scale / SCALE_MAX);
}

export function surfaceTarget(
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (algorithm === "apca") return Math.max(0, SURFACE_APCA_UNIT[mode] * scale);
  return SURFACE_WCAG_AT_10 ** (scale / SCALE_MAX);
}

/** Contrast target for one kind. Surface and emphasis take the theme mode. */
export function contrastAt(
  kind: Kind,
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (kind === "surface") return surfaceTarget(algorithm, mode, scale);
  if (kind === "emphasis") return emphasisTarget(algorithm, mode, scale);
  if (kind === "border") return borderTarget(algorithm, scale);
  return textTarget(algorithm, scale);
}

/** Body-text target for the active algorithm. Scale {@link TEXT_BODY_SCALE}. */
export function bodyTextTarget(algorithm: ContrastAlgorithm): number {
  return textTarget(algorithm, TEXT_BODY_SCALE);
}
