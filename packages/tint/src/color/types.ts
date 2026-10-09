/** sRGB color, channels 0..255 (integers after rounding). */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Linear-light sRGB, channels 0..1. */
export interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

/** OKLab: l 0..1, a/b roughly -0.4..0.4. */
export interface OKLAB {
  l: number;
  a: number;
  b: number;
}

/** OKLCH: l 0..1, c >= 0, h 0..360 (degrees). */
export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

/** HSL: h 0..360, s and l 0..100. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}
