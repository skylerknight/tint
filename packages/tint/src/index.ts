/**
 * Public API (tint v4).
 *
 * v3 config, engine, and output modules stay in the package for internal
 * use. They are not re-exported from here.
 */

// Config
export { defineConfig } from "./v4/define.js";
export { surface, text, border, emphasis } from "./v4/kinds.js";
export { validateConfig, assertConfig } from "./v4/validate.js";
export { ConfigError, formatConfigIssues } from "./v4/errors.js";
export { resolveConfig } from "./v4/resolve.js";
export { OUTPUT_FORMATS, COLOR_FORMATS } from "./v4/types.js";
export type {
  Mode,
  Kind,
  Level,
  LevelOrdinal,
  State,
  TokenOptions,
  Token,
  PaletteColor,
  ContrastAlgorithm,
  ContrastLevel,
  ContrastOptions,
  ThemeOptions,
  LevelNames,
  StateSteps,
  Preset,
  OutputFormat,
  ColorFormat,
  OutputOptions,
  Config,
} from "./v4/types.js";
export type { ConfigIssue, ConfigFix } from "./v4/errors.js";
export type { ValidationResult } from "./v4/validate.js";
export type { ResolveResult, ResolvedConfig } from "./v4/resolve.js";

// Engine
export { generateV4 as generate } from "./v4/engine.js";
export type {
  GeneratedColorV4,
  SolvedTokenV4,
  PaletteResultV4,
  GenerationResultV4,
  GenerationResultV4 as GenerationResult,
} from "./v4/engine.js";

// Output
export {
  toCSS,
  toCSSWithTailwind,
  toTailwind,
  toDTCG,
  toDTCGJSON,
  toFlat,
  toFlatJSON,
  assertConsistentStructure,
  formatColor,
  mediaQueryFor,
  TAILWIND_UTILITY_PREFIXES,
} from "./v4/output/index.js";
export type {
  CSSOptions,
  TailwindOptions,
  FlatOptions,
  DTCGFile,
  DTCGColorToken,
  DTCGColorValue,
} from "./v4/output/index.js";

// Audit
export { auditV4 as audit, formatAuditTable } from "./audit/index.js";
export type {
  AuditReportV4,
  AuditRowV4,
  AuditReportV4 as AuditReport,
  AuditRowV4 as AuditRow,
} from "./audit/index.js";

// Color
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

// Contrast
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

// Loader
export { loadConfig, findDefaultConfig, DEFAULT_CONFIG_FILES } from "./loader/index.js";
export type { LoadOptions, LoadedConfig } from "./loader/index.js";
