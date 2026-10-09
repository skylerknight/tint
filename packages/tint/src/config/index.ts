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
} from "./types.js";
export { LC_SHORTCUTS, TOKEN_ROLES, OUTPUT_FORMATS } from "./types.js";
export { validateConfig, assertConfig, ConfigError } from "./validate.js";
export type { Issue, ValidationResult } from "./validate.js";
export { resolveConfig, parseOn, PURE } from "./resolve.js";
export type {
  ResolvedConfig,
  ResolvedGroup,
  ResolvedVariant,
  ResolvedOverride,
} from "./resolve.js";
export { defineConfig } from "./define.js";
