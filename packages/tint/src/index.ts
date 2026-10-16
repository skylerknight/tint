/**
 * Public entry while v5 is in progress.
 *
 * The v4 config, solver, and output API lives in `legacy/v4` and is not part
 * of this build. Color, contrast, and the CSS/Tailwind emitters remain.
 * {@link generate} is a placeholder until the v5 solver lands.
 */

export { generate } from "./engine/index.js";
export type { EngineResult } from "./engine/index.js";

export {
  parseColor,
  tryParseColor,
  rgbToHex,
  rgbToOKLCH,
  oklchToRGB,
  oklchToRGBGamut,
  toGamut,
  formatOKLCH,
  isOKLCHInGamut,
} from "./color/index.js";
export type { RGB, LinearRGB, OKLAB, OKLCH, HSL } from "./color/index.js";

export {
  calcAPCA,
  calcAPCAabs,
  calcAPCAraw,
  meetsContrast,
  APCA_THRESHOLDS,
  solveContrast,
  maxContrast,
  preferredPolarity,
} from "./contrast/index.js";
export type { Polarity, SolveOptions, SolveResult } from "./contrast/index.js";

export {
  TAILWIND_UTILITY_PREFIXES,
  assertConsistentStructure,
  detectTailwindConflicts,
  toCSS,
  toCSSWithTailwind,
  toCSSWithTailwindAndTint,
  toDTCG,
  toFlatMap,
  toJSON,
  toTailwind,
  toTailwindIntelliSense,
} from "./output/index.js";
export type {
  CSSOptions,
  JSONOptions,
  TailwindOptions,
  TintUtilitiesOptions,
} from "./output/index.js";
