import type { RGB, OKLCH } from "../color/types.js";
import type { Polarity, SolveOptions, SolveResult } from "./types.js";

const NOT_IMPLEMENTED = "not implemented";

export function solveContrast(
  seed: OKLCH,
  background: RGB,
  targetLc: number,
  options: SolveOptions,
): SolveResult {
  void seed;
  void background;
  void targetLc;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
export function maxContrast(
  seed: OKLCH,
  background: RGB,
  polarity: Polarity,
): SolveResult {
  void seed;
  void background;
  void polarity;
  throw new Error(NOT_IMPLEMENTED);
}
export function preferredPolarity(background: RGB): Polarity {
  void background;
  throw new Error(NOT_IMPLEMENTED);
}
