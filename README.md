# tint

tint builds accessible, interchangeable color palettes from a few palette colors
and one token template. Each token names a kind (`surface`, `text`, `border`,
`emphasis`) and a level. tint solves the color against the surface it sits on,
for every palette color and every theme, and emits CSS variables, Tailwind v4
`@theme` blocks, DTCG JSON, or a flat map.

4.0.0-alpha.0 is the v4 config. A `tint-danger` class re-skins any subtree that
uses the unprefixed tokens (`bg-action`, `text-action-on`, `bg-surface-raised`).

## In 30 seconds

```ts
import { defineConfig, emphasis, generate, surface, text, toCSS } from "@skylerknight/tint";

const config = defineConfig({
  palette: {
    neutral: "#71717a",
    brand: { color: "#7c3aed", exact: true },
    danger: "#dc2626",
  },
  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: {
      mode: "dark",
      selector: ".dark",
      media: true,
      palette: { brand: "#a78bfa" },
    },
  },
  tokens: {
    surface: { DEFAULT: surface(), raised: surface("raised") },
    action: {
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      on: text({ on: "action" }),
    },
    text: { DEFAULT: text(), strong: text("strong"), muted: text("muted") },
    border: { DEFAULT: { kind: "border" }, firm: { kind: "border", level: "firm" } },
  },
});

export default config;

const light = generate(config)[0];
if (light) toCSS(light);
```

The full template (surface elevation, button states, borders, text, a list row,
and a `.light-hc` theme) is the quick start in the package README. It lives at
`examples/v4-spec`.

## Install

```bash
pnpm add -D @skylerknight/tint@next esbuild
```

`esbuild` is an optional peer, needed to load `tint.config.ts`. CI runs on Node
20 and Node 22.

## Documentation

- [Package README](packages/tint/README.md): install, the v4 quick start, kinds
  and states, `on`, palette and themes, contrast, `exact` and lints, CSS /
  Tailwind / DTCG / flat output, `output.format` and `output.prefix`, the CLI,
  Vite and PostCSS, and the programmatic API.
- [Migration from v3](docs/migration-v4.md): the §10 mapping, the playground
  rewrite, the `.light-hc` selector, and the renamed exports (`json` split into
  `dtcg` and `flat`).
- [v4 spec](docs/v4-spec.md): the normative API draft.
- [CHANGELOG](CHANGELOG.md).
- [SPEC.md](SPEC.md), [concepts](docs/concepts.md), [recipes](docs/recipes.md),
  and [architecture](docs/architecture.md) describe the v3 config and the color
  engine the v4 solver still uses.

JSON configs set
`"$schema": "https://unpkg.com/@skylerknight/tint/schema/v4.json"`.

## Monorepo layout

```
packages/tint/            @skylerknight/tint (library, CLI, Vite and PostCSS plugins)
  src/v4/                 v4 config, solver, and css / tailwind / dtcg / flat output
  src/color/              parse, convert, gamut, OKLCH helpers
  src/contrast/           APCA, WCAG 2, and the solver
  src/loader/             config loading (esbuild for TypeScript)
  src/cli/                tint build | check | inspect | init
  src/vite/  src/postcss/ plugins
  schema/v4.json          JSON Schema for a v4 config
  tests/                  vitest, mirrors src/
examples/v4-spec/         the v4 spec example (TypeScript and JSON)
examples/vite-playground/ Vite + Tailwind v4 demo
docs/                     v4 spec, v3 → v4 migration, v3 concept notes
```

## Development

```bash
pnpm install
pnpm build                          # tsup, every package
pnpm test                           # vitest run, every package
pnpm --filter vite-playground dev   # the example app
```

Inside `packages/tint`: `pnpm test` (watch), `pnpm typecheck`, `pnpm lint`
(tsc + prettier check), `pnpm docs:examples` (typecheck and run the README samples).

## License

MIT
