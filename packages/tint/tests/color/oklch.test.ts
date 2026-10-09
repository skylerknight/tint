import { describe, expect, it } from "vitest";
import {
  oklch,
  setLightness,
  setChroma,
  scaleChroma,
  setHue,
  mixOKLCH,
  isAchromatic,
  formatOKLCH,
} from "../../src/color/oklch.js";

describe("oklch()", () => {
  it("passes through normal values", () => {
    expect(oklch(0.7, 0.15, 250)).toEqual({ l: 0.7, c: 0.15, h: 250 });
  });

  it("clamps lightness to 0..1 and chroma to >= 0", () => {
    expect(oklch(-0.2, -0.1, 0)).toEqual({ l: 0, c: 0, h: 0 });
    expect(oklch(1.5, 0.1, 0)).toEqual({ l: 1, c: 0.1, h: 0 });
  });

  it("wraps hue into [0, 360)", () => {
    expect(oklch(0.5, 0.1, 360).h).toBe(0);
    expect(oklch(0.5, 0.1, 370).h).toBe(10);
    expect(oklch(0.5, 0.1, -10).h).toBe(350);
    expect(oklch(0.5, 0.1, -720).h).toBe(0);
    expect(oklch(0.5, 0.1, 1080.5).h).toBeCloseTo(0.5, 10);
  });
});

describe("setters", () => {
  const base = { l: 0.5, c: 0.1, h: 120 };

  it("setLightness clamps and does not mutate", () => {
    expect(setLightness(base, 0.8)).toEqual({ l: 0.8, c: 0.1, h: 120 });
    expect(setLightness(base, 2)).toEqual({ l: 1, c: 0.1, h: 120 });
    expect(setLightness(base, -1).l).toBe(0);
    expect(base).toEqual({ l: 0.5, c: 0.1, h: 120 });
  });

  it("setChroma clamps to >= 0", () => {
    expect(setChroma(base, 0.3)).toEqual({ l: 0.5, c: 0.3, h: 120 });
    expect(setChroma(base, -0.3)).toEqual({ l: 0.5, c: 0, h: 120 });
  });

  it("scaleChroma multiplies", () => {
    expect(scaleChroma(base, 2)).toEqual({ l: 0.5, c: 0.2, h: 120 });
    expect(scaleChroma(base, 0)).toEqual({ l: 0.5, c: 0, h: 120 });
    expect(scaleChroma(base, -1)).toEqual({ l: 0.5, c: 0, h: 120 });
  });

  it("setHue wraps", () => {
    expect(setHue(base, 30)).toEqual({ l: 0.5, c: 0.1, h: 30 });
    expect(setHue(base, 390)).toEqual({ l: 0.5, c: 0.1, h: 30 });
    expect(setHue(base, -30)).toEqual({ l: 0.5, c: 0.1, h: 330 });
  });
});

describe("mixOKLCH", () => {
  const a = { l: 0.2, c: 0.1, h: 350 };
  const b = { l: 0.8, c: 0.3, h: 10 };

  it("returns the endpoints at t=0 and t=1", () => {
    expect(mixOKLCH(a, b, 0)).toEqual(a);
    expect(mixOKLCH(a, b, 1)).toEqual(b);
  });

  it("interpolates l and c linearly and hue along the shortest arc", () => {
    const mid = mixOKLCH(a, b, 0.5);
    expect(mid.l).toBeCloseTo(0.5, 12);
    expect(mid.c).toBeCloseTo(0.2, 12);
    expect(mid.h).toBeCloseTo(0, 12); // 350 → 10 crosses 0, not 180
  });

  it("goes the short way in both directions", () => {
    expect(mixOKLCH(b, a, 0.5).h).toBeCloseTo(0, 12);
    // 10 → 200 is a 190° gap; the short arc goes the other way through 285.
    expect(mixOKLCH({ ...a, h: 10 }, { ...b, h: 200 }, 0.5).h).toBeCloseTo(285, 12);
    expect(mixOKLCH({ ...a, h: 200 }, { ...b, h: 10 }, 0.5).h).toBeCloseTo(285, 12);
    expect(mixOKLCH({ ...a, h: 90 }, { ...b, h: 300 }, 0.5).h).toBeCloseTo(15, 12);
  });

  it("clamps t to [0, 1]", () => {
    expect(mixOKLCH(a, b, -1)).toEqual(a);
    expect(mixOKLCH(a, b, 2)).toEqual(b);
  });

  it("adopts the chromatic endpoint's hue when the other is gray", () => {
    const gray = { l: 0.5, c: 0, h: 0 };
    const blue = { l: 0.5, c: 0.2, h: 264 };
    expect(mixOKLCH(gray, blue, 0.25).h).toBe(264);
    expect(mixOKLCH(blue, gray, 0.75).h).toBe(264);
  });

  it("always yields hue in [0, 360)", () => {
    for (let h1 = 0; h1 < 360; h1 += 37) {
      for (let h2 = 0; h2 < 360; h2 += 41) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const { h } = mixOKLCH({ ...a, h: h1 }, { ...b, h: h2 }, t);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(360);
        }
      }
    }
  });
});

describe("isAchromatic", () => {
  it("uses a 1e-4 default threshold", () => {
    expect(isAchromatic({ l: 0.5, c: 0, h: 0 })).toBe(true);
    expect(isAchromatic({ l: 0.5, c: 5e-5, h: 0 })).toBe(true);
    expect(isAchromatic({ l: 0.5, c: 1e-4, h: 0 })).toBe(false);
    expect(isAchromatic({ l: 0.5, c: 0.1, h: 0 })).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(isAchromatic({ l: 0.5, c: 0.01, h: 0 }, 0.02)).toBe(true);
    expect(isAchromatic({ l: 0.5, c: 0.03, h: 0 }, 0.02)).toBe(false);
  });
});

describe("formatOKLCH", () => {
  it("matches the spec example", () => {
    expect(formatOKLCH({ l: 0.7, c: 0.15, h: 250 })).toBe("oklch(70.00% 0.1500 250.00)");
  });

  it("rounds to the fixed precision", () => {
    expect(formatOKLCH({ l: 0.54123, c: 0.248456, h: 293.006 })).toBe(
      "oklch(54.12% 0.2485 293.01)",
    );
    expect(formatOKLCH({ l: 0, c: 0, h: 0 })).toBe("oklch(0.00% 0.0000 0.00)");
    expect(formatOKLCH({ l: 1, c: 0, h: 0 })).toBe("oklch(100.00% 0.0000 0.00)");
  });

  it("honours a custom precision (C gets two extra decimals)", () => {
    expect(formatOKLCH({ l: 0.7, c: 0.15, h: 250 }, 0)).toBe("oklch(70% 0.15 250)");
    expect(formatOKLCH({ l: 0.7, c: 0.15, h: 250 }, 3)).toBe(
      "oklch(70.000% 0.15000 250.000)",
    );
  });
});
