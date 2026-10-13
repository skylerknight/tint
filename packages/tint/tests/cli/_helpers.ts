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

/** Clean two-theme v4 config with no warnings. */
export const CLEAN_TS = `import { border, defineConfig, surface, text } from "@skylerknight/tint";

export default defineConfig({
  palette: {
    neutral: "#71717a",
    brand: "#2563eb",
  },
  themes: {
    light: { mode: "light" },
    dark: {
      mode: "dark",
      selector: ".dark",
      media: true,
      palette: { brand: "#60a5fa" },
    },
  },
  tokens: {
    surface: { DEFAULT: surface(0) },
    text: { strong: text(4), body: text(3) },
    border: { firm: border(4) },
  },
});
`;

/** Single-theme config whose palette color is outside sRGB. */
export const WARNING_JSON = JSON.stringify({
  palette: { neutral: "oklch(0.7 0.4 30)" },
  tokens: {
    surface: { DEFAULT: { kind: "surface", scale: 0 } },
  },
});

/** Single-theme JSON config with output settings and no warnings. */
export const CLEAN_JSON_WITH_OUTPUT = JSON.stringify({
  palette: { neutral: "#ffffff", brand: "#2563eb" },
  tokens: {
    surface: { DEFAULT: { kind: "surface", scale: 0 } },
    text: { body: { kind: "text", scale: 3 } },
  },
  output: { path: "./generated", formats: ["dtcg", "flat"] },
});

/** A v3 theme object. `tint check` must refuse it with the migration hint. */
export const V3_JSON = JSON.stringify({
  name: "light",
  mode: "light",
  colors: { base: "#ffffff", brand: "#7c3aed" },
  tokens: {
    surface: { DEFAULT: { ls: 1 } },
    text: { $on: "surface", body: { lc: 75 } },
  },
});
