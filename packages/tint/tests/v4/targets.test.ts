import { describe, expect, it } from "vitest";
import { contrastTarget, LEVEL_TARGETS, shiftOrdinal } from "../../src/v4/targets.js";

describe("level targets (§5)", () => {
  it("matches the APCA and WCAG 2 tables", () => {
    expect(LEVEL_TARGETS).toEqual({
      apca: {
        text: [
          { type: "contrast", value: 45 },
          { type: "contrast", value: 60 },
          { type: "contrast", value: 75 },
          { type: "contrast", value: 90 },
          { type: "max" },
        ],
        border: [
          { type: "contrast", value: 15 },
          { type: "contrast", value: 30 },
          { type: "contrast", value: 45 },
          { type: "contrast", value: 60 },
          { type: "contrast", value: 75 },
        ],
        emphasis: [
          { type: "tint", steps: 1 },
          { type: "tint", steps: 2 },
          { type: "contrast", value: 60 },
          { type: "contrast", value: 75 },
          { type: "contrast", value: 90 },
        ],
        surface: [
          { type: "step", offset: -2 },
          { type: "step", offset: -1 },
          { type: "step", offset: 0 },
          { type: "step", offset: 1 },
          { type: "step", offset: 2 },
        ],
      },
      wcag2: {
        text: [
          { type: "contrast", value: 3 },
          { type: "contrast", value: 3.5 },
          { type: "contrast", value: 4.5 },
          { type: "contrast", value: 7 },
          { type: "max" },
        ],
        border: [
          { type: "contrast", value: 1.5 },
          { type: "contrast", value: 2 },
          { type: "contrast", value: 3 },
          { type: "contrast", value: 4.5 },
          { type: "contrast", value: 7 },
        ],
        emphasis: [
          { type: "tint", steps: 1 },
          { type: "tint", steps: 2 },
          { type: "contrast", value: 3 },
          { type: "contrast", value: 4.5 },
          { type: "contrast", value: 7 },
        ],
        surface: [
          { type: "step", offset: -2 },
          { type: "step", offset: -1 },
          { type: "step", offset: 0 },
          { type: "step", offset: 1 },
          { type: "step", offset: 2 },
        ],
      },
    });
  });

  it("uses the WCAG text ladder 3 / 3.5 / 4.5 / 7 / max, with body text at 4.5:1", () => {
    expect(contrastTarget("wcag2", "text", 1)).toEqual({ type: "contrast", value: 3 });
    expect(contrastTarget("wcag2", "text", 2)).toEqual({ type: "contrast", value: 3.5 });
    expect(contrastTarget("wcag2", "text", 3)).toEqual({ type: "contrast", value: 4.5 });
    expect(contrastTarget("wcag2", "text", 4)).toEqual({ type: "contrast", value: 7 });
    expect(contrastTarget("wcag2", "text", 5)).toEqual({ type: "max" });
  });
});

describe("contrast shifts (§2.1, §2.4, §5)", () => {
  it("leaves the ordinal alone at standard", () => {
    expect(shiftOrdinal(1)).toBe(1);
    expect(shiftOrdinal(3)).toBe(3);
    expect(shiftOrdinal(5)).toBe(5);
    expect(shiftOrdinal(4, { contrastLevel: "standard" })).toBe(4);
  });

  it("shifts more by +1 and max by +2", () => {
    expect(shiftOrdinal(1, { contrastLevel: "more" })).toBe(2);
    expect(shiftOrdinal(1, { contrastLevel: "max" })).toBe(3);
    expect(shiftOrdinal(3, { contrastLevel: "more" })).toBe(4);
    expect(shiftOrdinal(3, { contrastLevel: "max" })).toBe(5);
  });

  it("caps at level 5", () => {
    expect(shiftOrdinal(4, { contrastLevel: "more" })).toBe(5);
    expect(shiftOrdinal(4, { contrastLevel: "max" })).toBe(5);
    expect(shiftOrdinal(5, { contrastLevel: "more" })).toBe(5);
    expect(shiftOrdinal(5, { contrastLevel: "max" })).toBe(5);
    expect(shiftOrdinal(5, { contrast: "+1" })).toBe(5);
    expect(shiftOrdinal(3, { contrastLevel: "max", contrast: "+2" })).toBe(5);
    expect(contrastTarget("wcag2", "text", 4, { contrastLevel: "more" })).toEqual({
      type: "max",
    });
    expect(contrastTarget("apca", "text", 5, { contrastLevel: "max" })).toEqual({
      type: "max",
    });
    expect(contrastTarget("wcag2", "text", 5, { contrast: "+1" })).toEqual({
      type: "max",
    });
  });

  it("applies a per-token +1 or -1 nudge", () => {
    expect(shiftOrdinal(2, { contrast: "+1" })).toBe(3);
    expect(shiftOrdinal(2, { contrast: "-1" })).toBe(1);
    expect(shiftOrdinal(4, { contrast: "+1" })).toBe(5);
    expect(shiftOrdinal(4, { contrast: "-1" })).toBe(3);
    expect(contrastTarget("apca", "text", 3, { contrast: "+1" })).toEqual({
      type: "contrast",
      value: 90,
    });
    expect(contrastTarget("wcag2", "border", 4, { contrast: "-1" })).toEqual({
      type: "contrast",
      value: 3,
    });
  });

  it("floors at level 1", () => {
    expect(shiftOrdinal(1, { contrast: "-1" })).toBe(1);
    expect(shiftOrdinal(1, { contrast: "-2" })).toBe(1);
    expect(shiftOrdinal(2, { contrast: "-2" })).toBe(1);
    expect(contrastTarget("apca", "border", 1, { contrast: "-1" })).toEqual({
      type: "contrast",
      value: 15,
    });
    expect(
      contrastTarget("wcag2", "surface", 1, {
        contrastLevel: "standard",
        contrast: "-2",
      }),
    ).toEqual({
      type: "step",
      offset: -2,
    });
  });

  it("stacks the global preference and the token nudge before clamping", () => {
    expect(shiftOrdinal(3, { contrastLevel: "more", contrast: "+1" })).toBe(5);
    expect(shiftOrdinal(3, { contrastLevel: "max", contrast: "-1" })).toBe(4);
    expect(shiftOrdinal(2, { contrastLevel: "more", contrast: "-1" })).toBe(2);
    expect(shiftOrdinal(2, { contrastLevel: "max", contrast: "-2" })).toBe(2);
    expect(shiftOrdinal(4, { contrastLevel: "more", contrast: "-1" })).toBe(4);
    expect(
      contrastTarget("wcag2", "text", 3, { contrastLevel: "more", contrast: "+1" }),
    ).toEqual({
      type: "max",
    });
    expect(
      contrastTarget("apca", "emphasis", 3, { contrastLevel: "max", contrast: "-1" }),
    ).toEqual({
      type: "contrast",
      value: 75,
    });
  });

  it("walks emphasis off the tint rungs and surfaces off the page", () => {
    expect(contrastTarget("apca", "emphasis", 2)).toEqual({ type: "tint", steps: 2 });
    expect(contrastTarget("wcag2", "emphasis", 2, { contrast: "+1" })).toEqual({
      type: "contrast",
      value: 3,
    });
    expect(contrastTarget("apca", "emphasis", 3, { contrast: "-1" })).toEqual({
      type: "tint",
      steps: 2,
    });
    expect(contrastTarget("wcag2", "surface", 3)).toEqual({ type: "step", offset: 0 });
    expect(contrastTarget("apca", "surface", 3, { contrastLevel: "more" })).toEqual({
      type: "step",
      offset: 1,
    });
    expect(contrastTarget("wcag2", "surface", 5, { contrastLevel: "max" })).toEqual({
      type: "step",
      offset: 2,
    });
  });
});
