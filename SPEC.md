# Tint v3 — Engineering Specification

This document is the single source of truth for the v3 rewrite of `@skylerknight/tint`.
Every module is implemented against the signatures and semantics here. When this spec
and the old implementation (`/Users/skylerknight/Development/tint-claude/packages/tint`)
disagree, **this spec wins**. The old code is a reference for intent, not for behavior.

## 1. What tint is

Tint turns a small config (a few seed colors + a token structure) into complete,
accessible, interchangeable color palettes.

- **APCA** (Accessible Perceptual Contrast Algorithm, Lc 0–108) decides lightness.
  A token says "I need Lc 75 against the surface" and tint finds the color.
- **OKLCH** is the working color space. Hue and chroma come from the seed color;
  lightness is solved. Results are gamut-mapped to sRGB by chroma reduction.
- **Every seed color gets the same token structure.** `brand`, `error`, `success` all
  produce `surface.*`, `text.*`, `action.*` … so a `tint-error` class can swap the
  whole palette of a component with zero per-component CSS.
- **Light and dark are the same config with a different `mode`** — contrast direction
  is derived, not authored.

## 2. Package layout

```
packages/tint/src
  color/      parse, convert (sRGB <-> linear <-> OKLab <-> OKLCH), gamut, helpers
  contrast/   apca (measure), solve (find color at Lc)
  config/     types, validate (zero-dep schema), resolve (normalize + dependency graph)
  engine/     generate (the pipeline), diagnostics
  output/     names, css, json, tailwind, intellisense
  audit/      audit(result) -> contrast report
  loader/     load a tint.config.{ts,js,mjs,cjs,json}
  cli/        tint build | init | check | inspect
  vite/       Vite plugin (@tint directive + virtual module)
  postcss/    PostCSS plugin (@tint at-rule)
  index.ts    public API
```

Zero runtime dependencies in the core and CLI. `esbuild`, `vite`, `postcss` are
optional peers used only by the loader/plugins.

Code style: TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`),
ESM with `.js` import specifiers, named exports only, no default exports except the
PostCSS plugin (PostCSS convention). Prettier formatting (printWidth 90).

## 3. Color module (`src/color`)

### Types (`types.ts`)

```ts
export interface RGB { r: number; g: number; b: number }        // 0..255 integers after rounding
export interface LinearRGB { r: number; g: number; b: number }  // 0..1
export interface OKLAB { l: number; a: number; b: number }
export interface OKLCH { l: number; c: number; h: number }      // l 0..1, c >= 0, h 0..360
export interface HSL { h: number; s: number; l: number }        // h 0..360, s/l 0..100
```

### `parse.ts`

```ts
export function parseColor(input: string): RGB
export function tryParseColor(input: string): RGB | null
export function parseHex(input: string): RGB
export function parseRGB(input: string): RGB
export function parseHSL(input: string): RGB
export function parseOKLCH(input: string): OKLCH          // may be out of gamut
export function rgbToHex(rgb: RGB): string               // "#rrggbb" lowercase
```

Accepted syntaxes (case-insensitive, surrounding whitespace ignored):

- hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (alpha parsed and ignored), with or without `#`.
- `rgb(255 0 0)`, `rgb(255, 0, 0)`, `rgba(...)`, percentages allowed, alpha via `/` or 4th arg ignored.
- `hsl(210 40% 50%)`, `hsl(210, 40%, 50%)`, `hsla(...)`, `deg`/`turn`/`rad`/`grad` hue units.
- `oklch(0.7 0.15 250)`, `oklch(70% 0.15 250deg)`, chroma as number or percent (100% = 0.4).
- Named CSS colors: the full CSS Color Level 4 named-color list (148 names) + `transparent` is rejected.

`parseColor` throws `TypeError` with message `Invalid color: "<input>"` (and for oklch out of gamut it gamut-maps, never throws). `tryParseColor` returns `null` instead of throwing.

### `convert.ts`

```ts
export function srgbToLinear(rgb: RGB): LinearRGB
export function linearToSRGB(linear: LinearRGB): RGB        // clamps and rounds
export function linearRGBToOKLAB(rgb: LinearRGB): OKLAB
export function oklabToLinearRGB(lab: OKLAB): LinearRGB
export function oklabToOKLCH(lab: OKLAB): OKLCH
export function oklchToOKLAB(lch: OKLCH): OKLAB
export function rgbToOKLCH(rgb: RGB): OKLCH
export function oklchToRGB(lch: OKLCH): RGB                  // NO gamut mapping; clamps channels
export function isInGamut(linear: LinearRGB, epsilon?: number): boolean
export function isOKLCHInGamut(lch: OKLCH, epsilon?: number): boolean
export function rgbToHSL(rgb: RGB): HSL
export function hslToRGB(hsl: HSL): RGB
```

Use the standard Björn Ottosson OKLab matrices. Achromatic colors (c < 1e-4) get hue 0.

### `gamut.ts`

```ts
export function toGamut(color: OKLCH, epsilon?: number): OKLCH   // chroma reduction, preserves L and H
export function oklchToRGBGamut(color: OKLCH): RGB
export function maxChromaForLH(l: number, h: number, epsilon?: number): number
export function clampRGB(rgb: RGB): RGB
```

`toGamut`: if `l <= 0` → `{l:0,c:0,h}`; if `l >= 1` → `{l:1,c:0,h}`; if in gamut return as-is; else bisect chroma in `[0, c]` to the largest in-gamut value (epsilon 1e-4).

### `oklch.ts`

```ts
export function oklch(l: number, c: number, h: number): OKLCH          // normalizes ranges
export function setLightness(color: OKLCH, l: number): OKLCH
export function setChroma(color: OKLCH, c: number): OKLCH
export function scaleChroma(color: OKLCH, factor: number): OKLCH
export function setHue(color: OKLCH, h: number): OKLCH
export function mixOKLCH(a: OKLCH, b: OKLCH, t: number): OKLCH         // shortest-path hue
export function isAchromatic(color: OKLCH, threshold?: number): boolean
export function formatOKLCH(color: OKLCH, precision?: number): string  // "oklch(70.00% 0.1500 250.00)"
```

`formatOKLCH` renders `oklch(<L%> <C> <H>)` with L as percent (2 decimals), C 4 decimals, H 2 decimals.

## 4. Contrast module (`src/contrast`)

### `apca.ts` — APCA-W3 0.1.9 (the official constants)

```ts
export function sRGBtoY(rgb: RGB): number                 // simple 2.4 power curve, coefficients 0.2126729/0.7151522/0.0721750
export function calcAPCA(text: RGB, background: RGB): number     // signed Lc. + = dark text on light bg (BoW), - = light on dark (WoB)
export function calcAPCAabs(text: RGB, background: RGB): number
export function calcAPCAraw(fg: RGB, bg: RGB): number      // |Lc| without the loClip cutoff, clamped at 0 — monotonic
export function meetsContrast(text: RGB, background: RGB, min: number): boolean
export const APCA_THRESHOLDS: { minimum: 8; decorative: 15; largeText: 30; bodyTextMin: 45; bodyTextRecommended: 60; smallText: 75; maximum: 90 }
```

Constants: mainTRC 2.4; normBG 0.56; normTXT 0.57; revTXT 0.62; revBG 0.65; blkThrs 0.022;
blkClmp 1.414; scaleBoW 1.14; scaleWoB 1.14; loBoWoffset 0.027; loWoBoffset 0.027;
deltaYmin 0.0005; loClip 0.1. Softclamp: `Y < blkThrs ? Y + (blkThrs - Y)^blkClmp : Y`.
Reference checks (must hold within ±0.5): `calcAPCA(#000,#fff)=106.04`, `calcAPCA(#fff,#000)=-107.88`,
`calcAPCA(#888,#fff)=63.06`, `calcAPCA(#fff,#888)=-68.54`, `calcAPCA(#aaa,#000)=-56.24`, `calcAPCA(#000,#aaa)=58.15`.

### `solve.ts` — finding a color at a target Lc

```ts
export type Polarity = "lighter" | "darker";   // foreground lighter or darker than background

export interface SolveOptions {
  /** Which side of the background to search. Required. */
  polarity: Polarity;
  /** Use calcAPCAraw (no loClip). Default false. */
  raw?: boolean;
  /** Stop when achieved - target <= tolerance. Default 0.25. */
  tolerance?: number;
}

export interface SolveResult {
  color: OKLCH;        // gamut-mapped, has seed hue/chroma (chroma may be reduced for gamut)
  lc: number;          // achieved |Lc| (raw or clipped per options)
  reached: boolean;    // lc >= target
}

export function solveContrast(seed: OKLCH, background: RGB, targetLc: number, options: SolveOptions): SolveResult
export function maxContrast(seed: OKLCH, background: RGB, polarity: Polarity): SolveResult  // extreme of that side
export function preferredPolarity(background: RGB): Polarity   // "darker" if black-on-bg >= white-on-bg else "lighter"
```

Algorithm: within one polarity, contrast is monotonic in OKLCH L (with fixed c, h after
gamut mapping). Search L in `[0, bgL]` for `darker` and `[bgL, 1]` for `lighter`, where
`bgL = rgbToOKLCH(background).l`. Bisect (≤ 60 iterations or until the L interval is < 1e-5),
tracking the smallest-overshoot candidate with `lc >= target`. If the far extreme cannot
reach the target, return the extreme with `reached: false`. `targetLc <= 0` returns the
color at `bgL` with lc 0 and reached true. `raw: true` never crosses the background.

**Guarantee:** when `reached` is true, `target <= lc <= target + tolerance` unless the
tolerance is unattainable because of 8-bit quantization, in which case `lc` is the
smallest achievable value `>= target`.

## 5. Config module (`src/config`)

### Public types (`types.ts`)

```ts
export type Mode = "light" | "dark";
export type TokenRole = "surface" | "text" | "border" | "action" | "status" | "icon";
export type LcShortcut = "heading" | "body" | "muted" | "placeholder" | "disabled" | "pure";
export const LC_SHORTCUTS: Record<Exclude<LcShortcut,"pure">, number> = { heading: 90, body: 80, muted: 60, placeholder: 45, disabled: 40 };

export interface LcVariant {
  lc: number | LcShortcut;           // 0..108 or shortcut; 'pure' = pure white/black
  $reference?: boolean;
  $on?: string;                      // "group" | "group.variant"
  $decorative?: boolean;
  $invert?: boolean;
  $chroma?: number;                  // multiplier on seed chroma, 0..2, default 1
}
export interface LsVariant {
  ls: number | "pure";               // >= 0 lightness steps from the reference
  $reference?: boolean;
  $on?: string;
  $decorative?: boolean;
  $scale?: number;                   // 0.001..0.1
  $chroma?: number;
}
export type Variant = LcVariant | LsVariant;

export interface TokenGroup {
  $on?: string;
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

export interface OverrideValue { lc?: number | LcShortcut; ls?: number | "pure"; $scale?: number; $decorative?: boolean; $invert?: boolean; $chroma?: number }
export type Overrides = Record<string /* "error" or "error,warning" */, Record<string /* group */, Record<string /* variant */, OverrideValue>>>;

export type OutputFormat = "css" | "json" | "tailwind" | "flat";
export interface OutputConfig { path?: string; formats?: OutputFormat[] }

export interface Config {
  name: string;
  mode: Mode;
  selector?: string;                           // default ":root"
  prefersColorScheme?: "light" | "dark";
  prefersContrast?: "more" | "less" | "custom";
  scale?: number;                              // default 0.02
  offset?: number;                             // 0..0.5; default light 0.015, dark 0.15
  colors: Colors;                              // >= 1 entry
  tokens: Tokens;                              // >= 1 group, each >= 1 variant
  overrides?: Overrides;
  output?: OutputConfig;
}
```

`defineConfig` is identity + validation with a const generic so token names flow to
callers: `export function defineConfig<const T extends Config>(config: T): T` and an
overload for `readonly Config[]`/`Config[]`.

### Validation (`validate.ts`) — hand-written, zero deps

```ts
export interface Issue { path: string; message: string; hint?: string }   // path like "tokens.text.heading.$on"
export class ConfigError extends Error { issues: Issue[]; constructor(issues: Issue[], prefix?: string) }
export function validateConfig(input: unknown): { ok: true; config: Config } | { ok: false; issues: Issue[] }
export function assertConfig(input: unknown): Config     // throws ConfigError
```

`ConfigError.message` = `Invalid tint config:\n  - tokens.text.heading.$on: ...\n  - ...`.
Collect **all** issues before returning (don't stop at the first).

Rules (each produces a precise `path`):

- top level: must be a plain object; unknown keys rejected with hint listing valid keys; `name` non-empty string; `mode` in {light,dark}; `selector` string; `prefersColorScheme`/`prefersContrast` enums; `scale` number in [0.001, 0.1]; `offset` number in [0, 0.5]; `colors` object with ≥1 entry, each a string or `{value: string}` (strict), each parseable by `tryParseColor` (invalid → issue `colors.<name>: Invalid color "<v>"`); `tokens` object with ≥1 group; `overrides` object; `output` object with `path?: string`, `formats?: OutputFormat[]`.
- color names and group/variant names: must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/` (they become CSS identifiers). Variant named `DEFAULT` (exact) is allowed and special in output.
- group: plain object; `$`-keys limited to `$on $role $decorative $invert $scale $chroma`; unknown `$` key → issue with hint (`$reference` on a group gets the hint "mark the variant instead"); ≥1 variant key; `$on` matches `/^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)?$/`; `$role` enum; booleans are booleans; `$scale` in [0.001,0.1]; `$chroma` in [0,2].
- variant: plain object; exactly one of `lc`/`ls` (both → issue, neither → issue); `lc` number in [0,108] or shortcut string; `ls` number ≥ 0 or `"pure"`; lc variants allow `$reference $on $decorative $invert $chroma`; ls variants allow `$reference $on $decorative $scale $chroma`; any other key → issue naming the allowed keys.
- at most one `$reference: true` per group.
- `$invert: true` (group or variant) requires an effective `$on` (variant `$on`, group `$on`, or any variant in the group having `$on` for the group-level case).
- `$on` targets must exist (group, and variant if given) → issue `tokens.<g>.$on: Unknown group "x"` / `Unknown variant "x" in group "g"`.
- no circular `$on` chains (resolve `group` → that group's reference variant; `group.variant` → that variant; follow each variant's effective `$on`). Report the cycle path `a.b -> c.d -> a.b`.
- `$on` may not point to the variant itself.
- overrides: color keys may be comma lists; each color must exist; group/variant must exist; `lc` override only on lc variants and `ls` only on ls variants; `$invert` override requires effective `$on`; at least one key per override value; unknown keys rejected.

### Resolution (`resolve.ts`)

```ts
export interface ResolvedVariant {
  group: string; name: string;
  kind: "lc" | "ls";
  value: number;                     // lc or ls; PURE = -1 sentinel for "pure"
  reference: boolean;
  on: { group: string; variant: string } | null;   // fully resolved target (variant always filled)
  decorative: boolean; invert: boolean;
  scale: number;                     // effective scale for ls (resolved precedence)
  chroma: number;                    // effective chroma multiplier
  role: TokenRole | null;
}
export interface ResolvedGroup { name: string; role: TokenRole | null; referenceVariant: string; variants: Record<string, ResolvedVariant> }
export interface ResolvedConfig {
  name: string; mode: Mode; selector: string;
  prefersColorScheme?: "light" | "dark"; prefersContrast?: "more" | "less" | "custom";
  scale: number; offset: number;
  colors: Array<{ name: string; input: string }>;   // "base" first if present, then insertion order
  groups: Record<string, ResolvedGroup>;
  order: Array<{ group: string; variant: string }>;  // topological: every $on target precedes its dependents
  overrides: Record<string /*color*/, Record<string /*"group.variant"*/, ResolvedOverride>>;
  output: { path: string; formats: OutputFormat[] };   // defaults "./tint", ["css"]
}
export interface ResolvedOverride { value?: number; scale?: number; decorative?: boolean; invert?: boolean; chroma?: number }
export const PURE = -1;
export function resolveConfig(config: Config): ResolvedConfig
export function parseOn(on: string): { group: string; variant?: string }
```

Semantics:

- **Reference variant** of a group: the one with `$reference: true`; else the highest
  non-pure `lc`/`ls` value; else the first variant.
- **Scale precedence** for ls variants: `variant.$scale` → `group.$scale` → `$scale` of the
  group named by the group's `$on` → `config.scale` → `0.02`.
- **Chroma precedence**: `variant.$chroma` → `group.$chroma` → `1`.
- `decorative` = group `$decorative` || variant `$decorative`; `invert` likewise.
- `on` for a variant = variant `$on` ?? group `$on`, resolved so that `variant` is the
  target group's reference variant when omitted.
- `order` is a stable topological order (Kahn's algorithm over the `on` edges, ties broken
  by config insertion order).
- Overrides are stored per-color with the comma lists expanded; the `value` key holds the
  override `lc`/`ls` resolved through shortcuts.

## 6. Engine (`src/engine`)

### Diagnostics (`diagnostics.ts`)

```ts
export type DiagnosticCode =
  | "contrast-unreachable"     // requested Lc exceeds what the reference allows
  | "contrast-below-minimum"   // non-decorative Lc < 8 against a reference
  | "role-contrast-low"        // non-decorative Lc below the role's recommended minimum
  | "seed-out-of-gamut"        // oklch() seed outside sRGB, clamped
  | "palette-name-conflict"    // palette name equals a Tailwind utility prefix
  | "reference-midtone";       // reference is a mid-tone, so neither polarity reaches high Lc
export interface Diagnostic { severity: "warning"; code: DiagnosticCode; message: string; path: string /* "<palette>.<group>.<variant>" or "<palette>" */; hint?: string; data?: Record<string, unknown> }
```

Role minimums (non-decorative, lc variants with `$on` only): text 45, icon 30, action 30,
status 30, border 15, surface none.

### Generation (`generate.ts`)

```ts
export interface GeneratedColor { hex: string; rgb: RGB; oklch: OKLCH }
export interface GeneratedVariantBase extends GeneratedColor { reference?: true; on?: string /* "group.variant" */ }
export interface GeneratedLcVariant extends GeneratedVariantBase { kind: "lc"; lc: number /* achieved |Lc| */; target: number /* requested */ }
export interface GeneratedLsVariant extends GeneratedVariantBase { kind: "ls"; ls: number /* steps, -1 for pure */ }
export type GeneratedVariant = GeneratedLcVariant | GeneratedLsVariant;
export interface GeneratedPalette { name: string; seed: GeneratedColor; tokens: Record<string, Record<string, GeneratedVariant>> }
export interface GenerationResult {
  name: string; mode: Mode; selector: string;
  prefersColorScheme?: "light" | "dark"; prefersContrast?: "more" | "less" | "custom";
  palettes: GeneratedPalette[];
  diagnostics: Diagnostic[];
  warnings: string[];            // diagnostics.map(d => d.message), for convenience
}
export function generate(config: Config | unknown): GenerationResult
export function generate(configs: readonly (Config | unknown)[]): GenerationResult[]
```

`generate` runs `assertConfig` → `resolveConfig` → per palette, walk `order` and compute
each variant. Token insertion order in `palette.tokens` must equal the **config's** group
and variant order (not topological order) so output is stable and readable.

Per-variant algorithm (palette seed `S` as OKLCH, mode `M`):

1. Apply the color's override (if any) to `value`, `scale`, `decorative`, `invert`, `chroma`.
2. Working seed `W = toGamut({ l: S.l, c: S.c * chroma, h: S.h })` (chroma applied once).
3. Determine the **reference color** `R`:
   - with `on`: the already generated `tokens[on.group][on.variant]` of this palette.
   - without `on` (a *foundation* variant): `R` = mode baseline (`#ffffff` light / `#000000` dark).
4. If `on` exists and `value === 0` (for either kind): return a copy of `R` (`lc: 0, target: 0` / `ls: 0`).
5. **ls variant**:
   - `value === PURE` → mode baseline color, `ls: -1`.
   - no `on`: the reference for stepping is the *foundation color*: `L = 1 - offset` (light) or `offset` (dark), `c = min(W.c, maxChromaForLs(0))`, `h = W.h`, gamut mapped.
   - `L = clamp(R.l - ls*scale)` in light mode, `R.l + ls*scale` in dark mode.
   - `c = min(W.c, maxChromaForLs(ls))` where `maxChromaForLs(ls)` = 0.02 if ls ≤ 0, 0.05 if ≤ 3, 0.08 if ≤ 7, else 0.12.
   - color = `toGamut({l, c, h: W.h})`.
6. **lc variant**:
   - polarity: with `on`, `preferredPolarity(R.rgb)` (whichever of black/white yields higher APCA vs R), flipped if `invert`. Without `on`: `"darker"` in light mode, `"lighter"` in dark mode.
   - `value === PURE` → white if polarity lighter else black; `lc` = measured `calcAPCAabs`.
   - otherwise `solveContrast(W, R.rgb, value, { polarity })`. If `!reached`, try the opposite polarity **only when `invert` is false**; keep whichever has higher lc; emit `contrast-unreachable` (with `reference-midtone` hint when `0.35 < R.l < 0.75` and max achievable < 70). The emitted color is the best achievable.
   - diagnostics: `contrast-below-minimum` when `on` && !decorative && 0 < value < 8; `role-contrast-low` when `on` && !decorative && role minimum defined && value < minimum.
7. Result fields: `hex`, `rgb`, `oklch` (gamut-mapped), `kind`, `lc`+`target` or `ls`, `reference: true` when it is the group's reference variant, `on: "group.variant"` when applicable.

Palette-level diagnostics: `seed-out-of-gamut` (only for `oklch()` inputs that are outside sRGB), `palette-name-conflict` (palette name, lowercased, is a key of `TAILWIND_UTILITY_PREFIXES`).

Determinism: identical config → byte-identical result. No randomness, no Date.

## 7. Output (`src/output`)

### Naming (`names.ts`)

```ts
export const TAILWIND_UTILITY_PREFIXES: Record<string, string>   // { text:"text", bg:"bg", background:"bg", border:"border", outline:"outline", ring:"ring", accent:"accent", caret:"caret", fill:"fill", stroke:"stroke", decoration:"decoration", divide:"divide", placeholder:"placeholder", shadow:"shadow" }
export function variantSegment(name: string): string          // "DEFAULT" -> "", else name
export function cssVar(...parts: string[]): string            // "--" + non-empty parts joined by "-"
export function tokenVarName(palette: string, group: string, variant: string): string   // --brand-text-heading, --brand-text (DEFAULT)
export function simplifyTailwindParts(palette: string, group: string, variant: string): string[]
```

`simplifyTailwindParts`: if `group.toLowerCase()` is a utility prefix and variant is non-empty → `[palette, variant]`; if prefix and variant empty → `[palette, group]`; else `[palette, group, variant].filter(Boolean)`.

### CSS (`css.ts`)

```ts
export interface CSSOptions { selector?: string; format?: "hex" | "oklch"; includeOKLCH?: boolean; indent?: string; comments?: boolean }
export function toCSS(result: GenerationResult | GenerationResult[], options?: CSSOptions): string
```

Output per result (selector from `options.selector ?? result.selector`), wrapped in
`@media (prefers-color-scheme: X)` / `(prefers-contrast: Y)` (joined with ` and `) when
present. One `/* <palette> palette */` comment per palette when `comments !== false`.
Variables named by `tokenVarName`. `format: "oklch"` uses `formatOKLCH`. Multiple results are
joined with a blank line.

### JSON (`json.ts`)

```ts
export interface JSONOptions { includeSchema?: boolean; useOKLCH?: boolean; indent?: number; metadata?: boolean }
export function toDTCG(result: GenerationResult, options?: JSONOptions): Record<string, unknown>
export function toJSON(result: GenerationResult, options?: JSONOptions): string
export function toFlatMap(result: GenerationResult): Record<string, string>   // "brand.text.heading" -> hex, DEFAULT dropped
```

DTCG: `{ $schema?, [palette]: { [group]: { [variant]: { $type: "color", $value, $extensions?: { "dev.tint": { kind, lc|ls, target?, on?, reference? } } } } } }`. `metadata` (default true) controls `$extensions`. Variant keys keep the config name (`DEFAULT` stays `DEFAULT` in JSON).

### Tailwind (`tailwind.ts`)

```ts
export interface TailwindOptions { indent?: string; simplifyNames?: boolean /* true */; generateShortcuts?: boolean /* true */ }
export interface TintUtilitiesOptions extends TailwindOptions {
  generateTintUtilities?: boolean;   // default true in toCSSWithTailwindAndTint
  defaultPalette?: string;           // "base"
  includeOKLCH?: boolean;
}
export function toTailwind(result | result[], options?: TailwindOptions): string                  // "@theme { --color-...: var(--...); }"
export function toCSSWithTailwind(result | result[], options?: TailwindOptions & { includeOKLCH?: boolean }): string
export function toCSSWithTailwindAndTint(result | result[], options?: TintUtilitiesOptions): string
export function assertConsistentStructure(results: GenerationResult[]): void   // throws descriptive Error when themes differ
export function detectTailwindConflicts(result: GenerationResult, simplifyNames: boolean): void  // throws listing conflicts
```

`toCSSWithTailwindAndTint` sections, joined by blank lines, in this order:

1. Per-result CSS variable block (same as `toCSS`, hex).
2. Per-result **alias layer** when tint utilities enabled: `<selector> { --text-heading: var(--base-text-heading); ... }` for the default palette, wrapped in the same media queries.
3. `@theme static { --color-<palette>-<group>-<variant>: var(--<palette>-<group>-<variant>); ... ; /* Unprefixed colors (for tint-* utility classes) */ --color-<group>-<variant>: var(--<group>-<variant>); }` — tint path never simplifies names. Without tint utilities, a plain `@theme {}` with simplified names (conflict-checked).
4. `@utility tint-<palette> { --color-<group>-<variant>: var(--<palette>-<group>-<variant>); ... }` for every non-default palette.
5. Shortcut utilities, for groups whose lowercase name is a utility prefix: `@utility <group>-<variant|default> { <property>: var(--color-<group>-<variant>); }` with the property map `text→color, bg/background→background-color, border→border-color, outline→outline-color, accent→accent-color, caret→caret-color, fill→fill, stroke→stroke, decoration→text-decoration-color, ring→--tw-ring-color, shadow→--tw-shadow-color, divide→"& > * + * { border-color: … }", placeholder→"&::placeholder { color: … }"`.

If the default palette is missing from the result, sections 2, 4, 5 are omitted and the
unprefixed part of 3 is omitted.

### IntelliSense (`intellisense.ts`)

```ts
export function toTailwindIntelliSense(result | result[], options?: TintUtilitiesOptions): string
```

`@import 'tailwindcss';\n\n@theme { --color-...: #hex; }` from the **first** result. Tint path
(`generateTintUtilities === true`) uses full names and appends the unprefixed default
palette colors; otherwise simplified names (conflict-checked).

## 8. Audit (`src/audit`)

```ts
export interface AuditRow { palette: string; group: string; variant: string; hex: string; kind: "lc" | "ls"; target: number | null; achieved: number; on: string | null; decorative: boolean; status: "pass" | "warn" | "fail" | "n/a" }
export interface AuditReport { rows: AuditRow[]; summary: { tokens: number; pass: number; warn: number; fail: number; na: number }; diagnostics: Diagnostic[] }
export function audit(result: GenerationResult): AuditReport
export function formatAuditTable(report: AuditReport, options?: { color?: boolean }): string   // aligned plain-text table
```

Status: lc variants with `on`: `pass` if achieved ≥ target − 0.5; `warn` if a diagnostic
with that path exists and it still reached; `fail` if achieved < target − 0.5. Foundation
and ls variants are `n/a` (achieved is the measured APCA against the mode baseline).

## 9. Loader (`src/loader`)

```ts
export interface LoadOptions { root?: string; configPath: string }
export interface LoadedConfig { configs: Config[]; path: string /* absolute */ ; dependencies: string[] /* absolute paths bundled in, incl. the config */ }
export async function loadConfig(options: LoadOptions): Promise<LoadedConfig>
```

- Resolve path against `root` (default `process.cwd()`); throw `Error("Config not found: <path>")`.
- `.json` → `JSON.parse`.
- `.js/.mjs/.cjs` → native `import()` first (cache-busted with `?t=<mtime>`).
- `.ts/.mts/.cts` (or when native import fails) → `esbuild.build` to `<root>/node_modules/.tint/config.<hash>.<mtime>.mjs` (bundle, platform node, format esm, external `@skylerknight/tint`), `metafile: true` to collect `dependencies`, then `import()`, then delete the temp file. Missing esbuild → helpful error telling the user to `npm i -D esbuild`.
- Accept `default` export or named `config`; a single config or an array; validate each with `assertConfig`; return array.

## 10. CLI (`src/cli`) — zero deps (`node:util` `parseArgs`, `node:readline/promises`)

```
tint build   [-c|--config <path>] [-o|--out <dir>] [-f|--formats css,json,tailwind,flat] [--tailwind-tint] [--quiet]
tint check   [-c <path>] [--strict]        # validate + generate; prints diagnostics; exit 1 on error, or on warnings with --strict
tint inspect [-c <path>] [--palette <name>] [--theme <name>]   # prints the audit table
tint init    [--dark] [--brand <hex>] [--yes]                  # writes tint.config.ts
tint --help | -h, tint --version | -v
```

- Default config path: first existing of `tint.config.ts, tint.config.mts, tint.config.js, tint.config.mjs, tint.config.json`.
- `build` writes `<out>/<theme>/tokens.css`, `tokens.json`, `tailwind.css`, `tokens.flat.json` per selected format; `--tailwind-tint` makes `tailwind.css` the full `toCSSWithTailwindAndTint` output across all themes in one file at `<out>/tailwind.css`.
- Output dir precedence: `--out` → `config.output.path` → `./tint`. Formats: `--formats` → `config.output.formats` → `["css"]`.
- Human-friendly errors (no stack traces); exit codes 0/1. Diagnostics printed as `warn <path>: <message>` lines.
- `init`: interactive unless `--yes`; asks for brand color (validated hex) and dark mode; writes a config using the modern token set (surface ls-based, text, border, action, on, ring).

## 11. Vite plugin (`src/vite`)

```ts
export interface TintVitePluginOptions extends TintUtilitiesOptions { intellisense?: boolean /* true */ }
export function tint(options?: TintVitePluginOptions): Plugin
```

- `enforce: "pre"`; transforms CSS modules containing `@tint "<path>";` (single or double quotes, optional semicolon; the regex `/@tint\s+["']([^"']+)["']\s*;?/g`), path relative to the CSS file. Replace each directive with `toCSSWithTailwindAndTint`.
- Registers the config and its bundled dependencies with `this.addWatchFile`; on change of any dependency, drops the cache, invalidates importers, and sends `full-reload`.
- Writes `node_modules/.tint/intellisense.css` (when `intellisense !== false`).
- Virtual module `virtual:tint` (and `\0virtual:tint` resolved id) exporting `default` = `GenerationResult[]` JSON for the **first** `@tint` config seen, plus `virtual:tint/<relative-config-path>` for a specific one. Importing before any CSS transform ran loads the config at the default path.
- Build errors surface as Vite errors with the config path.

## 12. PostCSS plugin (`src/postcss`)

```ts
export interface TintPostCSSOptions extends TintUtilitiesOptions { root?: string }
const tintPostCSS: PluginCreator<TintPostCSSOptions>; tintPostCSS.postcss = true; export default tintPostCSS; export { tintPostCSS as tint }
```

Processes `@tint "<path>"` at-rules (path relative to `root`), registers `dependency` messages for the config and each bundled dependency, replaces the at-rule with the generated CSS, writes the IntelliSense file, caches the last good output at `node_modules/.tint/cache/<md5>.css` and serves it (with a `result.warn` and a leading `/* [tint] Error: … */` comment) when loading fails.

## 13. Public API (`src/index.ts`)

Export: `defineConfig, generate, validateConfig, assertConfig, ConfigError, resolveConfig, audit, formatAuditTable, toCSS, toJSON, toDTCG, toFlatMap, toTailwind, toCSSWithTailwind, toCSSWithTailwindAndTint, toTailwindIntelliSense, parseColor, tryParseColor, rgbToHex, rgbToOKLCH, oklchToRGB, oklchToRGBGamut, toGamut, formatOKLCH, calcAPCA, calcAPCAabs, calcAPCAraw, meetsContrast, APCA_THRESHOLDS, solveContrast, maxContrast, preferredPolarity, LC_SHORTCUTS, TAILWIND_UTILITY_PREFIXES, loadConfig` and all public types.

## 14. Testing

Vitest. Each module has a test file mirroring its path under `tests/`. Tests must be
deterministic and fast (whole suite < 10 s). Prefer property-style loops over many seeds
for solver/gamut invariants. Golden snapshot strings for formatters are fine but keep
them small and readable.
