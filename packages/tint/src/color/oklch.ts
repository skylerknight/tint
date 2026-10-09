import type { OKLCH } from "./types.js";

const NOT_IMPLEMENTED = "not implemented";

export function oklch(l: number, c: number, h: number): OKLCH {
  void l;
  void c;
  void h;
  throw new Error(NOT_IMPLEMENTED);
}
export function setLightness(color: OKLCH, l: number): OKLCH {
  void color;
  void l;
  throw new Error(NOT_IMPLEMENTED);
}
export function setChroma(color: OKLCH, c: number): OKLCH {
  void color;
  void c;
  throw new Error(NOT_IMPLEMENTED);
}
export function scaleChroma(color: OKLCH, factor: number): OKLCH {
  void color;
  void factor;
  throw new Error(NOT_IMPLEMENTED);
}
export function setHue(color: OKLCH, h: number): OKLCH {
  void color;
  void h;
  throw new Error(NOT_IMPLEMENTED);
}
export function mixOKLCH(a: OKLCH, b: OKLCH, t: number): OKLCH {
  void a;
  void b;
  void t;
  throw new Error(NOT_IMPLEMENTED);
}
export function isAchromatic(color: OKLCH, threshold = 1e-4): boolean {
  void color;
  void threshold;
  throw new Error(NOT_IMPLEMENTED);
}
export function formatOKLCH(color: OKLCH, precision?: number): string {
  void color;
  void precision;
  throw new Error(NOT_IMPLEMENTED);
}
