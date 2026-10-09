import type { RGB } from "../color/types.js";

/**
 * APCA-W3 0.1.9 (Accessible Perceptual Contrast Algorithm).
 *
 * Reference: https://github.com/Myndex/SAPC-APCA
 *
 * Sign convention (official): positive Lc = dark text on light background
 * (BoW), negative Lc = light text on dark background (WoB).
 */

// Transfer curve exponent (simple power curve, NOT the piecewise sRGB EOTF).
const mainTRC = 2.4;

// sRGB luminance coefficients.
const sRco = 0.2126729;
const sGco = 0.7151522;
const sBco = 0.072175;

// Polarity exponents.
const normBG = 0.56;
const normTXT = 0.57;
const revTXT = 0.62;
const revBG = 0.65;

// Black soft clamp.
const blkThrs = 0.022;
const blkClmp = 1.414;

// Output scaling and low-contrast handling.
const scaleBoW = 1.14;
const scaleWoB = 1.14;
const loBoWoffset = 0.027;
const loWoBoffset = 0.027;
const deltaYmin = 0.0005;
const loClip = 0.1;

/** APCA Lc guideline thresholds. */
export const APCA_THRESHOLDS = {
  minimum: 8,
  decorative: 15,
  largeText: 30,
  bodyTextMin: 45,
  bodyTextRecommended: 60,
  smallText: 75,
  maximum: 90,
} as const;

/** APCA luminance Y of an sRGB color (simple 2.4 power curve). */
export function sRGBtoY(rgb: RGB): number {
  return (
    sRco * Math.pow(rgb.r / 255, mainTRC) +
    sGco * Math.pow(rgb.g / 255, mainTRC) +
    sBco * Math.pow(rgb.b / 255, mainTRC)
  );
}

/** Soft clamp near black to model flare. */
function softClamp(y: number): number {
  return y < blkThrs ? y + Math.pow(blkThrs - y, blkClmp) : y;
}

/**
 * Shared APCA core. Returns the signed, offset-adjusted contrast in Lc units
 * before the low-contrast clip, or `null` for out-of-range or near-identical
 * luminances (which both map to Lc 0).
 */
function sapc(text: RGB, background: RGB): number | null {
  let txtY = sRGBtoY(text);
  let bgY = sRGBtoY(background);

  // Official input-range guard: out-of-range luminance → Lc 0.
  if (!(txtY >= 0 && txtY <= 1.1 && bgY >= 0 && bgY <= 1.1)) return null;

  txtY = softClamp(txtY);
  bgY = softClamp(bgY);

  if (Math.abs(bgY - txtY) < deltaYmin) return null;

  return bgY > txtY
    ? (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scaleBoW
    : (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scaleWoB;
}

/**
 * Signed APCA Lc contrast of `text` on `background`.
 * Positive = dark on light (BoW), negative = light on dark (WoB).
 */
export function calcAPCA(text: RGB, background: RGB): number {
  const s = sapc(text, background);
  if (s === null) return 0;
  if (s > 0) return s < loClip ? 0 : (s - loBoWoffset) * 100;
  return s > -loClip ? 0 : (s + loWoBoffset) * 100;
}

/** Absolute APCA Lc contrast. */
export function calcAPCAabs(text: RGB, background: RGB): number {
  return Math.abs(calcAPCA(text, background));
}

/**
 * |Lc| without the `loClip` cutoff, clamped at 0. Monotonic as the foreground
 * moves away from the background, which makes it suitable for searching at
 * very low targets (surface tokens).
 */
export function calcAPCAraw(fg: RGB, bg: RGB): number {
  const s = sapc(fg, bg);
  if (s === null) return 0;
  // Clamp (not abs) so values inside the offset band do not fold upward.
  return s > 0
    ? Math.max(0, (s - loBoWoffset) * 100)
    : Math.max(0, -(s + loWoBoffset) * 100);
}

/** Whether `|Lc| >= min`. */
export function meetsContrast(text: RGB, background: RGB, min: number): boolean {
  return calcAPCAabs(text, background) >= min;
}
