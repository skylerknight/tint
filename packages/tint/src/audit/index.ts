import type { RGB } from "../color/types.js";
import { calcAPCAraw } from "../contrast/apca.js";
import type {
  GeneratedPalette,
  GenerationResult,
  GeneratedVariant,
} from "../engine/types.js";
import type { Diagnostic } from "../engine/diagnostics.js";
import type { EngineDiagnosticV4 } from "../v4/diagnostics.js";
import type { GenerationResultV4, SolvedTokenV4 } from "../v4/engine.js";
import type { Kind, LevelOrdinal } from "../v4/types.js";

export interface AuditRow {
  palette: string;
  group: string;
  variant: string;
  hex: string;
  kind: "lc" | "ls";
  target: number | null;
  achieved: number;
  on: string | null;
  decorative: boolean;
  status: "pass" | "warn" | "fail" | "n/a";
}

export interface AuditReport {
  rows: AuditRow[];
  summary: { tokens: number; pass: number; warn: number; fail: number; na: number };
  diagnostics: Diagnostic[];
}

/** One v4 token. `kind` is the token kind; `level` is the ordinal; `state` is `-` at rest. */
export interface AuditRowV4 {
  palette: string;
  group: string;
  variant: string;
  hex: string;
  kind: Kind;
  level: LevelOrdinal;
  state: string;
  target: number | null;
  achieved: number;
  on: string | null;
  status: AuditRow["status"];
}

export interface AuditReportV4 {
  version: 4;
  rows: AuditRowV4[];
  summary: AuditReport["summary"];
  diagnostics: EngineDiagnosticV4[];
}

/** Tolerance below the requested Lc that still counts as reached. */
const PASS_TOLERANCE = 0.5;

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

function isDecorative(token: GeneratedVariant): boolean {
  return token.decorative === true;
}

function auditToken(
  palette: string,
  group: string,
  variant: string,
  token: GeneratedVariant,
  baseline: RGB,
  tokens: GeneratedPalette["tokens"],
  flaggedPaths: ReadonlySet<string>,
): AuditRow {
  const base = {
    palette,
    group,
    variant,
    hex: token.hex,
    kind: token.kind,
    on: token.on ?? null,
    decorative: isDecorative(token),
  };

  // ls variants have no Lc goal. Report the raw (un-clipped) APCA distance from
  // whatever they step away from: their reference when they have one, else the
  // mode baseline. Raw APCA keeps subtle surface differences visible.
  if (token.kind === "ls") {
    const reference = token.on ? lookupReference(tokens, token.on) : baseline;
    return {
      ...base,
      target: null,
      achieved: calcAPCAraw(token.rgb, reference ?? baseline),
      status: "n/a",
    };
  }

  // Foundation lc variants contrast against the mode baseline; the engine
  // already measured that, so `lc` is the achieved value.
  if (token.on === undefined) {
    return { ...base, target: null, achieved: token.lc, status: "n/a" };
  }

  // `pure` targets (-1) have no numeric goal: the token is as far from its
  // reference as the gamut allows.
  const pure = token.target < 0;
  const reached = pure || token.lc >= token.target - PASS_TOLERANCE;
  const flagged = flaggedPaths.has(`${palette}.${group}.${variant}`);

  return {
    ...base,
    target: pure ? null : token.target,
    achieved: token.lc,
    status: !reached ? "fail" : flagged ? "warn" : "pass",
  };
}

function lookupReference(tokens: GeneratedPalette["tokens"], on: string): RGB | null {
  const dot = on.indexOf(".");
  if (dot < 0) return null;
  return tokens[on.slice(0, dot)]?.[on.slice(dot + 1)]?.rgb ?? null;
}

/**
 * Contrast report for every token of a result.
 *
 * Status is only meaningful for lc variants with a reference (`on`): `pass`
 * when the achieved Lc is within 0.5 of the target, `warn` when it reached
 * the target but the engine emitted a diagnostic for it, `fail` otherwise.
 * Foundation and ls variants are `n/a`; for ls variants `achieved` is the raw
 * APCA distance from their reference (or the mode baseline when they have none).
 */
export function audit(result: GenerationResult): AuditReport {
  const baseline = result.mode === "dark" ? BLACK : WHITE;
  const flaggedPaths = new Set(result.diagnostics.map((d) => d.path));
  const rows: AuditRow[] = [];

  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const [variant, token] of Object.entries(variants)) {
        rows.push(
          auditToken(
            palette.name,
            group,
            variant,
            token,
            baseline,
            palette.tokens,
            flaggedPaths,
          ),
        );
      }
    }
  }

  const summary = { tokens: rows.length, pass: 0, warn: 0, fail: 0, na: 0 };
  for (const row of rows) {
    if (row.status === "pass") summary.pass++;
    else if (row.status === "warn") summary.warn++;
    else if (row.status === "fail") summary.fail++;
    else summary.na++;
  }

  return { rows, summary, diagnostics: [...result.diagnostics] };
}

function v4Status(token: SolvedTokenV4, flagged: boolean): AuditRow["status"] {
  if (token.states.includes("disabled")) return "n/a";
  if (token.kind === "surface" || token.mode === "lightness") return "n/a";
  if (token.kind === "emphasis" && token.ordinal <= 2) return "n/a";
  if (token.kind === "border" && token.ordinal <= 2) return "n/a";
  if (token.reached === false) return "fail";
  if (flagged) return "warn";
  return "pass";
}

function auditTokenV4(
  palette: string,
  token: SolvedTokenV4,
  diagnostics: readonly EngineDiagnosticV4[],
): AuditRowV4 {
  const path = `${palette}.${token.id}`;
  const flagged = diagnostics.some(
    (diagnostic) => diagnostic.severity === "warning" && diagnostic.path === path,
  );
  return {
    palette,
    group: token.group,
    variant: token.name,
    hex: token.color.hex,
    kind: token.kind,
    level: token.ordinal,
    state: token.states.length === 0 ? "-" : token.states.join("-"),
    target: token.target ?? null,
    achieved: token.achieved,
    on: token.backdrop.length === 0 ? null : token.backdrop.join(", "),
    status: v4Status(token, flagged),
  };
}

/**
 * Contrast report for one v4 theme.
 *
 * Disabled tokens, surfaces, emphasis 1–2, and border 1–2 are `n/a` (they are
 * not contrast-linted). A contrast token that missed its target is `fail`.
 * One that reached it while a warning names it is `warn`.
 */
export function auditV4(result: GenerationResultV4): AuditReportV4 {
  const rows: AuditRowV4[] = [];
  for (const palette of result.palettes) {
    for (const token of palette.tokens)
      rows.push(auditTokenV4(palette.name, token, result.diagnostics));
  }
  const summary = { tokens: rows.length, pass: 0, warn: 0, fail: 0, na: 0 };
  for (const row of rows) {
    if (row.status === "pass") summary.pass++;
    else if (row.status === "warn") summary.warn++;
    else if (row.status === "fail") summary.fail++;
    else summary.na++;
  }
  return { version: 4, rows, summary, diagnostics: [...result.diagnostics] };
}

const ANSI = {
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  reset: "\u001b[0m",
} as const;

function colorize(status: AuditRow["status"], text: string): string {
  switch (status) {
    case "pass":
      return `${ANSI.green}${text}${ANSI.reset}`;
    case "warn":
      return `${ANSI.yellow}${text}${ANSI.reset}`;
    case "fail":
      return `${ANSI.red}${text}${ANSI.reset}`;
    default:
      return text;
  }
}

interface Column {
  header: string;
  align: "left" | "right";
  cell: (row: AuditRow | AuditRowV4) => string;
}

const SHARED_COLUMNS: readonly Column[] = [
  { header: "Token", align: "left", cell: (r) => `${r.palette}.${r.group}.${r.variant}` },
  { header: "Hex", align: "left", cell: (r) => r.hex },
  { header: "Kind", align: "left", cell: (r) => r.kind },
];

const TAIL_COLUMNS: readonly Column[] = [
  {
    header: "Target",
    align: "right",
    cell: (r) => (r.target === null ? "-" : String(r.target)),
  },
  { header: "Achieved", align: "right", cell: (r) => r.achieved.toFixed(1) },
  { header: "On", align: "left", cell: (r) => r.on ?? "-" },
  { header: "Status", align: "left", cell: (r) => r.status },
];

const V4_COLUMNS: readonly Column[] = [
  ...SHARED_COLUMNS,
  {
    header: "Level",
    align: "right",
    cell: (r) => ("level" in r ? String(r.level) : "-"),
  },
  {
    header: "State",
    align: "left",
    cell: (r) => ("state" in r ? r.state : "-"),
  },
  ...TAIL_COLUMNS,
];

const V3_COLUMNS: readonly Column[] = [...SHARED_COLUMNS, ...TAIL_COLUMNS];

function pad(text: string, width: number, align: Column["align"]): string {
  return align === "right" ? text.padStart(width) : text.padEnd(width);
}

function isAuditV4(report: AuditReport | AuditReportV4): report is AuditReportV4 {
  return "version" in report && report.version === 4;
}

/**
 * Aligned plain-text table of an audit report followed by a summary line.
 * With `color: true` the status cell is wrapped in ANSI green / yellow / red.
 * v4 reports add Level and State columns. v3 reports keep the original columns.
 */
export function formatAuditTable(
  report: AuditReport | AuditReportV4,
  options?: { color?: boolean },
): string {
  const columns = isAuditV4(report) ? V4_COLUMNS : V3_COLUMNS;
  const color = options?.color ?? false;
  const cells = report.rows.map((row) => columns.map((column) => column.cell(row)));
  const widths = columns.map((column, i) =>
    Math.max(column.header.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const last = columns.length - 1;

  const formatLine = (values: string[], decorate: (i: number, s: string) => string) =>
    columns
      .map((column, i) => {
        const text = values[i] ?? "";
        // The last column is never padded, so lines carry no trailing whitespace.
        const padded = i === last ? text : pad(text, widths[i] ?? 0, column.align);
        return decorate(i, padded);
      })
      .join(" | ");

  const lines = [
    formatLine(
      columns.map((column) => column.header),
      (_, s) => s,
    ),
    widths.map((w) => "-".repeat(w)).join("-|-"),
  ];

  report.rows.forEach((row, index) => {
    const values = cells[index] ?? [];
    lines.push(
      formatLine(values, (i, s) => (color && i === last ? colorize(row.status, s) : s)),
    );
  });

  const { tokens, pass, warn, fail, na } = report.summary;
  lines.push("");
  lines.push(`${tokens} tokens: ${pass} pass, ${warn} warn, ${fail} fail, ${na} n/a`);

  return lines.join("\n");
}
