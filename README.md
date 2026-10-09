# tint

APCA-driven design-token color generator. A config of a few seed colors and a token
structure becomes complete, accessible, interchangeable palettes for light and dark mode,
as CSS variables, Tailwind v4 `@theme` blocks, DTCG JSON or a flat map.

## In 30 seconds

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

`tint build` (or `@tint "./tint.config.ts"` in your CSS) yields:

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

Every `lc` is an APCA contrast target that tint solved for; every palette has the same
shape, so with the Tailwind integration `<button class="bg-action text-on-action">`
becomes an error button by adding `tint-error` to any ancestor. Change `mode` to `"dark"`
and the same config produces the dark theme.

## Install

```bash
pnpm add -D @skylerknight/tint esbuild
```

`esbuild` is an optional peer, needed only to load `tint.config.ts`.

## Documentation

- [Package README](packages/tint/README.md): quick start (Vite, PostCSS, programmatic),
  config reference, output formats, Tailwind integration, diagnostics, CLI, API, FAQ.
- [Concepts](docs/concepts.md): the mental model, with dependency diagrams.
- [Recipes](docs/recipes.md): status colors, soft buttons, focus rings, dark-mode fills,
  overrides, high-contrast themes, multiple brands, `virtual:tint`, Next.js.
- [Architecture](docs/architecture.md): the pipeline, the solver, determinism, where to
  extend.
- [SPEC.md](SPEC.md): the engineering specification the implementation follows.
- [CHANGELOG.md](CHANGELOG.md).

## Monorepo layout

```
packages/tint/            @skylerknight/tint (library, CLI, Vite and PostCSS plugins)
  src/color/              parse, convert, gamut, OKLCH helpers
  src/contrast/           APCA and the Lc solver
  src/config/             types, validation, resolution
  src/engine/             generation and diagnostics
  src/output/             css, json, tailwind, intellisense formatters
  src/audit/              contrast report
  src/loader/             config loading (esbuild for TypeScript)
  src/cli/                tint build | check | inspect | init
  src/vite/  src/postcss/ plugins
  tests/                  vitest, mirrors src/
examples/vite-playground/ Vite + Tailwind v4 demo with light and dark themes
docs/                     concepts, recipes, architecture
```

## Development

```bash
pnpm install
pnpm build                          # tsup, every package
pnpm test                           # vitest run, every package
pnpm --filter vite-playground dev   # the example app
```

Inside `packages/tint`: `pnpm test` (watch), `pnpm typecheck`, `pnpm lint`
(tsc + prettier check).

## License

MIT
