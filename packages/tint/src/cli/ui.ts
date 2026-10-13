import { createInterface } from "node:readline/promises";
import type { EngineDiagnosticV4 } from "../v4/diagnostics.js";

/** Injectable I/O so `run()` can be exercised in tests without touching the process. */
export interface RunOptions {
  /** Directory every relative path resolves against (default `process.cwd()`). */
  cwd?: string;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
  /** Ask the user a question; `def` is the answer used when they just press enter. */
  prompt?: (q: string, def?: string) => Promise<string>;
  /** Force ANSI colors on/off (default: on when stdout is a TTY and `NO_COLOR` is unset). */
  color?: boolean;
}

export interface IO {
  cwd: string;
  color: boolean;
  out: (s: string) => void;
  err: (s: string) => void;
  prompt: (q: string, def?: string) => Promise<string>;
}

export function createIO(options: RunOptions = {}): IO {
  const usingProcessStdout = options.stdout === undefined;
  const color =
    options.color ??
    (usingProcessStdout && Boolean(process.stdout.isTTY) && !process.env["NO_COLOR"]);
  return {
    cwd: options.cwd ?? process.cwd(),
    color,
    out: options.stdout ?? ((s) => process.stdout.write(s + "\n")),
    err: options.stderr ?? ((s) => process.stderr.write(s + "\n")),
    prompt: options.prompt ?? readlinePrompt,
  };
}

async function readlinePrompt(question: string, def?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = def !== undefined && def !== "" ? ` (${def})` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer === "" && def !== undefined ? def : answer;
  } finally {
    rl.close();
  }
}

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────

type Paint = (s: string) => string;

function ansi(open: number, close: number): (enabled: boolean) => Paint {
  return (enabled) => (s) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);
}

export const paint = {
  bold: ansi(1, 22),
  dim: ansi(2, 22),
  red: ansi(31, 39),
  green: ansi(32, 39),
  yellow: ansi(33, 39),
  cyan: ansi(36, 39),
};

// ─────────────────────────────────────────────────────────────
// Line formatting
// ─────────────────────────────────────────────────────────────

export function formatError(message: string, color: boolean): string {
  const [first = "", ...rest] = message.split("\n");
  return [`${paint.red(color)("error")} ${first}`, ...rest].join("\n");
}

export function formatWarning(message: string, color: boolean): string {
  return `${paint.yellow(color)("warn")} ${message}`;
}

/** `warn <path>: <message>` with the hint indented on the following line. */
export function formatDiagnostic(
  diagnostic: Pick<EngineDiagnosticV4, "path" | "message" | "hint">,
  color: boolean,
): string {
  const line = formatWarning(`${diagnostic.path}: ${diagnostic.message}`, color);
  return diagnostic.hint ? `${line}\n     ${paint.dim(color)(diagnostic.hint)}` : line;
}

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
