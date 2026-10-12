import type { RGB } from "../color/types.js";

/**
 * WCAG 2 relative luminance and contrast ratio.
 *
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * This is the sRGB piecewise electro-optical transfer function and the
 * 0.2126 / 0.7152 / 0.0722 coefficients. It is not APCA's simple 2.4 curve.
 */

/**
 * Fractional overshoot the WCAG solver accepts: achieved <= target × (1 + this).
 * 0.02 matches the "within 2%" search bound. Lives here, not in `src/v4`, so
 * the v3 contrast bundle does not import the v4 module.
 */
export const WCAG2_RELATIVE_TOLERANCE = 0.02;

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2 relative luminance of an sRGB color. Channels are 0..255. */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b)
  );
}

/**
 * WCAG 2 contrast ratio of `fg` against `bg`, in the range [1, 21].
 * Symmetric: `wcag2Ratio(a, b) === wcag2Ratio(b, a)`.
 */
export function wcag2Ratio(fg: RGB, bg: RGB): number {
  const lighter = relativeLuminance(fg);
  const darker = relativeLuminance(bg);
  const l1 = lighter > darker ? lighter : darker;
  const l2 = lighter > darker ? darker : lighter;
  return (l1 + 0.05) / (l2 + 0.05);
}
