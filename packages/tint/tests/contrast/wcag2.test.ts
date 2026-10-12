import { describe, expect, it } from "vitest";
import type { RGB } from "../../src/color/types.js";
import { relativeLuminance, wcag2Ratio } from "../../src/contrast/wcag2.js";

/** `#RGB` or `#RRGGBB`. Three-digit form expands the way CSS does. */
function hex(value: string): RGB {
  const raw = value.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

const BLACK = hex("#000000");
const WHITE = hex("#ffffff");
const GRAY_777 = hex("#777777");

describe("wcag2Ratio", () => {
  it("is 21 for black and white", () => {
    expect(wcag2Ratio(hex("#000"), hex("#fff"))).toBe(21);
    expect(wcag2Ratio(hex("#000000"), hex("#ffffff"))).toBe(21);
    expect(wcag2Ratio(WHITE, BLACK)).toBe(21);
  });

  it("is about 4.48 for #777 on white", () => {
    expect(wcag2Ratio(hex("#777"), hex("#fff"))).toBeCloseTo(4.48, 2);
    expect(wcag2Ratio(GRAY_777, WHITE)).toBeCloseTo(4.48, 2);
  });

  it("is symmetric", () => {
    const colors = [
      BLACK,
      WHITE,
      GRAY_777,
      hex("#777777"),
      hex("#1d4ed8"),
      hex("#fbbf24"),
      hex("#111827"),
      { r: 12, g: 200, b: 40 },
    ];
    for (const a of colors) {
      for (const b of colors) {
        expect(wcag2Ratio(a, b)).toBe(wcag2Ratio(b, a));
      }
    }
  });

  it("is 1 for a color against itself and at least 1 otherwise", () => {
    expect(wcag2Ratio(GRAY_777, GRAY_777)).toBe(1);
    expect(wcag2Ratio(hex("#1d4ed8"), hex("#fbbf24"))).toBeGreaterThanOrEqual(1);
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBe(1);
  });
});
