/**
 * Public v4 config types (docs/v4-spec.md §2–§4).
 *
 * Kind functions return this data as JSON. Level names and state words are
 * stored as written and resolved at build time (§2.4).
 */

/**
 * Light or dark theme baseline (§2.3).
 * The array is the source for the v4 JSON Schema enum.
 */
export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

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
 * Only pairs are modeled (`selected-hover`). The grammar in §4 is narrower
 * than this type: `disabled-hover` still type-checks, and `parseState`
 * rejects it. Three-part strings are not in this type; the parser rejects
 * them at runtime anyway, because JSON configs are not type-checked.
 */
export type CompoundState = `${AtomicState}-${AtomicState}`;

/** A rest-token modifier. States are never levels (§4). */
export type State = AtomicState | CompoundState;

/** One-token shift of the contrast ordinal (§2.4, §5). */
export type ContrastNudge = "+1" | "-1" | "+2" | "-2";

/**
 * Force the solved side relative to the backdrop (§2.4). Replaces v3 `$invert`.
 * The array is the source for the v4 JSON Schema enum.
 */
export const DIRECTIONS = ["lighter", "darker"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * Absolute hue, or a degree shift written `+12` / `-12` (§2.4).
 * The template forms are the spec's `` `+${number}` | `-${number}` ``.
 */
export type Hue = number | `+${number}` | `-${number}`;

/**
 * Options shared by every kind on the numeric-scale prototype.
 *
 * Level names, `state`, `contrast`, `step`, and `direction` are gone.
 * A state is another token with another number.
 *
 * `nudge: false` disables auto-nudge. The field sits on the shared options.
 */
export interface TokenOptions {
  /** Single backdrop: `"group"` or `"group.token"`. */
  on?: string;
  /** Multiplier on the palette color's chroma, 0..2 (default 1; surfaces capped). */
  chroma?: number;
  /** Absolute hue, or a `+` / `-` shift in degrees. */
  hue?: Hue;
  /** Raw APCA target. Expert escape hatch; only with algorithm `apca`. */
  lc?: number;
  /** Raw WCAG ratio. Expert escape hatch; only with algorithm `wcag2`. */
  ratio?: number;
  /** `false` disables auto-nudge for this token. */
  nudge?: boolean;
}

/**
 * A token: its kind, a numeric scale, and {@link TokenOptions}.
 *
 * The scale's unit depends on the kind. See `ladders.ts`.
 */
export interface Token extends TokenOptions {
  kind: Kind;
  /** `surface(0)`, `text(3)`, `emphasis(2.5)`. Decimals are allowed. */
  scale: number;
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
   * `true` means `prefers-color-scheme` matching the resolved mode.
   * A string is a custom media query (§2.3).
   */
  media?: boolean | string;
  contrast?: ThemeContrastOptions;
  /** Per-theme palette deltas. Strings replace `color` (§2.3). */
  palette?: Record<string, string | Partial<PaletteColor>>;
  /**
   * Page lightness, 0..100. Replaces `mode` as the page lever.
   * Polarity is inferred: 50 and above is light, below 50 is dark.
   * `mode` remains shorthand for the current page values (light 96, dark 15).
   */
  lightness?: number;
}

/**
 * Theme options.
 *
 * Set `lightness`, or `mode` as shorthand, or `extends` to inherit either.
 */
export interface ThemeOptions extends ThemeFields {
  mode?: Mode;
  extends?: string;
}

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
 * Size of one step in OKLCH lightness, per mode (§4).
 * Surface defaults are 0.02 (light) and 0.03 (dark).
 * Emphasis tint defaults are 0.025 (light) and 0.0375 (dark).
 */
export interface SurfaceStep {
  light?: number;
  dark?: number;
}

/**
 * Surface state overrides (§4).
 *
 * `hover: 1` is a step *count*. `step` is the OKLCH size of one surface step.
 */
export interface SurfaceStateSteps extends StateStepCounts {
  step?: SurfaceStep;
}

/**
 * Emphasis state overrides (§4).
 *
 * Counts apply to every emphasis level. `step` is the OKLCH size of one tint
 * step: emphasis 1–2, state steps on those tints, and a non-surface `step`
 * override. Text and border entries stay counts.
 */
export interface EmphasisStateSteps extends StateStepCounts {
  step?: SurfaceStep;
}

/** Per-kind state step overrides (§2, §4). */
export interface StateSteps {
  surface?: SurfaceStateSteps;
  text?: StateStepCounts;
  border?: StateStepCounts;
  emphasis?: EmphasisStateSteps;
}

/**
 * Built-in vocabulary (§2, §9).
 * The array is the source for the v4 JSON Schema enum.
 */
export const PRESETS = ["shadcn", "material", "primer", "radix", "polaris"] as const;
export type Preset = (typeof PRESETS)[number];

/**
 * Artifacts `tint build` writes (§2, §7).
 * The array is the source for the v4 JSON Schema enum.
 */
export const OUTPUT_FORMATS = ["css", "tailwind", "dtcg", "flat"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Emitted color notation. Internal math is always OKLCH (§7).
 * The array is the source for the v4 JSON Schema enum.
 */
export const COLOR_FORMATS = ["oklch", "hex", "rgb"] as const;
export type ColorFormat = (typeof COLOR_FORMATS)[number];

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
  /**
   * Prepended to every CSS custom property (§7).
   * `"tint"` emits `--tint-brand-action-hover` and alias `--tint-action-hover`.
   * Omit it for no prefix. `tint-<palette>` utility names are unchanged.
   */
  prefix?: string;
}

/**
 * A v4 tint config (§2).
 *
 * `palette` and `tokens` are required. At least one palette color is a
 * validator rule. Group and token names (`/^[a-zA-Z][a-zA-Z0-9_-]*$/`) are
 * too.
 */
/**
 * Top-level palette overrides. A key is one palette name, or several joined
 * by commas (`"warning,info"`). Each value is a partial token tree: a token
 * with `kind` replaces that token, options merge. Applied after `tune`.
 */
export type Overrides = Record<
  string,
  Record<string, Record<string, Token | Partial<TokenOptions>>>
>;

export interface Config {
  contrast?: ContrastOptions;
  /** At least one entry. The first is the default palette unless `default` is set. */
  palette: Record<string, string | PaletteColor>;
  /** Default when omitted: `{ light: { mode: "light" } }`. */
  themes?: Record<string, ThemeOptions>;
  preset?: Preset;
  /** Groups contain only tokens. There are no group-level settings (§2.4). */
  tokens: Record<string, Record<string, Token>>;
  /** Explicit per-palette replacements. Prefer this over palette `tune`. */
  overrides?: Overrides;
  output?: OutputOptions;
}
