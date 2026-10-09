import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVersion } from "../../src/cli/run.js";
import { capture, type Capture } from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
});
afterEach(() => {
  c.cleanup();
});

describe("tint --help / --version", () => {
  it("prints usage on --help and -h with exit 0", async () => {
    expect(await c.run(["--help"])).toBe(0);
    expect(c.out()).toContain("tint build");
    expect(c.out()).toContain("tint init");
    c.stdout.length = 0;
    expect(await c.run(["-h"])).toBe(0);
    expect(c.out()).toContain("Usage:");
    expect(c.err()).toBe("");
  });

  it("prints usage with exit 1 when no command is given", async () => {
    expect(await c.run([])).toBe(1);
    expect(c.out()).toContain("Usage:");
  });

  it("prints the package version on --version and -v", async () => {
    expect(await c.run(["--version"])).toBe(0);
    expect(c.out().trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(c.out().trim()).toBe(readVersion());
    c.stdout.length = 0;
    expect(await c.run(["-v"])).toBe(0);
    expect(c.out().trim()).toBe(readVersion());
  });

  it("prints per-command help", async () => {
    expect(await c.run(["build", "--help"])).toBe(0);
    expect(c.out()).toContain("--tailwind-tint");
  });
});

describe("errors", () => {
  it("rejects an unknown command with usage and exit 1", async () => {
    expect(await c.run(["frobnicate"])).toBe(1);
    expect(c.err()).toContain('Unknown command "frobnicate"');
    expect(c.err()).toContain("Usage:");
    expect(c.out()).toBe("");
  });

  it("rejects unknown flags without a stack trace", async () => {
    expect(await c.run(["build", "--bogus"])).toBe(1);
    expect(c.err()).toContain("--bogus");
    expect(c.err()).toContain("tint build --help");
    expect(c.err()).not.toContain("    at ");
  });

  it("rejects stray positionals", async () => {
    expect(await c.run(["check", "extra"])).toBe(1);
    expect(c.err()).toContain('Unexpected argument "extra"');
  });
});
