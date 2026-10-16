import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENGINE_NOT_READY } from "../../src/cli/shared.js";
import { capture, type Capture } from "./_helpers.js";

let c: Capture;
beforeEach(() => {
  c = capture();
});
afterEach(() => {
  c.cleanup();
});

describe("commands that need the v5 engine", () => {
  it.each(["build", "check", "inspect"])(
    "%s exits 1 until the solver lands",
    async (command) => {
      expect(await c.run([command])).toBe(1);
      expect(c.err()).toContain(ENGINE_NOT_READY);
      expect(c.err()).not.toContain("    at ");
      expect(c.out()).toBe("");
    },
  );
});
