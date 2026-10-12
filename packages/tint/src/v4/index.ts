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
