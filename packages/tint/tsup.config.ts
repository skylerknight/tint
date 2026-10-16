import { defineConfig } from "tsup";

export default defineConfig({
  // Public entry is the v5 scaffold. The v4 API lives in legacy/ and is not bundled.
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
