import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { build } from "./build.js";
import { check } from "./check.js";
import { init } from "./init.js";
import { inspect } from "./inspect.js";
import { CLIError } from "./shared.js";
import { createIO, formatError, type IO, type RunOptions } from "./ui.js";

export type { RunOptions } from "./ui.js";

const PACKAGE_NAME = "@skylerknight/tint";

/**
 * Read the package version by walking up from this file until a `package.json` for
 * this package is found. Works from `src/cli` (tests) and `dist/cli` (built).
 */
export function readVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i += 1) {
      const candidate = join(dir, "package.json");
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
          name?: string;
          version?: string;
        };
        if (pkg.name === PACKAGE_NAME && typeof pkg.version === "string")
          return pkg.version;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fall through
  }
  return "unknown";
}

export const USAGE = `tint — APCA-driven design tokens

Usage:
  tint build   [-c|--config <path>] [-o|--out <dir>] [-f|--formats css,json,tailwind,flat]
               [--tailwind-tint] [--quiet]
  tint check   [-c|--config <path>] [--strict]
  tint inspect [-c|--config <path>] [--palette <name>] [--theme <name>] [--json]
  tint init    [--dark] [--brand <hex>] [--yes]
  tint --help | -h
  tint --version | -v

Commands:
  build     Generate token files into <out>/<theme>/ (tokens.css, tokens.json,
            tailwind.css, tokens.flat.json). --tailwind-tint writes one <out>/tailwind.css
            with the full tint utility system across every theme instead.
  check     Validate the config and generate; prints diagnostics. Exit 1 on errors,
            or on warnings when --strict is given.
  inspect   Print the contrast audit table for each theme (--json for raw data).
  init      Create tint.config.ts (interactive unless --yes).

Config lookup: --config, else the first of tint.config.ts, tint.config.mts,
tint.config.js, tint.config.mjs, tint.config.json in the current directory.
Output dir: --out, else config.output.path, else ./tint.
Formats:    --formats, else config.output.formats, else css.`;

const COMMAND_HELP: Record<Command, string> = {
  build: `Usage: tint build [options]

  -c, --config <path>     Config file (default: auto-detected tint.config.*)
  -o, --out <dir>         Output directory (default: config.output.path or ./tint)
  -f, --formats <list>    Comma-separated: css, json, tailwind, flat (default: css)
      --tailwind-tint     Write a single <out>/tailwind.css with tint utilities
      --quiet             Only print errors
  -h, --help              Show this help`,
  check: `Usage: tint check [options]

  -c, --config <path>     Config file (default: auto-detected tint.config.*)
      --strict            Exit 1 when there are warnings
  -h, --help              Show this help`,
  inspect: `Usage: tint inspect [options]

  -c, --config <path>     Config file (default: auto-detected tint.config.*)
      --palette <name>    Only show rows for this palette
      --theme <name>      Only show this theme
      --json              Print the raw audit report as JSON
  -h, --help              Show this help`,
  init: `Usage: tint init [options]

      --dark              Include a dark theme
      --brand <hex>       Brand seed color (e.g. #2563eb)
  -y, --yes               Skip prompts and accept defaults
  -h, --help              Show this help`,
};

type Command = "build" | "check" | "inspect" | "init";
const COMMANDS: readonly Command[] = ["build", "check", "inspect", "init"];

type Options = NonNullable<ParseArgsConfig["options"]>;

const CONFIG_OPTION: Options = { config: { type: "string", short: "c" } };
const HELP_OPTION: Options = { help: { type: "boolean", short: "h" } };

const COMMAND_OPTIONS: Record<Command, Options> = {
  build: {
    ...CONFIG_OPTION,
    ...HELP_OPTION,
    out: { type: "string", short: "o" },
    formats: { type: "string", short: "f" },
    "tailwind-tint": { type: "boolean" },
    quiet: { type: "boolean" },
  },
  check: { ...CONFIG_OPTION, ...HELP_OPTION, strict: { type: "boolean" } },
  inspect: {
    ...CONFIG_OPTION,
    ...HELP_OPTION,
    palette: { type: "string" },
    theme: { type: "string" },
    json: { type: "boolean" },
  },
  init: {
    ...HELP_OPTION,
    dark: { type: "boolean" },
    brand: { type: "string" },
    yes: { type: "boolean", short: "y" },
  },
};

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

function parseArgsError(error: unknown, command: Command): string {
  const message = error instanceof Error ? error.message : String(error);
  // Node's messages are already decent; trim the trailing "To specify ..." advice.
  const trimmed = message.replace(/\.\s+To specify[\s\S]*$/, ".");
  return `${trimmed}\nRun \`tint ${command} --help\` for usage.`;
}

/** Entry point for the CLI; returns the process exit code. */
export async function run(argv: string[], options: RunOptions = {}): Promise<number> {
  const io = createIO(options);
  const [first, ...rest] = argv;

  if (first === undefined || first === "--help" || first === "-h" || first === "help") {
    io.out(USAGE);
    return first === undefined ? 1 : 0;
  }
  if (first === "--version" || first === "-v" || first === "version") {
    io.out(readVersion());
    return 0;
  }
  if (!isCommand(first)) {
    io.err(formatError(`Unknown command "${first}".`, io.color));
    io.err("");
    io.err(USAGE);
    return 1;
  }

  let values: Record<string, string | boolean | undefined>;
  try {
    const parsed = parseArgs({
      args: rest,
      options: COMMAND_OPTIONS[first],
      strict: true,
      allowPositionals: true,
    });
    if (parsed.positionals.length > 0) {
      throw new CLIError(`Unexpected argument "${parsed.positionals[0]}".`);
    }
    values = parsed.values as Record<string, string | boolean | undefined>;
  } catch (error) {
    const message =
      error instanceof CLIError
        ? `${error.message}\nRun \`tint ${first} --help\` for usage.`
        : parseArgsError(error, first);
    io.err(formatError(message, io.color));
    return 1;
  }

  if (values["help"] === true) {
    io.out(COMMAND_HELP[first]);
    return 0;
  }

  try {
    return await dispatch(first, values, io);
  } catch (error) {
    if (error instanceof CLIError) {
      io.err(formatError(error.message, io.color));
      return 1;
    }
    // Unexpected: still no stack trace, but say it is a bug.
    const message = error instanceof Error ? error.message : String(error);
    io.err(formatError(`Unexpected error: ${message}`, io.color));
    return 1;
  }
}

async function dispatch(
  command: Command,
  v: Record<string, string | boolean | undefined>,
  io: IO,
): Promise<number> {
  const str = (key: string): string | undefined =>
    typeof v[key] === "string" ? (v[key] as string) : undefined;
  const bool = (key: string): boolean | undefined =>
    typeof v[key] === "boolean" ? (v[key] as boolean) : undefined;

  switch (command) {
    case "build":
      return build(io, {
        config: str("config"),
        out: str("out"),
        formats: str("formats"),
        tailwindTint: bool("tailwind-tint"),
        quiet: bool("quiet"),
      });
    case "check":
      return check(io, { config: str("config"), strict: bool("strict") });
    case "inspect":
      return inspect(io, {
        config: str("config"),
        palette: str("palette"),
        theme: str("theme"),
        json: bool("json"),
      });
    case "init":
      return init(io, { dark: bool("dark"), brand: str("brand"), yes: bool("yes") });
  }
}
