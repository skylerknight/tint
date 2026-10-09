import type { RGB, OKLCH } from "./types.js";
import { isOKLCHInGamut, oklchToRGB } from "./convert.js";

/** Upper bound on sRGB-representable OKLCH chroma (true max is ~0.32). */
const MAX_CHROMA = 0.4;

/**
 * Bisect chroma in [0, high] for the largest value whose color is in gamut.
 * Assumes chroma 0 is in gamut (true for 0 < l < 1).
 */
function bisectChroma(l: number, h: number, high: number, epsilon: number): number {
  let low = 0;
  while (high - low > epsilon) {
    const mid = (low + high) / 2;
    if (isOKLCHInGamut({ l, c: mid, h })) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Map an OKLCH color into the sRGB gamut by reducing chroma only.
 * Lightness and hue are preserved exactly; `l <= 0` and `l >= 1` collapse
 * to black and white respectively.
 */
export function toGamut(color: OKLCH, epsilon = 1e-4): OKLCH {
  if (color.l <= 0) return { l: 0, c: 0, h: color.h };
  if (color.l >= 1) return { l: 1, c: 0, h: color.h };
  if (color.c <= 0) return { l: color.l, c: 0, h: color.h };
  if (isOKLCHInGamut(color)) return color;
  const c = bisectChroma(color.l, color.h, color.c, epsilon);
  return { l: color.l, c, h: color.h };
}

/** OKLCH → 8-bit sRGB, gamut-mapping first so the result is faithful. */
export function oklchToRGBGamut(color: OKLCH): RGB {
  return oklchToRGB(toGamut(color));
}

/** Largest sRGB-representable chroma for the given lightness and hue. */
export function maxChromaForLH(l: number, h: number, epsilon = 1e-3): number {
  if (l <= 0 || l >= 1) return 0;
  if (isOKLCHInGamut({ l, c: MAX_CHROMA, h })) return MAX_CHROMA;
  return bisectChroma(l, h, MAX_CHROMA, epsilon);
}

/** Clamp each channel to 0..255 and round to an integer. */
export function clampRGB(rgb: RGB): RGB {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return { r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) };
}
