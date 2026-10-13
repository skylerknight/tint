# Migrating from tint v3 to v4

4.0.0-alpha.0 replaces the v3 config (`colors`, `lc` / `ls`, `$on`) with kinds,
levels, and states. Install the alpha with the `next` dist-tag:

```bash
pnpm add -D @skylerknight/tint@next
```

The public entry exports the v4 API only. A v3 document fails `validateConfig`,
`generate`, and `loadConfig` with `code: "v3-config"` and a hint that names the
replacement. The 4.0.0-alpha.0 commands are `build`, `check`, `inspect`, and
`init`. The mapping below is [docs/v4-spec.md](v4-spec.md) §10, applied the way
`examples/vite-playground/tint.config.ts` was migrated by hand.

`docs/concepts.md`, `docs/recipes.md`, and `docs/architecture.md` still describe
the v3 model. The v4 reference is the [package README](../packages/tint/README.md).

## Shape of a config

v3 was one object per theme, often an array, with seed colors and numeric
contrast on each variant. v4 is one object: a shared palette, a `themes` map,
and a token template. The quick start in `examples/v4-spec/tint.config.ts` is
the full shape. A smaller migrated button, surface, and text set:

```ts
import { defineConfig, emphasis, generate, surface, text, border } from "@skylerknight/tint";

export const config = defineConfig({
  contrast: { algorithm: "apca", level: "standard" },
  palette: {
    neutral: "#ffffff",
    brand: "#7c3aed",
    danger: "#dc2626",
  },
  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: {
      mode: "dark",
      selector: ".dark",
      media: true,
      palette: {
        neutral: "#1c1c1f",
        brand: "#a78bfa",
        danger: "#f87171",
      },
    },
  },
  tokens: {
    surface: {
      well: surface("sunken"),
      DEFAULT: surface(),
      raised: surface("raised"),
    },
    action: {
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      disabled: emphasis({ state: "disabled" }),
      on: text({ on: "action" }),
      "on-disabled": text({ state: "disabled", on: "action" }),
    },
    text: {
      strong: text("strong"),
      body: text(),
      muted: text("muted"),
      faint: text("faint"),
    },
    border: {
      subtle: border("hairline"),
      DEFAULT: border("soft"),
      strong: border(),
      focus: border("firm"),
    },
  },
});

generate(config);
```

That is the playground migration, trimmed to the tokens most UIs start with.
The playground file keeps `info`, `success`, and `warning` as well.

The same tokens as JSON, which is what the kind functions return:

```json config
{
  "$schema": "https://unpkg.com/@skylerknight/tint/schema/v4.json",
  "palette": { "neutral": "#ffffff", "brand": "#7c3aed" },
  "tokens": {
    "surface": { "DEFAULT": { "kind": "surface" }, "raised": { "kind": "surface", "level": "raised" } },
    "action": {
      "DEFAULT": { "kind": "emphasis" },
      "hover": { "kind": "emphasis", "state": "hover" },
      "on": { "kind": "text", "on": "action" }
    }
  }
}
```

## v3 keys

| v3 | v4 |
| --- | --- |
| `colors: { base, brand }` | `palette: { neutral, brand }`. The first palette color is the default. `base` is not special |
| `overrides: { warning: { action: { DEFAULT: { lc: 70 } } } }` | `palette.warning.tune`. A kind call replaces the token (`emphasis("bold")`). A partial object merges (`{ chroma: 0.5 }`). Share a tune across colors with a TypeScript variable |
| `lc: 90`, `"heading"` on text | `text("strong")` |
| `lc: 75`, `80`, `"body"` | `text()` (body, ordinal 3) |
| `lc: 60`, `"muted"` | `text("muted")` |
| `lc: 45`, `40`, `"placeholder"`, `"disabled"` | `text("faint")`, or `text({ state: "disabled" })` for a disabled label |
| `lc: N` on an action or fill | nearest emphasis level (`60` → `default`, `75` → `bold`), or `{ lc: N }` with `algorithm: "apca"` |
| `lc: N` on a border | nearest border level (15 hairline, 30 soft, 45 default, 60 firm, 75 heavy) |
| `lc: "pure"` | `text("max")` or `emphasis("loud")` |
| `ls: 0..n` on surfaces | an elevation level, or `surface({ step: n })` |
| `ls: n` on a soft fill (`action.soft`) | `emphasis("subtle")` and its states, usually in their own group |
| `$on: "surface"` on a group | omit it. The default backdrop is the base surface |
| `$on: "action"` on a variant | `{ on: "action" }`, which includes that token's states |
| `$on: "action.soft"` | `{ on: "action.soft" }`, or `{ on: "soft" }` when the soft fill is its own group |
| `$reference: true` | removed. The solver uses the worst-case backdrop set |
| `$invert: true` | `{ direction: "lighter" }` or `{ direction: "darker" }` |
| `$decorative: true` | implied by border levels 1–2, `state: "disabled"`, emphasis levels 1–2, and surfaces |
| `$role` | the kind |
| `$scale`, `scale` | `states` step config, or `surface({ step })` |
| `$chroma` | `{ chroma }` on the token, or `tune` on the palette color |
| `offset` | not a v4 config key. The validator tells you it is still internal |
| `hover: { lc: 68 }`, `active: { lc }` | `{ state: "hover" }`, `{ state: "pressed" }`. `active` normalizes to `pressed` |
| a separate `on` group (`on.action`) | the label inside the fill group: `action.on = text({ on: "action" })` |
| an array of theme configs | a `themes` map. Palette and tokens are shared |
| `name`, `mode`, `selector` on the root | theme name is the map key. `mode` and `selector` move onto the theme |
| `prefersColorScheme` | `themes.<name>.media` (`true`, or a query string) |
| `prefersContrast: "more"` plus hand-raised tokens | `themes.<name>.contrast.level: "more"` |
| copying a referenced color with `lc: 0` / `ls: 0` | the `duplicate-token` lint. There is no `ref()` alias in this alpha |

`LC_SHORTCUTS` is not exported. Use the level names.

## Playground migration

`examples/vite-playground/tint.config.ts` is a v3 playground config rewritten
with the table above. The comments in that file are the decisions:

| v3 playground | v4 |
| --- | --- |
| `colors.base: "#ffffff"` | `palette.neutral`. Dark `#1c1c1f` is `themes.dark.palette.neutral` |
| `colors.brand`, `info`, `success`, `warning`, `error` | the same keys on `palette`. Dark seeds are theme palette deltas (`brand: "#a78bfa"`, and the same for the status colors) |
| `surface.well` at `ls: 0` under the page | `surface("sunken")` |
| `surface.DEFAULT` | `surface()` (page, level `base`) |
| `surface.raised` | `surface("raised")` |
| `surface.lowlight` | `surface("flat")` |
| `surface.highlight` | `surface("floating")` |
| `surface.selection` | `surface({ state: "selected" })` |
| `text.heading` at Lc 90 | `text("strong")` |
| `text.body` at Lc 75 | `text()`. The token stays named `body`, so the shortcut class stays `text-body` |
| `text.muted` | `text("muted")` |
| placeholder / Lc 40 | `text("faint")` |
| decorative border (`ls`) | `border("hairline")` |
| border around Lc 25 | `border("soft")` |
| border around Lc 40 | `border()` (`default`) |
| the v3 ring at Lc 65 | `border("firm")`, used as the focus ring |
| `action.DEFAULT` at Lc 60 | `emphasis()` |
| `action.hover`, `action.active` | `emphasis({ state: "hover" })`, `emphasis({ state: "pressed" })` |
| `on.action`, `on.action` disabled | `action.on` and `action["on-disabled"]` |
| `action.soft` and its hover / active | a `soft` group: `emphasis("subtle")` plus `hover` and `pressed`, with `on: text({ on: "soft" })` |

The spec example (`examples/v4-spec`) uses `DEFAULT` for body text, so the
shortcut is `text-default`. The playground kept the token name `body`. Either
is a v4 config. Pick the class name you want in markup.

## High contrast and `.light-hc`

A high-contrast theme is a normal theme with `contrast.level: "more"` or
`"max"`. It does not need its own token template.

`extends` copies the parent theme, including `selector`. The spec example sets
`selector: ".light-hc"` on the high-contrast theme so the light theme keeps
`.light`. Omitting that selector emits a second `.light` block, and the later
one wins.

```ts
import { defineConfig, emphasis, generate, surface, text } from "@skylerknight/tint";

generate(
  defineConfig({
    palette: { neutral: "#71717a", brand: "#7c3aed" },
    themes: {
      light: { mode: "light", selector: ".light", media: true },
      "light-hc": {
        mode: "light",
        extends: "light",
        selector: ".light-hc",
        media: "(prefers-contrast: more)",
        contrast: { level: "more" },
      },
    },
    tokens: {
      surface: { DEFAULT: surface() },
      action: {
        DEFAULT: emphasis(),
        on: text({ on: "action" }),
      },
      text: { DEFAULT: text() },
    },
  }),
);
```

Formatted with the light theme, the automatic blocks are:

`@media (prefers-color-scheme: light) { :root:not(.light-hc) { … } }`

`@media (prefers-contrast: more) { :root:not(.light) { … } }`

Put the class on `<html>`: `class="light-hc"`. With no class, the OS preference
selects the theme.

## Outputs and renamed exports

v3 `tint build -f json` wrote DTCG through `toJSON`. v4 rejects the format name
`json`:

`Unknown format "json". v3 "json" split into "dtcg" and "flat".`

| v3 | v4 |
| --- | --- |
| `output.formats` includes `"json"` | `"dtcg"`. File: `<theme>/tokens.dtcg.json` |
| `output.formats` includes `"flat"` | still `"flat"`. File: `<theme>/tokens.flat.json` |
| `toJSON(result)` | `toDTCGJSON(result)` |
| `toDTCG(result)` | `toDTCG(result)` (object, unchanged name) |
| `toFlatMap(result)` | `toFlat(result)` and `toFlatJSON(result)` |
| `toCSS` default notation hex | default `oklch`. Pass `{ format: "hex" }` or set `output.format` |
| `toCSS(..., { includeOKLCH: true })` | removed. Use `format: "oklch"` |
| `toCSSWithTailwindAndTint` | `toCSSWithTailwind` (variables, aliases, `@theme static`, `tint-*`, shortcuts) |
| `toTailwindIntelliSense` | not exported. The plugins still write `node_modules/.tint/intellisense.css` |
| `generateTintUtilities` | `tintUtilities` |
| `generateShortcuts` | `shortcuts` |
| `simplifyNames`, `defaultPalette` | removed. `@theme` maps the alias layer (`--color-action`), and the default palette is the first entry or `default: true` |
| `generate(config)` returns one result | `generate` always returns `GenerationResult[]` |
| `result.warnings` | `result.diagnostics` (`info`, `warning`, `error`) |
| `loadConfig` → `{ configs }` | `{ config, path, dependencies }` |
| `defineConfig([light, dark])` | `defineConfig({ themes: { light, dark }, … })` |
| `LC_SHORTCUTS` | removed |

```ts
import {
  audit,
  formatAuditTable,
  generate,
  loadConfig,
  surface,
  text,
  toCSS,
  toCSSWithTailwind,
  toDTCG,
  toDTCGJSON,
  toFlat,
  toFlatJSON,
  toTailwind,
} from "@skylerknight/tint";

const themes = generate({
  palette: { neutral: "#71717a", brand: "#7c3aed" },
  output: { format: "hex", prefix: "tint", formats: ["css", "dtcg", "flat"] },
  tokens: {
    surface: { DEFAULT: surface(), raised: surface("raised") },
    action: {
      DEFAULT: { kind: "emphasis" },
      hover: { kind: "emphasis", state: "hover" },
      on: text({ on: "action" }),
    },
    text: { strong: text("strong"), body: text() },
  },
});

const light = themes[0];
if (light === undefined) throw new Error("expected a theme");

toCSS(themes, { format: "hex", prefix: "tint" });
toTailwind(light);
toCSSWithTailwind(themes);
toDTCG(light);
toDTCGJSON(light);
toFlat(light, { format: "hex" });
toFlatJSON(light);
formatAuditTable(audit(light));

export async function readConfig(configPath: string) {
  const loaded = await loadConfig({ configPath });
  return loaded.config;
}
```

`output` on the config is applied by `tint build` and the plugins. A direct
`toCSS(themes)` call uses its own defaults (`oklch`, no prefix) until you pass
options.

`prefix: "tint"` renames custom properties to `--tint-brand-action-hover` and
aliases to `--tint-action-hover`. DTCG and flat keys stay `brand.action.hover`.
The class stays `tint-brand`.

## CLI

```bash
tint build -f css,tailwind,dtcg,flat
tint build --tailwind-tint
tint check --strict
tint inspect --theme dark --palette brand
tint init --yes --dark --brand '#7c3aed'
```

`tint init` writes a v4 `tint.config.ts` (the quick-start tokens, optional dark
theme, no high-contrast theme). `tint inspect` prints the v4 audit columns:
kind, level, state, target, achieved, backdrop, status.

## Plugins

`@tint "./tint.config.ts"` is unchanged. `tint()` still runs before the Tailwind
plugin. Vite still resolves the path from the CSS file. PostCSS still resolves
it from `root`.

```ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tint } from "@skylerknight/tint/vite";

export default defineConfig({
  plugins: [tint({ format: "oklch", prefix: "tint" }), tailwindcss()],
});
```

`virtual:tint` still default-exports the themes. The type is `GenerationResult[]`,
the v4 result. Drop `includeOKLCH`, `simplifyNames`, `defaultPalette`,
`generateTintUtilities`, and `generateShortcuts` from plugin options.
