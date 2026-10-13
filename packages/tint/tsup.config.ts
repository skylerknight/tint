import { defineConfig } from "tsup";

export default defineConfig({
  // The public entry imports `src/v4`, so the v4 API is in the bundle.
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
    "vite/index": "src/vite/index.ts",
    "postcss/index": "src/postcss/index.ts",
  },
  format: ["esm", "cjs"],
  dts: {
    entry: {
      index: "src/index.ts",
      "vite/index": "src/vite/index.ts",
      "postcss/index": "src/postcss/index.ts",
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node18",
  external: ["vite", "postcss", "esbuild"],
});
