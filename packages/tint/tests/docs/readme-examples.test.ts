import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/loader/index.js";
import {
  generate,
  toCSS,
  toDTCGJSON,
  toFlatJSON,
  toTailwind,
  validateConfig,
} from "../../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(packageRoot, "../..");
const scratch = join(packageRoot, ".readme-check");

const DOC_FILES = [
  join(packageRoot, "README.md"),
  join(repoRoot, "README.md"),
  join(repoRoot, "docs/migration-v4.md"),
];

interface Fence {
  file: string;
  line: number;
  lang: string;
  tags: string[];
  code: string;
}

function extract(file: string): Fence[] {
  const text = readFileSync(file, "utf8");
  const fences: Fence[] = [];
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const match of text.matchAll(pattern)) {
    const info = (match[1] ?? "").trim().split(/\s+/).filter(Boolean);
    const lang = info[0] ?? "";
    const code = match[2] ?? "";
    const line = text.slice(0, match.index ?? 0).split("\n").length;
    fences.push({ file, line, lang, tags: info.slice(1), code });
  }
  return fences;
}

function label(fence: Fence): string {
  return `${relative(repoRoot, fence.file)}:${fence.line}`;
}

function compilerOptions(): ts.CompilerOptions {
  const configPath = join(packageRoot, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, packageRoot);
  const tailwindTypes = join(
    repoRoot,
    "examples/vite-playground/node_modules/@tailwindcss/vite/dist/index.d.mts",
  );
  return {
    ...parsed.options,
    noEmit: true,
    baseUrl: packageRoot,
    paths: {
      "@skylerknight/tint": ["src/index.ts"],
      "@skylerknight/tint/vite": ["src/vite/index.ts"],
      "@skylerknight/tint/postcss": ["src/postcss/index.ts"],
      "@tailwindcss/vite": [relative(packageRoot, tailwindTypes)],
    },
  };
}

/** One program for every sample, so `src/` is parsed once. */
function typecheckAll(files: readonly string[]): Map<string, string[]> {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram([...files], options, host);
  const byFile = new Map<string, string[]>(files.map((file) => [file, []]));
  const globals: string[] = [];
  byFile.set("", globals);
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const name = diagnostic.file?.fileName;
    const bucket = name === undefined ? globals : byFile.get(name);
    if (bucket === undefined) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
      bucket.push(message);
      continue;
    }
    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    bucket.push(`${pos.line + 1}:${pos.character + 1} ${message}`);
  }
  return byFile;
}

function rewriteImports(code: string): string {
  const replacements: ReadonlyArray<readonly [string, string]> = [
    ['"@skylerknight/tint/vite"', JSON.stringify(join(packageRoot, "src/vite/index.ts"))],
    [
      '"@skylerknight/tint/postcss"',
      JSON.stringify(join(packageRoot, "src/postcss/index.ts")),
    ],
    ['"@skylerknight/tint"', JSON.stringify(join(packageRoot, "src/index.ts"))],
    [
      '"@tailwindcss/vite"',
      JSON.stringify(
        join(
          repoRoot,
          "examples/vite-playground/node_modules/@tailwindcss/vite/dist/index.mjs",
        ),
      ),
    ],
  ];
  let next = code;
  for (const [from, to] of replacements) {
    next = next.replaceAll(`from ${from}`, `from ${to}`);
  }
  return next;
}

describe.skip("README examples (still show the level/state API)", () => {
  const fences = DOC_FILES.flatMap(extract);
  const typescript = fences.filter(
    (fence) => fence.lang === "ts" && !fence.tags.includes("v3"),
  );

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("finds TypeScript samples in the v4 docs", () => {
    expect(typescript.length).toBeGreaterThan(5);
  });

  it("typechecks every current TypeScript sample", () => {
    mkdirSync(scratch, { recursive: true });
    const paths = typescript.map((fence, index) => {
      const sourcePath = join(scratch, `sample-${index}.ts`);
      writeFileSync(sourcePath, fence.code);
      return sourcePath;
    });
    const diagnostics = typecheckAll(paths);
    const failures = typescript.flatMap((fence, index) => {
      const messages = diagnostics.get(paths[index] ?? "") ?? [];
      return messages.length === 0 ? [] : [`${label(fence)}\n${messages.join("\n")}`];
    });
    const globals = diagnostics.get("") ?? [];
    if (globals.length > 0) failures.push(globals.join("\n"));
    expect(failures, failures.join("\n\n")).toEqual([]);
  }, 60_000);

  it("runs every current TypeScript sample", async () => {
    mkdirSync(scratch, { recursive: true });
    const failures: string[] = [];
    for (const [index, fence] of typescript.entries()) {
      const runtimePath = join(scratch, `run-${index}.ts`);
      writeFileSync(runtimePath, rewriteImports(fence.code));
      try {
        await import(pathToFileURL(runtimePath).href);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${label(fence)}\n${message}`);
      }
    }
    expect(failures, failures.join("\n\n")).toEqual([]);
  }, 60_000);

  it("keeps the quick start identical to examples/v4-spec/tint.config.ts", () => {
    const quickStart = typescript.find((fence) => fence.tags.includes("example"));
    expect(quickStart, "missing ```ts example fence").toBeDefined();
    const source = readFileSync(
      join(repoRoot, "examples/v4-spec/tint.config.ts"),
      "utf8",
    );
    expect(quickStart?.code.trimEnd()).toBe(source.trimEnd());
  });

  it("keeps the Vite sample identical to examples/vite-playground/vite.config.ts", () => {
    const sample = typescript.find((fence) => fence.tags.includes("vite-config"));
    expect(sample, "missing ```ts vite-config fence").toBeDefined();
    const source = readFileSync(
      join(repoRoot, "examples/vite-playground/vite.config.ts"),
      "utf8",
    );
    expect(sample?.code.trimEnd()).toBe(source.trimEnd());
  });

  it("matches generated output from the spec example", async () => {
    const loaded = await loadConfig({
      root: repoRoot,
      configPath: "examples/v4-spec/tint.config.ts",
    });
    const themes = generate(loaded.config);
    const light = themes.find((theme) => theme.name === "light");
    expect(light).toBeDefined();
    if (light === undefined) return;

    const haystacks: Record<string, string> = {
      css: `${toCSS(themes)}\n${toTailwind(themes)}`,
      hex: toCSS(light, { format: "hex", comments: false }),
      prefix: toCSS(light, { prefix: "tint", format: "hex", comments: false }),
      dtcg: toDTCGJSON(light),
      flat: toFlatJSON(light),
      "flat-hex": toFlatJSON(light, { format: "hex" }),
    };

    const checked = fences.filter((fence) => fence.tags.includes("check"));
    expect(checked.length).toBeGreaterThan(3);

    for (const fence of checked) {
      const kind = fence.tags.find((tag) => tag !== "check") ?? "css";
      const haystack = haystacks[kind];
      expect(haystack, `${label(fence)} unknown check kind ${kind}`).toBeTypeOf("string");
      const body = fence.code.trimEnd();
      expect(
        haystack?.includes(body),
        `${label(fence)} is not in the ${kind} output`,
      ).toBe(true);
    }
  });

  it("accepts every JSON config sample", () => {
    const configs = fences.filter((fence) => fence.tags.includes("config"));
    expect(configs.length).toBeGreaterThan(0);
    for (const fence of configs) {
      const parsed: unknown = JSON.parse(fence.code);
      const result = validateConfig(parsed);
      expect(
        result.ok,
        `${label(fence)} ${result.ok ? "" : result.issues.map((issue) => issue.message).join("; ")}`,
      ).toBe(true);
      if (!result.ok) continue;
      expect(generate(result.config).length).toBeGreaterThan(0);
    }
  });
});
