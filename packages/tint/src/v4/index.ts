/**
 * Internal home for the tint v4 API (docs/v4-spec.md).
 *
 * Not re-exported from `src/index.ts` and not a tsup entry, so the v3
 * public surface and build output stay unchanged until the cut-over.
 */

export const V4_SCAFFOLD = "v4" as const;

export type {
  Mode,
  Kind,
  Level,
  LevelOrdinal,
  AtomicState,
  CompoundState,
  State,
  ContrastNudge,
  Direction,
  Hue,
  TokenOptions,
  Token,
  PaletteColor,
  ContrastAlgorithm,
  ContrastLevel,
  ContrastOptions,
  ThemeContrastOptions,
  ThemeOptions,
  KindLevelNames,
  LevelNames,
  StateStepCounts,
  SurfaceStep,
  SurfaceStateSteps,
  StateSteps,
  Preset,
  OutputFormat,
  ColorFormat,
  OutputOptions,
  Config,
} from "./types.js";

export { surface, text, border, emphasis } from "./kinds.js";
export { defineConfig } from "./define.js";
export {
  KINDS,
  DEFAULT_ORDINAL,
  DEFAULT_LEVEL_NAMES,
  normalizeIssue,
  joinPath,
  isPlainObject,
  isKind,
  isOrdinal,
  suggestName,
  compileLevelTable,
  compileLevels,
  resolveLevel,
} from "./levels.js";
export type {
  NormalizeIssue,
  LevelTable,
  LevelTableResult,
  LevelTables,
  CompileLevelsResult,
  ResolveLevelResult,
  StateSuggestions,
} from "./levels.js";
export {
  ATOMIC_STATES,
  PERSISTENT_STATES,
  TEMPORARY_STATES,
  DISABLED_STATE,
  STATE_ALIASES,
  STATE_APPLIES_TO,
  CANONICAL_STATES,
  canonicalStatesFor,
  parseState,
} from "./states.js";
export type { CanonicalState, ParseStateResult } from "./states.js";
export { normalizeToken } from "./normalize.js";
export type { NormalizedToken, NormalizeResult, NormalizeOptions } from "./normalize.js";
export { validateConfig, assertConfig } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export { ConfigError, formatConfigIssues } from "./errors.js";
export type { ConfigIssue, ConfigFix } from "./errors.js";
