import type { RGB, OKLCH } from "./types.js";

const NOT_IMPLEMENTED = "not implemented";

export function toGamut(color: OKLCH, epsilon = 1e-4): OKLCH {
  void color;
  void epsilon;
  throw new Error(NOT_IMPLEMENTED);
}
export function oklchToRGBGamut(color: OKLCH): RGB {
  void color;
  throw new Error(NOT_IMPLEMENTED);
}
export function maxChromaForLH(l: number, h: number, epsilon = 1e-3): number {
  void l;
  void h;
  void epsilon;
  throw new Error(NOT_IMPLEMENTED);
}
export function clampRGB(rgb: RGB): RGB {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
