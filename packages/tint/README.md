# @skylerknight/tint

tint turns a few palette colors and one token template into a full color palette
for every theme. Each token says what it is (its kind) and how prominent it should
be (its level). tint solves the color against the surface it sits on, then repeats
that template for every palette color. The same button markup becomes a danger
button when an ancestor has the class `tint-danger`.

This is **4.0.0-alpha.0**. The config below is the v4 API. Install the alpha with
the `next` dist-tag. A v3 config fails validation. The
[migration guide](../../docs/migration-v4.md) maps the old keys onto this one.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Kinds, levels, and states](#kinds-levels-and-states)
- [Backdrops (`on`)](#backdrops-on)
- [Palette, themes, and contrast](#palette-themes-and-contrast)
- [`exact` and lints](#exact-and-lints)
- [Output](#output)
- [JSON config](#json-config)
- [CLI](#cli)
- [Vite and PostCSS](#vite-and-postcss)
- [Programmatic API](#programmatic-api)

The normative write-up is [docs/v4-spec.md](../../docs/v4-spec.md). The quick start
is the runnable copy in [examples/v4-spec](../../examples/v4-spec).

## Install

```bash
pnpm add -D @skylerknight/tint@next
# or
npm install -D @skylerknight/tint@next
```

Loading a TypeScript config (`tint.config.ts`) needs `esbuild`, an optional peer:

```bash
pnpm add -D esbuild
```

CI for this repo runs on Node 20 and Node 22. The `vite` and `postcss` peers are
optional and only needed for the plugins.

## Quick start

`tint.config.ts`, the same file as `examples/v4-spec/tint.config.ts`:

```ts example
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
    // `.light-hc` is its own selector. extends would otherwise copy `.light`
    // and a second unconditional `.light` block would replace the light theme.
    "light-hc": {
      mode: "light",
      extends: "light",
      selector: ".light-hc",
      media: "(prefers-contrast: more)",
      contrast: { level: "more" },
    },
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

`defineConfig` returns the object unchanged and keeps the literal names.
`generate`, `assertConfig`, `validateConfig`, the CLI, and the plugins validate.

`tint build` (or `@tint` in CSS) writes one file set per theme. The light theme's
neutral palette starts like this. Colors are OKLCH, which is the default notation:

```css check
  /* neutral palette */
  --neutral-surface-sunken: oklch(95.00% 0.0138 285.94);
  --neutral-surface: oklch(97.00% 0.0138 285.94);
  --neutral-surface-raised: oklch(99.00% 0.0049 285.94);
  --neutral-surface-floating: oklch(100.00% 0.0000 285.94);
  --neutral-action: oklch(57.81% 0.0138 285.94);
  --neutral-action-hover: oklch(53.31% 0.0138 285.94);
  --neutral-action-pressed: oklch(48.60% 0.0138 285.94);
  --neutral-action-disabled: oklch(86.92% 0.0041 285.94);
  --neutral-action-on: oklch(100.00% 0.0000 285.94);
  --neutral-action-on-disabled: oklch(76.93% 0.0041 285.94);
```

That template is repeated for `brand`, `danger`, and `warning`: 29 tokens × 4
palette colors = 116 variables in each of the three themes. `neutral` is the
default palette, so it also gets an unprefixed alias layer (`--action` points at
`--neutral-action`). `tint-brand` re-points those aliases.

With `output.format: "hex"` the same neutral button tokens are:

```css check hex
  --neutral-action: #797982;
  --neutral-action-hover: #6c6c75;
  --neutral-action-pressed: #5e5e67;
  --neutral-action-disabled: #d3d3d7;
  --neutral-action-on: #ffffff;
  --neutral-action-on-disabled: #b3b4b6;
```

On the light theme, `brand` has `exact: true`, so the resting action fill is the
palette color you passed (`#7c3aed`). Hover and pressed are derived from that
fill. Dark and `light-hc` reject that snap and keep the solved color; see
[`exact` and lints](#exact-and-lints). `tint check --strict` exits 1 on this
config because of those two warnings.

### Markup

Tailwind v4 classes for the quick start. Groups named `text` and `border` also
get shortcut utilities (`text-strong`, `border-firm`). `DEFAULT` becomes
`text-default` and `border-default`. Other groups are ordinary color utilities
(`bg-action`, `bg-surface-raised`).

| UI | Classes |
| --- | --- |
| Page, card, popover, well | `bg-surface`, `bg-surface-raised`, `bg-surface-floating`, `bg-surface-sunken` |
| Primary button | `bg-action hover:bg-action-hover active:bg-action-pressed disabled:bg-action-disabled text-action-on disabled:text-action-on-disabled` |
| Soft button | `bg-soft hover:bg-soft-hover active:bg-soft-pressed text-soft-on` |
| Text | `text-default`, `text-strong`, `text-muted`, `text-faint`, `text-disabled`, `text-link` |
| Borders | `border-hairline`, `border-default`, `border-firm`, `focus-visible:outline-2 focus-visible:outline-border-focus` |
| List row | `bg-row hover:bg-row-hover aria-selected:bg-row-selected aria-selected:hover:bg-row-selected-hover text-row-on` |
| Danger button | `<button class="tint-danger bg-action hover:bg-action-hover text-action-on">Delete</button>` |
| Brand section | `<section class="tint-brand">…</section>` re-skins every unprefixed class inside it |
| Theme | `<html class="dark">` or `<html class="light-hc">`, or leave the class off and follow the OS |

`examples/vite-playground` is the same idea with a named `text.body` token, so
its body class is `text-body`.

## Kinds, levels, and states

Four kind functions return JSON. A JSON config that writes the same objects is
equivalent. `level` may be an ordinal `1`–`5`, a name, or omitted (ordinal 3).
Pass options alone when there is no level: `emphasis({ state: "hover" })`.

| Ordinal | `surface` elevation | `text` legibility | `border` definition | `emphasis` prominence |
| --- | --- | --- | --- | --- |
| 1 | `sunken` | `faint` | `hairline` | `quiet` |
| 2 | `flat` | `muted` | `soft` | `subtle` |
| 3 | `base` (default) | `body` (default) | `default` | `default` |
| 4 | `raised` | `strong` | `firm` | `bold` |
| 5 | `floating` | `max` | `heavy` | `loud` |

`default` is an alias of ordinal 3 on every kind. Surface levels are elevation:
higher sits closer to the light in both modes. `base` is the page, `sunken` and
`flat` sit below it (wells, sidebars), `raised` and `floating` sit above it
(cards, popovers). Emphasis levels 1–2 are tinted surfaces (a soft button).
Levels 3–5 are solid fills.

```ts
import { defineConfig, emphasis, generate, surface, text } from "@skylerknight/tint";

generate(
  defineConfig({
    palette: { neutral: "#71717a", brand: "#7c3aed" },
    levels: {
      text: { secondary: 2, tertiary: 1 },
      emphasis: { primary: 3, $replace: true },
    },
    tokens: {
      surface: { DEFAULT: surface(), raised: surface("raised") },
      text: { secondary: text("secondary"), body: text() },
      action: {
        DEFAULT: emphasis("primary"),
        hover: emphasis("primary", { state: "hover" }),
        on: text({ on: "action" }),
      },
    },
  }),
);
```

Aliases merge with the table. `$replace: true` drops the built-in names for that
kind, including `default`. Ordinals `1`–`5` still resolve. Omitting `level` is
still ordinal 3.

States are interactions layered on a rest token. They are participles, never
level names. `active` is an alias of `pressed` and is stored as `pressed`.

| State | Applies to | Default step from the rest token |
| --- | --- | --- |
| `hover` | all | +1 step |
| `pressed` (`active`) | all | +2 steps |
| `focus` | all | +1 step |
| `selected` | all four kinds | +2 steps, chroma ×1.5 |
| `checked` | emphasis, border | at least the solid `default` level |
| `disabled` | all | low contrast, chroma ×0.3. Never contrast-linted |

Compound states join with `-`, persistent state first, then `disabled`, then one
temporary state: `selected-hover`, `checked-disabled`. `disabled-hover` and
`hover-selected` are rejected. `didYouMean` carries the legal spelling when
there is one (`hovver` → `hover`, `hover-selected` → `selected-hover`).

Emphasis levels 1–2 step by 0.025 OKLCH L in light mode and 0.0375 in dark
mode (the light step times the surface dark/light ratio, so one tint stays
1.25 surface steps). `states.emphasis.step` overrides that size the same way
`states.surface.step` overrides a surface step. The tint size also applies to
a non-surface `step` override.

```ts
import { defineConfig, emphasis, generate, surface } from "@skylerknight/tint";

generate(
  defineConfig({
    palette: { neutral: "#71717a" },
    states: {
      emphasis: { hover: 1, pressed: 3, step: { dark: 0.04 } },
      surface: { step: { light: 0.02, dark: 0.035 } },
    },
    tokens: {
      surface: { DEFAULT: surface() },
      action: {
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        "selected-hover": emphasis({ state: "selected-hover" }),
      },
    },
  }),
);
```

A state token follows the rest token in the same group with the same kind and
level. If you only write the state, tint still solves a rest token and names it
in diagnostics.

## Backdrops (`on`)

`on` is one backdrop: `"group"` or `"group.token"`. It is never a list.

| Form | What the token is solved against |
| --- | --- |
| omitted, kind is not surface | The base surface: `<first surface group>.DEFAULT`, else the first surface at ordinal 3, else the page |
| omitted, kind is surface | The page, stepped by elevation |
| `"group"` | `group.DEFAULT` plus that token's states, except `disabled` |
| `"group.token"` | That token plus its states, except `disabled` |

A disabled token sits on the disabled state of its backdrop when that state
exists. `text({ on: "action", state: "disabled" })` is the label on a disabled
button.

tint picks the side that maximizes the minimum contrast across that set, then
solves lightness against the worst member. `direction: "lighter"` or `"darker"`
locks the side. Surfaces with `on` step from that surface: `surface("raised", { on: "panel" })`.

Labels on an emphasis fill are checked after the solve. If the label misses its
target, tint walks that fill (and its states) away from its own backdrop until
the label passes and the fill still meets its own target, up to two levels. The
move is an `emphasis-nudged` info diagnostic. `nudge: false` on the emphasis
token keeps the un-nudged color. If the label still misses, the diagnostic is
`label-unreachable`.

```ts
import { defineConfig, emphasis, generate, text } from "@skylerknight/tint";

generate(
  defineConfig({
    palette: { neutral: "#71717a", brand: "#7c3aed" },
    tokens: {
      surface: { DEFAULT: { kind: "surface" } },
      action: {
        DEFAULT: emphasis({ nudge: false }),
        hover: emphasis({ state: "hover" }),
        on: text({ on: "action", contrast: "+1" }),
      },
    },
  }),
);
```

`contrast: "+1"` | `"-1"` | `"+2"` | `"-2"` shifts that token's level before the
target lookup. `chroma` (0..2, default 1) multiplies the palette color's chroma.
`hue` is an absolute hue or a `"+12"` / `"-12"` shift.

## Palette, themes, and contrast

`palette` needs at least one color. A string is shorthand for `{ color }`. The
first entry is the default (unprefixed) palette unless some entry sets
`default: true`. Names must be CSS identifiers.

`tune` overrides tokens for that palette color before solving, so states and
labels follow. `'action'` means `action.DEFAULT`, `'action.hover'` is one token,
and `'action.*'` is the whole group. A kind call replaces the token
(`emphasis("bold")`). A partial options object merges (`{ chroma: 0.5 }`).

```ts
import { defineConfig, emphasis, generate } from "@skylerknight/tint";

generate(
  defineConfig({
    palette: {
      neutral: "#71717a",
      brand: { color: "#7c3aed", exact: true },
      warning: { color: "#d97706", tune: { action: emphasis("bold"), "action.hover": { chroma: 0.8 } } },
    },
    tokens: {
      surface: { DEFAULT: { kind: "surface" } },
      action: { DEFAULT: emphasis(), hover: emphasis({ state: "hover" }) },
    },
  }),
);
```

Themes default to `{ light: { mode: "light" } }` when `themes` is omitted.

| Key | Role |
| --- | --- |
| `mode` | `"light"` or `"dark"`. Required unless `extends` supplies it |
| `selector` | Manual block. Default `:root` |
| `media` | `true` follows `prefers-color-scheme` for `mode`. A string is the query, such as `"(prefers-contrast: more)"` |
| `contrast.level` | Per-theme shift. This is how a high-contrast theme is derived |
| `palette` | Per-theme color deltas. A string replaces `color` |
| `extends` | Copies another theme, then applies the keys you set |

CSS scoping:

- Selector only → `selector { … }`
- Media only, selector `:root` → `@media { :root { … } }`
- Both → the manual class, then an automatic media block

When several themes are formatted together, each automatic block excludes the
other themes' class selectors, so a class can override the OS preference. The
quick start emits:

```css check
@media (prefers-color-scheme: light) {
  :root:not(.dark):not(.light-hc) {
```

```css check
@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.light-hc) {
```

```css check
@media (prefers-contrast: more) {
  :root:not(.light):not(.dark) {
```

`light-hc` sets `selector: ".light-hc"`. `extends: "light"` would otherwise copy
`.light`, and a second unconditional `.light` block would replace the light theme.

### Contrast

`contrast.algorithm` chooses the target table. `contrast.level` shifts every
contrast-targeted ordinal by 0 (`standard`), +1 (`more`), or +2 (`max`), capped
at 5. A theme's `contrast.level` overrides the global level and does not change
the algorithm.

Targets are measured against the worst backdrop. APCA values are |Lc|. WCAG 2
values are contrast ratios.

| Ordinal | APCA text | APCA border | APCA emphasis | WCAG 2 text | WCAG 2 border | WCAG 2 emphasis |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 45 | 15 | tint, no Lc target | 3:1 | 1.5:1 | tint |
| 2 | 60 | 30 | tint, no Lc target | 3.5:1 | 2:1 | tint |
| 3 | 75 | 45 | 60 | 4.5:1 (AA body) | 3:1 | 3:1 |
| 4 | 90 | 60 | 75 | 7:1 (AAA) | 4.5:1 | 4.5:1 |
| 5 | max | 75 | 90 | max | 7:1 | 7:1 |

APCA reference points: Lc 15 non-text minimum, 30 spot text, 45 large text, 60
content text, 75 body text, 90 preferred body. WCAG 2 emphasis 3 at 3:1 meets
1.4.11 against the surface. The label on that fill still has to reach its own
text target (4.5:1 for `body` under WCAG 2).

Surfaces are signed lightness steps from the theme lightness (97 in light, 18 in
dark). They are not contrast-targeted. `surface.DEFAULT` is the painted page.
`decorative(n)` steps 0.04 OKLCH lightness away from its backdrop and is not
contrast-checked. `border` is a 0–10 contrast scale. `text` below 5 is muted,
not a body-text failure. `emphasis(0)` is WCAG 3:1.

`lc` (APCA) and `ratio` (WCAG 2) skip the table. They are expert values and emit
an `expert-value` info diagnostic. `step` is the surface escape hatch for the
same lint. `lc` is only valid with `algorithm: "apca"`, and `ratio` only with
`"wcag2"`.

```ts
import { border, defineConfig, generate, text } from "@skylerknight/tint";

generate(
  defineConfig({
    contrast: { algorithm: "wcag2", level: "more" },
    palette: { neutral: "#71717a", brand: "#7c3aed" },
    tokens: {
      surface: { DEFAULT: { kind: "surface", level: "base" } },
      text: { DEFAULT: text(), strong: text("strong") },
      border: { firm: border("firm", { direction: "darker" }) },
    },
  }),
);
```

## `exact` and lints

`exact: true` snaps the first emphasis rest token (in the quick start,
`action.DEFAULT`) to the palette `color` after solving, and re-derives its
states from that color. `exact: "action.hover"` names a different token. The
snap is kept only when the fill still meets its target against its backdrop and
every dependent label still passes. Otherwise tint emits `exact-rejected` and
keeps the solved color.

In the quick start, light accepts `brand: #7c3aed`. Dark (the theme delta
`#a78bfa`) and `light-hc` (contrast level `more`) reject it:

`dark warning exact-rejected brand.action.DEFAULT`

`light-hc warning exact-rejected brand.action.DEFAULT`

Engine diagnostics live on `result.diagnostics`. Each one has `severity`,
`code`, `path`, `message`, `hint`, `theme`, and `palette`.

| Code | Severity | When |
| --- | --- | --- |
| `contrast-unreachable` | warning | The target is not achievable against the worst backdrop |
| `label-unreachable` | warning | Auto-nudge could not make a label pass |
| `emphasis-nudged` | info | An emphasis token moved so its label could pass |
| `exact-rejected` | warning | `exact` failed its pairs |
| `duplicate-token` | info | Two tokens solve to the same color in every theme and palette color |
| `hue-identity-lost` | info | The solved color drifted far from the palette color's lightness |
| `expert-value` | info | `lc`, `ratio`, or `step` was set |
| `color-out-of-gamut` | warning | A palette color was outside sRGB and was mapped |

Disabled tokens are never contrast-linted. `decorative(n)` is not contrast-checked. `tint check`
prints warnings and exits 0. `--strict` exits 1 when any warning was printed.
Info diagnostics are not warnings.

`name-conflict` is a config error. A token whose shortcut would replace a
Tailwind utility (`text-lg`, `border-x`) is rejected. The issue `code` is
`"name-conflict"`.

```ts
import { ConfigError, defineConfig, generate, text } from "@skylerknight/tint";

try {
  generate(
    defineConfig({
      palette: { neutral: "#71717a" },
      tokens: {
        surface: { DEFAULT: { kind: "surface" } },
        text: { lg: text() },
      },
    }),
  );
  throw new Error("expected a name-conflict");
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  const issue = error.issues.find((item) => item.code === "name-conflict");
  if (issue === undefined) throw new Error("expected code name-conflict");
}
```

Unknown level names and illegal states are also `ConfigError` issues. They carry
`path`, `message`, and `didYouMean` when a legal spelling is close. A level typo
that is really a state points at the state form:

```ts
import { ConfigError, generate, surface } from "@skylerknight/tint";

try {
  generate({
    palette: { neutral: "#71717a" },
    tokens: { row: { selected: surface("selcted") } },
  });
  throw new Error("expected a level error");
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  const issue = error.issues[0];
  if (issue?.didYouMean !== "selected") throw new Error(issue?.message ?? "missing issue");
}
```

v3 keys fail with `code: "v3-config"` and a hint that names the v4 replacement.
`formatConfigIssues` prints the repair text.

## Output

`output` on the config is what `tint build` and the plugins pass to the
formatters:

| Key | Default | Effect |
| --- | --- | --- |
| `path` | `"./tint"` | Directory for `tint build` |
| `formats` | `["css"]` | `css`, `tailwind`, `dtcg`, `flat` |
| `format` | `"oklch"` | Emitted notation: `oklch`, `hex`, or `rgb`. Internal math stays OKLCH |
| `prefix` | none | CSS identifier prepended to every custom property |

`prefix: "tint"` writes `--tint-brand-action-hover` and the alias
`--tint-action-hover`. `@theme` `var()` references use the prefix. The swap
class stays `tint-brand`. DTCG paths and flat keys are not prefixed.

```css check prefix
  --tint-brand-action: #7c3aed;
  --tint-brand-action-hover: #6e22da;
  --tint-brand-action-pressed: #5c00bf;
  --tint-brand-action-disabled: #d6cdff;
  --tint-brand-action-on: #ffffff;
```

```css check prefix
  --tint-action: var(--tint-neutral-action);
  --tint-action-hover: var(--tint-neutral-action-hover);
```

Pass `format` and `prefix` when you call `toCSS` yourself. The CLI and the
plugins apply `config.output` for you.

### CSS

`toCSS(result | result[], options?)` emits one scoped block per theme, plus the
alias layer for the default palette. `DEFAULT` is dropped from the variable
name (`--neutral-action`, not `--neutral-action-DEFAULT`). Options: `format`,
`indent`, `comments`, `selector`, `aliases`, `prefix`.

### Tailwind

`toTailwind` emits `@theme static`, `@utility tint-<palette>` for every
non-default palette color, and shortcut utilities for groups whose names are
Tailwind prefixes (`text`, `border`, `bg`, `ring`, and the rest of
`TAILWIND_UTILITY_PREFIXES`). `toCSSWithTailwind` is the CSS variables followed
by that block. It is what `@tint` expands to.

```css check
@theme static {
  --color-surface-sunken: var(--surface-sunken);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-floating: var(--surface-floating);
  --color-action: var(--action);
  --color-action-hover: var(--action-hover);
```

```css check
@utility text-default {
  color: var(--text);
}
```

```css check
@utility tint-brand {
  --surface-sunken: var(--brand-surface-sunken);
  --color-surface-sunken: var(--brand-surface-sunken);
```

`assertConsistentStructure` throws when two themes or palette colors disagree
about the authored token list, because one `@theme` block serves every theme.
`tintUtilities: false` omits the `tint-*` utilities. `shortcuts: false` omits
`text-strong` and `border-firm`.

### DTCG

`toDTCG(result)` is one Design Tokens Community Group document per theme.
`toDTCGJSON(result)` stringifies it. `DEFAULT` is the group's `$root`. `on` in
the extension is the resolved backdrop id list. `output.format` does not change
this object. On the light theme, brand's resting action is the exact palette
color:

```json check dtcg
"$root": {
        "$type": "color",
        "$value": {
          "colorSpace": "oklch",
          "components": [
            0.5413370851180865,
            0.24658592413900496,
            293.0089677307044
          ],
          "hex": "#7c3aed"
        },
        "$description": "emphasis level 3, on surface.DEFAULT",
        "$extensions": {
          "dev.tint": {
            "kind": "emphasis",
            "level": 3,
            "on": [
              "surface.DEFAULT"
            ],
            "algorithm": "apca",
            "achieved": 69.46082053137368,
            "target": 60
          }
        }
      },
```

### Flat

`toFlat(result, { format })` is a one-level map. `toFlatJSON` stringifies it.
`DEFAULT` is dropped (`neutral.action`, not `neutral.action.DEFAULT`). Values
follow `format` (`oklch` by default).

```json check flat
  "neutral.surface.sunken": "oklch(92.00% 0.0138 285.94)",
  "neutral.surface": "oklch(96.00% 0.0138 285.94)",
  "neutral.surface.raised": "oklch(98.00% 0.0098 285.94)",
  "neutral.surface.floating": "oklch(100.00% 0.0000 285.94)",
  "neutral.action": "oklch(57.81% 0.0138 285.94)",
  "neutral.action.hover": "oklch(53.31% 0.0138 285.94)",
```

```json check flat-hex
  "neutral.surface.sunken": "#e3e3ee",
  "neutral.surface": "#f1f1fb",
  "neutral.surface.raised": "#f8f8ff",
  "neutral.surface.floating": "#ffffff",
  "neutral.action": "#797982",
  "neutral.action.hover": "#6c6c75",
```

### Files `tint build` writes

| Format | Path |
| --- | --- |
| `css` | `<out>/<theme>/tokens.css` |
| `tailwind` | `<out>/<theme>/tailwind.css` |
| `dtcg` | `<out>/<theme>/tokens.dtcg.json` |
| `flat` | `<out>/<theme>/tokens.flat.json` |

`--tailwind-tint` writes a single `<out>/tailwind.css` from `toCSSWithTailwind`
across every theme, and skips the per-theme Tailwind file.

## JSON config

Kind functions are a TypeScript convenience. The JSON form is the same data.
`$schema` points at the published v4 schema (also exported as
`@skylerknight/tint/schema/v4.json`):

```json config
{
  "$schema": "https://unpkg.com/@skylerknight/tint/schema/v4.json",
  "contrast": { "algorithm": "apca", "level": "standard" },
  "palette": {
    "neutral": "#71717a",
    "brand": { "color": "#7c3aed", "exact": true },
    "danger": "#dc2626"
  },
  "themes": {
    "light": { "mode": "light", "selector": ".light", "media": true },
    "dark": {
      "mode": "dark",
      "selector": ".dark",
      "media": true,
      "palette": { "brand": "#a78bfa" }
    }
  },
  "output": { "format": "oklch", "prefix": "tint", "formats": ["css", "tailwind", "dtcg", "flat"] },
  "tokens": {
    "surface": {
      "sunken": { "kind": "surface", "level": "sunken" },
      "DEFAULT": { "kind": "surface" },
      "raised": { "kind": "surface", "level": "raised" }
    },
    "action": {
      "DEFAULT": { "kind": "emphasis" },
      "hover": { "kind": "emphasis", "state": "hover" },
      "pressed": { "kind": "emphasis", "state": "pressed" },
      "on": { "kind": "text", "on": "action" }
    },
    "text": {
      "DEFAULT": { "kind": "text" },
      "strong": { "kind": "text", "level": "strong" },
      "muted": { "kind": "text", "level": "muted" }
    },
    "border": {
      "hairline": { "kind": "border", "level": "hairline" },
      "DEFAULT": { "kind": "border" },
      "firm": { "kind": "border", "level": "firm" }
    }
  }
}
```

The full document for the quick start is `examples/v4-spec/tint.config.json`.

## CLI

The binary is `tint`. A `.ts` config needs `esbuild`. There is no `tint migrate`
or `tint explain` command in this alpha; the mapping is the
[migration guide](../../docs/migration-v4.md).

```
tint build   [-c|--config <path>] [-o|--out <dir>] [-f|--formats css,tailwind,dtcg,flat]
             [--tailwind-tint] [--quiet]
tint check   [-c|--config <path>] [--strict]
tint inspect [-c|--config <path>] [--palette <name>] [--theme <name>] [--json]
tint init    [--dark] [--brand <hex>] [--yes]
tint --help | -h
tint --version | -v
```

| Command | Behavior |
| --- | --- |
| `build` | Writes the files in the table above. `--tailwind-tint` writes one combined `tailwind.css`. `--quiet` prints only errors |
| `check` | Validates and generates. Prints warnings. Exit 1 on a config error, or on any warning with `--strict` |
| `inspect` | Prints the contrast audit (level, state, target, achieved, backdrop, pass/warn/fail/n/a). `--json` prints the report. `--theme` and `--palette` filter |
| `init` | Writes `tint.config.ts` from the quick-start shape, without the high-contrast theme. `--dark` adds a dark theme. `--brand` sets the brand hex. `--yes` skips prompts |

Config lookup is `-c`, else the first of `tint.config.ts`, `tint.config.mts`,
`tint.config.js`, `tint.config.mjs`, `tint.config.json` in the current directory.
The output directory is `--out`, else `output.path`, else `./tint`. Formats are
`--formats`, else `output.formats`, else `css`. The name `json` is rejected: v3
`json` split into `dtcg` and `flat`.

```bash
tint check --strict
tint inspect --theme dark --palette brand
tint build -f css,dtcg,flat -o src/styles/tokens
tint build --tailwind-tint
```

## Vite and PostCSS

Both plugins replace `@tint "./tint.config.ts"` with `toCSSWithTailwind` and
honor `output.format` / `output.prefix` from the config. An option passed to the
plugin wins over the config.

Vite resolves the `@tint` path against the CSS file. PostCSS resolves it against
the plugin `root` option, which defaults to `process.cwd()`.

`vite.config.ts` from `examples/vite-playground`:

```ts vite-config
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tint } from "@skylerknight/tint/vite";

export default defineConfig({
  // tint() must run before tailwindcss() so the @tint directive is expanded first.
  plugins: [tint(), tailwindcss()],
});
```

```css
@import "tailwindcss";
@tint "../tint.config.ts";
```

```html
<section class="rounded-xl border border-default bg-surface-raised p-5">
  <h2 class="text-strong">Default palette</h2>
  <button class="bg-action text-action-on hover:bg-action-hover active:bg-action-pressed">
    Save
  </button>
</section>

<section class="tint-danger rounded-xl border border-default bg-surface-raised p-5">
  <h2 class="text-strong">Same markup, danger palette</h2>
  <button class="bg-action text-action-on hover:bg-action-hover">Delete</button>
</section>
```

Plugin options (`TintVitePluginOptions` / `TintPostCSSOptions`):

| Option | Default | Effect |
| --- | --- | --- |
| `format` | config, else `oklch` | `oklch`, `hex`, or `rgb` |
| `prefix` | config, else none | Custom-property prefix |
| `tintUtilities` | `true` | `tint-<palette>` utilities and the alias layer they need |
| `shortcuts` | `true` | `text-strong`, `border-firm`, and the other prefix shortcuts |
| `comments` | `true` | Palette comments in the CSS |
| `aliases` | `true` | Unprefixed alias layer |
| `indent` | two spaces | Indentation |
| `selector` | each theme's selector | Overrides the manual selector |
| `intellisense` | `true` (Vite only) | Write `node_modules/.tint/intellisense.css` |
| `root` | `process.cwd()` (PostCSS only) | Base directory for `@tint` paths |

The IntelliSense file is a static-hex `@theme` for the Tailwind CSS IntelliSense
extension, which cannot follow `var()`. Point the extension at it:

```json
{
  "tailwindCSS.experimental.configFile": "node_modules/.tint/intellisense.css"
}
```

PostCSS writes that file when `tintUtilities` is left on. Vite writes it when
`intellisense` is left on.

`postcss.config.mjs`:

```js
export default {
  plugins: {
    "@skylerknight/tint/postcss": {},
    "@tailwindcss/postcss": {},
  },
};
```

The same options as a function. `tint` is the named export and the default export:

```ts
import { tint } from "@skylerknight/tint/postcss";

export default {
  plugins: [tint({ root: process.cwd(), format: "oklch" })],
};
```

### `virtual:tint`

The Vite plugin exposes the generated themes. Plain `virtual:tint` is the first
config loaded through `@tint`. `virtual:tint/<path>` selects a config.

```ts
declare module "virtual:tint" {
  import type { GenerationResult } from "@skylerknight/tint";
  const themes: GenerationResult[];
  export default themes;
}
```

`GenerationResult` is the v4 result: `name`, `mode`, `selector`, `media`,
`algorithm`, `contrastLevel`, `palettes`, and `diagnostics`.

## Programmatic API

Everything here is a named export from `@skylerknight/tint`. The v3 config
types stay internal to the package.

```ts
import {
  ConfigError,
  assertConfig,
  audit,
  defineConfig,
  emphasis,
  formatAuditTable,
  generate,
  surface,
  text,
  toCSS,
  toCSSWithTailwind,
  toDTCG,
  toDTCGJSON,
  toFlat,
  toFlatJSON,
  toTailwind,
  validateConfig,
} from "@skylerknight/tint";

const config = defineConfig({
  contrast: { algorithm: "apca", level: "standard" },
  palette: {
    neutral: "#71717a",
    brand: { color: "#7c3aed", exact: true },
    danger: "#dc2626",
  },
  themes: {
    light: { mode: "light", selector: ".light", media: true },
  },
  output: {
    path: "./tint",
    formats: ["css", "tailwind", "dtcg", "flat"],
    format: "hex",
    prefix: "tint",
  },
  tokens: {
    surface: {
      sunken: surface("sunken"),
      DEFAULT: surface(),
      raised: surface("raised"),
    },
    action: {
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      on: text({ on: "action" }),
    },
    text: {
      DEFAULT: text(),
      strong: text("strong"),
      muted: text("muted"),
    },
    border: {
      DEFAULT: { kind: "border" },
      firm: { kind: "border", level: "firm" },
    },
  },
});

const validated = validateConfig(config);
if (!validated.ok) throw new ConfigError(validated.issues);

const themes = generate(assertConfig(config));
const light = themes[0];
if (light === undefined) throw new Error("expected the light theme");

toCSS(themes, { format: "hex", prefix: "tint" });
toTailwind(themes, { prefix: "tint", shortcuts: true, tintUtilities: true });
toCSSWithTailwind(themes);
toDTCG(light);
toDTCGJSON(light);
toFlat(light, { format: "hex" });
toFlatJSON(light);
formatAuditTable(audit(light));
```

`generate` always returns one `GenerationResult` per theme. `toDTCG`, `toFlat`,
and `audit` take a single theme. `toCSS`, `toTailwind`, and `toCSSWithTailwind`
take one theme or the array.

`audit` reports every solved token. Disabled tokens, surfaces, emphasis levels
1–2, and border levels 1–2 are `n/a`. A contrast token that missed its target is
`fail`. One that reached it while a warning names it is `warn`. The table
columns are token, hex, kind, level, state, target, achieved, backdrop, and
status.

`loadConfig({ root?, configPath })` returns `{ config, path, dependencies }`
for a `.ts`, `.mts`, `.js`, `.mjs`, `.cjs`, or `.json` file. A v3 document
throws `ConfigError`.

Color and contrast helpers used by the solver are exported too: `parseColor`,
`tryParseColor`, `rgbToHex`, `rgbToOKLCH`, `oklchToRGB`, `oklchToRGBGamut`,
`toGamut`, `formatOKLCH`, `isOKLCHInGamut`, `calcAPCA`, `calcAPCAabs`,
`calcAPCAraw`, `meetsContrast`, `APCA_THRESHOLDS`, `solveContrast`,
`maxContrast`, and `preferredPolarity`.

```ts
import {
  APCA_THRESHOLDS,
  calcAPCA,
  calcAPCAabs,
  calcAPCAraw,
  formatOKLCH,
  isOKLCHInGamut,
  maxContrast,
  meetsContrast,
  oklchToRGB,
  oklchToRGBGamut,
  parseColor,
  preferredPolarity,
  rgbToHex,
  rgbToOKLCH,
  solveContrast,
  toGamut,
  tryParseColor,
} from "@skylerknight/tint";

const black = parseColor("#000000");
const white = parseColor("#ffffff");
if (tryParseColor("not-a-color") !== null) throw new Error("expected null");

calcAPCA(black, white);
calcAPCAabs(black, white);
calcAPCAraw(black, white);
meetsContrast(black, white, APCA_THRESHOLDS.bodyTextMin);

const oklch = rgbToOKLCH(brandPurple());
rgbToHex(oklchToRGB(oklch));
oklchToRGBGamut(oklch);
formatOKLCH(toGamut(oklch));
isOKLCHInGamut(oklch);

const polarity = preferredPolarity(white);
solveContrast(oklch, white, 60, { polarity });
maxContrast(oklch, white, polarity);

function brandPurple() {
  return parseColor("#7c3aed");
}
```

## License

MIT
