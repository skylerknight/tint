import { describe, expect, it } from "vitest";
import { border, emphasis, surface, text } from "../../src/v4/kinds.js";

describe("numeric kind functions", () => {
  it("stores the scale and copies only the supported options", () => {
    expect(surface(0)).toEqual({ kind: "surface", scale: 0 });
    expect(surface(-2)).toEqual({ kind: "surface", scale: -2 });
    expect(emphasis(2.5, { on: "surface", chroma: 1.5 })).toEqual({
      kind: "emphasis",
      scale: 2.5,
      on: "surface",
      chroma: 1.5,
    });
    expect(text(3, { lc: 75, nudge: false })).toEqual({
      kind: "text",
      scale: 3,
      lc: 75,
      nudge: false,
    });
    expect(border(4, { hue: "+12", ratio: 3 })).toEqual({
      kind: "border",
      scale: 4,
      hue: "+12",
      ratio: 3,
    });
  });

  it("returns a fresh object each call", () => {
    expect(emphasis(4)).not.toBe(emphasis(4));
  });
});
