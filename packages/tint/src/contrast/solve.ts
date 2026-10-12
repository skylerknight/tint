import type { RGB, OKLCH } from "../color/types.js";
import type { Metric, Polarity, SolveOptions, SolveResult } from "./types.js";
import { calcAPCAabs, calcAPCAraw } from "./apca.js";
import { WCAG2_RELATIVE_TOLERANCE, wcag2Ratio } from "./wcag2.js";
import { rgbToOKLCH } from "../color/convert.js";
import { oklchToRGBGamut, toGamut } from "../color/gamut.js";
import { setLightness } from "../color/oklch.js";

const DEFAULT_TOLERANCE = 0.25;
const MAX_ITERATIONS = 60;
const MIN_INTERVAL = 1e-5;

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Clipped APCA |Lc|. The default metric; v3 behavior. */
export const apcaMetric: Metric = {
  id: "apca",
  neutral: 0,
  neutralResult: 0,
  toleranceMode: "absolute",
  defaultTolerance: DEFAULT_TOLERANCE,
  measure: calcAPCAabs,
};

/** APCA |Lc| without the low-contrast clip. Selected by `raw: true`. */
export const apcaRawMetric: Metric = {
  id: "apca",
  neutral: 0,
  neutralResult: 0,
  toleranceMode: "absolute",
  defaultTolerance: DEFAULT_TOLERANCE,
  measure: calcAPCAraw,
};

/** WCAG 2 contrast ratio. Monotonic in OKLCH L on one polarity. */
export const wcag2Metric: Metric = {
  id: "wcag2",
  neutral: 1,
  neutralResult: "measure",
  toleranceMode: "relative",
  defaultTolerance: WCAG2_RELATIVE_TOLERANCE,
  measure: wcag2Ratio,
};

function resolveMetric(options: SolveOptions): Metric {
  return options.metric ?? (options.raw === true ? apcaRawMetric : apcaMetric);
}

/** Gamut-mapped seed at lightness `l` and its metric value against `background`. */
function sample(
  seed: OKLCH,
  l: number,
  background: RGB,
  metric: Metric,
): { color: OKLCH; lc: number } {
  const color = toGamut(setLightness(seed, l));
  const rgb = oklchToRGBGamut(color);
  return { color, lc: metric.measure(rgb, background) };
}

function closeEnough(
  metric: Metric,
  achieved: number,
  target: number,
  tolerance: number,
): boolean {
  return metric.toleranceMode === "absolute"
    ? achieved - target <= tolerance
    : achieved <= target * (1 + tolerance);
}

/**
 * Find the seed's hue/chroma at the lightness that achieves `targetLc`
 * against `background`, searching only on the requested side.
 *
 * Within one polarity the metric is monotonic in OKLCH L, so this bisects L
 * between the background lightness and the far extreme (0 or 1), keeping the
 * smallest-overshoot candidate that still meets the target.
 *
 * The third argument is |Lc| for the default APCA metric and a contrast ratio
 * when `options.metric` is `wcag2Metric`. Omitting `metric` preserves v3.
 */
export function solveContrast(
  seed: OKLCH,
  background: RGB,
  targetLc: number,
  options: SolveOptions,
): SolveResult {
  const metric = resolveMetric(options);
  const tolerance = options.tolerance ?? metric.defaultTolerance;
  const bgL = rgbToOKLCH(background).l;

  if (targetLc <= metric.neutral) {
    const color = toGamut(setLightness(seed, bgL));
    const lc =
      metric.neutralResult === 0 ? 0 : metric.measure(oklchToRGBGamut(color), background);
    return { color, lc, reached: true };
  }

  const farL = options.polarity === "darker" ? 0 : 1;
  const far = sample(seed, farL, background, metric);
  if (far.lc < targetLc) {
    return { color: far.color, lc: far.lc, reached: false };
  }

  // `near` is the background side (low contrast), `farEnd` the extreme.
  let near = bgL;
  let farEnd = farL;
  let best = far;

  for (let i = 0; i < MAX_ITERATIONS && Math.abs(farEnd - near) > MIN_INTERVAL; i++) {
    const mid = (near + farEnd) / 2;
    const s = sample(seed, mid, background, metric);
    if (s.lc >= targetLc) {
      if (s.lc < best.lc) best = s;
      if (closeEnough(metric, s.lc, targetLc, tolerance)) break;
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
  const s = sample(seed, polarity === "darker" ? 0 : 1, background, apcaMetric);
  return { color: s.color, lc: s.lc, reached: true };
}

/** "darker" when black on `background` reaches at least as much Lc as white. */
export function preferredPolarity(background: RGB): Polarity {
  return calcAPCAabs(BLACK, background) >= calcAPCAabs(WHITE, background)
    ? "darker"
    : "lighter";
}
