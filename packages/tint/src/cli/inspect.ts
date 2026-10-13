import { auditV4, formatAuditTable, type AuditReportV4 } from "../audit/index.js";
import type { GenerationResultV4 } from "../v4/engine.js";
import { CLIError, loadAndGenerate } from "./shared.js";
import { paint, type IO } from "./ui.js";

export interface InspectFlags {
  config?: string | undefined;
  palette?: string | undefined;
  theme?: string | undefined;
  json?: boolean | undefined;
}

function filterReport(report: AuditReportV4, palette: string): AuditReportV4 {
  const rows = report.rows.filter((row) => row.palette === palette);
  const summary = { tokens: rows.length, pass: 0, warn: 0, fail: 0, na: 0 };
  for (const row of rows) {
    if (row.status === "n/a") summary.na += 1;
    else summary[row.status] += 1;
  }
  const diagnostics = report.diagnostics.filter(
    (d) => d.path === palette || d.path.startsWith(`${palette}.`),
  );
  return { version: 4, rows, summary, diagnostics };
}

export async function inspect(io: IO, flags: InspectFlags): Promise<number> {
  const { results } = await loadAndGenerate(io, flags.config);

  let selected: GenerationResultV4[] = results;
  if (flags.theme !== undefined) {
    selected = results.filter((r) => r.name === flags.theme);
    if (selected.length === 0) {
      throw new CLIError(
        `Unknown theme "${flags.theme}". Available: ${results.map((r) => r.name).join(", ")}`,
      );
    }
  }

  if (flags.palette !== undefined) {
    const names = new Set(selected.flatMap((r) => r.palettes.map((p) => p.name)));
    if (!names.has(flags.palette)) {
      throw new CLIError(
        `Unknown palette "${flags.palette}". Available: ${[...names].join(", ")}`,
      );
    }
  }

  const reports = selected.map((result) => {
    const report = auditV4(result);
    return {
      result,
      report: flags.palette !== undefined ? filterReport(report, flags.palette) : report,
    };
  });

  if (flags.json) {
    const payload =
      reports.length === 1
        ? reports[0]!.report
        : Object.fromEntries(reports.map(({ result, report }) => [result.name, report]));
    io.out(JSON.stringify(payload, null, 2));
    return 0;
  }

  reports.forEach(({ result, report }, index) => {
    if (index > 0) io.out("");
    io.out(paint.bold(io.color)(`== ${result.name} (${result.mode})`));
    io.out(formatAuditTable(report, { color: io.color }));
  });
  return 0;
}
