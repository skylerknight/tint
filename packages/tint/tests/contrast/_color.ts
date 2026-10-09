/**
 * Minimal, test-only sRGB <-> OKLCH conversion and chroma-reduction gamut
 * mapping (standard Björn Ottosson matrices). Used to keep the solver tests
 * hermetic and independent of `src/color`.
 */
import type { RGB, OKLCH } from "../../src/color/types.js";

function toLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

function oklchToLinear(lch: OKLCH): { r: number; g: number; b: number } {
  const hr = (lch.h * Math.PI) / 180;
  const a = lch.c * Math.cos(hr);
  const b = lch.c * Math.sin(hr);
  const l_ = lch.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lch.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lch.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function rgbToOKLCH(rgb: RGB): OKLCH {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  if (c < 1e-4) return { l: L, c: 0, h: 0 };
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function inGamut(lch: OKLCH, eps = 1e-4): boolean {
  const { r, g, b } = oklchToLinear(lch);
  const lo = -eps;
  const hi = 1 + eps;
  return r >= lo && r <= hi && g >= lo && g <= hi && b >= lo && b <= hi;
}

export function toGamut(color: OKLCH, epsilon = 1e-4): OKLCH {
  if (color.l <= 0) return { l: 0, c: 0, h: color.h };
  if (color.l >= 1) return { l: 1, c: 0, h: color.h };
  if (inGamut(color, epsilon)) return color;
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 40 && hi - lo > epsilon; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l: color.l, c: mid, h: color.h }, epsilon)) lo = mid;
    else hi = mid;
  }
  return { l: color.l, c: lo, h: color.h };
}

export function oklchToRGBGamut(color: OKLCH): RGB {
  const { r, g, b } = oklchToLinear(toGamut(color));
  return { r: fromLinear(r), g: fromLinear(g), b: fromLinear(b) };
}

export function setLightness(color: OKLCH, l: number): OKLCH {
  return { l: Math.min(1, Math.max(0, l)), c: color.c, h: color.h };
}
