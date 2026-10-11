# @skylerknight/tint

APCA-driven design-token color generator. You describe *how much contrast* each token
needs; tint finds the colors, for every seed color, in light and dark mode, and emits
CSS variables, Tailwind v4 `@theme` blocks, DTCG JSON, or a flat map.

```ts
// tint.config.ts
import { defineConfig } from "@skylerknight/tint";

export default defineConfig({
  name: "light",
  mode: "light",
  colors: { base: "#ffffff", brand: "#7c3aed", error: "#dc2626" },
  tokens: {
    surface: { DEFAULT: { ls: 0 }, raised: { ls: 2, $reference: true } },
    text: { $on: "surface", heading: { lc: 90 }, body: { lc: 75 } },
    action: { $on: "surface", DEFAULT: { lc: 60 } },
    on: { action: { lc: 60, $on: "action" } },
  },
});
```

```css
:root {
  /* base palette */
  --base-surface: #fafafa;
  --base-surface-raised: #ededed;
  --base-text-heading: #2b2b2b;
  --base-text-body: #555555;
  --base-action: #777777;
  --base-on-action: #e6e6e6;

  /* brand palette */
  --brand-surface: #faf9ff;
  --brand-surface-raised: #edeaff;
  --brand-text-heading: #30006a;
  --brand-text-body: #6712d1;
  --brand-action: #8a4cfe;
  --brand-on-action: #e7e2ff;

  /* error palette */
  --error-surface: #fff8f7;
  --error-surface-raised: #ffe6e3;
  --error-text-heading: #4b0002;
  --error-text-body: #9e000c;
  --error-action: #dc2526;
  --error-on-action: #ffded9;
}
```

Zero runtime dependencies. Node 18.17+. Tailwind integration requires Tailwind CSS v4.

## Contents

- [Why tint](#why-tint)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
- [Config reference](#config-reference)
- [Output reference](#output-reference)
- [Tailwind integration](#tailwind-integration)
- [Diagnostics](#diagnostics)
- [CLI reference](#cli-reference)
- [Programmatic API](#programmatic-api)
- [Migrating from v2](#migrating-from-v2)
- [FAQ](#faq)

Deeper material lives in the repo: [concepts](../../docs/concepts.md),
[recipes](../../docs/recipes.md), [architecture](../../docs/architecture.md).

## Why tint

**APCA instead of WCAG 2 ratios.** WCAG 2's contrast ratio is a luminance ratio that
treats `#767676` on white and white on `#767676` as the same 4.5:1. Human vision does not:
APCA (the Accessible Perceptual Contrast Algorithm, the candidate for WCAG 3) measures
them as Lc 71.6 and Lc 77.0 respectively, and it models spatial frequency, polarity and
the non-linear response to dark colors. Its output, Lc 0 to about 108, maps to concrete
use: Lc 45 is the floor for body text, Lc 60 is comfortable, Lc 75 is small text, Lc 90 is
a heading. tint treats those numbers as the specification. A token says `lc: 75` and tint
solves for the lightness that delivers it.

**Interchangeable palettes.** Every seed color gets the same token structure. `brand`,
`error` and `success` all produce `surface.*`, `text.*`, `action.*`, `on.*`, so a component
written against `bg-action text-on-action` becomes an error button by adding one class,
`tint-error`, with no per-component CSS. **Light and dark are one config** with a
different `mode`: the direction of contrast is derived from the mode and the reference
color, never authored.

## Install

```bash
pnpm add -D @skylerknight/tint
# or
npm install -D @skylerknight/tint
```

Loading a TypeScript config (`tint.config.ts`) through the CLI or a plugin needs
`esbuild`, an optional peer:

```bash
pnpm add -D esbuild
```

## Quick start

### Vite + Tailwind v4

```bash
pnpm add -D @skylerknight/tint esbuild tailwindcss @tailwindcss/vite
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tint } from "@skylerknight/tint/vite";

export default defineConfig({
  // tint() must run before tailwindcss() so the @tint directive is expanded first.
  plugins: [tint(), tailwindcss()],
});
```

`tint.config.ts` (an array gives you light and dark from one token structure):

```ts
import { defineConfig } from "@skylerknight/tint";

const tokens = {
  surface: {
    $role: "surface",
    well: { ls: 0 },
    DEFAULT: { ls: 1 },
    raised: { ls: 2, $reference: true },
    highlight: { ls: 4 },
  },
  text: {
    $on: "surface",
    $role: "text",
    heading: { lc: 90 },
    body: { lc: 75 },
    muted: { lc: 50 },
  },
  border: {
    $on: "surface",
    $role: "border",
    $decorative: true,
    DEFAULT: { lc: 25 },
    strong: { lc: 40 },
  },
  action: {
    $on: "surface",
    $role: "action",
    DEFAULT: { lc: 60, $reference: true },
    hover: { lc: 68 },
    soft: { ls: 3 },
  },
  on: {
    $role: "text",
    action: { lc: 60, $on: "action" },
    "action-soft": { lc: 75, $on: "action.soft" },
  },
  ring: { $on: "surface", $role: "border", DEFAULT: { lc: 65 } },
} as const;

export default defineConfig([
  {
    name: "light",
    mode: "light",
    colors: { base: "#ffffff", brand: "#7c3aed", error: "#dc2626" },
    tokens,
  },
  {
    name: "dark",
    mode: "dark",
    selector: ".dark",
    prefersColorScheme: "dark",
    colors: { base: "#1c1c1f", brand: "#a78bfa", error: "#f87171" },
    tokens,
  },
]);
```

`src/app.css`:

```css
@import "tailwindcss";
@tint "../tint.config.ts";

@custom-variant dark (&:where(.dark, .dark *));

body {
  @apply bg-surface text-body;
}
```

Markup:

```html
<section class="rounded-xl border border-default bg-surface-raised p-5">
  <h2 class="text-heading">Default palette</h2>
  <button class="bg-action text-on-action hover:bg-action-hover focus-visible:outline-ring">
    Save
  </button>
</section>

<section class="tint-error rounded-xl border border-default bg-surface-raised p-5">
  <h2 class="text-heading">Same markup, error palette</h2>
  <button class="bg-action text-on-action hover:bg-action-hover">Delete</button>
</section>
```

The `@tint` path is relative to the CSS file. Editing the config (or anything it imports)
triggers a full reload. The plugin also writes `node_modules/.tint/intellisense.css` for
editor autocomplete (see [IntelliSense](#intellisense-in-vs-code)).

### PostCSS (Next.js, webpack, Parcel)

```bash
pnpm add -D @skylerknight/tint esbuild tailwindcss @tailwindcss/postcss postcss
```

`postcss.config.mjs`:

```js
export default {
  plugins: {
    // tint must come before @tailwindcss/postcss.
    "@skylerknight/tint/postcss": {},
    "@tailwindcss/postcss": {},
  },
};
```

`app/globals.css`:

```css
@import "tailwindcss";
@tint "./tint.config.ts";
```

With PostCSS the `@tint` path resolves against the plugin's `root` option
(default `process.cwd()`), not the CSS file. Pass `{ root: "..." }` for non-standard
layouts.

### Programmatic

```ts
import { generate, toCSS, audit, formatAuditTable } from "@skylerknight/tint";

const result = generate({
  name: "light",
  mode: "light",
  colors: { base: "#ffffff", brand: "#7c3aed" },
  tokens: {
    surface: { DEFAULT: { ls: 0 } },
    text: { $on: "surface", heading: { lc: 90 }, body: { lc: 75 } },
  },
});

console.log(toCSS(result));
console.log(formatAuditTable(audit(result)));
for (const d of result.diagnostics) console.warn(`${d.code} ${d.path}: ${d.message}`);
```

`generate` accepts an array of configs and returns an array of results. Every formatter
accepts either.

## Concepts

### Lc, the unit everything is measured in

| Lc     | APCA guidance                       | Typical token               |
| ------ | ----------------------------------- | --------------------------- |
| < 8    | not perceptible as a foreground     | nothing (use `ls`)          |
| 15     | decorative dividers, disabled       | `border.subtle`             |
| 30     | large/bold text, icons, controls    | `border.DEFAULT`, `icon`    |
| 45     | minimum for body text               | `text.placeholder`          |
| 60     | comfortable body text, fills        | `action.DEFAULT`, `text.muted` |
| 75     | small text, dense UI                | `text.body`                 |
| 90     | headings, maximum readability       | `text.heading`              |
| ~106   | black on white (white on black ~108) |                             |

These are the values in `APCA_THRESHOLDS` (`minimum: 8, decorative: 15, largeText: 30,
bodyTextMin: 45, bodyTextRecommended: 60, smallText: 75, maximum: 90`).

### OKLCH

tint works in OKLCH. The seed color contributes hue and chroma; lightness is the only
free variable, and it is solved. Within one direction (foreground lighter or darker than
the reference) APCA contrast is monotonic in OKLCH lightness, which is what makes the
solve a simple bisection. Results are gamut-mapped to sRGB by reducing chroma while
preserving lightness and hue, so a deep brand purple at Lc 90 keeps its hue and becomes
as saturated as sRGB allows at that lightness.

### Foundation groups and referenced groups

A **foundation** group has no `$on`. Its tokens are measured against the mode baseline:
pure white in light mode, pure black in dark mode. `surface` is almost always a
foundation.

A **referenced** group has `$on: "group"` or `$on: "group.variant"`. Its tokens are
solved against an already-generated token of the same palette. `text` is on `surface`;
`on.action` is on `action`.

Together they form a dependency graph that tint evaluates in topological order:

```
surface.raised  (foundation, ls 2 from the mode baseline)
   |
   +-- text.heading   lc 90 against surface.raised
   +-- text.body      lc 75
   +-- action.DEFAULT lc 60
          |
          +-- on.action  lc 60 against action.DEFAULT
```

### Reference variants

`$on: "surface"` means "against surface's **reference variant**". The reference is:

1. the variant with `$reference: true`, else
2. the variant named `DEFAULT`, else
3. the variant with the highest non-`pure` `lc`/`ls` value (first wins on ties), else
4. the first variant.

Rule 3 can surprise: in `action: { resting: { lc: 60 }, strong: { lc: 75 } }` the
reference is `strong`, so `on.action` contrasts against `action.strong`. Name the resting
variant `DEFAULT` or mark it `$reference: true`.
`$on: "group.variant"` bypasses the reference and targets a specific variant.

### `lc` versus `ls`

| Kind | Meaning                                                                              | Use for                        |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------ |
| `lc` | Target APCA contrast against the reference. Lightness is solved.                     | text, borders, fills, icons    |
| `ls` | Lightness steps away from the reference: `L = ref.L - ls * scale` (light), `+` (dark). | surfaces, soft fills, subtle borders |

`ls` tokens are for things that must differ *slightly* from their reference, where APCA
below Lc 8 is meaningless. Their chroma is capped by step count (0.02 at `ls: 0`, 0.05 up
to 3, 0.08 up to 7, 0.12 beyond) so surfaces stay surface-like. A foundation `ls` token
steps from the **foundation surface**, `1 - offset` in light mode or `offset` in dark
mode, not from pure white or black. The seed's own lightness is ignored for `ls` tokens;
only its hue and chroma are used.

With a reference, `lc: 0` or `ls: 0` returns an exact copy of the reference.

### Polarity and `$invert`

For a referenced `lc` token, tint picks the direction that can reach more contrast:
whichever of black or white scores higher against the reference. A dark surface gets
light text, a light button gets dark text, without you saying so. If the chosen side
cannot reach the target, the other side is tried and the better result is kept.

`$invert: true` flips the chosen direction and disables the fallback. Use it when you
specifically want, say, dark text on a mid-dark fill. If the inverted side cannot reach
the target you get the best it can do plus a `contrast-unreachable` diagnostic.

Foundation `lc` tokens have a fixed polarity: darker than white in light mode, lighter
than black in dark mode.

### `$chroma`

A multiplier (0 to 2, default 1) on the seed's chroma, applied once before solving.
`$chroma: 0` makes a token neutral grey; `0.3` makes it a tinted grey; `1.5` pushes
saturation (then gamut-mapped). It applies per variant or per group and can be
overridden per color.

```ts
text: {
  $on: "surface",
  body: { lc: 75 },                  // #6712d1 for brand #7c3aed
  soft: { lc: 75, $chroma: 0.3 },    // #574e7b
  mono: { lc: 75, $chroma: 0 },      // #545454
}
```

For `ls` tokens the result is still capped by the step-count ceiling, so `$chroma` on a
surface mostly lowers chroma rather than raising it.

### `pure`

`lc: "pure"` or `ls: "pure"` yields pure white or black:

- Foundation: the mode baseline (white in light, black in dark).
- Referenced `lc`: whichever extreme sits on the chosen polarity side of the reference.
  The achieved Lc is measured and reported, and the audit treats it as a pass.
- Referenced `ls`: the mode baseline.

### Shortcuts

`lc` accepts named values: `heading` (90), `body` (80), `muted` (60), `placeholder`
(45), `disabled` (40), `pure`. They are available as `LC_SHORTCUTS`.

### Overrides

Per-color adjustments to a token, keyed by color name or a comma list of names:

```ts
overrides: {
  "warning,info": { action: { DEFAULT: { lc: 70 } } },   // #ac5d00 / #2967f0 instead of Lc 60
  warning: { text: { body: { $chroma: 0.5 } } },
}
```

An override can set `lc` (on `lc` variants), `ls` (on `ls` variants), `$scale`,
`$decorative`, `$invert`, `$chroma`. Overrides are applied before solving, so dependents
see the overridden color.

### `offset` and `scale`

`scale` is the lightness distance of one `ls` step (default 0.02). Precedence for an
`ls` variant: `variant.$scale`, then `group.$scale`, then the `$scale` of the group named
by the group's `$on`, then `config.scale`, then 0.02.

`offset` is how far the foundation surface sits from the mode baseline (default 0.015
light, 0.15 dark). With the defaults, light `surface { ls: 0 }` is `#fafafa` (L 0.985)
and dark is `#0b0b0e` (L 0.15). `offset: 0` makes `ls: 0` exactly white or black.

| config                  | `ls: 0`   | `ls: 2`   | `ls: 6`   |
| ----------------------- | --------- | --------- | --------- |
| light, defaults         | `#fafafa` | `#ededed` | `#d2d2d2` |
| light, `offset: 0`      | `#ffffff` | `#f2f2f2` | `#d7d7d7` |
| light, `offset: 0.05`   | `#eeeeee` | `#e1e1e1` | `#c7c7c7` |
| light, `scale: 0.04`    | `#fafafa` | `#dfdfdf` | `#acacac` |
| dark, defaults          | `#0b0b0e` | `#131316` | `#262629` |

## Config reference

`defineConfig(config)` validates and returns the config unchanged, with a `const` generic
so literal token names flow to callers. It also accepts an array of configs.

### Top level

| Key                  | Type                                | Default                         | Notes                                                              |
| -------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `name`               | `string`                            | required                        | Theme name; output folder for `tint build`, shown in diagnostics.  |
| `mode`               | `"light" \| "dark"`                 | required                        | Sets the baseline and contrast direction.                          |
| `selector`           | `string`                            | `":root"`                       | Selector the variables are scoped to (the manual block).           |
| `prefersColorScheme` | `"light" \| "dark"`                 | none                            | Adds an automatic `@media (prefers-color-scheme: …) { :root { … } }` block. |
| `prefersContrast`    | `"more" \| "less" \| "custom"`      | none                            | Adds an automatic `@media (prefers-contrast: …) { :root { … } }` block (joined with `and` when both are set). |
| `scale`              | `number` 0.001..0.1                 | `0.02`                          | Default `ls` step size.                                            |
| `offset`             | `number` 0..0.5                     | `0.015` light, `0.15` dark      | Distance of the foundation surface from pure white/black.         |
| `colors`             | `Record<string, string \| {value}>` | required, at least one          | Seed colors. `base` is always generated first.                     |
| `tokens`             | `Record<string, TokenGroup>`        | required, at least one group    | Token structure applied to every color.                            |
| `overrides`          | `Overrides`                         | none                            | Per-color adjustments.                                             |
| `output`             | `{ path?, formats? }`               | `{ path: "./tint", formats: ["css"] }` | Defaults for `tint build`.                                  |

Color values accept hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, with or without `#`),
`rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()`, and CSS named colors. Alpha is ignored.
Color, group and variant names must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/` because they
become CSS identifiers. `DEFAULT` is a special variant name that is dropped from output
names (`--brand-action`, not `--brand-action-DEFAULT`).

### Group keys

| Key           | Type                                                              | Default | Notes                                                             |
| ------------- | ----------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| `$on`         | `"group"` or `"group.variant"`                                    | none    | Reference for every variant in the group. Omit for a foundation.  |
| `$role`       | `"surface" \| "text" \| "border" \| "action" \| "status" \| "icon"` | none  | Enables the role lint (see [Diagnostics](#diagnostics)).          |
| `$decorative` | `boolean`                                                         | `false` | Exempts all variants from contrast diagnostics.                   |
| `$invert`     | `boolean`                                                         | `false` | Flips the contrast direction; requires an effective `$on`.        |
| `$scale`      | `number` 0.001..0.1                                               | inherit | Step size for the group's `ls` variants.                          |
| `$chroma`     | `number` 0..2                                                     | `1`     | Chroma multiplier for the group.                                  |

Every other key in a group is a variant. A group needs at least one.

### Variant keys

Exactly one of `lc` or `ls` is required.

| Key           | `lc` variant | `ls` variant | Type                             | Notes                                             |
| ------------- | ------------ | ------------ | -------------------------------- | ------------------------------------------------- |
| `lc`          | yes          |              | `number` 0..108 or shortcut      | Target contrast against the reference.            |
| `ls`          |              | yes          | `number >= 0` or `"pure"`        | Lightness steps from the reference.               |
| `$reference`  | yes          | yes          | `boolean`                        | At most one per group.                            |
| `$on`         | yes          | yes          | `string`                         | Overrides the group's `$on` for this variant.     |
| `$decorative` | yes          | yes          | `boolean`                        | Skip contrast diagnostics for this variant.       |
| `$invert`     | yes          |              | `boolean`                        | Requires an effective `$on`.                      |
| `$scale`      |              | yes          | `number` 0.001..0.1              | Step size for this variant.                       |
| `$chroma`     | yes          | yes          | `number` 0..2                    | Chroma multiplier for this variant.               |

### Override values

`overrides[color | "a,b"][group][variant]` is an object with at least one of `lc`, `ls`,
`$scale`, `$decorative`, `$invert`, `$chroma`. `lc` is only valid on `lc` variants and
`ls` on `ls` variants. Every color, group and variant named must exist.

### Validation

`validateConfig` collects every issue before returning; `assertConfig`, `defineConfig`,
`generate` and the loader throw a `ConfigError` whose `issues` carry a dotted `path`, a
`message` and often a `hint`:

```
Invalid tint config:
  - extra: Unknown key "extra" (valid config keys are: name, mode, selector, prefersColorScheme, prefersContrast, scale, offset, colors, tokens, overrides, output)
  - colors.bad: Invalid color "not-a-color" (use hex (#rgb, #rrggbb), rgb(), hsl() or oklch())
  - tokens.text.heading: Variant cannot have both "lc" and "ls"
  - tokens.text.body.lc: Expected a number between 0 and 108 or a shortcut (shortcuts are: heading, body, muted, placeholder, disabled, pure)
```

Also checked: unknown `$` keys (with a hint when `$reference` is put on a group),
unknown `$on` targets, `$on` pointing at the variant itself, circular `$on` chains
(reported as `a.b -> c.d -> a.b`), more than one `$reference` per group, `$invert`
without an `$on`, and override kinds.

## Output reference

All examples below use the config from the top of this file.

### `toCSS(result | result[], options?)`

Options: `selector` (overrides the result's), `format: "hex" | "oklch"` (default hex),
`includeOKLCH` (an `oklch()` comment above each hex), `indent` (default two spaces),
`comments` (the `/* <palette> palette */` lines, default true).

Variables are named `--<palette>-<group>-<variant>`; `DEFAULT` is dropped. How a result
is scoped depends on `selector` and the media preferences:

| `selector`       | `prefersColorScheme` / `prefersContrast` | Emitted                                                 |
| ---------------- | ---------------------------------------- | ------------------------------------------------------- |
| any              | none                                     | `<selector> { … }`                                      |
| `:root`          | set                                      | `@media (…) { :root { … } }` only                       |
| custom (`.dark`) | set                                      | `.dark { … }` **and then** `@media (…) { :root { … } }` |

The two-block form means a dark theme applies when the class is present *or* when the OS
prefers dark, with no extra CSS. The dark theme from the quick start
(`selector: ".dark"`, `prefersColorScheme: "dark"`) produces:

```css
.dark {
  /* base palette */
  --base-surface: #0b0b0e;
  --base-surface-raised: #131316;
  --base-text-heading: #e4e5e9;
  --base-text-body: #ccccd1;
  --base-action: #b2b2b6;
  --base-on-action: #1d1d20;

  /* brand palette */
  --brand-surface: #0b0a13;
  --brand-surface-raised: #150e28;
  --brand-text-heading: #e7e1ff;
  --brand-text-body: #d0c5ff;
  --brand-action: #baa5ff;
  --brand-on-action: #22004e;
  /* … */
}

@media (prefers-color-scheme: dark) {
  :root {
    /* base palette */
    --base-surface: #0b0b0e;
    --base-surface-raised: #131316;
    /* … identical declarations … */
  }
}
```

An explicit `toCSS(result, { selector })` replaces the result's selector in the manual
block and `:root` in the automatic block. The alias layer of `toCSSWithTailwindAndTint`
is scoped the same way.

When several themes are formatted together, each automatic block excludes the other
themes' custom selectors, so a class can override the OS preference. With
`light: { selector: ".light", prefersColorScheme: "light" }` and
`dark: { selector: ".dark", prefersColorScheme: "dark" }` the automatic blocks are
`:root:not(.dark)` and `:root:not(.light)`: no class follows the OS, `.light` or `.dark`
on `<html>` forces a mode either way. (With `light` on `:root` there is nothing to
exclude, so under an OS dark preference the page cannot be forced light.)

With `format: "oklch"`:

```css
:root {
  /* brand palette */
  --brand-surface: oklch(98.50% 0.0077 293.01);
  --brand-surface-raised: oklch(94.50% 0.0287 293.01);
  --brand-text-heading: oklch(27.70% 0.1544 293.01);
  --brand-text-body: oklch(46.17% 0.2466 293.01);
  --brand-action: oklch(59.01% 0.2466 293.01);
  --brand-on-action: oklch(92.63% 0.0388 293.01);
}
```

### `toJSON(result, options?)` / `toDTCG(result, options?)`

DTCG (Design Tokens Community Group) format. `toDTCG` returns the object, `toJSON`
stringifies it. Options: `includeSchema` (default true), `useOKLCH` (default false),
`indent` (default 2), `metadata` (default true; attaches `$extensions["dev.tint"]`).
Variant keys keep their config names, so `DEFAULT` stays `DEFAULT` here.

```json
{
  "$schema": "https://design-tokens.org/schema.json",
  "brand": {
    "surface": {
      "raised": {
        "$type": "color",
        "$value": "#edeaff",
        "$extensions": { "dev.tint": { "kind": "ls", "ls": 2, "reference": true } }
      }
    },
    "text": {
      "body": {
        "$type": "color",
        "$value": "#6712d1",
        "$extensions": {
          "dev.tint": { "kind": "lc", "lc": 75.10339608443442, "target": 75, "on": "surface.raised" }
        }
      }
    }
  }
}
```

### `toFlatMap(result)`

`"palette.group.variant"` to hex, with `DEFAULT` dropped:

```json
{
  "brand.surface": "#faf9ff",
  "brand.surface.raised": "#edeaff",
  "brand.text.heading": "#30006a",
  "brand.text.body": "#6712d1",
  "brand.action": "#8a4cfe",
  "brand.on.action": "#e7e2ff"
}
```

### `toTailwind(result | result[], options?)`

A bare `@theme` block mapping `--color-*` to the variables `toCSS` emits. Options:
`indent`, `simplifyNames` (default true), `generateShortcuts` (default true, unused by
this formatter). With `simplifyNames`, a group whose name is a Tailwind utility prefix
is dropped from the color name so you write `text-brand-heading` instead of
`text-brand-text-heading`:

```css
@theme {
  --color-brand-surface: var(--brand-surface);
  --color-brand-surface-raised: var(--brand-surface-raised);
  --color-brand-heading: var(--brand-text-heading);
  --color-brand-body: var(--brand-text-body);
  --color-brand-action: var(--brand-action);
  --color-brand-on-action: var(--brand-on-action);
}
```

Simplification that would map two tokens to one name (`text.heading` and
`heading.text`) throws a descriptive error; set `simplifyNames: false` or rename.

### `toCSSWithTailwind(result | result[], options?)`

`toCSS` for every result followed by one `toTailwind` block. Accepts `includeOKLCH` too.

### `toCSSWithTailwindAndTint(result | result[], options?)`

The full single-file output used by the plugins. See
[Tailwind integration](#tailwind-integration) for the sections and a real excerpt.
Options: `TailwindOptions` plus `generateTintUtilities` (default true), `defaultPalette`
(default `"base"`), `includeOKLCH`.

### `toTailwindIntelliSense(result | result[], options?)`

A static-hex `@theme` for the Tailwind IntelliSense extension, which cannot follow
`var()`. Only the first result is used. Pass `generateTintUtilities: true` to get the
same names as the tint path (full names plus the unprefixed default palette); otherwise
names are simplified like `toTailwind`.

```css
@import 'tailwindcss';

@theme {
  --color-brand-surface: #faf9ff;
  --color-brand-text-heading: #30006a;
  /* … */

  /* Unprefixed colors (for tint-* utility classes) */
  --color-surface: #fafafa;
  --color-text-heading: #2b2b2b;
  --color-action: #777777;
  --color-on-action: #e6e6e6;
}
```

### Multi-theme rules

The Tailwind formatters derive one `@theme` from the first result and reuse it for every
theme, because the variables themselves change per selector. `assertConsistentStructure`
therefore throws if two results differ in palette, group or variant names.

## Tailwind integration

`toCSSWithTailwindAndTint` (what `@tint` expands to) emits five sections:

1. **Variables** per theme: `--brand-action: #8a4cfe;` inside the theme's selector and
   media query (same as `toCSS`).
2. **Alias layer** per theme: unprefixed variables that point at the default palette.
3. **`@theme static`**: `--color-<palette>-<group>-<variant>` for every token (full names,
   never simplified), then `--color-<group>-<variant>` for the default palette.
4. **`@utility tint-<palette>`** for every non-default palette: re-points the unprefixed
   `--color-*` at that palette.
5. **Shortcut utilities** for groups named after a Tailwind utility prefix.

For the config at the top of this file:

```css
:root {
  /* Unprefixed variables (default to base) */
  --surface: var(--base-surface);
  --surface-raised: var(--base-surface-raised);
  --text-heading: var(--base-text-heading);
  --text-body: var(--base-text-body);
  --action: var(--base-action);
  --on-action: var(--base-on-action);
}

@theme static {
  --color-base-surface: var(--base-surface);
  --color-brand-action: var(--brand-action);
  --color-error-on-action: var(--error-on-action);
  /* … one line per token … */

  /* Unprefixed colors (for tint-* utility classes) */
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-text-heading: var(--text-heading);
  --color-text-body: var(--text-body);
  --color-action: var(--action);
  --color-on-action: var(--on-action);
}

@utility tint-brand {
  --color-surface: var(--brand-surface);
  --color-surface-raised: var(--brand-surface-raised);
  --color-text-heading: var(--brand-text-heading);
  --color-text-body: var(--brand-text-body);
  --color-action: var(--brand-action);
  --color-on-action: var(--brand-on-action);
}

@utility tint-error {
  --color-surface: var(--error-surface);
  /* … */
}

@utility text-heading {
  color: var(--color-text-heading);
}

@utility text-body {
  color: var(--color-text-body);
}
```

### Three ways to reference a color

| Class                     | Resolves to                                 | Use when                                     |
| ------------------------- | ------------------------------------------- | -------------------------------------------- |
| `bg-brand-action`         | `--color-brand-action` (explicit palette)   | The color must not change with `tint-*`.     |
| `bg-action`               | `--color-action` (default palette, swappable) | Component code that should re-skin.        |
| `text-heading`            | shortcut utility for `text.heading`         | Groups named `text`, `bg`, `border`, `ring`… |

Standard Tailwind utilities work with both prefixed and unprefixed names:
`bg-surface-raised`, `border-brand-border`, `outline-ring`, `text-on-action`.

### `tint-*` utilities

`tint-error` re-points every unprefixed `--color-*` at the error palette for that element
and its subtree. Because the swap happens at the CSS variable level, nested children
written with unprefixed classes follow along:

```html
<div class="tint-error border border-default bg-surface-raised">
  <p class="text-body">Any unprefixed class in here is now error-colored.</p>
  <button class="bg-action text-on-action">Delete</button>
  <button class="bg-brand-action text-brand-on-action">Still brand</button>
</div>
```

### Shortcuts

A group whose lowercase name is a Tailwind utility prefix (`text`, `bg`, `background`,
`border`, `outline`, `ring`, `accent`, `caret`, `fill`, `stroke`, `decoration`, `divide`,
`placeholder`, `shadow`) gets one `@utility <prefix>-<variant>` per variant, writing the
matching property. `DEFAULT` becomes `-default`, so a `border` group with `DEFAULT`
yields `border-default`. The mapping:

| Group            | Property                                   |
| ---------------- | ------------------------------------------ |
| `text`           | `color`                                    |
| `bg`, `background` | `background-color`                       |
| `border`         | `border-color`                             |
| `outline`        | `outline-color`                            |
| `accent`         | `accent-color`                             |
| `caret`          | `caret-color`                              |
| `fill`           | `fill`                                     |
| `stroke`         | `stroke`                                   |
| `decoration`     | `text-decoration-color`                    |
| `ring`           | `--tw-ring-color`                          |
| `shadow`         | `--tw-shadow-color`                        |
| `divide`         | `& > * + * { border-color: … }`            |
| `placeholder`    | `&::placeholder { color: … }`              |

Why they exist: without them `text-text-heading` is the natural Tailwind class for
`text.heading`. The shortcut makes it `text-heading`, which is also why a *palette* named
`text` triggers a `palette-name-conflict` diagnostic. Disable with
`generateShortcuts: false`.

### Why `@theme static`

Tailwind v4 normally emits only the `--color-*` variables you use in classes. The
`tint-*` utilities and the alias layer reference variables that no class mentions
directly, so they would be pruned. `@theme static` keeps every variable, which is what
runtime palette swapping needs. The cost is one declaration per token in the CSS bundle.

### IntelliSense in VS Code

The Tailwind CSS IntelliSense extension cannot resolve `var()` chains, so the plugins
write a static copy to `node_modules/.tint/intellisense.css`. Point the extension at it
in `.vscode/settings.json`:

```json
{
  "tailwindCSS.experimental.configFile": "node_modules/.tint/intellisense.css"
}
```

You then get completion and color swatches for `bg-surface-raised`, `text-on-action`,
`bg-brand-action` and so on. The file is regenerated on every config change; disable it
with `tint({ intellisense: false })`.

### Plugin options

Both `tint()` (Vite) and the PostCSS plugin accept `TintUtilitiesOptions`:

| Option                  | Default  | Effect                                                         |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `generateTintUtilities` | `true`   | Emit the alias layer, `@theme static` and `tint-*` utilities. `false` emits plain `@theme` with simplified names. |
| `defaultPalette`        | `"base"` | Palette the unprefixed variables alias to.                     |
| `generateShortcuts`     | `true`   | Emit `@utility text-heading`-style shortcuts.                  |
| `simplifyNames`         | `true`   | Only used when `generateTintUtilities: false`.                 |
| `includeOKLCH`          | `false`  | `oklch()` comments above each hex.                             |
| `indent`                | `"  "`   | Indentation string.                                            |

Vite only: `intellisense` (default true). PostCSS only: `root` (default `process.cwd()`).

### `virtual:tint`

The Vite plugin exposes the generated results to application code:

```ts
import themes from "virtual:tint"; // GenerationResult[] for the first @tint config seen

for (const theme of themes) {
  console.log(theme.name, theme.palettes.length, theme.diagnostics.length);
}
```

`virtual:tint/<relative-config-path>` selects a specific config. Importing before any
CSS was transformed loads the config at the default path. Add a declaration for
TypeScript:

```ts
// src/vite-env.d.ts
declare module "virtual:tint" {
  import type { GenerationResult } from "@skylerknight/tint";
  const themes: GenerationResult[];
  export default themes;
}
```

## Diagnostics

`generate` never throws for a contrast problem. It emits structured diagnostics
(`result.diagnostics`, with `result.warnings` holding just the messages) and the best
achievable color. Every diagnostic has `severity: "warning"`, a `code`, a `path`
(`<palette>.<group>.<variant>` or `<palette>`), a `message`, usually a `hint`, and
machine-readable `data`.

| Code                     | Meaning                                                                                   | Fix                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `contrast-unreachable`   | The requested Lc exceeds what is possible against the reference. The emitted color is the best achievable. | Lower `lc`, or move the reference away from mid lightness (see [FAQ](#faq)). `data.achievable` tells you the ceiling. |
| `reference-midtone`      | Companion to the above when the reference has OKLCH L between 0.35 and 0.75 and the ceiling is below Lc 70. | Make the reference darker (light text works) or lighter (dark text works).                       |
| `contrast-below-minimum` | A non-decorative referenced `lc` token asks for 0 < Lc < 8, which APCA considers imperceptible. | Use an `ls` variant for subtle surfaces, or mark it `$decorative`.                              |
| `role-contrast-low`      | A non-decorative referenced `lc` token is below its `$role` minimum: text 45, icon 30, action 30, status 30, border 15 (surface has none). | Raise `lc`, change `$role`, or mark it `$decorative`.                    |
| `seed-out-of-gamut`      | An `oklch()` seed lies outside sRGB and was chroma-reduced.                               | Lower the seed's chroma. `data.requested` and `data.mapped` show both.                                   |
| `palette-name-conflict`  | A color is named after a Tailwind utility prefix (`text`, `bg`, …), making shortcut classes ambiguous. | Rename the color (`textColor`).                                                          |

Example:

```json
{
  "severity": "warning",
  "code": "contrast-unreachable",
  "path": "brand.on.action",
  "message": "brand.on.action requests Lc 75 but only Lc 55.8 is achievable against action.DEFAULT (#ae95ff).",
  "hint": "\"action.DEFAULT\" is a mid-tone (L=0.73), so neither light nor dark foregrounds reach high contrast. Make \"action.DEFAULT\" darker (so light text works) or lighter (so dark text works), or accept Lc 56 for large/bold text.",
  "data": { "target": 75, "achievable": 55.78, "reference": "#ae95ff", "referenceL": 0.73 }
}
```

### Audit

`audit(result)` turns a result into a row per token with a status, and
`formatAuditTable` renders it (`{ color: true }` adds ANSI colors to the status column).
`pass` means achieved is within 0.5 of the target; `warn` means it reached the target but
a diagnostic was emitted for that path; `fail` means it did not reach the target; `n/a`
is for foundation and `ls` tokens. For `ls` tokens the "Achieved" column is informational
only: the raw, un-clipped APCA distance (`calcAPCAraw`) between the token and its
reference, or the mode baseline when it has none. It tells you how far apart two surfaces
are (`surface.raised` is 8.2 from white, `border.subtle` is 9.2 from `surface.raised`); it
is not a pass/fail value. Foundation `lc` tokens report the engine's measured Lc against
the baseline.

```
Token                 | Hex     | Kind | Target | Achieved | On              | Status
----------------------|---------|------|--------|----------|-----------------|-------
base.surface.DEFAULT  | #fafafa | ls   |      - |      0.0 | -               | n/a
base.action.DEFAULT   | #a5a5a5 | lc   |     45 |     45.5 | surface.DEFAULT | pass
base.action.faint     | #eae9e9 | lc   |      5 |      7.4 | surface.DEFAULT | warn
base.on.action        | #000000 | lc   |     75 |     55.5 | action.DEFAULT  | fail

4 tokens: 1 pass, 1 warn, 1 fail, 1 n/a
```

## CLI reference

The CLI has no dependencies beyond Node. Loading a `.ts` config needs `esbuild`.

```
tint build   [-c|--config <path>] [-o|--out <dir>] [-f|--formats css,json,tailwind,flat] [--tailwind-tint] [--quiet]
tint check   [-c <path>] [--strict]
tint inspect [-c <path>] [--palette <name>] [--theme <name>]
tint init    [--dark] [--brand <hex>] [--yes]
tint --help | -h
tint --version | -v
```

| Command   | What it does                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`   | Generates and writes files per theme: `<out>/<theme>/tokens.css`, `tokens.json`, `tailwind.css`, `tokens.flat.json` for each selected format. `--tailwind-tint` instead writes one `<out>/tailwind.css` with the full `toCSSWithTailwindAndTint` output across all themes. |
| `check`   | Validates and generates, prints diagnostics as `warn <path>: <message>` lines. Exit 1 on a config error, or on any warning with `--strict`. Meant for CI.                                                                                                              |
| `inspect` | Prints the audit table. `--theme` picks a theme by name, `--palette` filters to one palette.                                                                                                                                                                        |
| `init`    | Writes a `tint.config.ts` using the modern token set (ls-based surfaces, text, border, action, on, ring). Interactive unless `--yes`; `--brand <hex>` and `--dark` answer the two prompts (brand color, dark mode) up front.                                                                            |

Config path: `-c`, else the first of `tint.config.ts`, `tint.config.mts`,
`tint.config.js`, `tint.config.mjs`, `tint.config.json` that exists. Output directory:
`--out`, else `config.output.path`, else `./tint`. Formats: `--formats`, else
`config.output.formats`, else `css`. Errors print without stack traces; exit codes are
0 and 1.

```bash
tint check --strict             # fail CI on any diagnostic
tint inspect --theme dark --palette brand
tint build -f css,json,flat -o src/styles/tokens
tint build --tailwind-tint      # one tailwind.css for all themes
```

## Programmatic API

Everything is a named export from `@skylerknight/tint`.

### Config

```ts
function defineConfig<const T extends Config>(config: T): T;
function defineConfig<const T extends readonly Config[]>(configs: T): T;
function validateConfig(input: unknown): { ok: true; config: Config } | { ok: false; issues: Issue[] };
function assertConfig(input: unknown): Config;              // throws ConfigError
class ConfigError extends Error { issues: Issue[] }
function resolveConfig(config: Config): ResolvedConfig;     // normalized + dependency order
const LC_SHORTCUTS: { heading: 90; body: 80; muted: 60; placeholder: 45; disabled: 40 };
```

### Engine

```ts
function generate(config: Config | unknown): GenerationResult;
function generate(configs: readonly unknown[]): GenerationResult[];

interface GenerationResult {
  name: string; mode: "light" | "dark"; selector: string;
  prefersColorScheme?: "light" | "dark"; prefersContrast?: "more" | "less" | "custom";
  palettes: GeneratedPalette[];
  diagnostics: Diagnostic[];
  warnings: string[];                        // diagnostics.map(d => d.message)
}
interface GeneratedPalette { name: string; seed: GeneratedColor; tokens: Record<string, Record<string, GeneratedVariant>> }
interface GeneratedColor { hex: string; rgb: RGB; oklch: OKLCH }
type GeneratedVariant =
  | (GeneratedColor & { kind: "lc"; lc: number; target: number; reference?: true; on?: string; decorative?: true })
  | (GeneratedColor & { kind: "ls"; ls: number;                 reference?: true; on?: string; decorative?: true });
```

`lc` is the achieved contrast, `target` the requested one (`-1` for `pure`); `ls` is `-1`
for `pure`. `tokens` keeps the config's group and variant order.

### Output

```ts
function toCSS(result | result[], options?: CSSOptions): string;
function toJSON(result, options?: JSONOptions): string;
function toDTCG(result, options?: JSONOptions): Record<string, unknown>;
function toFlatMap(result): Record<string, string>;
function toTailwind(result | result[], options?: TailwindOptions): string;
function toCSSWithTailwind(result | result[], options?: TailwindOptions & { includeOKLCH?: boolean }): string;
function toCSSWithTailwindAndTint(result | result[], options?: TintUtilitiesOptions): string;
function toTailwindIntelliSense(result | result[], options?: TintUtilitiesOptions): string;
const TAILWIND_UTILITY_PREFIXES: Record<string, string>;
```

### Audit

```ts
function audit(result: GenerationResult): AuditReport;
function formatAuditTable(report: AuditReport, options?: { color?: boolean }): string;
interface AuditRow { palette; group; variant; hex; kind: "lc" | "ls"; target: number | null; achieved: number; on: string | null; decorative: boolean; status: "pass" | "warn" | "fail" | "n/a" }
interface AuditReport { rows: AuditRow[]; summary: { tokens; pass; warn; fail; na }; diagnostics: Diagnostic[] }
```

### Color and contrast

```ts
function parseColor(input: string): RGB;                     // throws TypeError('Invalid color: "…"')
function tryParseColor(input: string): RGB | null;
function rgbToHex(rgb: RGB): string;
function rgbToOKLCH(rgb: RGB): OKLCH;
function oklchToRGB(lch: OKLCH): RGB;                        // clamps, no gamut mapping
function oklchToRGBGamut(lch: OKLCH): RGB;                   // gamut-mapped
function toGamut(color: OKLCH, epsilon?: number): OKLCH;     // chroma reduction, keeps L and H
function formatOKLCH(color: OKLCH, precision?: number): string;

function calcAPCA(text: RGB, background: RGB): number;       // signed Lc; + dark-on-light, - light-on-dark
function calcAPCAabs(text: RGB, background: RGB): number;
function calcAPCAraw(fg: RGB, bg: RGB): number;              // no low-contrast clip, monotonic
function meetsContrast(text: RGB, background: RGB, min: number): boolean;
const APCA_THRESHOLDS: { minimum: 8; decorative: 15; largeText: 30; bodyTextMin: 45; bodyTextRecommended: 60; smallText: 75; maximum: 90 };

type Polarity = "lighter" | "darker";
function solveContrast(seed: OKLCH, background: RGB, targetLc: number, options: { polarity: Polarity; raw?: boolean; tolerance?: number }): { color: OKLCH; lc: number; reached: boolean };
function maxContrast(seed: OKLCH, background: RGB, polarity: Polarity): SolveResult;
function preferredPolarity(background: RGB): Polarity;
```

Reference values: `calcAPCA(#000, #fff)` is 106.04, `calcAPCA(#fff, #000)` is -107.88,
`calcAPCA(#888, #fff)` is 63.06, `calcAPCA(#fff, #888)` is -68.54.

### Loader

```ts
function loadConfig(options: { root?: string; configPath: string }): Promise<{
  configs: Config[];
  path: string;             // absolute
  dependencies: string[];   // absolute paths bundled in, including the config itself
}>;
```

Resolves `configPath` against `root` (default `process.cwd()`). `.json` is parsed;
`.js`/`.mjs`/`.cjs` is imported natively (cache-busted by mtime), falling back to esbuild;
`.ts`/`.mts`/`.cts` is bundled with esbuild into `node_modules/.tint/` and imported. The
`@skylerknight/tint` import inside the config is replaced by a stub during bundling, so the
config loads even in monorepos where the package is not resolvable from the config's
location. Accepts a `default` export or a named `config` export, single or array.

## Migrating from v2

- `result.warnings` is still there. `result.diagnostics` is new and structured
  (`code`, `path`, `hint`, `data`); prefer it.
- Generated `lc` tokens now carry both `lc` (achieved) and `target` (requested), and
  tokens exempt from lint carry `decorative: true`.
- `lc: "pure"` on a foundation token now means the mode baseline (white in light, black
  in dark) rather than a solved extreme; with a reference it is the extreme on the
  chosen polarity side.
- `$chroma` is new on groups, variants and overrides.
- `offset` is unchanged (`ls: 0` is still `1 - offset` / `offset`, defaults 0.015 and 0.15).
- The `$role` lint is now enforced: `role-contrast-low` fires for text under Lc 45,
  icon/action/status under 30, border under 15.
- `audit`, `formatAuditTable`, `tint check` and `tint inspect` are new.
- `output.formats` gains `"flat"` (`tokens.flat.json`).
- The loader stubs the `@skylerknight/tint` import while bundling the config, so configs
  load before the package is built and in strict pnpm layouts.
- `defineConfig` preserves literal types (`const` generic) and accepts an array.
- `virtual:tint` exposes results to app code under Vite.
- DTCG output carries `$extensions["dev.tint"]` metadata (`metadata: false` to omit).
- Zero runtime dependencies; `esbuild`, `vite` and `postcss` are optional peers.
- CSS scoping: v2 wrapped the custom selector *inside* the media query
  (`@media (prefers-color-scheme: dark) { .dark { … } }`), so the theme only applied when
  both the class and the OS preference matched. v3 emits a manual `.dark { … }` block
  followed by an automatic `@media (…) { :root { … } }` block, so either one is enough.
  Give both themes a class selector and a `prefersColorScheme` to get "follow the OS,
  but either class forces a mode". If you relied on the old "both" semantics, drop
  `prefersColorScheme` and keep the class.

## FAQ

### Why not WCAG 2 contrast ratios?

Because they are wrong in both directions. WCAG 2 passes some pairs that are hard to
read (light grey on white at exactly 4.5:1 with thin type) and fails pairs that are fine
(dark text on saturated colors). It also cannot tell dark-on-light from light-on-dark,
which matters: `#888888` on white measures Lc 63, white on `#888888` measures Lc 68.5.
APCA's polarity-aware model is why tint can derive the direction of contrast instead of
asking you for it.

### Why OKLCH?

Because lightness has to mean the same thing for every hue. In HSL, yellow at L 50% and
blue at L 50% differ wildly in perceived brightness, so "step the surface two shades
darker" would behave differently per palette. OKLCH is perceptually uniform enough that
`ls: 2` is the same visual step for `brand`, `warning` and `error`, and that APCA
contrast is monotonic in L within one polarity, which is what the solver relies on.

### Why can't text on my mid-tone button reach Lc 75?

Contrast is a function of both colors, and a mid-tone background limits both sides. For
`brand: #7c3aed` with `action: { lc: 45 }` on a near-white surface, the solved fill is
`#ae95ff` (OKLCH L 0.73). White on it reaches Lc 53; black reaches Lc 56. Nothing on
earth gets Lc 75 against that fill. The reference, not the text token, is the problem,
and tint tells you so with `contrast-unreachable` plus `reference-midtone`.

How the ceiling moves with the fill's own contrast against the surface:

| `action.lc` | fill      | OKLCH L | white text | black text |
| ----------- | --------- | ------- | ---------- | ---------- |
| 45          | `#ae95ff` | 0.73    | Lc 53      | Lc 56      |
| 55          | `#9e7aff` | 0.67    | Lc 64      | Lc 46      |
| 60          | `#966aff` | 0.64    | Lc 69      | Lc 41      |
| 65          | `#8e58ff` | 0.61    | Lc 74      | Lc 36      |
| 70          | `#8547f9` | 0.57    | Lc 79      | Lc 31      |
| 75          | `#7a37eb` | 0.53    | Lc 84      | Lc 26      |

The fixes, in order of preference:

1. Push the fill away from the middle: `action: { lc: 65 }` or higher gives white text
   Lc 74+. The button gets darker and the label gets legible.
2. Accept the ceiling for large or bold labels: Lc 60 on the label is APCA's threshold
   for comfortable text at larger sizes, and `on.action: { lc: 60 }` on a Lc 60 fill
   passes in both light and dark mode.
3. Use `lc: "pure"` on the label to take the extreme (white here, Lc 69) and let the
   audit report what you got.

### Why is my dark surface not the color I passed as `base`?

For `ls` tokens the seed contributes hue and chroma only. Lightness comes from `offset`
and the step count, so `base: "#1c1c1f"` in dark mode gives `surface { ls: 0 }` =
`#0b0b0e` (L 0.15, the dark default offset). Raise `offset` for a lighter dark theme.

### Why did `on.action` contrast against `action.hover` instead of `action.DEFAULT`?

That happens when the group has neither a `DEFAULT` variant nor a `$reference`: the
reference then falls back to the variant with the highest value, and `hover` is usually
higher than the resting state. Name the resting variant `DEFAULT` or mark it
`$reference: true`.

## License

MIT
