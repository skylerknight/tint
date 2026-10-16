import { describe, expect, it } from "vitest";
import { generate, type EngineResult } from "../../src/engine/index.js";

describe("v5 engine stub", () => {
  it("returns a placeholder result", () => {
    const result: EngineResult = generate();
    expect(result).toEqual({ version: 5 });
  });
});
