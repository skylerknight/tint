# Architecture

How `@skylerknight/tint` is put together, for contributors and for anyone who wants to
reason about what a given config will produce. [SPEC.md](../SPEC.md) is the normative
source; this page is the narrative.

## Pipeline

```
 config (unknown)
     │
     ▼
 validate   config/validate.ts   collect every Issue, throw ConfigError
     │
     ▼
 resolve    config/resolve.ts    normalize, pick references, build the $on graph,
     │                           topological order, expand overrides
     ▼
 generate   engine/generate.ts   per palette, walk the order, solve each token,
     │                           collect diagnostics
     ▼
 format     output/*.ts          css | json | flat | tailwind | intellisense
            audit/index.ts       pass/warn/fail report
```

Each stage is a pure function of the previous one. `generate(config)` runs the first
three; formatters take a `GenerationResult` and never look at the config again.

### Validate

`validateConfig(input: unknown)` is a hand-written schema with no dependencies. It walks
the object once, appending `{ path, message, hint? }` issues, and returns all of them
rather than the first. Checks run in this order so later ones can assume earlier
structure: top-level keys and enums, colors (parseable, valid identifiers), groups and
variants (allowed `$` keys per kind, ranges, one reference per group), `$on` target
existence and self-reference, `$on` cycles (DFS over effective edges, each cycle
reported once as `a.b -> c.d -> a.b`), overrides (existence, kind of `lc`/`ls`), output.

`assertConfig` throws `ConfigError`, whose message is the issue list formatted as
`Invalid tint config:\n  - path: message (hint)`.

### Resolve

`resolveConfig` turns the authored shape into something the engine can walk blindly:

- Every variant becomes a `ResolvedVariant` with `kind`, numeric `value` (`PURE = -1`
  for `"pure"`, shortcuts expanded), `on` fully resolved to `{ group, variant }` (the
  reference variant filled in when omitted), effective `decorative`, `invert`, `scale`
  (variant → group → `$on` group → config → 0.02) and `chroma` (variant → group → 1).
- `colors` is reordered so `base` comes first, then insertion order.
- `order` is a topological sort (Kahn's algorithm) over `on` edges. Among the ready nodes
  the earliest in config insertion order is emitted, so the order is deterministic and
  the same for every palette.
- `overrides` are expanded from `"a,b"` keys to per-color maps keyed `group.variant`.

### Generate

For each color: parse the seed (emitting `seed-out-of-gamut` for out-of-sRGB `oklch()`
inputs), pre-create the `tokens` object in **config order** (so output order is readable
regardless of dependency order), then walk `order` and fill each slot.

Per variant:

1. Apply the color's override to `value`, `scale`, `decorative`, `invert`, `chroma`.
2. Working seed `W = toGamut({ l: S.l, c: S.c × chroma, h: S.h })`.
3. Reference `R`: the generated `tokens[on.group][on.variant]`, or the mode baseline.
4. `value === 0` with a reference: copy `R`.
5. `ls`: `L = R.L ∓ ls × scale` (anchor is `1 - offset` / `offset` for foundations),
   chroma capped by `maxChromaForLs(ls)`, gamut-mapped.
6. `lc`: pick polarity, solve, fall back to the other side if unreached (unless
   inverted), emit diagnostics.

Palette-level `palette-name-conflict` is emitted up front for any color whose lowercase
name is a Tailwind utility prefix.

### Format

Formatters are independent and small. They share `output/names.ts` for variable naming
(`tokenVarName`, `simplifyTailwindParts`, `variantSegment` which turns `DEFAULT` into an
empty segment) and `output/css.ts` for scoping (`scopeBlock`: a plain selector block, an
automatic `@media (…) { :root { … } }` block, or both when a theme has a custom selector
and a media preference). The
Tailwind formatters validate that multi-theme results share one structure
(`assertConsistentStructure`) and that name simplification is injective
(`detectTailwindConflicts`) before emitting anything.

## The solver

`contrast/solve.ts` answers: "with this hue and chroma, what lightness gives Lc *t*
against background *B*, on the *lighter* or *darker* side?"

```
solveContrast(seed, B, t, { polarity, raw?, tolerance = 0.25 })

  bgL  = OKLCH(B).L
  far  = polarity == darker ? 0 : 1
  if t <= 0            → color at bgL, lc 0, reached
  if lc(far) < t       → the extreme, reached: false        (ceiling is below the target)

  near = bgL, farEnd = far, best = sample(far)
  repeat ≤ 60 times while |farEnd - near| > 1e-5:
      mid = (near + farEnd) / 2
      s   = sample(mid)                 gamut-map(seed at L=mid) → sRGB → |APCA| vs B
      if s.lc >= t:  best = min-overshoot(best, s); stop if s.lc - t <= tolerance; farEnd = mid
      else:          near = mid
  return best, reached: true
```

Properties the engine relies on:

- **Monotonic.** For fixed hue and chroma, within one polarity, |Lc| is monotonic in
  OKLCH L even after gamut mapping, because gamut mapping only reduces chroma and APCA
  depends on luminance. Bisection is therefore exact.
- **Measured, not predicted.** Every sample converts to 8-bit sRGB and measures APCA on
  that, so the reported `lc` is what a browser will show.
- **Guarantee.** When `reached` is true, `t <= lc <= t + tolerance` unless 8-bit
  quantization makes that impossible, in which case `lc` is the smallest achievable value
  `>= t`.
- **`raw: true`** uses `calcAPCAraw`, which omits APCA's low-contrast clip so the curve
  stays monotonic near zero. The engine uses the clipped value for reported numbers.

`maxContrast` samples the extreme only; `preferredPolarity(B)` compares black and white
against `B` and is the engine's default direction for referenced tokens.

### APCA

`contrast/apca.ts` is APCA-W3 0.1.9 with the official constants (sRGB to Y via the 2.4
power curve with coefficients 0.2126729 / 0.7151522 / 0.0721750; black soft-clamp at
0.022; exponents 0.56/0.57 for black-on-white and 0.62/0.65 for white-on-black; scale
1.14; offsets 0.027; low clip 0.1). The test suite pins the reference pairs
(`#000/#fff` = 106.04, `#fff/#000` = -107.88, `#888/#fff` = 63.06, `#fff/#888` = -68.54,
`#aaa/#000` = -56.24, `#000/#aaa` = 58.15) to ±0.5.

### Color

`color/` holds the sRGB ↔ linear ↔ OKLab ↔ OKLCH conversions (Björn Ottosson's
matrices), parsing for hex, `rgb()`, `hsl()`, `oklch()` and the 148 CSS named colors,
and gamut mapping. `toGamut` bisects chroma in `[0, c]` to the largest in-gamut value,
preserving L and H; `L <= 0` and `L >= 1` short-circuit to black and white.

## Determinism

Identical config, identical bytes. There is no randomness, no clock, no dependence on
object identity. Specifically:

- Token iteration follows config insertion order; topological order breaks ties by
  insertion index.
- The solver's bisection is a fixed sequence of midpoint evaluations.
- Hex output is lowercase `#rrggbb`; OKLCH output is formatted to fixed precision.
- Diagnostics are appended in evaluation order (palette order, then `order`).

This makes generated CSS safe to commit and diff, and lets the test suite use small
golden strings.

## Where the tooling sits

```
 loader/      loadConfig: .json parse | native import | esbuild bundle (TS, or JS that
              fails to import), stubs the @skylerknight/tint import, returns configs
              plus every bundled file path
     │
     ├── cli/      build | check | inspect | init   (node:util parseArgs, no deps)
     ├── vite/     @tint directive → toCSSWithTailwindAndTint, watch dependencies,
     │             full-reload on change, virtual:tint, intellisense.css
     └── postcss/  @tint at-rule → same output, dependency messages, last-good cache
```

The loader bundles the config into `node_modules/.tint/config.<hash>.<mtime>.<pid>.mjs`,
imports it, and deletes the file. The `metafile` from esbuild provides the dependency
list (excluding `node_modules`) that the plugins register as watch files. Replacing the
`@skylerknight/tint` import with a stub (`defineConfig = (c) => c`) during bundling
means the config never needs the built package; validation happens after loading.

## Code conventions

- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
  Optional fields are omitted rather than set to `undefined`, which is why resolved
  objects are built with spread-conditionals.
- ESM with `.js` import specifiers, named exports only (the PostCSS plugin also has a
  default export, per PostCSS convention).
- Zero runtime dependencies in `color`, `contrast`, `config`, `engine`, `output`,
  `audit` and `cli`. `esbuild`, `vite` and `postcss` are optional peers used only by
  `loader`, `vite` and `postcss`.
- Prettier, print width 90.
- Tests mirror `src/` under `tests/`, run in under a second, and prefer property-style
  loops over many seeds for solver and gamut invariants.

## Where to extend

| Want to…                                   | Touch                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Add an output format                       | `output/<name>.ts` taking a `GenerationResult`; export from `output/index.ts` and `index.ts`; add it to `OutputFormat`, `OUTPUT_FORMATS` and the CLI's `build` file map. |
| Add a diagnostic                           | Add the code to `DiagnosticCode` in `engine/diagnostics.ts`, emit it in `engine/generate.ts` with a `path`, `hint` and `data`; document it in the README table. The audit picks it up automatically via `path`. |
| Add a `$` setting                          | `config/types.ts` (type), `config/validate.ts` (allowed-key lists and range), `config/resolve.ts` (precedence into `ResolvedVariant`), `engine/generate.ts` (effect), `OverrideValue` if it should be overridable. |
| Add a role or change a minimum             | `ROLE_MIN_LC` in `engine/diagnostics.ts`, `TOKEN_ROLES` in `config/types.ts`.                   |
| Change the `ls` chroma ceiling             | `maxChromaForLs` in `engine/generate.ts`.                                                       |
| Add a shortcut property                    | `SHORTCUT_PROPERTIES` in `output/tailwind.ts` and `TAILWIND_UTILITY_PREFIXES` in `output/names.ts`. |
| Accept a new color syntax                  | `color/parse.ts` (`parseColor` / `tryParseColor`).                                              |
| Add a CLI command                          | `cli/run.ts`; keep it dependency-free and return an exit code.                                  |
