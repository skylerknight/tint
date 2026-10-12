/**
 * Public v4 config types (docs/v4-spec.md §2–§4).
 *
 * Kind functions return this data as JSON. Level names and state words are
 * stored as written and resolved at build time (§2.4).
 */

/** Light or dark theme baseline (§2.3). */
export type Mode = "light" | "dark";

/** Token kind. The name is the token's role (§2.4, §3). */
export type Kind = "surface" | "text" | "border" | "emphasis";

/** Ordinal prominence, 1 (least) through 5 (most) (§3). */
export type LevelOrdinal = 1 | 2 | 3 | 4 | 5;

/**
 * A level argument: an ordinal, or a level name (§2.4).
 *
 * Spec writes `1 | 2 | 3 | 4 | 5 | string` so aliases from `levels` type-check.
 * Names are not resolved to ordinals here.
 */
export type Level = LevelOrdinal | string;

/**
 * Atomic interaction states (§4). `active` is an alias of `pressed` and is
 * kept as written, the same as any other name.
 */
export type AtomicState =
  "hover" | "pressed" | "active" | "focus" | "selected" | "checked" | "disabled";

/**
 * Compound states are `-`-joined and applied left to right (§4).
 *
 * Only pairs are modeled (`selected-hover`). The spec doesn't cap length, and
 * it leaves unknown or nonsensical combinations (`disabled-hover`) to
 * validation, so those pairs still type-check.
 */
export type CompoundState = `${AtomicState}-${AtomicState}`;

/** A rest-token modifier. States are never levels (§4). */
export type State = AtomicState | CompoundState;

/** One-token shift of the contrast ordinal (§2.4, §5). */
export type ContrastNudge = "+1" | "-1" | "+2" | "-2";

/** Force the solved side relative to the backdrop (§2.4). Replaces v3 `$invert`. */
export type Direction = "lighter" | "darker";

/**
 * Absolute hue, or a degree shift written `+12` / `-12` (§2.4).
 * The template forms are the spec's `` `+${number}` | `-${number}` ``.
 */
export type Hue = number | `+${number}` | `-${number}`;

/**
 * Options shared by every kind (§2.4). `level` is a separate argument.
 *
 * `nudge` is mentioned on emphasis tokens in §6.4 but is not a field here.
 * It stays off this type until §2 lists it.
 */
export interface TokenOptions {
  /** Interaction layered on the rest token (§4). */
  state?: State;
  /** Single backdrop: `"group"` or `"group.token"` (§2.4, §6.2). */
  on?: string;
  /** Relative level nudge for this token only (§5). */
  contrast?: ContrastNudge;
  /** Force lighter or darker against the backdrop (§2.4). */
  direction?: Direction;
  /** Multiplier on the palette color's chroma, 0..2 (default 1; surfaces capped). */
  chroma?: number;
  /** Absolute hue, or a `+` / `-` shift in degrees (§2.4). */
  hue?: Hue;
  /** Raw APCA target. Expert escape hatch; only with algorithm `apca`. */
  lc?: number;
  /** Raw WCAG ratio. Expert escape hatch; only with algorithm `wcag2`. */
  ratio?: number;
  /** Raw lightness steps (surface) or a step offset (other kinds). */
  step?: number;
}

/** A token: its kind, plus an optional level and {@link TokenOptions}. */
export interface Token extends TokenOptions {
  kind: Kind;
  /** Omitted when the call omits it. The default ordinal is applied at build time. */
  level?: Level;
}

/**
 * One palette color (§2.2). A string in `palette` is shorthand for `{ color }`.
 */
export interface PaletteColor {
  /** Any CSS color. Supplies hue and chroma; lightness is solved. */
  color: string;
  /** Make this the unprefixed palette. Otherwise the first palette color is. */
  default?: boolean;
  /**
   * `true`: snap the first emphasis rest token to `color` when it passes.
   * A `"group.token"` path snaps that token. Failure is a diagnostic (§6.5).
   */
  exact?: boolean | string;
  /**
   * Per-palette-color overrides, keyed by token path (§2.2).
   * A {@link Token} replaces the token; {@link TokenOptions} merges.
   */
  tune?: Record<string, Token | Partial<TokenOptions>>;
}

/** Which contrast table to use, and how far to shift it (§2.1, §5). */
export type ContrastAlgorithm = "apca" | "wcag2";

/** Global or per-theme shift of every contrast-targeted level (§2.1). */
export type ContrastLevel = "standard" | "more" | "max";

export interface ContrastOptions {
  /** Default `apca`. */
  algorithm?: ContrastAlgorithm;
  /** Default `standard` (shift 0). `more` / `max` shift by +1 / +2, capped at 5. */
  level?: ContrastLevel;
}

/** A theme may override the contrast level, not the algorithm (§2.3). */
export interface ThemeContrastOptions {
  level?: ContrastLevel;
}

interface ThemeFields {
  /** Default `:root`. */
  selector?: string;
  /**
   * `true` means `prefers-color-scheme` matching `mode`.
   * A string is a custom media query (§2.3).
   */
  media?: boolean | string;
  contrast?: ThemeContrastOptions;
  /** Per-theme palette deltas. Strings replace `color` (§2.3). */
  palette?: Record<string, string | Partial<PaletteColor>>;
}

/**
 * Theme options (§2.3).
 *
 * §2.3 lists `mode` as required. The §8 `light-hc` theme omits it and sets
 * `extends` instead, so `mode` is required only when the theme does not
 * inherit another one.
 */
export type ThemeOptions =
  | (ThemeFields & { mode: Mode; extends?: string })
  | (ThemeFields & { mode?: Mode; extends: string });

/**
 * Aliases for one kind (§2.5). Values are ordinals 1–5.
 * `$replace: true` drops the built-in names.
 *
 * `$replace` shares the map with the aliases, so a boolean is part of the
 * index signature. Boolean alias targets are a validator concern, not a
 * type-level one.
 */
export interface KindLevelNames {
  $replace?: boolean;
  [alias: string]: LevelOrdinal | boolean | undefined;
}

/** Rename or add level aliases per kind (§2.5). Built-in names stay unless `$replace`. */
export interface LevelNames {
  surface?: KindLevelNames;
  text?: KindLevelNames;
  border?: KindLevelNames;
  emphasis?: KindLevelNames;
}

/**
 * Per-state step counts (§4). One step's size depends on the kind.
 *
 * The spec's applies-to column is not enforced here: every atomic state is
 * allowed on every kind, and nonsensical combinations wait for validation.
 */
export interface StateStepCounts {
  hover?: number;
  pressed?: number;
  active?: number;
  focus?: number;
  selected?: number;
  checked?: number;
  disabled?: number;
}

/**
 * Size of one surface step in OKLCH lightness (§4).
 * The published defaults are 0.02 (light) and 0.03 (dark).
 */
export interface SurfaceStep {
  light?: number;
  dark?: number;
}

/**
 * Surface state overrides (§4).
 *
 * `hover: 1` on emphasis is a step *count*. `step` here is the size of one
 * surface step. The spec's only `states` example uses counts for emphasis
 * and `step` for surface, so `step` is surface-only for now.
 */
export interface SurfaceStateSteps extends StateStepCounts {
  step?: SurfaceStep;
}

/** Per-kind state step overrides (§2, §4). */
export interface StateSteps {
  surface?: SurfaceStateSteps;
  text?: StateStepCounts;
  border?: StateStepCounts;
  emphasis?: StateStepCounts;
}

/** Built-in vocabulary (§2, §9). */
export type Preset = "shadcn" | "material" | "primer" | "radix" | "polaris";

/** Artifacts `tint build` writes (§2, §7). */
export type OutputFormat = "css" | "tailwind" | "dtcg" | "flat";

/** Emitted color notation. Internal math is always OKLCH (§7). */
export type ColorFormat = "oklch" | "hex" | "rgb";

export interface OutputOptions {
  /** Output directory for `tint build`. */
  path?: string;
  /**
   * File formats. `readonly` so `defineConfig`'s const type parameter accepts
   * a literal array (§2 writes a mutable array type).
   */
  formats?: readonly OutputFormat[];
  /** Default `oklch`. */
  format?: ColorFormat;
}

/**
 * A v4 tint config (§2).
 *
 * `palette` and `tokens` are required. At least one palette color is a
 * validator rule. Group and token names (`/^[a-zA-Z][a-zA-Z0-9_-]*$/`) are
 * too.
 */
export interface Config {
  contrast?: ContrastOptions;
  /** At least one entry. The first is the default palette unless `default` is set. */
  palette: Record<string, string | PaletteColor>;
  /** Default when omitted: `{ light: { mode: "light" } }`. */
  themes?: Record<string, ThemeOptions>;
  levels?: LevelNames;
  states?: StateSteps;
  preset?: Preset;
  /** Groups contain only tokens. There are no group-level settings (§2.4). */
  tokens: Record<string, Record<string, Token>>;
  output?: OutputOptions;
}
