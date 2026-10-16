import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture, CLEAN_TS, V3_JSON, WARNING_JSON, type Capture } from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
});
afterEach(() => {
  c.cleanup();
});

describe("tint check", () => {
  it("passes a clean config", async () => {
    c.write("tint.config.ts", CLEAN_TS);
    expect(await c.run(["check"])).toBe(0);
    expect(c.out()).toMatch(/✓ 2 themes, \d+ tokens, no warnings/);
    expect(c.err()).toBe("");
  });

  it("prints warnings but exits 0 without --strict", async () => {
    c.write("tint.config.json", WARNING_JSON);
    expect(await c.run(["check"])).toBe(0);
    expect(c.err()).toMatch(/^warn neutral: /m);
    expect(c.err()).toContain("outside sRGB");
    expect(c.out()).toMatch(/1 theme, 1 token, 1 warning/);
  });

  it("exits 1 on warnings with --strict", async () => {
    c.write("tint.config.json", WARNING_JSON);
    expect(await c.run(["check", "--strict"])).toBe(1);
    expect(c.err()).toContain("warn neutral:");
    expect(c.err()).toContain("--strict");
  });

  it("exits 1 on an invalid config", async () => {
    c.write("tint.config.json", JSON.stringify({ name: "x" }));
    expect(await c.run(["check", "--strict"])).toBe(1);
    expect(c.err()).toContain("Invalid tint config");
  });

  it("exits 1 on a v3 config with the migration hint", async () => {
    c.write("tint.config.json", V3_JSON);
    expect(await c.run(["check"])).toBe(1);
    expect(c.err()).toContain("migration table");
    expect(c.err()).toContain('"colors" is a v3 config key');
  });

  it("exits 1 when the config is missing", async () => {
    expect(await c.run(["check"])).toBe(1);
    expect(c.err()).toContain("tint init");
  });
});
