import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture, CLEAN_TS, type Capture } from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
  c.write("tint.config.ts", CLEAN_TS);
});
afterEach(() => {
  c.cleanup();
});

describe("tint inspect", () => {
  it("prints an audit table per theme", async () => {
    expect(await c.run(["inspect"])).toBe(0);
    const out = c.out();
    expect(out).toContain("== light (light)");
    expect(out).toContain("== dark (dark)");
    expect(out).toContain("brand");
    expect(out).toContain("strong");
    expect(out).toMatch(/\d+ tokens: \d+ pass, \d+ warn, \d+ fail, \d+ n\/a/);
  });

  it("--theme selects a single theme", async () => {
    expect(await c.run(["inspect", "--theme", "dark"])).toBe(0);
    expect(c.out()).toContain("== dark (dark)");
    expect(c.out()).not.toContain("== light");
  });

  it("--theme rejects unknown names", async () => {
    expect(await c.run(["inspect", "--theme", "sepia"])).toBe(1);
    expect(c.err()).toContain('Unknown theme "sepia"');
    expect(c.err()).toContain("light, dark");
  });

  it("--palette filters rows", async () => {
    expect(await c.run(["inspect", "--palette", "brand", "--theme", "light"])).toBe(0);
    const rows = c
      .out()
      .split("\n")
      .filter((line) => /^(neutral|brand)\./.test(line));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((line) => line.startsWith("brand."))).toBe(true);
    expect(c.out()).toMatch(new RegExp(`^${rows.length} tokens:`, "m"));
  });

  it("--palette rejects unknown names", async () => {
    expect(await c.run(["inspect", "--palette", "nope"])).toBe(1);
    expect(c.err()).toContain('Unknown palette "nope"');
  });

  it("--json prints the raw report", async () => {
    expect(
      await c.run(["inspect", "--json", "--theme", "light", "--palette", "brand"]),
    ).toBe(0);
    const report = JSON.parse(c.out());
    expect(Array.isArray(report.rows)).toBe(true);
    expect(report.rows.every((r: { palette: string }) => r.palette === "brand")).toBe(
      true,
    );
    expect(report.summary.tokens).toBe(report.rows.length);
    expect(report.rows[0]).toMatchObject({ palette: "brand", group: "surface" });
  });

  it("--json without --theme keys reports by theme name", async () => {
    expect(await c.run(["inspect", "--json"])).toBe(0);
    const payload = JSON.parse(c.out());
    expect(Object.keys(payload)).toEqual(["light", "dark"]);
    expect(payload.light.summary.tokens).toBeGreaterThan(0);
  });
});
