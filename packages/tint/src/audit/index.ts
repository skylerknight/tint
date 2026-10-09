import type { RGB } from "../color/types.js";
import { calcAPCAabs } from "../contrast/apca.js";
import type { GenerationResult, GeneratedVariant } from "../engine/types.js";
import type { Diagnostic } from "../engine/diagnostics.js";

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

/** Tolerance below the requested Lc that still counts as reached. */
const PASS_TOLERANCE = 0.5;

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

/**
 * Whether the engine flagged this token as decorative. The generated token
 * does not carry the flag today, so this reads it defensively and defaults
 * to `false`.
 */
function isDecorative(token: GeneratedVariant): boolean {
  return (token as { decorative?: boolean }).decorative === true;
}

function auditToken(
  palette: string,
  group: string,
  variant: string,
  token: GeneratedVariant,
  baseline: RGB,
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

  if (token.kind === "ls") {
    return {
      ...base,
      target: null,
      achieved: calcAPCAabs(token.rgb, baseline),
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

/**
 * Contrast report for every token of a result.
 *
 * Status is only meaningful for lc variants with a reference (`on`): `pass`
 * when the achieved Lc is within 0.5 of the target, `warn` when it reached
 * the target but the engine emitted a diagnostic for it, `fail` otherwise.
 * Foundation and ls variants are `n/a`; their `achieved` is the measured
 * APCA against the mode baseline (white in light mode, black in dark).
 */
export function audit(result: GenerationResult): AuditReport {
  const baseline = result.mode === "dark" ? BLACK : WHITE;
  const flaggedPaths = new Set(result.diagnostics.map((d) => d.path));
  const rows: AuditRow[] = [];

  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const [variant, token] of Object.entries(variants)) {
        rows.push(
          auditToken(palette.name, group, variant, token, baseline, flaggedPaths),
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
  cell: (row: AuditRow) => string;
}

const COLUMNS: readonly Column[] = [
  { header: "Token", align: "left", cell: (r) => `${r.palette}.${r.group}.${r.variant}` },
  { header: "Hex", align: "left", cell: (r) => r.hex },
  { header: "Kind", align: "left", cell: (r) => r.kind },
  {
    header: "Target",
    align: "right",
    cell: (r) => (r.target === null ? "-" : String(r.target)),
  },
  { header: "Achieved", align: "right", cell: (r) => r.achieved.toFixed(1) },
  { header: "On", align: "left", cell: (r) => r.on ?? "-" },
  { header: "Status", align: "left", cell: (r) => r.status },
];

function pad(text: string, width: number, align: Column["align"]): string {
  return align === "right" ? text.padStart(width) : text.padEnd(width);
}

/**
 * Aligned plain-text table of an audit report followed by a summary line.
 * With `color: true` the status cell is wrapped in ANSI green / yellow / red.
 */
export function formatAuditTable(
  report: AuditReport,
  options?: { color?: boolean },
): string {
  const color = options?.color ?? false;
  const cells = report.rows.map((row) => COLUMNS.map((column) => column.cell(row)));
  const widths = COLUMNS.map((column, i) =>
    Math.max(column.header.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const last = COLUMNS.length - 1;

  const formatLine = (values: string[], decorate: (i: number, s: string) => string) =>
    COLUMNS.map((column, i) => {
      const text = values[i] ?? "";
      // The last column is never padded, so lines carry no trailing whitespace.
      const padded = i === last ? text : pad(text, widths[i] ?? 0, column.align);
      return decorate(i, padded);
    }).join(" | ");

  const lines = [
    formatLine(
      COLUMNS.map((column) => column.header),
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
