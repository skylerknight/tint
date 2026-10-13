import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Old level/state suites. The numeric-scale prototype replaces that API.
    exclude: [
      "**/node_modules/**",
      "tests/v4/engine.test.ts",
      "tests/v4/resolve.test.ts",
      "tests/v4/validate.test.ts",
      "tests/v4/nudge.test.ts",
      "tests/v4/levels.test.ts",
      "tests/v4/states.test.ts",
    ],
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
