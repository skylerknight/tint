import { describe, expect, it } from "vitest";
import {
  srgbToLinear,
  linearToSRGB,
  linearRGBToOKLAB,
  oklabToLinearRGB,
  oklabToOKLCH,
  oklchToOKLAB,
  rgbToOKLCH,
  oklchToRGB,
  isInGamut,
  isOKLCHInGamut,
  rgbToHSL,
  hslToRGB,
} from "../../src/color/convert.js";
import type { RGB } from "../../src/color/types.js";

const near = (actual: number, expected: number, tol: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

/** Every 15th value per channel, plus 255: 18^3 = 5832 colors. */
function* sampleColors(step = 15): Generator<RGB> {
  const values: number[] = [];
  for (let v = 0; v < 256; v += step) values.push(v);
  if (values[values.length - 1] !== 255) values.push(255);
  for (const r of values)
    for (const g of values) for (const b of values) yield { r, g, b };
}

describe("sRGB transfer", () => {
  it("maps endpoints and the linear/curved knee", () => {
    expect(srgbToLinear({ r: 0, g: 0, b: 0 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(srgbToLinear({ r: 255, g: 255, b: 255 })).toEqual({
      r: 1,
      g: 1,
      b: 1,
    });
    // 128/255 → ~0.2158
    near(srgbToLinear({ r: 128, g: 0, b: 0 }).r, 0.2158, 1e-3);
    // Small values use the linear segment: 10/255/12.92
    near(srgbToLinear({ r: 10, g: 0, b: 0 }).r, 10 / 255 / 12.92, 1e-12);
  });

  it("linearToSRGB clamps and rounds", () => {
    expect(linearToSRGB({ r: -0.5, g: 2, b: 0.5 })).toEqual({
      r: 0,
      g: 255,
      b: 188,
    });
  });

  it("round-trips every 8-bit value exactly", () => {
    for (let v = 0; v < 256; v++) {
      const out = linearToSRGB(srgbToLinear({ r: v, g: v, b: v }));
      expect(out).toEqual({ r: v, g: v, b: v });
    }
  });
});

describe("OKLab / OKLCH", () => {
  it("white is l≈1 with ~zero chroma", () => {
    const lch = rgbToOKLCH({ r: 255, g: 255, b: 255 });
    near(lch.l, 1, 1e-4);
    near(lch.c, 0, 1e-4);
    expect(lch.h).toBe(0);
  });

  it("black is l 0", () => {
    const lch = rgbToOKLCH({ r: 0, g: 0, b: 0 });
    expect(lch.l).toBe(0);
    expect(lch.c).toBe(0);
    expect(lch.h).toBe(0);
  });

  it.each([
    [{ r: 255, g: 0, b: 0 }, 0.628, 0.2577, 29.23],
    [{ r: 0, g: 0, b: 255 }, 0.452, 0.3132, 264.05],
    [{ r: 0x7c, g: 0x3a, b: 0xed }, 0.541, 0.248, 293.0],
  ])("known value %o → oklch(%f %f %f)", (rgb, l, c, h) => {
    const lch = rgbToOKLCH(rgb);
    near(lch.l, l, 0.005);
    near(lch.c, c, 0.005);
    near(lch.h, h, 0.5);
  });

  it("grays are achromatic with hue 0", () => {
    for (let v = 0; v < 256; v += 5) {
      const lch = rgbToOKLCH({ r: v, g: v, b: v });
      expect(lch.c).toBeLessThan(1e-4);
      expect(lch.h).toBe(0);
    }
  });

  it("hue is always in [0, 360)", () => {
    for (const rgb of sampleColors(51)) {
      const { h } = rgbToOKLCH(rgb);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("oklab ↔ oklch are inverses", () => {
    const lab = { l: 0.6, a: -0.1, b: 0.12 };
    const back = oklchToOKLAB(oklabToOKLCH(lab));
    near(back.l, lab.l, 1e-12);
    near(back.a, lab.a, 1e-12);
    near(back.b, lab.b, 1e-12);
  });

  it("linear ↔ oklab are inverses", () => {
    const lin = { r: 0.2, g: 0.7, b: 0.4 };
    const back = oklabToLinearRGB(linearRGBToOKLAB(lin));
    near(back.r, lin.r, 1e-6);
    near(back.g, lin.g, 1e-6);
    near(back.b, lin.b, 1e-6);
  });

  it("rgb → oklch → rgb is exact for a dense 8-bit sample", () => {
    let count = 0;
    for (const rgb of sampleColors()) {
      expect(oklchToRGB(rgbToOKLCH(rgb))).toEqual(rgb);
      count++;
    }
    expect(count).toBe(18 ** 3);
  });

  it("oklchToRGB clamps out-of-gamut colors rather than throwing", () => {
    const rgb = oklchToRGB({ l: 0.7, c: 0.5, h: 150 });
    for (const v of [rgb.r, rgb.g, rgb.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("gamut checks", () => {
  it("isInGamut respects epsilon", () => {
    expect(isInGamut({ r: 0, g: 0.5, b: 1 })).toBe(true);
    expect(isInGamut({ r: 1.00005, g: 0, b: 0 })).toBe(true);
    expect(isInGamut({ r: 1.01, g: 0, b: 0 })).toBe(false);
    expect(isInGamut({ r: -0.01, g: 0, b: 0 })).toBe(false);
    expect(isInGamut({ r: 1.01, g: 0, b: 0 }, 0.02)).toBe(true);
  });

  it("isOKLCHInGamut agrees with 8-bit colors and rejects wild chroma", () => {
    for (const rgb of sampleColors(51)) {
      expect(isOKLCHInGamut(rgbToOKLCH(rgb))).toBe(true);
    }
    expect(isOKLCHInGamut({ l: 0.5, c: 0.4, h: 0 })).toBe(false);
    expect(isOKLCHInGamut({ l: 0.9, c: 0.3, h: 264 })).toBe(false);
  });
});

describe("HSL", () => {
  it.each([
    [
      { r: 255, g: 0, b: 0 },
      { h: 0, s: 100, l: 50 },
    ],
    [
      { r: 0, g: 255, b: 0 },
      { h: 120, s: 100, l: 50 },
    ],
    [
      { r: 0, g: 0, b: 255 },
      { h: 240, s: 100, l: 50 },
    ],
    [
      { r: 255, g: 255, b: 255 },
      { h: 0, s: 0, l: 100 },
    ],
    [
      { r: 0, g: 0, b: 0 },
      { h: 0, s: 0, l: 0 },
    ],
    [
      { r: 128, g: 128, b: 128 },
      { h: 0, s: 0, l: (128 / 255) * 100 },
    ],
  ])("rgbToHSL(%o) = %o", (rgb, hsl) => {
    const out = rgbToHSL(rgb);
    near(out.h, hsl.h, 1e-9);
    near(out.s, hsl.s, 1e-9);
    near(out.l, hsl.l, 1e-9);
  });

  it.each([
    [
      { h: 0, s: 100, l: 50 },
      { r: 255, g: 0, b: 0 },
    ],
    [
      { h: 120, s: 100, l: 50 },
      { r: 0, g: 255, b: 0 },
    ],
    [
      { h: 240, s: 100, l: 50 },
      { r: 0, g: 0, b: 255 },
    ],
    [
      { h: 210, s: 40, l: 50 },
      { r: 77, g: 128, b: 179 },
    ],
    [
      { h: 0, s: 0, l: 50 },
      { r: 128, g: 128, b: 128 },
    ],
    [
      { h: -120, s: 100, l: 50 },
      { r: 0, g: 0, b: 255 },
    ],
    [
      { h: 480, s: 100, l: 50 },
      { r: 0, g: 255, b: 0 },
    ],
  ])("hslToRGB(%o) = %o", (hsl, rgb) => {
    expect(hslToRGB(hsl)).toEqual(rgb);
  });

  it("rgb → hsl → rgb round-trips exactly", () => {
    for (const rgb of sampleColors()) {
      expect(hslToRGB(rgbToHSL(rgb))).toEqual(rgb);
    }
  });
});
