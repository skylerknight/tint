# Changelog

## 4.0.0-alpha.0

First alpha of the v4 config. Install with `@skylerknight/tint@next`. The public
entry exports the v4 API. The migration map is [docs/migration-v4.md](docs/migration-v4.md).
The quick start is [examples/v4-spec](examples/v4-spec) and the
[package README](packages/tint/README.md).

### Breaking

- One config object replaces the v3 theme array. `palette` holds the colors
  (the first is the default; `base` is not special). `themes` holds light, dark,
  and high-contrast. Tokens are `surface()`, `text()`, `border()`, and
  `emphasis()`, with levels and states. v3 keys (`colors`, `overrides`, `lc` /
  `ls`, `$on`, `$reference`, `$invert`, `$role`, `$chroma`, `$scale`,
  `$decorative`, `name`, `mode`, `selector`, `prefersColorScheme`,
  `prefersContrast`, `scale`, `offset`) fail validation with `code: "v3-config"`.
- A high-contrast theme that `extends` another theme must set its own selector.
  The spec example uses `.light-hc`. Copying `.light` would emit a second
  unconditional `.light` block.
- `defineConfig` accepts a single config and does not validate. `generate`
  always returns `GenerationResult[]`. Results expose `diagnostics` (`info`,
  `warning`, `error`). The `warnings` array is gone.
- `loadConfig` returns `{ config, path, dependencies }`.
- Output formats are `css`, `tailwind`, `dtcg`, and `flat`. The v3 format name
  `json` is rejected: it split into `dtcg` (`tokens.dtcg.json`) and `flat`
  (`tokens.flat.json`).
- `toJSON` is now `toDTCGJSON`. `toFlatMap` is now `toFlat` / `toFlatJSON`.
  `toCSSWithTailwindAndTint` and `toTailwindIntelliSense` are no longer public.
  `toCSSWithTailwind` emits the variables, the alias layer, `@theme static`,
  `tint-<palette>` utilities, and shortcut utilities.
- Emitted notation defaults to `oklch`. `output.format` is `oklch`, `hex`, or
  `rgb`. `output.prefix` prepends a CSS identifier to every custom property
  (`"tint"` → `--tint-brand-action-hover` and alias `--tint-action-hover`).
  `tint-<palette>` class names are unchanged. DTCG and flat keys ignore the prefix.
- Plugin options are `tintUtilities` and `shortcuts`. `generateTintUtilities`,
  `generateShortcuts`, `simplifyNames`, `defaultPalette`, and `includeOKLCH`
  are gone.
- `LC_SHORTCUTS` is removed. Levels are the §3 names or ordinals 1–5.

### Added

- Kind functions and the JSON form they return. Level aliases (`levels`,
  including `$replace`). State grammar (`hover`, `pressed`, `selected-hover`,
  `checked-disabled`, …) with `active` normalized to `pressed`.
- `on` solves against a token and its states (except `disabled`). Omitted `on`
  uses the base surface. Auto-nudge moves an emphasis fill so its label can pass
  (`emphasis-nudged`, `label-unreachable`, `nudge: false`).
- `palette` color options: `exact`, `tune`, `default`. Per-theme `palette` deltas.
- Engine lints: `contrast-unreachable`, `label-unreachable`, `emphasis-nudged`,
  `exact-rejected`, `duplicate-token`, `hue-identity-lost`, `expert-value`,
  `color-out-of-gamut`. `name-conflict` is a config error (a token shortcut would
  replace a Tailwind utility).
- JSON Schema for the config, `$id`
  `https://unpkg.com/@skylerknight/tint/schema/v4.json`. A JSON config may set
  `$schema` to that URL. The file is also exported as
  `@skylerknight/tint/schema/v4.json`.
- `contrast.algorithm` (`apca` or `wcag2`) and `contrast.level` (`standard`,
  `more`, `max`), overridable per theme.
- CLI formats `dtcg` and `flat`. `tint check --strict`, `tint inspect`
  (`--theme`, `--palette`, `--json`), `tint init` (`--dark`, `--brand`, `--yes`).
- README samples are typechecked and executed by
  `packages/tint/tests/docs/readme-examples.test.ts` (`pnpm docs:examples`).

## 3.0.0

A ground-up rewrite against [SPEC.md](SPEC.md). The config format is compatible with v2
in shape; the engine, outputs and tooling are new.

### Added

- Structured diagnostics: `result.diagnostics` with `code`, `path`, `message`, `hint`
  and `data`. Codes: `contrast-unreachable`, `contrast-below-minimum`,
  `role-contrast-low`, `seed-out-of-gamut`, `palette-name-conflict`,
  `reference-midtone`. `result.warnings` remains as the message list.
- Role lint: `$role` now enforces minimum Lc for non-decorative referenced `lc` tokens
  (text 45, icon 30, action 30, status 30, border 15).
- `$chroma` multiplier (0..2) on groups, variants and overrides.
- `audit(result)` and `formatAuditTable(report)`: a per-token pass/warn/fail/n/a report.
- CLI: `tint check [--strict]` for CI and `tint inspect [--palette] [--theme]` for the
  audit table, alongside `tint build` and `tint init`. `--help` and `--version`.
- `"flat"` output format (`tokens.flat.json`) and `toFlatMap`.
- `toTailwindIntelliSense` and the `node_modules/.tint/intellisense.css` file written by
  both plugins for the Tailwind IntelliSense extension.
- Vite `virtual:tint` (and `virtual:tint/<config-path>`) module exporting the generated
  `GenerationResult[]`.
- DTCG `$extensions["dev.tint"]` metadata (`kind`, `lc`/`ls`, `target`, `on`,
  `reference`) on every token; `metadata: false` to omit.
- `defineConfig` keeps literal types through a `const` generic and accepts an array of
  themes.
- Generated tokens expose `kind`, `target` (requested Lc), `reference`, `on` and
  `decorative`.
- Validation collects every issue with a dotted path and a hint, including unknown
  keys, unknown `$on` targets, self-references and `$on` cycles.

### Changed

- Automatic reference selection now prefers a variant named `DEFAULT` before falling back
  to the highest-value variant, so `$on: "action"` targets the resting fill by default.
- Theme names must be safe identifiers (`/^[a-zA-Z][a-zA-Z0-9_-]*$/`) and unique within a
  multi-theme config; they become output directories.
- `contrast-unreachable` reports the ceiling of the locked polarity when `$invert` is set.
- Automatic (media query) theme blocks exclude sibling themes' class selectors
  (`:root:not(.light)`), so a class can force a mode against the OS preference.

- `lc: "pure"` on a foundation token is the mode baseline (white in light mode, black in
  dark); with a reference it is the extreme on the chosen polarity side.
- Loading a config bundles it with esbuild and stubs the `@skylerknight/tint` import, so
  configs load in monorepos, strict pnpm layouts and before the package is built. Bundled
  dependencies are reported and watched by the plugins.
- CSS scoping: a theme with a media preference and a custom selector (`.dark` +
  `prefersColorScheme: "dark"`) now emits a manual `.dark { … }` block followed by an
  automatic `@media (prefers-color-scheme: dark) { :root { … } }` block, so the theme
  applies on class *or* OS preference. v2 nested the selector inside the media query and
  required both. With `selector: ":root"` only the media block is emitted; with no media
  preference only the plain selector block. The alias layer is scoped the same way.
- Audit: for `ls` tokens the `achieved` value is the raw, un-clipped APCA distance from
  the token's reference (or the mode baseline), informational only.
- `toCSSWithTailwindAndTint` output is fixed in five sections: variables, alias layer,
  `@theme static`, `tint-*` utilities, shortcut utilities. Multi-theme results must share
  one token structure (`assertConsistentStructure`).
- Solver guarantees: when a target is reached, achieved Lc is within the tolerance (0.25)
  above the target unless 8-bit quantization prevents it. Unreachable targets fall back
  to the opposite polarity unless `$invert` is set.
- APCA-W3 0.1.9 constants; reference checks are part of the test suite.
- Zero runtime dependencies. `esbuild`, `vite` and `postcss` are optional peers.
- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`;
  ESM with `.js` specifiers; named exports only (the PostCSS plugin also has a default).

### Removed

- Runtime dependencies `valibot`, `commander` and `@inquirer/prompts`. Validation is a
  hand-written zero-dependency schema; the CLI uses `node:util` `parseArgs` and
  `node:readline/promises`.
