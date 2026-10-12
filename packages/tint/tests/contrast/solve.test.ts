import { describe, expect, it, vi } from "vitest";
import type { RGB, OKLCH } from "../../src/color/types.js";
import type { Polarity } from "../../src/contrast/types.js";

// The solver tests are hermetic: they run against a minimal, test-only color
// implementation regardless of the state of `src/color`.
vi.mock("../../src/color/convert.js", async () => {
  const m = await import("./_color.js");
  return { rgbToOKLCH: m.rgbToOKLCH };
});
vi.mock("../../src/color/gamut.js", async () => {
  const m = await import("./_color.js");
  return { toGamut: m.toGamut, oklchToRGBGamut: m.oklchToRGBGamut };
});
vi.mock("../../src/color/oklch.js", async () => {
  const m = await import("./_color.js");
  return { setLightness: m.setLightness };
});

import { calcAPCAabs, calcAPCAraw } from "../../src/contrast/apca.js";
import { wcag2Ratio } from "../../src/contrast/wcag2.js";
import {
  apcaMetric,
  apcaRawMetric,
  maxContrast,
  preferredPolarity,
  solveContrast,
  wcag2Metric,
} from "../../src/contrast/solve.js";
import { oklchToRGBGamut, rgbToOKLCH } from "./_color.js";

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
const gray = (v: number): RGB => rgb(v, v, v);
const BLACK = gray(0);
const WHITE = gray(255);

// 8-bit quantization can make the 0.25 tolerance unattainable. The largest
// Lc step between adjacent representable colors is ~0.65 (achromatic on
// mid-gray, where all three channels step together), so allow 1 Lc.
const QUANT = 1;

const HUES = [0, 30, 60, 120, 180, 220, 260, 300, 340];
const SEEDS: OKLCH[] = [
  ...HUES.map((h) => ({ l: 0.6, c: 0.15, h })),
  ...HUES.map((h) => ({ l: 0.4, c: 0.3, h })),
  { l: 0.5, c: 0, h: 0 },
  { l: 0.9, c: 0.02, h: 90 },
];
const BACKGROUNDS: RGB[] = [
  WHITE,
  BLACK,
  gray(128),
  gray(250),
  gray(8),
  rgb(30, 60, 120),
  rgb(255, 240, 200),
  rgb(200, 30, 60),
];
const TARGETS = [15, 45, 60, 75, 90, 105];
const POLARITIES: Polarity[] = ["lighter", "darker"];

function lcOf(color: OKLCH, bg: RGB, raw = false): number {
  const c = oklchToRGBGamut(color);
  return raw ? calcAPCAraw(c, bg) : calcAPCAabs(c, bg);
}

describe("preferredPolarity", () => {
  it("prefers darker text on light backgrounds and lighter on dark", () => {
    expect(preferredPolarity(WHITE)).toBe("darker");
    expect(preferredPolarity(gray(200)).valueOf()).toBe("darker");
    expect(preferredPolarity(BLACK)).toBe("lighter");
    expect(preferredPolarity(gray(60))).toBe("lighter");
  });

  it("matches a direct comparison of black vs white on the background", () => {
    for (let v = 0; v <= 255; v += 3) {
      const bg = gray(v);
      const expected =
        calcAPCAabs(BLACK, bg) >= calcAPCAabs(WHITE, bg) ? "darker" : "lighter";
      expect(preferredPolarity(bg)).toBe(expected);
    }
  });
});

describe("maxContrast", () => {
  it("returns the extreme of the requested side", () => {
    const seed: OKLCH = { l: 0.5, c: 0.2, h: 250 };
    const dark = maxContrast(seed, WHITE, "darker");
    expect(dark.color.l).toBe(0);
    expect(dark.lc).toBeCloseTo(calcAPCAabs(BLACK, WHITE), 6);
    expect(dark.reached).toBe(true);

    const light = maxContrast(seed, BLACK, "lighter");
    expect(light.color.l).toBe(1);
    expect(light.lc).toBeCloseTo(calcAPCAabs(WHITE, BLACK), 6);
  });

  it("is always >= any solved result on that side", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      for (const bg of BACKGROUNDS) {
        for (const polarity of POLARITIES) {
          const max = maxContrast(seed, bg, polarity).lc;
          const r = solveContrast(seed, bg, 60, { polarity });
          expect(r.lc).toBeLessThanOrEqual(max + 1e-9);
        }
      }
    }
  });
});

describe("solveContrast", () => {
  it("targetLc <= 0 returns the color at the background lightness", () => {
    const seed: OKLCH = { l: 0.3, c: 0.1, h: 40 };
    for (const bg of [WHITE, BLACK, gray(128), rgb(30, 60, 120)]) {
      const r = solveContrast(seed, bg, 0, { polarity: "lighter" });
      expect(r.reached).toBe(true);
      expect(r.lc).toBe(0);
      expect(r.color.l).toBeCloseTo(rgbToOKLCH(bg).l, 9);
      expect(r.color.h).toBe(40);
      expect(solveContrast(seed, bg, -5, { polarity: "darker" }).lc).toBe(0);
    }
  });

  it("meets target <= lc <= target + tolerance (modulo quantization) across many combinations", () => {
    let reachedCount = 0;
    let unreachedCount = 0;
    for (const seed of SEEDS) {
      for (const bg of BACKGROUNDS) {
        for (const target of TARGETS) {
          for (const polarity of POLARITIES) {
            const r = solveContrast(seed, bg, target, { polarity });
            const actual = lcOf(r.color, bg);
            expect(r.lc).toBeCloseTo(actual, 9);
            expect(r.color.h).toBe(seed.h);
            expect(r.color.c).toBeLessThanOrEqual(seed.c + 1e-9);
            expect(r.color.l).toBeGreaterThanOrEqual(0);
            expect(r.color.l).toBeLessThanOrEqual(1);

            const bgL = rgbToOKLCH(bg).l;
            if (polarity === "lighter") {
              expect(r.color.l).toBeGreaterThanOrEqual(bgL - 1e-9);
            } else {
              expect(r.color.l).toBeLessThanOrEqual(bgL + 1e-9);
            }

            if (r.reached) {
              reachedCount++;
              expect(r.lc).toBeGreaterThanOrEqual(target);
              expect(r.lc).toBeLessThanOrEqual(target + 0.25 + QUANT);
            } else {
              unreachedCount++;
              expect(r.lc).toBeLessThan(target);
              // Unreached → the extreme of that side.
              expect(r.color.l).toBe(polarity === "lighter" ? 1 : 0);
              expect(r.lc).toBeCloseTo(maxContrast(seed, bg, polarity).lc, 9);
            }
          }
        }
      }
    }
    expect(reachedCount).toBeGreaterThan(0);
    expect(unreachedCount).toBeGreaterThan(0);
  });

  it("honours a custom tolerance", () => {
    const seed: OKLCH = { l: 0.6, c: 0.12, h: 200 };
    for (const tolerance of [0.05, 1, 5]) {
      for (const bg of [WHITE, BLACK, gray(128)]) {
        for (const polarity of POLARITIES) {
          const r = solveContrast(seed, bg, 45, { polarity, tolerance });
          if (!r.reached) continue;
          expect(r.lc).toBeGreaterThanOrEqual(45);
          expect(r.lc).toBeLessThanOrEqual(45 + tolerance + QUANT);
        }
      }
    }
  });

  it("reports reached:false with the extreme when the side cannot reach the target", () => {
    // Lighter than white is impossible.
    const seed: OKLCH = { l: 0.5, c: 0.1, h: 120 };
    const r = solveContrast(seed, WHITE, 30, { polarity: "lighter" });
    expect(r.reached).toBe(false);
    expect(r.color.l).toBe(1);
    expect(r.lc).toBe(0);

    // Darker than black is impossible.
    const d = solveContrast(seed, BLACK, 30, { polarity: "darker" });
    expect(d.reached).toBe(false);
    expect(d.color.l).toBe(0);
    expect(d.lc).toBe(0);

    // 105 is beyond white-on-mid-gray.
    const m = solveContrast(seed, gray(128), 105, { polarity: "lighter" });
    expect(m.reached).toBe(false);
    expect(m.color.l).toBe(1);
    expect(m.lc).toBeCloseTo(calcAPCAabs(WHITE, gray(128)), 6);
  });

  it("raw mode solves low targets (7) and never crosses the background", () => {
    for (const seed of SEEDS) {
      for (const bg of BACKGROUNDS) {
        for (const target of [3, 7, 12]) {
          for (const polarity of POLARITIES) {
            const r = solveContrast(seed, bg, target, { polarity, raw: true });
            const bgL = rgbToOKLCH(bg).l;
            if (polarity === "lighter") {
              expect(r.color.l).toBeGreaterThanOrEqual(bgL - 1e-9);
            } else {
              expect(r.color.l).toBeLessThanOrEqual(bgL + 1e-9);
            }
            expect(r.lc).toBeCloseTo(lcOf(r.color, bg, true), 9);
            if (r.reached) {
              expect(r.lc).toBeGreaterThanOrEqual(target);
              expect(r.lc).toBeLessThanOrEqual(target + 0.25 + QUANT);
            } else {
              expect(r.color.l).toBe(polarity === "lighter" ? 1 : 0);
            }
          }
        }
      }
    }
  });

  it("raw mode reaches Lc 7 on a mid-gray background from both sides", () => {
    const seed: OKLCH = { l: 0.5, c: 0.05, h: 250 };
    for (const polarity of POLARITIES) {
      const r = solveContrast(seed, gray(128), 7, { polarity, raw: true });
      expect(r.reached).toBe(true);
      expect(r.lc).toBeGreaterThanOrEqual(7);
      expect(r.lc).toBeLessThan(7 + 0.25 + QUANT);
      // Clipped APCA would report 0 here.
      expect(lcOf(r.color, gray(128))).toBe(0);
    }
  });

  it("works with achromatic seeds", () => {
    const seed: OKLCH = { l: 0.5, c: 0, h: 0 };
    for (const bg of BACKGROUNDS) {
      const polarity = preferredPolarity(bg);
      const r = solveContrast(seed, bg, 60, { polarity });
      expect(r.reached).toBe(true);
      expect(r.color.c).toBe(0);
      expect(r.lc).toBeGreaterThanOrEqual(60);
      expect(r.lc).toBeLessThanOrEqual(60.25 + QUANT);
      const c = oklchToRGBGamut(r.color);
      expect(c.r).toBe(c.g);
      expect(c.g).toBe(c.b);
    }
  });

  it("is deterministic", () => {
    const seed: OKLCH = { l: 0.7, c: 0.2, h: 15 };
    const a = solveContrast(seed, gray(240), 75, { polarity: "darker" });
    const b = solveContrast(seed, gray(240), 75, { polarity: "darker" });
    expect(a).toEqual(b);
  });

  it("solved lightness is ordered by target within a polarity", () => {
    const seed: OKLCH = { l: 0.6, c: 0.15, h: 260 };
    for (const bg of [WHITE, BLACK, gray(128)]) {
      for (const polarity of POLARITIES) {
        let prev = polarity === "lighter" ? -Infinity : Infinity;
        for (const target of [15, 30, 45, 60, 75, 90]) {
          const r = solveContrast(seed, bg, target, { polarity });
          if (!r.reached) break;
          if (polarity === "lighter") {
            expect(r.color.l).toBeGreaterThanOrEqual(prev - 1e-9);
          } else {
            expect(r.color.l).toBeLessThanOrEqual(prev + 1e-9);
          }
          prev = r.color.l;
        }
      }
    }
  });
});

const WCAG_TARGETS = [1.5, 2, 3, 3.5, 4.5, 7, 10];

describe("solveContrast wcag2 metric", () => {
  it("defaults to clipped APCA when metric is omitted", () => {
    const seed: OKLCH = { l: 0.55, c: 0.12, h: 200 };
    expect(solveContrast(seed, WHITE, 60, { polarity: "darker" })).toEqual(
      solveContrast(seed, WHITE, 60, { polarity: "darker", metric: apcaMetric }),
    );
    expect(solveContrast(seed, gray(128), 7, { polarity: "lighter", raw: true })).toEqual(
      solveContrast(seed, gray(128), 7, {
        polarity: "lighter",
        metric: apcaRawMetric,
      }),
    );
  });

  it("when reached, target <= ratio <= target × 1.02", () => {
    let reachedCount = 0;
    let unreachedCount = 0;
    for (const seed of SEEDS) {
      for (const bg of BACKGROUNDS) {
        for (const target of WCAG_TARGETS) {
          for (const polarity of POLARITIES) {
            const where = `h${seed.h} c${seed.c} bg(${bg.r},${bg.g},${bg.b}) ${polarity} ${target}`;
            const r = solveContrast(seed, bg, target, { polarity, metric: wcag2Metric });
            const ratio = wcag2Ratio(oklchToRGBGamut(r.color), bg);
            expect(r.lc, where).toBe(ratio);
            expect(r.color.h, where).toBe(seed.h);
            expect(r.color.c, where).toBeLessThanOrEqual(seed.c + 1e-9);

            const bgL = rgbToOKLCH(bg).l;
            if (polarity === "lighter") {
              expect(r.color.l, where).toBeGreaterThanOrEqual(bgL - 1e-9);
            } else {
              expect(r.color.l, where).toBeLessThanOrEqual(bgL + 1e-9);
            }

            if (r.reached) {
              reachedCount++;
              expect(ratio, where).toBeGreaterThanOrEqual(target);
              expect(ratio, where).toBeLessThanOrEqual(target * 1.02);
            } else {
              unreachedCount++;
              expect(ratio, where).toBeLessThan(target);
              expect(r.color.l, where).toBe(polarity === "lighter" ? 1 : 0);
            }
          }
        }
      }
    }
    expect(reachedCount).toBeGreaterThan(0);
    expect(unreachedCount).toBeGreaterThan(0);
  });

  it("solved lightness is ordered by ratio within a polarity", () => {
    const seed: OKLCH = { l: 0.6, c: 0.08, h: 220 };
    for (const bg of [WHITE, BLACK, gray(200), gray(40)]) {
      for (const polarity of POLARITIES) {
        let prev = polarity === "lighter" ? -Infinity : Infinity;
        for (const target of [1.5, 2, 3, 4.5, 7]) {
          const r = solveContrast(seed, bg, target, { polarity, metric: wcag2Metric });
          if (!r.reached) break;
          if (polarity === "lighter") {
            expect(r.color.l).toBeGreaterThanOrEqual(prev - 1e-9);
          } else {
            expect(r.color.l).toBeLessThanOrEqual(prev + 1e-9);
          }
          prev = r.color.l;
        }
      }
    }
  });

  it("reports the extreme when the side cannot reach the ratio", () => {
    const seed: OKLCH = { l: 0.5, c: 0.1, h: 120 };
    const lighter = solveContrast(seed, WHITE, 3, {
      polarity: "lighter",
      metric: wcag2Metric,
    });
    expect(lighter.reached).toBe(false);
    expect(lighter.color.l).toBe(1);
    expect(lighter.lc).toBe(1);

    const darker = solveContrast(seed, BLACK, 3, {
      polarity: "darker",
      metric: wcag2Metric,
    });
    expect(darker.reached).toBe(false);
    expect(darker.color.l).toBe(0);
    expect(darker.lc).toBe(1);
  });
});
