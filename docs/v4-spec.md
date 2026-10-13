# tint v4 — API Specification (DRAFT)

*Status: draft, Sun Oct 11, 2026 (PT). Supersedes the v3 config sections of `SPEC.md`. The
v3 engine pieces (OKLCH color module, APCA solver, gamut mapping, loader, plugins) carry over
unless stated. Earlier exploration docs: `tint-review.md`, `tint-api-naming-and-edge-cases.md`,
`tint-vocabulary-presets.md`.*

---

## 1. Overview

tint turns **a few palette colors** and **one token template** into complete, accessible color
palettes, one per palette color, for every theme (light/dark/high-contrast). Every palette has the same
shape, so the `tint-<name>` class re-skins any subtree.

A token states **what it is** (its *kind*) and **how prominent it should be** (its *level*). tint
picks a contrast target for that level using the global contrast algorithm. It then solves the
color against whatever the token sits *on*.

```ts
tokens: {
  action: { DEFAULT: emphasis(), hover: emphasis({ state: 'hover' }), on: text({ on: 'action' }) },
}
```

### Principles
1. **Intent over units.** Configs never contain raw Lc or ratios. Raw values are an expert escape hatch.
2. **Palette-agnostic template.** Tokens never name palette colors. Color-specific behavior lives on the palette color.
3. **Plain data.** Kind functions return JSON-serializable objects. A JSON config is equivalent.
4. **Ordinal core, renamable surface.** Every kind has levels 1–5. Names are aliases. Numbers always work.
5. **States are interactions, levels are prominence.** They never mix.
6. **Solid colors only.** No alpha for anything that carries text (alpha may come later, decorative only).
7. **Guaranteed pairs.** A token passes against *every* backdrop it can appear on, including that backdrop's states.
8. **Deterministic and explainable.** Same config gives byte-identical output, and `tint explain` shows why each color is what it is.
9. **Errors that repair.** Every issue has a path, the expected shape, a suggestion, and a machine-readable fix.

---

## 2. Config reference

```ts
import { defineConfig, surface, text, border, emphasis } from "@skylerknight/tint";

defineConfig({
  contrast?: { algorithm?: 'apca' | 'wcag2', level?: 'standard' | 'more' | 'max' },
  palette: Record<string, string | PaletteColor>,     // ≥ 1; first = default (unprefixed) palette
  themes?: Record<string, ThemeOptions>,              // default: { light: { mode: 'light' } }
  levels?: LevelNames,                                // rename/add level aliases per kind
  states?: StateSteps,                                // override per-kind state step sizes
  preset?: Preset,                                    // shadcn | material | primer | radix | polaris
  tokens:  Record<string /*group*/, Record<string /*token*/, Token>>,
  output?: { path?: string, formats?: ('css' | 'tailwind' | 'dtcg' | 'flat')[], format?: 'oklch' | 'hex' | 'rgb', prefix?: string },
})
```

### 2.1 `contrast`
| Key | Values | Default | Meaning |
| --- | --- | --- | --- |
| `algorithm` | `'apca'` · `'wcag2'` | `'apca'` | Measures contrast and selects the target table (§5). |
| `level` | `'standard'` · `'more'` · `'max'` | `'standard'` | Shifts every contrast-targeted level up by 0 / 1 / 2 (capped at 5). A theme can override it, which is how high-contrast themes are derived. |

### 2.2 `palette`
```ts
type PaletteColor = {
  color: string;                      // any CSS color; supplies hue + chroma (lightness is solved)
  default?: boolean;                  // make this the unprefixed palette (else the first palette color)
  exact?: boolean | string;           // true: snap the first emphasis rest token to `color` if it passes;
                                      // 'group.token': snap that token. Rejected with a diagnostic if it fails.
  tune?: Record<string /*path*/, Token | Partial<TokenOptions>>;  // per-palette-color overrides
};
```
- `tune` keys are token paths. `'action'` means `action.DEFAULT`, `'action.hover'` is one token, and `'action.*'` is the whole group. Values replace the token (`emphasis('bold')`) or merge options (`{ chroma: 0.5 }`). States follow their rest token automatically.
- Palette color names must be CSS identifiers. The engine warns if a name equals a Tailwind utility prefix (`text`, `border`, …).

### 2.3 `themes`
```ts
type ThemeOptions = {
  mode: 'light' | 'dark';
  selector?: string;                  // default ':root'
  media?: boolean | string;           // true = prefers-color-scheme matching `mode`; string = custom media query
  contrast?: { level?: 'standard' | 'more' | 'max' };
  palette?: Record<string, string | Partial<PaletteColor>>;  // per-theme palette deltas
  extends?: string;                   // inherit another theme's options
};
```
CSS scoping is the same as v3:
- **Selector only** → a `selector {}` block.
- **Media only** (selector `:root`) → an `@media {}` block.
- **Both** → a manual class block plus an automatic media block that excludes sibling themes' classes (`:root:not(.light)`).

### 2.4 Tokens and kind functions
```ts
surface(level?, options?)   emphasis(level?, options?)   text(level?, options?)   border(level?, options?)

type Level = 1 | 2 | 3 | 4 | 5 | string;        // number or level name (§3)
type TokenOptions = {
  state?: State;                                // §4 — 'hover', 'selected-hover', …
  on?: string;                                  // single backdrop: 'group' or 'group.token'; §6.2
  contrast?: '+1' | '-1' | '+2' | '-2';         // relative level nudge
  direction?: 'lighter' | 'darker';             // force the side vs the backdrop (replaces $invert)
  chroma?: number;                              // multiplier on the palette color's chroma, 0..2 (default 1; surfaces capped)
  hue?: number | `+${number}` | `-${number}`;   // absolute hue or shift (degrees)
  nudge?: boolean;                              // false disables auto-nudge for this token (§6.4)
  // expert escape hatches (lint: expert-value)
  lc?: number;                                  // raw APCA target (only with algorithm 'apca')
  ratio?: number;                               // raw WCAG ratio (only with algorithm 'wcag2')
  step?: number;                                // raw lightness steps (surface) or step offset (others)
};
```
- `level` may be omitted when only options are passed: `emphasis({ state: 'hover' })`.
- `nudge: false` disables the label auto-nudge (§6.4) for that token. It is described for emphasis tokens and is accepted on every kind.
- **Returned data** (and the JSON form): `{ "kind": "emphasis", "level": 3, "state": "hover", "on": "surface" }`. Names are kept as written and resolved at build time.
- **Group and token names** must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/`.
- **`DEFAULT`** drops its segment in CSS names and becomes `$root` in DTCG.
- **Groups contain only tokens.** There are no group-level settings.

### 2.5 `levels`
```ts
levels: {
  text: { secondary: 2, tertiary: 1 },    // add aliases (defaults stay)
  emphasis: { primary: 3, $replace: true } // $replace: only these names are valid
}
```

Aliases merge with the §3 defaults. `$replace: true` drops those defaults, including the universal `default` alias. Ordinals `1`–`5`, including the strings `"1"`–`"5"`, still resolve. Omitting `level` is still ordinal 3, even when `default` was removed or pointed at another ordinal.

---

## 3. Levels (defaults)

Each kind has five ordinal levels. **The name describes the kind's own dimension.** `*` marks the default (used when `level` is omitted).

| Ordinal | `surface` — elevation | `text` — legibility | `border` — definition | `emphasis` — prominence |
| --- | --- | --- | --- | --- |
| 1 | `sunken` | `faint` | `hairline` | `quiet` |
| 2 | `flat` | `muted` | `soft` | `subtle` |
| 3 | `base`* | `body`* | `default`* | `default`* |
| 4 | `raised` | `strong` | `firm` | `bold` |
| 5 | `floating` | `max` | `heavy` | `loud` |

- `default` is accepted on every kind as the alias for that kind's default ordinal.
- Surface levels are **elevation**: higher = closer to the light, i.e. lighter in both modes. `base` is the page; `sunken`/`flat` sit below it (wells, sidebars) and `raised`/`floating` above it (cards, popovers). Direction is configurable by preset (§11, open question).
- `emphasis` levels 1–2 are **tinted surfaces** that carry a label (ghost/soft controls). Levels 3–5 are **solids** that contrast with the surface.

---

## 4. States

States are transient or toggled **interactions**, written as participles. They modify a rest token and are never levels.

| State | Applies to | Default step from the rest token | Linted |
| --- | --- | --- | --- |
| `hover` | all | +1 step | yes |
| `pressed` (alias `active`) | all | +2 steps | yes |
| `focus` | all | +1 step (same as `hover` unless overridden) | yes |
| `selected` | surface, emphasis, text, border | +2 steps, chroma ×1.5 (toward the palette hue) | yes |
| `checked` | emphasis, border | → level `default` (solid), at least | yes |
| `disabled` | all | contrast to Lc 15 / 1.5:1, chroma ×0.3 | **never** |

**Compound states** are `-`-joined strings, applied left to right. `active` is an alias of `pressed` and normalizes to it; it is not itself a canonical state. Parts belong to three groups:

| Group | States | Rule |
| --- | --- | --- |
| Persistent | `selected`, `checked` | at most one, written first |
| Disabled | `disabled` | at most one; never combined with a temporary state |
| Temporary | `hover`, `pressed`, `focus` | at most one, written last |

Written order is **persistent, then `disabled`, then temporary**. `checked-disabled` is the disabled form of a persistent state. `disabled-hover` is rejected, and so is the same pair in the other order. The canonical list — the source of truth `CANONICAL_STATES`, which JSON Schema is generated from — is:

`hover` · `pressed` · `focus` · `selected` · `checked` · `disabled` · `selected-hover` · `selected-pressed` · `selected-focus` · `selected-disabled` · `checked-hover` · `checked-pressed` · `checked-focus` · `checked-disabled`

`checked` and any compound that includes it apply only to `emphasis` and `border` (the table above). Every other state applies to all four kinds.

Rejected:

- **Wrong order.** `hover-selected` → `selected-hover`. `disabled-checked` → `checked-disabled`. `active-selected` → `selected-pressed`.
- **Duplicates.** `hover-hover`. `pressed-active` (`active` is already `pressed`).
- **`disabled` with a temporary state.** `disabled-hover`, `hover-disabled`, `selected-disabled-hover`.
- **Two persistent or two temporary states.** `selected-checked`, `hover-pressed`.
- **Three or more parts,** empty parts (`selected-`), and unknown parts.

A normalized token stores `states` as those canonical atoms in that order: `selected-active` → `["selected", "pressed"]`. A rest token has `states: []`. Unknown names and rejected combinations are issues `{ path, message, didYouMean? }`. They do not throw. `didYouMean` is the legal spelling when there is one (`hovver` → `hover`, `hover-selected` → `selected-hover`) and is omitted when the parts cannot be repaired into a state that applies to that kind.

**Step sizes per kind** (one "step"), overridable with `states`:

| Kind | One step |
| --- | --- |
| surface | 0.02 OKLCH L (light), 0.03 (dark), away from the backdrop |
| emphasis 1–2 | 0.025 OKLCH L (light), 0.0375 (dark), away from the backdrop |
| emphasis 3–5, text, border | ΔLc 6 (apca) · ratio ×1.15 (wcag2), toward more contrast |

The dark tint step is the light step scaled by the surface ratio: `0.025 × (0.03 / 0.02) = 0.0375`. One tint stays 1.25 surface steps in both modes. That size also applies to state steps on emphasis 1–2 and to a non-surface `step` override. `states.emphasis.step` overrides it with the same `{ light, dark }` shape as `states.surface.step`. An omitted side keeps that mode's default.

```ts
states: {
  emphasis: { hover: 1, pressed: 3, step: { dark: 0.04 } },
  surface: { step: { light: 0.02, dark: 0.035 } },
}
```

**State resolution:** a state token finds its rest token, meaning the token in the same group with the same kind and level and no state (or with the prefix state, for compounds). If none exists, the engine generates it internally and names it in diagnostics.

---

## 5. Level → contrast targets

Measured against the token's backdrop (§6.2) in the worst case. `level: 'more'` / `'max'` shifts the ordinal by +1 / +2 before lookup (capped at 5; `max` already = max).

### 5.1 APCA (Bronze-derived, |Lc|)
| Ordinal | text | border | emphasis | surface |
| --- | --- | --- | --- | --- |
| 1 | 45 | 15 | tint step ×1 (no Lc target) | step −2 |
| 2 | 60 | 30 | tint step ×2 (no Lc target) | step −1 |
| 3 | 75 | 45 | 60 | page (offset) |
| 4 | 90 | 60 | 75 | step +1 |
| 5 | max | 75 | 90 | step +2 |

APCA references: Lc 15 non-text minimum · 30 spot/incidental · 45 large text/UI · 60 content text · 75 body text · 90 preferred body.

### 5.2 WCAG 2 (contrast ratio)
| Ordinal | text | border | emphasis | surface |
| --- | --- | --- | --- | --- |
| 1 | 3:1 | 1.5:1 | tint step ×1 | step −2 |
| 2 | 3.5:1 | 2:1 | tint step ×2 | step −1 |
| 3 | **4.5:1** (AA body) | 3:1 | 3:1 | page |
| 4 | 7:1 (AAA) | 4.5:1 | 4.5:1 | step +1 |
| 5 | max | 7:1 | 7:1 | step +2 |

Emphasis 3 at 3:1 meets WCAG 1.4.11 against the surface. Its label still has to reach its
own text target (4.5:1 for `body`) against the fill, and auto-nudge (§6.4) enforces that.

Notes:
- `text(1)` is linted with an info note: *"faint: large or non-essential text only"*.
- `border` ≥ 3 meets WCAG 1.4.11 (non-text 3:1). `border(1–2)` are decorative and never fail.
- Surfaces and `emphasis(1–2)` aren't contrast-targeted. Their *labels* are.
- The `contrast: '+1'` option on a token is the same shift for one token. `lc`/`ratio` bypass the table.

---

## 6. Resolution rules

### 6.1 Pipeline
`validate → normalize (names → ordinals, presets, levels) → expand per theme × palette color (apply theme palette deltas, then `tune`) → build backdrop graph → topological solve → nudge pass (§6.4) → diagnostics → outputs`.

**Normalized token.** Normalization resolves names and does not throw. A token becomes `{ kind, ordinal, states, ...options }`. `ordinal` is 1–5 (§3): names, the universal `default` alias, and the strings `"1"`–`"5"` are resolved, and an omitted `level` is ordinal 3. `states` is the canonical atoms from §4 (`[]` at rest). The other `TokenOptions`, including `nudge`, are copied. `level` and `state` are not kept. An unknown level name or state string is an issue `{ path, message, didYouMean? }`. Preset renames (§9) are a separate step and are not applied here.

### 6.2 `on` (backdrop)
| Form | Backdrop set |
| --- | --- |
| omitted, kind ≠ surface | the **base surface**: the template's surface-kind token at level `base`. Preference order: `<first surface group>.DEFAULT`, then the first surface token at ordinal 3, then the page. |
| omitted, kind = surface | the **page** (theme baseline + offset), stepped by elevation |
| `'group'` | `group.DEFAULT` **plus all its state tokens** (except `disabled`) |
| `'group.token'` | that token **plus its state tokens** (except `disabled`) |

A **disabled** token's backdrop is the disabled state of its `on` target when one exists (e.g. a disabled label sits on a disabled fill).

The solver picks the polarity that maximizes the **minimum** contrast across the set, then solves the lightness to reach the target against the worst member. If the target is unreachable on that side it tries the opposite side (unless `direction` is set), keeps the best result, and emits `contrast-unreachable`.

Surfaces with `on` step from that surface instead of the page: `surface('raised', { on: 'panel' })`.

### 6.3 Ordering and cycles
Tokens are solved in topological order of `on` edges, plus rest → state edges, with ties broken by config order. The engine reports cycles (`a.b → c.d → a.b`), self-references, and unknown targets (with did-you-mean). Output order always equals config order.

### 6.4 Auto-nudge for labels
After solving, every `text` whose backdrop includes an `emphasis` token is checked:
- If it misses its target, the engine moves that emphasis token (and its states) one fine step at a time away from its own backdrop, up to +2 levels' worth. It stops as soon as the label passes **and** the emphasis still meets its own target.
- If that still fails, it keeps the best result and emits `label-unreachable` with the achievable value and suggested fixes.
- Nudges are reported as `info: emphasis-nudged` (with the delta) and can be disabled with `nudge: false` on the emphasis token.

### 6.5 Palette color options
- **`exact`:** after solving, the target emphasis token is replaced by the palette color itself, but only if it meets that token's target against its backdrop *and* every dependent label still passes. Its states are re-derived from that color. Otherwise the engine emits `exact-rejected` with the failing pair.
- **`tune`:** applied before solving, so dependents and states follow.

### 6.6 Lints (diagnostic codes)
| Code | Severity | When |
| --- | --- | --- |
| `contrast-unreachable` | warn | target not achievable vs the worst backdrop |
| `label-unreachable` | warn | auto-nudge couldn't make a label pass |
| `emphasis-nudged` | info | an emphasis token moved to let its label pass |
| `exact-rejected` | warn | a palette color's `exact` value fails its pairs |
| `duplicate-token` | info | two tokens resolve to the same color in every theme × palette color. Suggests `ref()`-style reuse or removal. |
| `hue-identity-lost` | info | the solved color drifted far from the palette color's lightness (e.g. yellow → olive) |
| `expert-value` | info | `lc`/`ratio`/`step` used |
| `color-out-of-gamut` | warn | a palette color is outside sRGB and was mapped |
| `name-conflict` | error | a token name collides with a Tailwind keyword for its utility prefix (`text-lg`, `border-x`, …) |

Disabled tokens and `border(1–2)` are never contrast-linted.

---

## 7. Outputs

- **CSS variables:** `--<name>-<group>[-<token>]` per theme block. The default palette color also gets an alias layer (`--action`) that `tint-<name>` re-points. `output.prefix` is an optional CSS identifier prepended to every custom property (default: none). `prefix: "tint"` emits `--tint-brand-action-hover` and alias `--tint-action-hover`. Swap classes stay `tint-<palette>`. All math is OKLCH internally (not configurable). `output.format` picks the emitted notation: `'oklch'` (default), `'hex'`, or `'rgb'`. Output is sRGB-gamut only for now.
- **Tailwind v4:** `@theme static { --color-<group>[-<token>]: var(--[<prefix>-]<group>[-<token>]) }`, plus `@utility tint-<name>` for every non-default palette color, plus shortcut utilities when the group name is a Tailwind prefix (`text-strong`, `border-firm`). The `var()` targets include `output.prefix`. The utility names do not.
- **DTCG 2025.10 JSON:** `{ <name>: { <group>: { $root | <token>: { $type: 'color', $value: { colorSpace: 'oklch', components, hex }, $description, $extensions: { 'dev.tint': { kind, level, state, on, algorithm, target, achieved } } } } } }`. One file per theme.
- **Flat JSON:** `{ "brand.action.hover": "#…" }`.
- **JSON Schema** for the config, published at `https://unpkg.com/@skylerknight/tint/schema/v4.json`; `tint.config.json` may set `$schema`.
- **CLI:**
  - `tint build`
  - `tint check [--strict]`
  - `tint inspect [--matrix]`
  - `tint explain <name.group.token> [--theme]`: prints the backdrop set, worst member, level → target, achieved, polarity reason, and any nudge or exact info.
  - `tint init [--preset]`
  - `tint migrate` (v3 → v4)
- **Later:** MCP server (`generate`, `validate`, `explain`, `suggest`, `preview`) and `llms.txt` / `llms-full.txt`.

### 7.1 Repair-style errors
```
✖ tokens.row.selected: level "selcted" is not a surface level.
    Did you mean "selected"? That's a state: surface({ state: 'selected' })
    Valid levels: sunken, flat, base, raised, floating (or 1–5)
    fix: { "path": "tokens.row.selected", "replace": { "kind": "surface", "state": "selected" } }
```

---

## 8. Complete example

```ts
// tint.config.ts
import { defineConfig, surface, text, border, emphasis } from "@skylerknight/tint";

export default defineConfig({
  contrast: { algorithm: "apca", level: "standard" },

  palette: {
    neutral: "#71717a",                                   // default palette (unprefixed)
    brand: { color: "#7c3aed", exact: true },
    danger: "#dc2626",
    warning: { color: "#d97706", tune: { action: emphasis("bold") } },
  },

  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: { mode: "dark", selector: ".dark", media: true, palette: { brand: "#a78bfa" } },
    "light-hc": { mode: "light", extends: "light", selector: ".light-hc", media: "(prefers-contrast: more)", contrast: { level: "more" } },
  },

  tokens: {
    surface: {
      sunken: surface("sunken"),
      DEFAULT: surface(),                                 // base: page
      raised: surface("raised"),                          // cards
      floating: surface("floating"),                      // popovers, dialogs
    },

    action: {                                             // solid button
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      disabled: emphasis({ state: "disabled" }),
      on: text({ on: "action" }),                         // passes on DEFAULT, hover, pressed
      "on-disabled": text({ state: "disabled", on: "action" }),
    },

    soft: {                                               // secondary / tonal button
      DEFAULT: emphasis("subtle"),
      hover: emphasis("subtle", { state: "hover" }),
      pressed: emphasis("subtle", { state: "pressed" }),
      on: text({ on: "soft" }),
    },

    border: {
      hairline: border("hairline"),                       // dividers
      DEFAULT: border(),
      firm: border("firm"),                               // inputs
      focus: border("firm", { on: "action" }),            // focus ring: non-text contrast (APCA Lc 60) on the action fill
    },

    text: {
      DEFAULT: text(),                                    // body
      strong: text("strong"),                             // headings
      muted: text("muted"),
      faint: text("faint"),                               // placeholder, meta
      disabled: text({ state: "disabled" }),
      link: text({ chroma: 1.2 }),
    },

    row: {                                                // list / table row
      DEFAULT: surface(),
      hover: surface({ state: "hover" }),
      selected: surface({ state: "selected" }),
      "selected-hover": surface({ state: "selected-hover" }),
      on: text({ on: "row" }),                            // passes on all four
    },
  },
});
```

JSON equivalent (excerpt):
```json
{ "$schema": "https://unpkg.com/@skylerknight/tint/schema/v4.json",
  "palette": { "neutral": "#71717a", "brand": { "color": "#7c3aed", "exact": true } },
  "tokens": { "action": {
    "DEFAULT": { "kind": "emphasis" },
    "hover":   { "kind": "emphasis", "state": "hover" },
    "on":      { "kind": "text", "on": "action" } } } }
```

### 8.1 Expected CSS variables (per theme; repeated for `brand`, `danger`, `warning`)
```
--neutral-surface-sunken  --neutral-surface  --neutral-surface-raised  --neutral-surface-floating
--neutral-action  --neutral-action-hover  --neutral-action-pressed  --neutral-action-disabled
--neutral-action-on  --neutral-action-on-disabled
--neutral-soft  --neutral-soft-hover  --neutral-soft-pressed  --neutral-soft-on
--neutral-border-hairline  --neutral-border  --neutral-border-firm  --neutral-border-focus
--neutral-text  --neutral-text-strong  --neutral-text-muted  --neutral-text-faint
--neutral-text-disabled  --neutral-text-link
--neutral-row  --neutral-row-hover  --neutral-row-selected  --neutral-row-selected-hover  --neutral-row-on
```
That's 29 tokens × 4 palette colors = 116 variables per theme, in 3 themes:
- `.light { }` + `@media (prefers-color-scheme: light) { :root:not(.dark):not(.light-hc) { } }`
- `.dark { }` + `@media (prefers-color-scheme: dark) { :root:not(.light):not(.light-hc) { } }`
- `.light-hc { }` + `@media (prefers-contrast: more) { :root:not(.light):not(.dark) { } }`

### 8.2 Tailwind classes
| UI | Classes |
| --- | --- |
| Page / card / popover / well | `bg-surface`, `bg-surface-raised`, `bg-surface-floating`, `bg-surface-sunken` |
| Primary button | `bg-action hover:bg-action-hover active:bg-action-pressed disabled:bg-action-disabled text-action-on disabled:text-action-on-disabled` |
| Soft button | `bg-soft hover:bg-soft-hover active:bg-soft-pressed text-soft-on` |
| Text | `text-default` (body), `text-strong`, `text-muted`, `text-faint`, `text-disabled`, `text-link` *(shortcuts; raw `text-text-*` also exists)* |
| Borders | `border-hairline`, `border-default`, `border-firm`, `focus-visible:outline-2 focus-visible:outline-border-focus` |
| List row | `bg-row hover:bg-row-hover aria-selected:bg-row-selected aria-selected:hover:bg-row-selected-hover text-row-on` |
| Danger swap | `<button class="tint-danger bg-action hover:bg-action-hover text-action-on">Delete</button>` |
| Brand section | `<section class="tint-brand"> … </section>` (every unprefixed class re-skins) |
| Theme | `<html class="dark">`, or follow the OS |

---

## 9. Presets

A preset supplies `levels` renames, optional state aliases, and optionally a token template (§11 Q6). Draft mappings (name → ordinal):

| Preset | surface | text | border | emphasis | Notes |
| --- | --- | --- | --- | --- | --- |
| `shadcn` | background 3, card 4, popover 5, muted 2 | muted-foreground 2, foreground 3 | border 2, input 3, ring 5 | accent 1, secondary 2, primary 3 | `destructive` → palette color; labels named `<x>-foreground` |
| `material` | surface 3, container-low 2 … (direction: away-from-baseline) | on-surface-variant 2, on-surface 4 | outline-variant 1, outline 3 | secondary-container 2, primary-container 2, primary 3 | primary/secondary/tertiary/error → palette colors; state layers approximated |
| `primer` | inset 1, muted 2, default 3, overlay 5 | muted 2, default 3 | muted 2, default 3, emphasis 4 | muted 2, emphasis 3, inverse 5 | `rest` = no state; role colors → palette colors |
| `radix` | background 3, panel 4 | low-contrast 2, high-contrast 3 | subtle 1, element 3 | ghost 1, soft 2, solid 3 | step numbers can't be names (they clash with ordinals) |
| `polaris` | bg 3, surface 4, surface-secondary via `on` + `step` | secondary 2, default 3 | secondary 1, default 2, tertiary 3 | fill-secondary 1, fill-tertiary 2, fill-brand 4 | prominence-ordered surfaces; white `bg-fill` doesn't fit |

---

## 10. Migration from v3

| v3 | v4 |
| --- | --- |
| `colors: { base, brand }` (v3 seeds) | `palette: { neutral, brand }`. The first palette color is the default; `base` gets no special treatment. |
| `overrides: { "warning,info": { action: { DEFAULT: { lc: 70 } } } }` | `palette.warning.tune: { action: emphasis('bold') }` (share across palette colors via a TS variable) |
| `lc: 90` / `"heading"` on text | `text('strong')` |
| `lc: 75` / `80` / `"body"` | `text()` (body) |
| `lc: 60` / `"muted"` | `text('muted')` |
| `lc: 45`, `40` / `"placeholder"`, `"disabled"` | `text('faint')` / `text({ state: 'disabled' })` |
| `lc: N` on action/fill | nearest emphasis level (60 → `default`, 75 → `bold`), or `{ lc: N }` (expert) |
| `lc: N` on border | nearest border level (15 hairline, 30 soft, 45 default, 60 firm, 75 heavy) |
| `lc: "pure"` | `text('max')` / `emphasis('loud')` |
| `ls: 0..n` on surfaces | elevation levels, or `surface({ step: n })` (expert) |
| `ls: n` on soft fills (`action.soft`) | `emphasis('subtle')` (+ states) |
| `ls: "pure"` | theme page offset 0 (open question Q9) |
| `$on: "surface"` (group) | omit it; the default backdrop is the base surface |
| `$on: "action"` (variant) | `{ on: 'action' }` (now includes action's states) |
| `$on: "action.soft"` | `{ on: 'action.soft' }` or the soft group `{ on: 'soft' }` |
| `$reference: true` | removed (worst-case backdrop set replaces it) |
| `$invert: true` | `{ direction: 'lighter' \| 'darker' }` (absolute side, mode-agnostic) |
| `$decorative: true` | implied by `border(1–2)`, `state: 'disabled'`, `emphasis(1–2)`, surfaces |
| `$role` | the kind |
| `$scale`, `scale` | `states` step config / `surface({ step })` |
| `$chroma: x` | `{ chroma: x }` (token) or `tune` (palette color) |
| `offset` | theme page offset (expert, Q9) |
| `hover: { lc: 68 }`, `active: { lc: 52 }` | `{ state: 'hover' }`, `{ state: 'pressed' }` |
| separate `on` group (`on.action`) | label inside the fill group: `action.on = text({ on: 'action' })` |
| config array (themes) | `themes` map; shared palette and tokens |
| `prefersColorScheme` / `selector` | `themes.x.media` / `themes.x.selector` |
| `prefersContrast: "more"` + hand-raised tokens | `themes.hc.contrast.level: 'more'` |
| value `0` with `$on` (copy) | duplicate lint suggests reuse; `ref()` (Q7) |

`tint migrate` performs these mappings. It keeps unmappable values as expert options with a TODO comment.

---

## 11. Open questions

1. **Surface level names and direction.** Is `flat` (2) clear next to `base` (3)? Should "higher = lighter in both modes" be the default, with Material's "away-from-baseline" as an option? Should the light-mode page sit about 2 steps below white so `floating` can reach white?
2. **Exact step sizes per state and kind** (§4). Validate visually in the playground, especially dark-mode surfaces.
3. **`checked`** for emphasis: always force the solid (`default`) level, or step from the current level?
4. **Presets:** levels only, or also a token template (so shadcn users get `bg-primary text-primary-foreground`)?
5. **Reuse:** add a `ref('group.token')` alias token (CSS `var()`, DTCG `{alias}`) alongside the `duplicate-token` lint?
6. **Auto-nudge limit:** max +2 levels? Is there a global opt-out in addition to `nudge: false` on the token (§2.4, §6.4)?
7. **Page baseline** (v3 `offset`, `pure`): expose as `themes.x.page`, or keep internal?
8. **Tailwind stutter** (`text-text`, `border-border`): rely on shortcut utilities, or offer an output `aliases` option?
9. **Name of the default palette color** (`neutral` vs `base`), and should the default palette be allowed to be non-neutral?
10. **APCA licensing and naming:** use `apca-w3` directly vs our port; marketing language per APCA's trademark guidance.
11. **P3 / wide-gamut output (no gamut option yet) and decorative-only alpha:** v4.0 or later?

---

## 12. Decisions log

| Date (PT) | Decision |
| --- | --- |
| Oct 11, 2026 | **WCAG 2 body text = 4.5:1 (AA).** Text table re-balanced to 3 / 3.5 / 4.5 / 7 / max. Border and emphasis aligned: emphasis 3 = 3:1 (non-text, 1.4.11), 4 = 4.5:1, 5 = 7:1. APCA stays 45 / 60 / 75 / 90 / max. |
| Oct 11, 2026 | **Focus is not special.** No focus-ring rule, level, or lint. A focus ring is an ordinary `border()` or `emphasis()` token with whatever `on` the user gives it, checked like any other token. `focus` remains a state word only. |
| Oct 11, 2026 | **`on` takes a single target** (`'group'` or `'group.token'`), never a list. Lists were rejected because the hardest target dominates the result anyway, and lists add solve cost. To cover several backdrops, point `on` at the hardest one. |
| Oct 12, 2026 | **`seeds` renamed to `palette`** (singular). Each key is a named palette color (`palette: { neutral: '#64748b', brand: { color: '#4f46e5', exact: true }, danger: '#dc2626' }`). "Seed" terminology is replaced throughout (`PaletteColor`, `color-out-of-gamut`, per-theme `palette` deltas). Swap class stays `tint-<name>`. |
| Oct 12, 2026 | **Color space:** internal math is always OKLCH (not configurable). New `output.format: 'oklch' \| 'hex' \| 'rgb'` (default `'oklch'`). No gamut option for now; P3 stays a later item. |
| Oct 12, 2026 | **State grammar (§4).** At most one persistent state (`selected` or `checked`), then optional `disabled`, then optional one temporary state (`hover`, `pressed`, or `focus`). `disabled` does not combine with a temporary state. `active` normalizes to `pressed`. `checked` is emphasis and border only. The canonical strings are `CANONICAL_STATES`. |
| Oct 12, 2026 | **`nudge?: boolean`** is a `TokenOptions` field (§2.4). §6.4 already consumes `nudge: false` on emphasis tokens; the field is accepted on every kind. |
| Oct 12, 2026 | **`light-hc` sets `mode: "light"`.** §2.3 requires `mode`; the §8 example had dropped it. |
| Oct 12, 2026 | **`output.prefix`.** Optional CSS identifier. When set, every custom property is `--<prefix>-…`, including aliases. `@theme` `var()` references follow. `tint-<palette>` utility names do not. Default is no prefix. |
| Oct 13, 2026 | **Tint step is mode-aware (§4).** Emphasis 1–2, state steps on those tints, and non-surface `step` overrides use 0.025 OKLCH L in light and 0.0375 in dark. Dark is `0.025 × (0.03 / 0.02)`, the surface dark/light ratio, so a tint stays 1.25 surface steps in both modes. Light output is unchanged. `states.emphasis.step: { light, dark }` overrides it the same way `states.surface.step` overrides a surface step. |
