# Legacy v4

This tree is the v4 engine, config API, loader, JSON Schema, Vite and PostCSS
implementations, and the tests that called them. It was moved here so v5 can
rebuild the engine without deleting that code from the branch.

Nothing in this directory is typechecked, bundled, linted, or tested. Imports
still use the old relative paths (`../color`, `../v4`, and so on) and will not
resolve from here. The previous layout is on the `v4` branch.

The CSS and Tailwind emitters that v5 keeps are `src/output`, not
`legacy/v4/output`.
