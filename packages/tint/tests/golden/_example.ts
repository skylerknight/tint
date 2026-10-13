import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { loadConfig } from "../../src/loader/index.js";
import { generateV4, type GenerationResultV4 } from "../../src/v4/engine.js";
import { toCSS } from "../../src/v4/output/css.js";
import { toDTCGJSON } from "../../src/v4/output/dtcg.js";
import { toTailwind } from "../../src/v4/output/tailwind.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

/** Committed engine output. A trailing newline is part of the fixture. */
export function fixture(example: string, name: string): string {
  return readFileSync(join(here, "__fixtures__", example, name), "utf8");
}

function text(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export async function generateExample(configPath: string): Promise<GenerationResultV4[]> {
  const loaded = await loadConfig({ root: repoRoot, configPath });
  return generateV4(loaded.config);
}

/** CSS, Tailwind, and per-theme DTCG against `tests/golden/__fixtures__/<example>`. */
export function expectGolden(
  example: string,
  themes: readonly GenerationResultV4[],
): void {
  expect(text(toCSS(themes))).toBe(fixture(example, "css.css"));
  expect(text(toTailwind(themes))).toBe(fixture(example, "tailwind.css"));
  for (const theme of themes) {
    expect(text(toCSS(theme))).toBe(fixture(example, `${theme.name}.css`));
    expect(text(toDTCGJSON(theme))).toBe(fixture(example, `${theme.name}.dtcg.json`));
  }
}

export function warningLines(themes: readonly GenerationResultV4[]): string[] {
  return themes.flatMap((theme) =>
    theme.diagnostics
      .filter((diagnostic) => diagnostic.severity !== "info")
      .map(
        (diagnostic) =>
          `${theme.name} ${diagnostic.severity} ${diagnostic.code} ${diagnostic.path}`,
      ),
  );
}
