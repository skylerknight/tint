# Recipes

**v3.** The fragments on this page are v3 configs (`colors`, `lc`, `ls`). Version
4.0.0-alpha.0 replaces them. See the [package README](../packages/tint/README.md)
and the [migration guide](migration-v4.md).

Common patterns, each with a config fragment and the real output it produces (light mode
unless stated). Hex values come from running the fragment through `generate`; your
numbers will match for the same seeds.

## Status colors (success, warning, error)

Add the seeds and a `status` group. The same structure gives you a solid badge, a soft
badge, and readable text on both.

```ts
colors: { base: "#ffffff", success: "#16a34a", warning: "#d97706", error: "#dc2626" },
tokens: {
  surface: { DEFAULT: { ls: 0 } },
  status: {
    $on: "surface",
    $role: "status",
    DEFAULT: { lc: 60 },                  // solid fill
    bg: { ls: 2 },                        // soft fill
    border: { lc: 25, $decorative: true },
  },
  on: {
    status: { lc: 60, $on: "status" },           // text on the solid fill
    "status-bg": { lc: 75, $on: "status.bg" },   // text on the soft fill
  },
},
```

```css
--success-status: #009c43;
--success-status-bg: #d7f7db;
--success-status-border: #68e286;
--success-on-status: #ccffd4;
--success-on-status-bg: #006429;

--warning-status: #cb6f00;
--warning-status-bg: #ffe8d7;
--warning-status-border: #ffbc89;
--warning-on-status: #fff0e4;
--warning-on-status-bg: #804300;

--error-status: #f3413b;
--error-status-bg: #ffe6e3;
--error-status-border: #ffb8af;
--error-on-status: #ffeeec;
--error-on-status-bg: #9e000c;
```

With Tailwind:

```html
<span class="tint-success rounded border border-status-border bg-status-bg px-2 text-on-status-bg">
  Deployed
</span>
<span class="tint-error rounded bg-status px-2 text-on-status">Failed</span>
```

Note that `warning` with seed `#d97706` comes out as `#cb6f00` at Lc 60: tint darkens the
orange until it actually contrasts with the page, which is what a readable amber badge
needs. If you want the seed's lightness, you want an `ls` token, not an `lc` one.

## Soft (tinted) buttons

A soft button is a surface, not a foreground: use `ls` for the fill and `lc` for the label
measured against that fill.

```ts
action: {
  $on: "surface",
  DEFAULT: { lc: 60, $reference: true },
  soft: { ls: 3 },
  "soft-hover": { ls: 4 },
  "soft-active": { ls: 5 },
},
on: {
  "action-soft": { lc: 75, $on: "action.soft" },
},
```

```css
--brand-action-soft: #dad4f8;
--brand-action-soft-hover: #d4caff;
--brand-action-soft-active: #cdc3fc;
--brand-on-action-soft: #400089;
```

```html
<button class="bg-action-soft text-on-action-soft hover:bg-action-soft-hover active:bg-action-soft-active">
  Secondary
</button>
```

Because `soft` is three steps from `surface.raised`, the hover and active states are one
step further each, and the label is solved against `soft` (not `soft-hover`). Lc 75 on
`soft` is still above Lc 70 on `soft-active`, two steps away, so one label token serves
all three states.

## Focus rings

A ring is a border with real contrast requirements, since it has to be visible against
the surface at a 2px width. Lc 65 is a safe target; `ring` is a Tailwind prefix so the
shortcut `ring-default` is generated too.

```ts
ring: { $on: "surface", $role: "border", DEFAULT: { lc: 65 } },
```

```css
--brand-ring: #7437ec;
--base-ring: #6c6c6c;
```

```html
<button class="focus-visible:outline-2 focus-visible:outline-ring">Save</button>
<input class="focus:ring-2 ring-default" />
```

`outline-ring` uses the unprefixed `--color-ring`, so inside `tint-error` the ring is red.

## Text on brand fills in dark mode

You do not need to do anything. In light mode a Lc 60 fill is mid-dark and gets a light
label; in dark mode it is mid-light and gets a dark label. One token:

```ts
action: { $on: "surface", DEFAULT: { lc: 60 } },
on: { action: { lc: 60, $on: "action" } },
```

| theme | `--brand-action` | `--brand-on-action` |
| ----- | ---------------- | ------------------- |
| light | `#8a4cfe`        | `#e7e2ff`           |
| dark  | `#baa5ff`        | `#22004e`           |

If you specifically want white-on-purple in dark mode, you have two choices:

1. Raise the fill's contrast so the label can reach its target on the light side:
   `action: { lc: 75 }` yields a lighter purple in dark mode and the dark label is the
   only option. A high-contrast fill cannot carry a light label in dark mode; that is
   physics, not configuration.
2. Make the fill *less* contrasting against the dark surface so it is dark enough for
   white text, then `$invert` the label:

   ```ts
   action: { $on: "surface", DEFAULT: { lc: 45 } },
   on: { action: { lc: 60, $on: "action", $invert: true } },
   ```

   Check `tint inspect --theme dark` afterwards. `$invert` disables the automatic
   fallback, so an unreachable target produces a `contrast-unreachable` diagnostic and
   the best achievable color.

## Per-color overrides

Seeds differ in how much chroma they carry at a given lightness, and sometimes one
palette needs a nudge. Overrides are applied before solving, so dependents follow.

```ts
colors: { base: "#ffffff", brand: "#7c3aed", warning: "#d97706", info: "#2563eb" },
tokens: {
  surface: { DEFAULT: { ls: 0 } },
  action: { $on: "surface", DEFAULT: { lc: 60 } },
  on: { action: { lc: 60, $on: "action" } },
},
overrides: {
  "warning,info": { action: { DEFAULT: { lc: 70 } } },  // stronger fills for these two
},
```

```css
--brand-action: #966aff;      /* Lc 60 */
--warning-action: #ac5d00;    /* Lc 70 */
--info-action: #2967f0;       /* Lc 70 */
--info-on-action: #d5e3ff;    /* solved against the overridden fill */
```

Other things an override can set: `ls`, `$scale`, `$decorative`, `$invert`, `$chroma`.
A common one is desaturating a palette's text: `warning: { text: { body: { $chroma: 0.5 } } }`.

## Neutral text in a tinted palette

Each palette's text is, by default, fully saturated in the seed's hue. For long-form text
on a tinted card that is often too much. `$chroma` on the group tones it down for every
palette at once:

```ts
text: {
  $on: "surface",
  $chroma: 0.3,
  heading: { lc: 90 },
  body: { lc: 75 },
},
```

For `brand` this turns body text from `#6712d1` (`$chroma: 1`) into `#574e7b`
(`$chroma: 0.3`); `$chroma: 0` gives `#545454`, a plain grey at exactly the same Lc.

## High-contrast theme with `prefersContrast`

Export a third config with the same structure, higher targets and `prefersContrast:
"more"`. It is emitted inside `@media (prefers-contrast: more)` and layers over the
default theme for users who ask for it.

```ts
const highContrastTokens = {
  surface: { DEFAULT: { ls: 0 }, raised: { ls: 2, $reference: true } },
  text: { $on: "surface", heading: { lc: 100 }, body: { lc: 90 }, muted: { lc: 75 } },
  border: { $on: "surface", $role: "border", DEFAULT: { lc: 45 } },
  action: { $on: "surface", DEFAULT: { lc: 75, $reference: true } },
  on: { action: { lc: 75, $on: "action" } },
} as const;

export default defineConfig([
  { name: "light", mode: "light", colors, tokens },
  { name: "light-hc", mode: "light", prefersContrast: "more", offset: 0, colors, tokens: highContrastTokens },
]);
```

Two caveats. The Tailwind formatters require every theme to share the same palette,
group and variant names (`assertConsistentStructure`), so the high-contrast token set
must have the same *shape* as the normal one, only with different numbers. And the
override is purely CSS: `:root` is declared twice, and the media-query block wins when
it applies.

```css
@media (prefers-contrast: more) {
  :root {
    /* brand palette */
    --brand-surface: #ffffff;
    --brand-text-body: #6100c8;
    /* … */
  }
}
```

`offset: 0` makes the page background pure white in that theme.

## Multiple brands or themes

Themes are an array; each needs a distinct `selector` (and usually `name`), and every
theme must share the token structure.

```ts
export default defineConfig([
  { name: "light", mode: "light", selector: ".light", prefersColorScheme: "light", colors: lightColors, tokens },
  { name: "dark", mode: "dark", selector: ".dark", prefersColorScheme: "dark", colors: darkColors, tokens },
]);
```

Each theme is emitted twice: a manual block (`.light { … }`, `.dark { … }`) and an
automatic block that excludes the other theme's class
(`@media (prefers-color-scheme: dark) { :root:not(.light) { … } }` and the mirror for
light). With no class on `<html>` the OS preference decides; `.light` or `.dark` forces a
mode regardless of the OS. That gives a "follow the system" default plus a real toggle:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

```ts
const html = document.documentElement;
const isDark = () =>
  html.classList.contains("dark") ||
  (!html.classList.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches);

toggle.addEventListener("click", () => {
  const dark = isDark();
  html.classList.toggle("dark", !dark);
  html.classList.toggle("light", dark);
});
```

Two simpler setups: class-only (omit `prefersColorScheme`, keep `light` on `:root`; only
`.dark { … }` is emitted and your script decides) and OS-only (`selector: ":root"` plus
`prefersColorScheme`; only the media block is emitted). Avoid `light` on `:root` *with* a
dark theme that has both a class and `prefersColorScheme`: under an OS dark preference
the automatic dark block has nothing to exclude, so the page cannot be forced light. The
alias layer in the Tailwind output follows the same scoping, so unprefixed `--color-*`
variables flip along with the theme.

For multiple *brands* (two customers, one product) add seeds rather than themes:
`colors: { base, acme: "#0ea5e9", globex: "#f43f5e", … }` and apply `tint-acme` or
`tint-globex` on `<body>`. Everything written with unprefixed classes re-skins. If the
brand should also change the neutral surfaces, give each brand its own `base`-like seed
and set `defaultPalette` in the plugin options to the one you want unprefixed by
default.

## Using `virtual:tint` at runtime

The Vite plugin exposes `GenerationResult[]` so app code can read the solved colors, for
example to color a canvas chart, set `theme-color`, or list diagnostics in a dev panel.

```ts
import themes from "virtual:tint";

const light = themes.find((t) => t.mode === "light")!;
const brand = light.palettes.find((p) => p.name === "brand")!;

document.querySelector('meta[name="theme-color"]')!.setAttribute(
  "content",
  brand.tokens.surface!.DEFAULT!.hex,
);

if (import.meta.env.DEV) {
  for (const t of themes) {
    for (const d of t.diagnostics) console.warn(`[tint:${t.name}] ${d.path}: ${d.message}`);
  }
}
```

Declare the module once (the playground keeps it in `src/vite-env.d.ts`):

```ts
declare module "virtual:tint" {
  import type { GenerationResult } from "@skylerknight/tint";
  const themes: GenerationResult[];
  export default themes;
}
```

`virtual:tint` is the first config seen by an `@tint` directive; `virtual:tint/tint.config.ts`
(path relative to the project root) picks a specific one. Importing it before any CSS has
been transformed loads the config at the default path.

## Next.js

Next.js runs Tailwind through PostCSS, so use the PostCSS plugin.

```bash
pnpm add -D @skylerknight/tint esbuild tailwindcss @tailwindcss/postcss postcss
```

`postcss.config.mjs`:

```js
export default {
  plugins: {
    "@skylerknight/tint/postcss": {},   // before tailwind
    "@tailwindcss/postcss": {},
  },
};
```

`tint.config.ts` at the project root, next to `next.config.ts`.

`app/globals.css`:

```css
@import "tailwindcss";
@tint "./tint.config.ts";
```

The path resolves against `root` (default `process.cwd()`, the project root), not against
the CSS file. The plugin registers the config and everything it imports as PostCSS
dependencies, so edits trigger a rebuild. If the config fails to load, the last good
output is served from `node_modules/.tint/cache/` with a `/* [tint] Error: … */` comment
at the top and a PostCSS warning, so a typo in the config does not blank the page.

For editor completion add to `.vscode/settings.json`:

```json
{ "tailwindCSS.experimental.configFile": "node_modules/.tint/intellisense.css" }
```

## Checking in CI

```bash
tint check --strict
```

exits 1 on any diagnostic. Pair it with `tint inspect` in a PR comment if you want the
table.
