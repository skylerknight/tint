# Changelog

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

- `lc: "pure"` on a foundation token is the mode baseline (white in light mode, black in
  dark); with a reference it is the extreme on the chosen polarity side.
- Loading a config bundles it with esbuild and stubs the `@skylerknight/tint` import, so
  configs load in monorepos, strict pnpm layouts and before the package is built. Bundled
  dependencies are reported and watched by the plugins.
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

- The hand-rolled v2 schema layer and its dependencies.
