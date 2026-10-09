import { describe, expect, it } from "vitest";
import {
  APCA_THRESHOLDS,
  calcAPCA,
  calcAPCAabs,
  calcAPCAraw,
  meetsContrast,
  sRGBtoY,
} from "../../src/contrast/apca.js";
import type { RGB } from "../../src/color/types.js";

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
const gray = (v: number): RGB => rgb(v, v, v);
const BLACK = gray(0);
const WHITE = gray(255);

describe("sRGBtoY", () => {
  it("maps black to 0 and white to 1", () => {
    expect(sRGBtoY(BLACK)).toBe(0);
    expect(sRGBtoY(WHITE)).toBeCloseTo(1, 6);
  });

  it("uses the simple 2.4 power curve with APCA coefficients", () => {
    expect(sRGBtoY(gray(128))).toBeCloseTo(
      (0.2126729 + 0.7151522 + 0.072175) * Math.pow(128 / 255, 2.4),
      9,
    );
    expect(sRGBtoY(rgb(255, 0, 0))).toBeCloseTo(0.2126729, 9);
    expect(sRGBtoY(rgb(0, 255, 0))).toBeCloseTo(0.7151522, 9);
    expect(sRGBtoY(rgb(0, 0, 255))).toBeCloseTo(0.072175, 9);
  });
});

describe("calcAPCA reference pairs (APCA-W3 0.1.9)", () => {
  const cases: [RGB, RGB, number][] = [
    [BLACK, WHITE, 106.04],
    [WHITE, BLACK, -107.88],
    [gray(0x88), WHITE, 63.06],
    [WHITE, gray(0x88), -68.54],
    [gray(0xaa), BLACK, -56.24],
    [BLACK, gray(0xaa), 58.15],
  ];

  for (const [text, bg, expected] of cases) {
    it(`calcAPCA(${JSON.stringify(text)}, ${JSON.stringify(bg)}) ≈ ${expected}`, () => {
      const lc = calcAPCA(text, bg);
      expect(Math.abs(lc - expected)).toBeLessThanOrEqual(0.1);
    });
  }

  it("returns 0 for identical colors", () => {
    expect(calcAPCA(gray(100), gray(100))).toBe(0);
    expect(calcAPCA(rgb(12, 200, 90), rgb(12, 200, 90))).toBe(0);
  });

  it("applies the low-contrast clip", () => {
    expect(calcAPCA(gray(128), gray(130))).toBe(0);
    expect(calcAPCA(gray(130), gray(128))).toBe(0);
  });

  it("returns 0 for out-of-range input", () => {
    expect(calcAPCA(rgb(-10, 0, 0), WHITE)).toBe(0);
    expect(calcAPCA(BLACK, rgb(300, 300, 300))).toBe(0);
  });
});

describe("calcAPCAabs / meetsContrast", () => {
  it("abs is the magnitude of the signed value", () => {
    expect(calcAPCAabs(WHITE, BLACK)).toBeCloseTo(107.88, 1);
    expect(calcAPCAabs(BLACK, WHITE)).toBeCloseTo(106.04, 1);
  });

  it("meetsContrast compares against |Lc|", () => {
    expect(meetsContrast(WHITE, BLACK, 90)).toBe(true);
    expect(meetsContrast(gray(0x88), WHITE, 63)).toBe(true);
    expect(meetsContrast(gray(0x88), WHITE, 64)).toBe(false);
  });

  it("exposes the threshold constants", () => {
    expect(APCA_THRESHOLDS).toEqual({
      minimum: 8,
      decorative: 15,
      largeText: 30,
      bodyTextMin: 45,
      bodyTextRecommended: 60,
      smallText: 75,
      maximum: 90,
    });
  });
});

describe("calcAPCAraw", () => {
  it("equals |calcAPCA| whenever the clipped value is non-zero", () => {
    const pairs: [RGB, RGB][] = [
      [BLACK, WHITE],
      [WHITE, BLACK],
      [gray(0x88), WHITE],
      [rgb(200, 30, 60), gray(240)],
      [rgb(80, 120, 255), gray(20)],
    ];
    for (const [fg, bg] of pairs) {
      expect(calcAPCAraw(fg, bg)).toBeCloseTo(calcAPCAabs(fg, bg), 9);
    }
  });

  it("measures sub-clip contrast and never goes negative", () => {
    expect(calcAPCAraw(gray(128), gray(140))).toBeGreaterThan(0);
    expect(calcAPCAraw(gray(140), gray(128))).toBeGreaterThan(0);
    expect(calcAPCAraw(gray(128), gray(128))).toBe(0);
    for (let v = 0; v <= 255; v += 5) {
      for (let w = 0; w <= 255; w += 5) {
        expect(calcAPCAraw(gray(v), gray(w))).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is monotonic non-decreasing as the foreground moves away from the background", () => {
    const backgrounds = [0, 1, 17, 64, 128, 192, 240, 254, 255];
    for (const b of backgrounds) {
      const bg = gray(b);
      // Lighter sweep.
      let prev = -1;
      for (let v = b; v <= 255; v++) {
        const lc = calcAPCAraw(gray(v), bg);
        expect(lc).toBeGreaterThanOrEqual(prev);
        prev = lc;
      }
      // Darker sweep.
      prev = -1;
      for (let v = b; v >= 0; v--) {
        const lc = calcAPCAraw(gray(v), bg);
        expect(lc).toBeGreaterThanOrEqual(prev);
        prev = lc;
      }
    }
  });

  it("is monotonic for a colored sweep too", () => {
    const bg = rgb(250, 245, 230);
    let prev = -1;
    for (let v = 250; v >= 0; v--) {
      const lc = calcAPCAraw(rgb(v, Math.round(v * 0.6), Math.round(v * 0.3)), bg);
      expect(lc).toBeGreaterThanOrEqual(prev);
      prev = lc;
    }
  });
});
