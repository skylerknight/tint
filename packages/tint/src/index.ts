// Config
export {
  defineConfig,
  validateConfig,
  assertConfig,
  ConfigError,
  resolveConfig,
  parseOn,
  PURE,
} from "./config/index.js";
export { LC_SHORTCUTS, TOKEN_ROLES, OUTPUT_FORMATS } from "./config/index.js";
export type {
  Mode,
  TokenRole,
  LcShortcut,
  LcVariant,
  LsVariant,
  Variant,
  TokenGroup,
  Tokens,
  ColorValue,
  Colors,
  OverrideValue,
  Overrides,
  OutputFormat,
  OutputConfig,
  Config,
  Issue,
  ValidationResult,
  ResolvedConfig,
  ResolvedGroup,
  ResolvedVariant,
  ResolvedOverride,
} from "./config/index.js";

// Engine
export { generate, ROLE_MIN_LC, APCA_MINIMUM_LC } from "./engine/index.js";
export { maxChromaForLs, MODE_BASELINE } from "./engine/generate.js";
export type {
  GeneratedColor,
  GeneratedVariantBase,
  GeneratedLcVariant,
  GeneratedLsVariant,
  GeneratedVariant,
  GeneratedPalette,
  GenerationResult,
  Diagnostic,
  DiagnosticCode,
} from "./engine/index.js";

// Output
export {
  toCSS,
  toJSON,
  toDTCG,
  toFlatMap,
  toTailwind,
  toCSSWithTailwind,
  toCSSWithTailwindAndTint,
  toTailwindIntelliSense,
  assertConsistentStructure,
  detectTailwindConflicts,
  TAILWIND_UTILITY_PREFIXES,
  tokenVarName,
} from "./output/index.js";
export type {
  CSSOptions,
  JSONOptions,
  TailwindOptions,
  TintUtilitiesOptions,
} from "./output/index.js";

// Audit
export { audit, formatAuditTable } from "./audit/index.js";
export type { AuditRow, AuditReport } from "./audit/index.js";

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
export {
  loadConfig,
  findDefaultConfig,
  DEFAULT_CONFIG_FILES,
  tintCacheDir,
} from "./loader/index.js";
export type { LoadOptions, LoadedConfig } from "./loader/index.js";
