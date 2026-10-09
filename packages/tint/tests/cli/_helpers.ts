import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../src/cli/run.js";

export interface Capture {
  dir: string;
  stdout: string[];
  stderr: string[];
  out: () => string;
  err: () => string;
  run: (
    argv: string[],
    prompt?: (q: string, def?: string) => Promise<string>,
  ) => Promise<number>;
  write: (name: string, content: string) => string;
  cleanup: () => void;
}

export function capture(prefix = "tint-cli-"): Capture {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    dir,
    stdout,
    stderr,
    out: () => stdout.join("\n"),
    err: () => stderr.join("\n"),
    run: (argv, prompt) =>
      run(argv, {
        cwd: dir,
        stdout: (s) => stdout.push(s),
        stderr: (s) => stderr.push(s),
        color: false,
        ...(prompt ? { prompt } : {}),
      }),
    write: (name, content) => {
      const path = join(dir, name);
      writeFileSync(path, content);
      return path;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Clean two-theme config with no diagnostics. */
export const CLEAN_TS = `import { defineConfig } from "@skylerknight/tint";
const tokens = {
  surface: { $role: "surface", DEFAULT: { ls: 1 }, raised: { ls: 2, $reference: true } },
  text: { $on: "surface", $role: "text", heading: { lc: 90 }, body: { lc: 75 } },
  border: { $on: "surface", $role: "border", DEFAULT: { lc: 25 } },
} as const;
export default defineConfig([
  { name: "light", mode: "light", colors: { base: "#ffffff", brand: "#2563eb" }, tokens },
  { name: "dark", mode: "dark", selector: ".dark", prefersColorScheme: "dark",
    colors: { base: "#1c1c1f", brand: "#60a5fa" }, tokens },
]);
`;

/** Single-theme JSON config that emits a `role-contrast-low` warning (text lc 20 < 45). */
export const WARNING_JSON = JSON.stringify({
  name: "light",
  mode: "light",
  colors: { base: "#ffffff" },
  tokens: {
    surface: { $role: "surface", DEFAULT: { ls: 1 } },
    text: { $on: "surface", $role: "text", body: { lc: 20 } },
  },
});

/** Single-theme JSON config with output settings and no diagnostics. */
export const CLEAN_JSON_WITH_OUTPUT = JSON.stringify({
  name: "light",
  mode: "light",
  colors: { base: "#ffffff", brand: "#2563eb" },
  tokens: {
    surface: { $role: "surface", DEFAULT: { ls: 1 } },
    text: { $on: "surface", $role: "text", body: { lc: 75 } },
  },
  output: { path: "./generated", formats: ["json", "flat"] },
});
