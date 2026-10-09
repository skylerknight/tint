export type Mode = "light" | "dark";

export type TokenRole = "surface" | "text" | "border" | "action" | "status" | "icon";

export type LcShortcut =
  "heading" | "body" | "muted" | "placeholder" | "disabled" | "pure";

/** Numeric values for the named Lc shortcuts (`pure` is a sentinel, not listed). */
export const LC_SHORTCUTS: Record<Exclude<LcShortcut, "pure">, number> = {
  heading: 90,
  body: 80,
  muted: 60,
  placeholder: 45,
  disabled: 40,
};

export const TOKEN_ROLES: readonly TokenRole[] = [
  "surface",
  "text",
  "border",
  "action",
  "status",
  "icon",
];

/** A variant that targets an APCA contrast (Lc) against its reference. */
export interface LcVariant {
  /** APCA Lc 0..108, a shortcut name, or `pure` for pure white/black. */
  lc: number | LcShortcut;
  /** Mark this variant as the group's contrast anchor. */
  $reference?: boolean;
  /** Override the group's `$on` for this variant (`"group"` or `"group.variant"`). */
  $on?: string;
  /** Skip contrast diagnostics for this variant. */
  $decorative?: boolean;
  /** Flip the automatically chosen contrast direction. */
  $invert?: boolean;
  /** Multiplier applied to the seed's chroma (0..2, default 1). */
  $chroma?: number;
}

/** A variant that steps lightness away from its reference. */
export interface LsVariant {
  /** Lightness steps (>= 0) from the reference, or `pure` for pure white/black. */
  ls: number | "pure";
  $reference?: boolean;
  $on?: string;
  $decorative?: boolean;
  /** Step size in OKLCH lightness (0.001..0.1). */
  $scale?: number;
  $chroma?: number;
}

export type Variant = LcVariant | LsVariant;

export interface TokenGroup {
  /** What this group contrasts against: `"group"` or `"group.variant"`. */
  $on?: string;
  /** Semantic role used for contrast lint diagnostics. */
  $role?: TokenRole;
  $decorative?: boolean;
  $invert?: boolean;
  $scale?: number;
  $chroma?: number;
  [variant: string]: Variant | string | number | boolean | undefined;
}

export type Tokens = Record<string, TokenGroup>;

export type ColorValue = string | { value: string };

export type Colors = Record<string, ColorValue>;

export interface OverrideValue {
  lc?: number | LcShortcut;
  ls?: number | "pure";
  $scale?: number;
  $decorative?: boolean;
  $invert?: boolean;
  $chroma?: number;
}

/** color (or "a,b" list) -> group -> variant -> override */
export type Overrides = Record<string, Record<string, Record<string, OverrideValue>>>;

export type OutputFormat = "css" | "json" | "tailwind" | "flat";

export const OUTPUT_FORMATS: readonly OutputFormat[] = [
  "css",
  "json",
  "tailwind",
  "flat",
];

export interface OutputConfig {
  /** Output directory for `tint build` (default `./tint`). */
  path?: string;
  /** Formats for `tint build` (default `["css"]`). */
  formats?: OutputFormat[];
}

export interface Config {
  /** Theme name, used as the output folder and in diagnostics. */
  name: string;
  mode: Mode;
  /** CSS selector that scopes this theme (default `:root`). */
  selector?: string;
  prefersColorScheme?: "light" | "dark";
  prefersContrast?: "more" | "less" | "custom";
  /** Default step size for `ls` variants (default 0.02). */
  scale?: number;
  /** Distance of the foundation surface from pure white/black (default 0.015 light, 0.15 dark). */
  offset?: number;
  colors: Colors;
  tokens: Tokens;
  overrides?: Overrides;
  output?: OutputConfig;
}
