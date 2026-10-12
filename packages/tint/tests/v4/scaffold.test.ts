import { describe, expect, it } from "vitest";
import * as publicApi from "../../src/index.js";
import { V4_SCAFFOLD } from "../../src/v4/index.js";

describe("v4 scaffold", () => {
  it("loads the internal module", () => {
    expect(V4_SCAFFOLD).toBe("v4");
  });

  it("is excluded from the public entry", () => {
    expect(publicApi).not.toHaveProperty("V4_SCAFFOLD");
  });
});
