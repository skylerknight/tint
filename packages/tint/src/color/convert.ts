import type { RGB, LinearRGB, OKLAB, OKLCH, HSL } from "./types.js";

/** Chroma below which a color is treated as achromatic (hue forced to 0). */
const ACHROMATIC_CHROMA = 1e-4;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** sRGB transfer function (gamma-encoded 0..1 → linear 0..1). */
function channelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse sRGB transfer function (linear 0..1 → gamma-encoded 0..1). */
function channelToSRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Convert 8-bit sRGB to linear-light sRGB (0..1). */
export function srgbToLinear(rgb: RGB): LinearRGB {
  return {
    r: channelToLinear(rgb.r / 255),
    g: channelToLinear(rgb.g / 255),
    b: channelToLinear(rgb.b / 255),
  };
}

/** Convert linear-light sRGB to 8-bit sRGB, clamping to 0..1 and rounding. */
export function linearToSRGB(linear: LinearRGB): RGB {
  const encode = (c: number): number => Math.round(channelToSRGB(clamp01(c)) * 255);
  return { r: encode(linear.r), g: encode(linear.g), b: encode(linear.b) };
}

/** Linear sRGB → OKLab (Björn Ottosson's matrices). */
export function linearRGBToOKLAB(rgb: LinearRGB): OKLAB {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab → linear sRGB (may be out of 0..1). */
export function oklabToLinearRGB(lab: OKLAB): LinearRGB {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** OKLab → OKLCH. Achromatic colors (c < 1e-4) get hue 0. */
export function oklabToOKLCH(lab: OKLAB): OKLCH {
  const c = Math.hypot(lab.a, lab.b);
  if (c < ACHROMATIC_CHROMA) return { l: lab.l, c, h: 0 };
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return { l: lab.l, c, h };
}

/** OKLCH → OKLab. */
export function oklchToOKLAB(lch: OKLCH): OKLAB {
  const rad = (lch.h * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}

/** 8-bit sRGB → OKLCH. */
export function rgbToOKLCH(rgb: RGB): OKLCH {
  return oklabToOKLCH(linearRGBToOKLAB(srgbToLinear(rgb)));
}

/** OKLCH → 8-bit sRGB. No gamut mapping: out-of-gamut channels are clamped. */
export function oklchToRGB(lch: OKLCH): RGB {
  return linearToSRGB(oklabToLinearRGB(oklchToOKLAB(lch)));
}

/** True when every linear channel lies in [-epsilon, 1 + epsilon]. */
export function isInGamut(linear: LinearRGB, epsilon = 1e-4): boolean {
  const ok = (c: number): boolean => c >= -epsilon && c <= 1 + epsilon;
  return ok(linear.r) && ok(linear.g) && ok(linear.b);
}

/** True when the OKLCH color converts to in-gamut linear sRGB. */
export function isOKLCHInGamut(lch: OKLCH, epsilon = 1e-4): boolean {
  return isInGamut(oklabToLinearRGB(oklchToOKLAB(lch)), epsilon);
}

/** 8-bit sRGB → HSL (h 0..360, s/l 0..100). Gray gets h 0. */
export function rgbToHSL(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

/** HSL (h 0..360, s/l 0..100) → 8-bit sRGB. */
export function hslToRGB(hsl: HSL): RGB {
  const h = (((hsl.h % 360) + 360) % 360) / 60;
  const s = clamp01(hsl.s / 100);
  const l = clamp01(hsl.l / 100);

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const m = l - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) [r, g] = [chroma, x];
  else if (h < 2) [r, g] = [x, chroma];
  else if (h < 3) [g, b] = [chroma, x];
  else if (h < 4) [g, b] = [x, chroma];
  else if (h < 5) [r, b] = [x, chroma];
  else [r, b] = [chroma, x];

  const to8 = (c: number): number => Math.round((c + m) * 255);
  return { r: to8(r), g: to8(g), b: to8(b) };
}
