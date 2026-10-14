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
surface(scale, options?)
text(scale, options?)
border(scale, options?)
emphasis(scale, options?)
decorative(scale, options?)   // only option is `on`

disabled.surface(scale, options?)
disabled.text(scale, options?)
disabled.border(scale, options?)
disabled.emphasis(scale, options?)

type TokenOptions = {
  on?: string;                                  // one backdrop: "group" or "group.token"; §6.2
  chroma?: number;                              // palette-chroma multiplier, 0..2 (default 1). Not on decorative.
  hue?: number | `+${number}` | `-${number}`;   // absolute hue or shift. Not on decorative.
  nudge?: boolean;                              // false disables auto-nudge (§6.4). Not on decorative.
  lc?: number;                                  // raw APCA target. Not on decorative.
  ratio?: number;                               // raw WCAG ratio. Not on decorative.
};
```

`text`, `border`, and `emphasis` are contrast scales. `decorative` is its own lightness kind. `surface` is a signed lightness scale. There are no level names on these functions. Hover and pressed are other tokens with other numbers.

- **`surface(n)`** steps OKLCH lightness from an anchor. With no `on`, the anchor is the theme lightness. `mode: "light"` is lightness 97. `mode: "dark"` is lightness 18. An explicit `lightness` replaces that shorthand. 50 and above is light; below 50 is dark. `surface(0)` is that anchor. Positive is raised (lighter). Negative is sunken (darker). One step is 0.02 in light and 0.03 in dark. Decimals are real steps. The range −10..10 is closed: outside it is an error.
- **Ordering.** Lightness is `clamp(anchor + n × step, 0, 1)` in both modes. Positive steps stay at or above the anchor. Negative steps stay at or below it. A raised step cannot cross a sunken step. A step that would pass white or black clamps to that edge and warns `surface-no-headroom`. Landing exactly on white or black does not warn. At lightness 97, `surface(1)` is L 0.99, `surface(1.5)` is white, and `surface(2)` clamps to white and warns. At lightness 18, steps −1 through 5 all fit. At lightness 100 a positive step clamps onto the page. At lightness 0 a negative step clamps onto the page, because black has no darker neighbor.
- **`surface.DEFAULT`** is an ordinary step, and it is the painted page. Text, border, emphasis, and decorative with no `on` solve against it. Other surfaces stay on the theme anchor, so `surface.DEFAULT: surface(1)` moves the page and leaves `surface(0)` at lightness 97 or 18.
- **`on` on a surface.** `surface(n, { on: "panel" })` steps from `panel.DEFAULT`'s resolved lightness. `surface(n, { on: "panel.raised" })` steps from that token. That is how a card nests on another card. A cycle (`a` on `b` on `a`) is an error.
- **`emphasis(n)`** is one contrast curve. `emphasis(0)` clears WCAG 3:1. The APCA anchors are the Lc values that first clear that ratio on the mode page: Lc 53.7 in light, Lc 22 in dark. WCAG `emphasis(0)` is 3:1. `emphasis(10)` is Lc 90 in light, Lc 100 in dark, and WCAG 7:1. One step is +3.63 Lc in light, +7.8 Lc in dark, or ×(7/3)^0.1 on the ratio.
- **`text(n)`.** `text(0)` is APCA Lc 45 and WCAG 3:1. `text(5)` is body text (Lc 75, WCAG 4.5:1). `text(10)` is the top. Scales below 5 are muted. They are not a body-text failure.
- **`border(n)`.** APCA is `15 + 6n`. WCAG is `1.5 × (2^0.2)^n`. `border(5)` is the WCAG non-text 3:1 rung. Every border scale is a contrast target.
- **Open contrast scales.** `emphasis`, `text`, and `border` outside 0..10 are kept and warn `scale-out-of-range`. They are not errors.
- **`decorative(n)`** steps OKLCH lightness away from its backdrop by `n × 0.04` in both modes. The backdrop is `on`, or `surface.DEFAULT` when `on` is omitted. Positive is more distinct: darker on a light backdrop, lighter on a dark one. Negative goes the other way. The result clamps at black and white. There is no contrast check. The one sanity warning is `decorative-indistinguishable`, when the color is the same hex as its backdrop. The range −10..10 is closed. The only option is `on`.
- **`disabled.emphasis(n)`**, **`disabled.text(n)`**, **`disabled.surface(n)`**, and **`disabled.border(n)`** solve that kind at `n`, then mute it: chroma ×0.3, and lightness moves toward the backdrop by at most 0.06 and by at most a quarter of the gap. The result is a solid color. Disabled tokens are not contrast-linted. There is no `disabled.decorative`.
- **`nudge: false`** disables the label auto-nudge (§6.4) for that token.
- **Returned data** (and the JSON form): `{ "kind": "surface", "scale": 1, "on": "panel" }`.
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

Aliases merge with the built-in ordinal names. `$replace: true` drops those names, including the universal `default` alias. Ordinals `1`–`5`, including the strings `"1"`–`"5"`, still resolve. Omitting `level` is still ordinal 3, even when `default` was removed or pointed at another ordinal. The token functions in §2.4 do not take those names.

---

## 3. Scales

The token functions in §2.4 take a number. These are the stops that define each curve. Decimals sit on the same line.

| Kind | Scale | What `n` means |
| --- | --- | --- |
| `surface` | −10..10, closed | Signed OKLCH L from the theme lightness, or from `on`. 0 is that anchor. Positive stays at or above it and clamps at white. Negative stays at or below it and clamps at black. Step 0.02 light, 0.03 dark. |
| `text` | 0..10, open | Contrast. 0 is Lc 45 / WCAG 3:1. 5 is body (Lc 75 / 4.5:1). 10 is the top. Below 5 warns only as muted text, not as a missed body target. |
| `border` | 0..10, open | Contrast. APCA `15 + 6n`. WCAG `1.5 × (2^0.2)^n`. 5 is the non-text 3:1 rung. |
| `emphasis` | 0..10, open | Contrast. 0 is WCAG 3:1 (APCA Lc 53.7 light, Lc 22 dark). 10 is Lc 90/100 and WCAG 7:1. |
| `decorative` | −10..10, closed | OKLCH L away from the backdrop, 0.04 per step, both modes. No contrast check. |

`surface.DEFAULT` is the painted page. It is whatever step you assign, including `surface(0)`. A contrast token or `decorative(n)` with no `on` uses that page. A surface with no `on` does not: it keeps the theme-lightness anchor.

---

## 4. States

The token functions in §2.4 do not take state names. Hover and pressed are other tokens with other numbers. `disabled.<kind>(n)` mutes a solved color. The table below is the earlier interaction model.

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

## 5. Contrast targets

Measured against the token's backdrop (§6.2). `surface` and `decorative` are not in these tables. They are lightness steps (§3).

### 5.1 APCA (|Lc|)

`text(n) = 45 + 6n`. `border(n) = 15 + 6n`. `emphasis(n)` is a straight line from the mode floor to the mode top: Lc 53.7 → 90 in light (3.63 per step), Lc 22 → 100 in dark (7.8 per step).

| Scale | text | border | emphasis, light | emphasis, dark |
| --- | --- | --- | --- | --- |
| 0 | 45 | 15 | 53.7 | 22 |
| 5 | 75 | 45 | 71.85 | 61 |
| 10 | 105 | 75 | 90 | 100 |

APCA references: Lc 15 non-text minimum · 30 spot/incidental · 45 large text/UI · 60 content text · 75 body text · 90 preferred body.

### 5.2 WCAG 2 (contrast ratio)

`text(n) = 4.5 × (4.5/3)^((n−5)/5)` (3:1 at 0, 4.5:1 at 5, 6.75:1 at 10). `border(n) = 1.5 × (2^0.2)^n` (1.5:1 at 0, 3:1 at 5, 6:1 at 10). `emphasis(n) = 3 × (7/3)^(n/10)` (3:1 at 0, 7:1 at 10).

| Scale | text | border | emphasis |
| --- | --- | --- | --- |
| 0 | 3:1 | 1.5:1 | 3:1 |
| 5 | **4.5:1** (AA body) | 3:1 | ~4.58:1 |
| 10 | 6.75:1 | 6:1 | 7:1 |

`emphasis(0)` meets WCAG 1.4.11 against its surface. Its label still has to reach its own text target against the fill, and auto-nudge (§6.4) enforces that.

Notes:
- Scales outside 0..10 stay on the same curve and warn `scale-out-of-range`.
- `text` below 5 is muted. It is not a body-text failure.
- `border(5)` is the non-text 3:1 rung. A lower border is still a contrast target. It is not exempt.
- `lc` / `ratio` replace the curve for that token.

---

## 6. Resolution rules

### 6.1 Pipeline
`validate → normalize (names → ordinals, presets, levels) → expand per theme × palette color (apply theme palette deltas, then `tune`) → build backdrop graph → topological solve → nudge pass (§6.4) → diagnostics → outputs`.

**Normalized token.** Normalization resolves names and does not throw. A token becomes `{ kind, ordinal, states, ...options }`. `ordinal` is 1–5 (§3): names, the universal `default` alias, and the strings `"1"`–`"5"` are resolved, and an omitted `level` is ordinal 3. `states` is the canonical atoms from §4 (`[]` at rest). The other `TokenOptions`, including `nudge`, are copied. `level` and `state` are not kept. An unknown level name or state string is an issue `{ path, message, didYouMean? }`. Preset renames (§9) are a separate step and are not applied here.

### 6.2 `on` (backdrop)
| Form | Backdrop set |
| --- | --- |
| omitted, kind ≠ surface | the painted page: the first surface group's `DEFAULT` when that token is a surface, otherwise the theme-lightness anchor |
| omitted, kind = surface | the theme-lightness anchor (97 in light, 18 in dark), stepped by `n` |
| `'group'` | `group.DEFAULT`. A surface steps from that token's resolved lightness |
| `'group.token'` | that token. A surface steps from that token's resolved lightness |

A **disabled** token's backdrop is the disabled state of its `on` target when one exists (e.g. a disabled label sits on a disabled fill).

The solver picks the polarity that maximizes the **minimum** contrast across the set, then solves the lightness to reach the target against the worst member. If the target is unreachable on that side it tries the opposite side (unless `direction` is set), keeps the best result, and emits `contrast-unreachable`.

A surface with `on` steps from that surface's resolved lightness, not from the theme anchor: `surface(1, { on: 'panel' })`. Cycles are reported as `Backdrop cycle: a.DEFAULT → b.DEFAULT → a.DEFAULT.`

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
| `surface-no-headroom` | warn | a surface step is past white or black and was clamped to that edge |
| `scale-out-of-range` | warn | an emphasis, text, or border scale is outside 0..10 |
| `decorative-indistinguishable` | warn | a decorative color is the same hex as its backdrop |

Disabled tokens are never contrast-linted. `decorative(n)` is not contrast-checked. A low border scale is still a contrast target.

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
| `$decorative: true` | removed. Use `decorative(n)`, a lightness step away from its backdrop |
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
