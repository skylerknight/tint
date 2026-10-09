import type { RGB } from "../color/types.js";

const NOT_IMPLEMENTED = "not implemented";

export const APCA_THRESHOLDS = {
  minimum: 8,
  decorative: 15,
  largeText: 30,
  bodyTextMin: 45,
  bodyTextRecommended: 60,
  smallText: 75,
  maximum: 90,
} as const;

export function sRGBtoY(rgb: RGB): number {
  void rgb;
  throw new Error(NOT_IMPLEMENTED);
}
export function calcAPCA(text: RGB, background: RGB): number {
  void text;
  void background;
  throw new Error(NOT_IMPLEMENTED);
}
export function calcAPCAabs(text: RGB, background: RGB): number {
  void text;
  void background;
  throw new Error(NOT_IMPLEMENTED);
}
export function calcAPCAraw(fg: RGB, bg: RGB): number {
  void fg;
  void bg;
  throw new Error(NOT_IMPLEMENTED);
}
export function meetsContrast(text: RGB, background: RGB, min: number): boolean {
  void text;
  void background;
  void min;
  throw new Error(NOT_IMPLEMENTED);
}
