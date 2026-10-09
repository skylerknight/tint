import type { GenerationResult } from "../engine/types.js";
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

export function audit(result: GenerationResult): AuditReport {
  void result;
  throw new Error("not implemented");
}

export function formatAuditTable(
  report: AuditReport,
  options?: { color?: boolean },
): string {
  void report;
  void options;
  throw new Error("not implemented");
}
