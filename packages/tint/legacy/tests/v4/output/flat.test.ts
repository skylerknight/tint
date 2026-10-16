import { describe, expect, it } from "vitest";
import { toFlat, toFlatJSON } from "../../../src/v4/output/flat.js";
import { light } from "./_fixture.js";

describe("toFlat", () => {
  it("maps palette.group[.token] and drops DEFAULT", () => {
    expect(toFlat(light)).toEqual({
      "neutral.tint.ink": "oklch(25.00% 0.0200 250.00)",
      "neutral.action": "oklch(50.00% 0.2000 300.00)",
      "neutral.action.hover": "oklch(45.00% 0.1800 300.00)",
      "neutral.text.strong": "oklch(10.00% 0.0100 250.00)",
      "neutral.border.firm": "oklch(40.00% 0.0300 250.00)",
      "brand.tint.ink": "oklch(40.00% 0.1600 300.00)",
      "brand.action": "oklch(55.00% 0.2200 300.00)",
      "brand.action.hover": "oklch(48.00% 0.2000 300.00)",
      "brand.text.strong": "oklch(12.00% 0.0500 300.00)",
      "brand.border.firm": "oklch(42.00% 0.0800 300.00)",
    });
  });

  it("keeps key order and skips generated rests", () => {
    expect(Object.keys(toFlat(light))).toEqual([
      "neutral.tint.ink",
      "neutral.action",
      "neutral.action.hover",
      "neutral.text.strong",
      "neutral.border.firm",
      "brand.tint.ink",
      "brand.action",
      "brand.action.hover",
      "brand.text.strong",
      "brand.border.firm",
    ]);
    expect(toFlatJSON(light)).toBe(toFlatJSON(light));
    expect(toFlatJSON(light)).not.toContain("__rest");
  });
});
