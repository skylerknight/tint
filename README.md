# tint

tint generates contrast-compliant color tokens by role. **v5 is in progress.**
The engine and the public config API are being rewritten. The plan is
[docs/v5-milestone-1.md](docs/v5-milestone-1.md).

The v4 engine and API now live in `packages/tint/legacy/v4`. That tree is not
typechecked, bundled, linted, or tested. The CLI shell, the CSS and Tailwind
emitters, and the color and contrast modules still build.

## Status

Milestone 1 is the engine only. There is no new public config yet.
`generate()` is a placeholder that returns `{ version: 5 }`. Presets,
publishing, and the HTML card come in later tasks. See the milestone for the
order.

Research notes for that work:

- [Retrospective](docs/research/retrospective.md)
- [Prior-art landscape](docs/research/landscape.md)
- [Pair solver](docs/research/pair-solver.md)

## Install

v5 is not published. From this repo:

```bash
pnpm install
```

## Documentation

- [v5 milestone 1](docs/v5-milestone-1.md): the engine plan.
- [Package README](packages/tint/README.md): the v4 API write-up. Those exports
  are not on the v5 build path.
- [v4 spec](docs/v4-spec.md) and [migration from v3](docs/migration-v4.md)
  describe the previous API, now under `packages/tint/legacy`.
- [CHANGELOG](CHANGELOG.md).

## Monorepo layout

```
packages/tint/                 @skylerknight/tint
  src/engine/                  v5 stub (index.ts); v3 solver kept for the emitters
  src/output/                  CSS and Tailwind emitters
  src/color/  src/contrast/    color math
  src/cli/                     tint build | check | inspect | init
  src/vite/  src/postcss/      plugin shells
  legacy/                      v4 engine, API, loader, schema, and their tests
docs/v5-milestone-1.md
docs/research/                 retrospective, landscape, pair solver
examples/v4-spec/              frozen v4 example, not used by CI
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`build`, `check`, and `inspect` parse flags and then report that the v5 engine
is not implemented yet. `init` still writes a starter `tint.config.ts`.

## License

MIT
