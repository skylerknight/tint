import type { RGB, LinearRGB, OKLAB, OKLCH, HSL } from "./types.js";

const NOT_IMPLEMENTED = "not implemented";

export function srgbToLinear(rgb: RGB): LinearRGB {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
export function linearToSRGB(linear: LinearRGB): RGB {
  void linear;
  throw new Error(NOT_IMPLEMENTED);
}
export function linearRGBToOKLAB(rgb: LinearRGB): OKLAB {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
export function oklabToLinearRGB(lab: OKLAB): LinearRGB {
  void lab;
  throw new Error(NOT_IMPLEMENTED);
}
export function oklabToOKLCH(lab: OKLAB): OKLCH {
  void lab;
  throw new Error(NOT_IMPLEMENTED);
}
export function oklchToOKLAB(lch: OKLCH): OKLAB {
  void lch;
  throw new Error(NOT_IMPLEMENTED);
}
export function rgbToOKLCH(rgb: RGB): OKLCH {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
export function oklchToRGB(lch: OKLCH): RGB {
  void lch;
  throw new Error(NOT_IMPLEMENTED);
}
export function isInGamut(linear: LinearRGB, epsilon = 1e-4): boolean {
  void linear;
  void epsilon;
  throw new Error(NOT_IMPLEMENTED);
}
export function isOKLCHInGamut(lch: OKLCH, epsilon = 1e-4): boolean {
  void lch;
  void epsilon;
  throw new Error(NOT_IMPLEMENTED);
}
export function rgbToHSL(rgb: RGB): HSL {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
export function hslToRGB(hsl: HSL): RGB {
  void hsl;
  throw new Error(NOT_IMPLEMENTED);
}
