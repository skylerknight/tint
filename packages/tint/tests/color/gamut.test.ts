import { describe, expect, it } from "vitest";
import {
  toGamut,
  oklchToRGBGamut,
  maxChromaForLH,
  clampRGB,
} from "../../src/color/gamut.js";
import { isOKLCHInGamut, rgbToOKLCH, oklchToRGB } from "../../src/color/convert.js";

describe("toGamut", () => {
  it("collapses l <= 0 and l >= 1 to black/white while keeping hue", () => {
    expect(toGamut({ l: 0, c: 0.2, h: 40 })).toEqual({ l: 0, c: 0, h: 40 });
    expect(toGamut({ l: -0.1, c: 0.2, h: 40 })).toEqual({ l: 0, c: 0, h: 40 });
    expect(toGamut({ l: 1, c: 0.2, h: 40 })).toEqual({ l: 1, c: 0, h: 40 });
    expect(toGamut({ l: 1.2, c: 0.2, h: 40 })).toEqual({ l: 1, c: 0, h: 40 });
  });

  it("returns in-gamut colors unchanged (same object)", () => {
    const color = rgbToOKLCH({ r: 120, g: 80, b: 200 });
    expect(toGamut(color)).toBe(color);
  });

  it("preserves L and H exactly, only reduces chroma, and lands in gamut", () => {
    for (let l = 0.05; l < 1; l += 0.05) {
      for (let h = 0; h < 360; h += 15) {
        const input = { l, c: 0.45, h };
        const out = toGamut(input);
        expect(out.l).toBe(l);
        expect(out.h).toBe(h);
        expect(out.c).toBeLessThanOrEqual(input.c);
        expect(out.c).toBeGreaterThanOrEqual(0);
        expect(isOKLCHInGamut(out)).toBe(true);
      }
    }
  });

  it("finds the gamut boundary to within epsilon", () => {
    const l = 0.6;
    const h = 30;
    const out = toGamut({ l, c: 0.4, h }, 1e-4);
    expect(isOKLCHInGamut(out)).toBe(true);
    // Stepping chroma up by 2 epsilon must leave the gamut (boundary found).
    expect(isOKLCHInGamut({ l, c: out.c + 2e-4, h })).toBe(false);
  });

  it("reduces chroma more for a tighter epsilon no further than needed", () => {
    const coarse = toGamut({ l: 0.5, c: 0.4, h: 200 }, 1e-2);
    const fine = toGamut({ l: 0.5, c: 0.4, h: 200 }, 1e-5);
    expect(fine.c).toBeGreaterThanOrEqual(coarse.c);
    expect(fine.c - coarse.c).toBeLessThan(1e-2);
  });

  it("negative chroma is normalised to zero", () => {
    expect(toGamut({ l: 0.5, c: -0.1, h: 10 })).toEqual({
      l: 0.5,
      c: 0,
      h: 10,
    });
  });
});

describe("oklchToRGBGamut", () => {
  it("matches oklchToRGB for in-gamut colors", () => {
    for (let v = 0; v < 256; v += 17) {
      const rgb = { r: v, g: 255 - v, b: (v * 3) % 256 };
      const lch = rgbToOKLCH(rgb);
      expect(oklchToRGBGamut(lch)).toEqual(oklchToRGB(lch));
      expect(oklchToRGBGamut(lch)).toEqual(rgb);
    }
  });

  it("produces a faithful hue for out-of-gamut colors", () => {
    const rgb = oklchToRGBGamut({ l: 0.7, c: 0.5, h: 150 });
    const back = rgbToOKLCH(rgb);
    expect(Math.abs(back.l - 0.7)).toBeLessThan(0.01);
    expect(Math.abs(back.h - 150)).toBeLessThan(1.5);
  });

  it("returns black/white for extreme lightness", () => {
    expect(oklchToRGBGamut({ l: 0, c: 0.3, h: 0 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });
    expect(oklchToRGBGamut({ l: 1, c: 0.3, h: 0 })).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });
});

describe("maxChromaForLH", () => {
  it("is zero at the lightness extremes", () => {
    expect(maxChromaForLH(0, 30)).toBe(0);
    expect(maxChromaForLH(1, 30)).toBe(0);
    expect(maxChromaForLH(-1, 30)).toBe(0);
  });

  it("is in gamut and near the boundary for a sweep of L and H", () => {
    for (let i = 1; i < 10; i++) {
      const l = i / 10;
      for (let h = 0; h < 360; h += 30) {
        const c = maxChromaForLH(l, h, 1e-3);
        expect(c).toBeGreaterThan(0);
        expect(isOKLCHInGamut({ l, c, h })).toBe(true);
        expect(isOKLCHInGamut({ l, c: c + 2e-3, h })).toBe(false);
      }
    }
  });

  it("agrees with toGamut from a large chroma", () => {
    const c = maxChromaForLH(0.55, 264, 1e-5);
    const mapped = toGamut({ l: 0.55, c: 0.4, h: 264 }, 1e-5);
    expect(Math.abs(c - mapped.c)).toBeLessThan(1e-4);
  });

  it("sRGB primaries sit at the maximum for their L and H", () => {
    const red = rgbToOKLCH({ r: 255, g: 0, b: 0 });
    const max = maxChromaForLH(red.l, red.h, 1e-5);
    expect(Math.abs(max - red.c)).toBeLessThan(1e-3);
  });
});

describe("clampRGB", () => {
  it("clamps and rounds", () => {
    expect(clampRGB({ r: -10, g: 300, b: 127.5 })).toEqual({
      r: 0,
      g: 255,
      b: 128,
    });
    expect(clampRGB({ r: 12.4, g: 0, b: 255 })).toEqual({
      r: 12,
      g: 0,
      b: 255,
    });
  });

  it("is idempotent on valid input", () => {
    const rgb = { r: 1, g: 2, b: 3 };
    expect(clampRGB(rgb)).toEqual(rgb);
  });
});
