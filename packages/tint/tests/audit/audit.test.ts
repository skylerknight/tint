import { describe, it, expect, vi } from "vitest";
import type { RGB } from "../../src/color/types.js";
import { audit, formatAuditTable } from "../../src/audit/index.js";
import type { AuditReport } from "../../src/audit/index.js";
import {
  light,
  dark,
  withDiagnostics,
  result,
  palette,
  color,
  lc,
} from "../output/_fixtures.js";

import { calcAPCAraw } from "../../src/contrast/apca.js";

describe("audit", () => {
  const report = audit(withDiagnostics);
  const byToken = Object.fromEntries(
    report.rows.map((row) => [`${row.group}.${row.variant}`, row]),
  );

  it("produces one row per token in config order", () => {
    expect(report.rows.map((r) => `${r.palette}.${r.group}.${r.variant}`)).toEqual([
      "base.surface.DEFAULT",
      "base.text.heading",
      "base.text.body",
      "base.text.muted",
      "base.text.edge",
      "base.text.pure",
      "base.action.DEFAULT",
      "base.border.DEFAULT",
    ]);
  });

  it("marks ls variants n/a with the raw APCA distance from their reference", () => {
    const white: RGB = { r: 255, g: 255, b: 255 };
    expect(byToken["surface.DEFAULT"]).toEqual({
      palette: "base",
      group: "surface",
      variant: "DEFAULT",
      hex: "#e9ecef",
      kind: "ls",
      target: null,
      achieved: calcAPCAraw(
        byToken["surface.DEFAULT"]!.hex === "#e9ecef"
          ? { r: 0xe9, g: 0xec, b: 0xef }
          : white,
        white,
      ),
      on: null,
      decorative: false,
      status: "n/a",
    });
    expect(byToken["border.DEFAULT"]).toMatchObject({
      kind: "ls",
      target: null,
      achieved: expect.any(Number),
      on: "surface.DEFAULT",
      status: "n/a",
    });
  });

  it("marks foundation lc variants n/a using the engine's measured lc", () => {
    const foundation = audit(
      result({
        name: "light",
        mode: "light",
        palettes: [
          palette("base", color("#000000", 0, 0, 0), {
            text: { DEFAULT: lc({ hex: "#000000", oklch: [0, 0, 0], lc: 106 }) },
          }),
        ],
      }),
    );
    expect(foundation.rows[0]).toMatchObject({
      kind: "lc",
      target: null,
      achieved: 106,
      on: null,
      status: "n/a",
    });
    expect(foundation.summary).toEqual({ tokens: 1, pass: 0, warn: 0, fail: 0, na: 1 });
  });

  it("passes when achieved is within 0.5 of the target", () => {
    expect(byToken["text.body"]).toMatchObject({
      target: 75,
      achieved: 75.1,
      status: "pass",
    });
    expect(byToken["text.edge"]).toMatchObject({
      target: 75,
      achieved: 74.6,
      status: "pass",
    });
    expect(byToken["action.DEFAULT"]).toMatchObject({
      target: 70,
      achieved: 70,
      status: "pass",
    });
  });

  it("fails when the target was not reached", () => {
    expect(byToken["text.heading"]).toMatchObject({
      hex: "#101214",
      kind: "lc",
      target: 90,
      achieved: 82.4,
      on: "surface.DEFAULT",
      status: "fail",
    });
  });

  it("warns when the target was reached but a diagnostic names the token", () => {
    expect(byToken["text.muted"]).toMatchObject({
      target: 40,
      achieved: 40.2,
      status: "warn",
    });
  });

  it("treats pure (target -1) as reached with no numeric target", () => {
    expect(byToken["text.pure"]).toMatchObject({
      target: null,
      achieved: 100.3,
      status: "pass",
    });
  });

  it("summarizes the counts", () => {
    expect(report.summary).toEqual({ tokens: 8, pass: 4, warn: 1, fail: 1, na: 2 });
  });

  it("copies the result's diagnostics", () => {
    expect(report.diagnostics).toEqual(withDiagnostics.diagnostics);
    expect(report.diagnostics).not.toBe(withDiagnostics.diagnostics);
  });

  it("uses black as the baseline in dark mode", () => {
    const row = audit(dark).rows.find(
      (r) => r.palette === "base" && r.group === "surface",
    );
    expect(row?.achieved).toBeCloseTo(
      calcAPCAraw({ r: 0x1c, g: 0x1d, b: 0x20 }, { r: 0, g: 0, b: 0 }),
      6,
    );
    expect(row?.status).toBe("n/a");
  });

  it("reads a decorative flag when the engine provides one", () => {
    const decorated = {
      ...withDiagnostics,
      palettes: [
        {
          ...withDiagnostics.palettes[0]!,
          tokens: {
            text: { heading: { ...byToken["text.heading"], decorative: true } as never },
          },
        },
      ],
    };
    const row = audit(decorated).rows[0];
    expect(row?.decorative).toBe(true);
    expect(row?.status).toBe("fail");
  });

  it("audits every token of the standard theme as pass or n/a", () => {
    const { summary } = audit(light);
    expect(summary).toEqual({ tokens: 14, pass: 10, warn: 0, fail: 0, na: 4 });
  });
});

describe("formatAuditTable", () => {
  const report = audit(withDiagnostics);

  it("renders an aligned table and a summary line", () => {
    expect(formatAuditTable(report)).toBe(
      [
        "Token                | Hex     | Kind | Target | Achieved | On              | Status",
        "---------------------|---------|------|--------|----------|-----------------|-------",
        "base.surface.DEFAULT | #e9ecef | ls   |      - |      9.0 | -               | n/a",
        "base.text.heading    | #101214 | lc   |     90 |     82.4 | surface.DEFAULT | fail",
        "base.text.body       | #2b3036 | lc   |     75 |     75.1 | surface.DEFAULT | pass",
        "base.text.muted      | #8a9099 | lc   |     40 |     40.2 | surface.DEFAULT | warn",
        "base.text.edge       | #2e3237 | lc   |     75 |     74.6 | surface.DEFAULT | pass",
        "base.text.pure       | #000000 | lc   |      - |    100.3 | surface.DEFAULT | pass",
        "base.action.DEFAULT  | #3b5bdb | lc   |     70 |     70.0 | surface.DEFAULT | pass",
        "base.border.DEFAULT  | #d0d4da | ls   |      - |     16.6 | surface.DEFAULT | n/a",
        "",
        "8 tokens: 4 pass, 1 warn, 1 fail, 2 n/a",
      ].join("\n"),
    );
  });

  it("has no trailing whitespace on any line", () => {
    for (const table of [formatAuditTable(report), formatAuditTable(audit(dark))]) {
      for (const line of table.split("\n")) expect(line).not.toMatch(/\s$/);
    }
  });

  it("colors only the status cell when color is enabled", () => {
    const table = formatAuditTable(report, { color: true });
    const lines = table.split("\n");
    expect(lines[0]).not.toContain("\u001b[");
    expect(lines[2]).toContain("| n/a");
    expect(lines[2]).not.toContain("\u001b[");
    expect(lines[3]?.endsWith("| \u001b[31mfail\u001b[0m")).toBe(true);
    expect(lines[4]?.endsWith("| \u001b[32mpass\u001b[0m")).toBe(true);
    expect(lines[5]?.endsWith("| \u001b[33mwarn\u001b[0m")).toBe(true);
    expect(lines.at(-1)).toBe("8 tokens: 4 pass, 1 warn, 1 fail, 2 n/a");
  });

  it("color: false matches the default", () => {
    expect(formatAuditTable(report, { color: false })).toBe(formatAuditTable(report));
  });

  it("renders a header and summary for an empty report", () => {
    const empty: AuditReport = {
      rows: [],
      summary: { tokens: 0, pass: 0, warn: 0, fail: 0, na: 0 },
      diagnostics: [],
    };
    expect(formatAuditTable(empty)).toBe(
      [
        "Token | Hex | Kind | Target | Achieved | On | Status",
        "------|-----|------|--------|----------|----|-------",
        "",
        "0 tokens: 0 pass, 0 warn, 0 fail, 0 n/a",
      ].join("\n"),
    );
  });
});
