import type { RGB, OKLCH } from "../color/types.js";
import type { Polarity, SolveOptions, SolveResult } from "./types.js";
import { calcAPCAabs, calcAPCAraw } from "./apca.js";
import { rgbToOKLCH } from "../color/convert.js";
import { oklchToRGBGamut, toGamut } from "../color/gamut.js";
import { setLightness } from "../color/oklch.js";

const DEFAULT_TOLERANCE = 0.25;
const MAX_ITERATIONS = 60;
const MIN_INTERVAL = 1e-5;

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Gamut-mapped seed at lightness `l` and its |Lc| against `background`. */
function sample(
  seed: OKLCH,
  l: number,
  background: RGB,
  raw: boolean,
): { color: OKLCH; lc: number } {
  const color = toGamut(setLightness(seed, l));
  const rgb = oklchToRGBGamut(color);
  const lc = raw ? calcAPCAraw(rgb, background) : calcAPCAabs(rgb, background);
  return { color, lc };
}

/**
 * Find the seed's hue/chroma at the lightness that achieves `targetLc`
 * against `background`, searching only on the requested side.
 *
 * Within one polarity |Lc| is monotonic in OKLCH L, so this bisects L between
 * the background lightness and the far extreme (0 or 1), keeping the
 * smallest-overshoot candidate with `lc >= target`.
 */
export function solveContrast(
  seed: OKLCH,
  background: RGB,
  targetLc: number,
  options: SolveOptions,
): SolveResult {
  const raw = options.raw ?? false;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const bgL = rgbToOKLCH(background).l;

  if (targetLc <= 0) {
    return { color: toGamut(setLightness(seed, bgL)), lc: 0, reached: true };
  }

  const farL = options.polarity === "darker" ? 0 : 1;
  const far = sample(seed, farL, background, raw);
  if (far.lc < targetLc) {
    return { color: far.color, lc: far.lc, reached: false };
  }

  // `near` is the background side (low contrast), `farEnd` the extreme.
  let near = bgL;
  let farEnd = farL;
  let best = far;

  for (let i = 0; i < MAX_ITERATIONS && Math.abs(farEnd - near) > MIN_INTERVAL; i++) {
    const mid = (near + farEnd) / 2;
    const s = sample(seed, mid, background, raw);
    if (s.lc >= targetLc) {
      if (s.lc < best.lc) best = s;
      if (s.lc - targetLc <= tolerance) break;
      farEnd = mid;
    } else {
      near = mid;
    }
  }

  return { color: best.color, lc: best.lc, reached: true };
}

/** The highest-contrast color of the seed's hue on the given side. */
export function maxContrast(
  seed: OKLCH,
  background: RGB,
  polarity: Polarity,
): SolveResult {
  const s = sample(seed, polarity === "darker" ? 0 : 1, background, false);
  return { color: s.color, lc: s.lc, reached: true };
}

/** "darker" when black on `background` reaches at least as much Lc as white. */
export function preferredPolarity(background: RGB): Polarity {
  return calcAPCAabs(BLACK, background) >= calcAPCAabs(WHITE, background)
    ? "darker"
    : "lighter";
}
