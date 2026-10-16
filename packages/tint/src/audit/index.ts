import type { RGB } from "../color/types.js";
import { calcAPCAraw } from "../contrast/apca.js";
import type {
  GeneratedPalette,
  GenerationResult,
  GeneratedVariant,
} from "../engine/types.js";
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
  const columns = COLUMNS;
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
