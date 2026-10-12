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

/**
 * Options for {@link solveAgainstSet}.
 *
 * `polarity` locks the side. Omit it to pick the side whose extreme maximizes
 * the minimum contrast across the set (docs/v4-spec.md §6.2).
 */
export interface SetSolveOptions {
  polarity?: Polarity;
  /** Ignored when `metric` is set. Same meaning as {@link SolveOptions.raw}. */
  raw?: boolean;
  tolerance?: number;
  metric?: Metric;
}

export interface SetSolveResult extends SolveResult {
  polarity: Polarity;
  /** Index of the backdrop with the lowest achieved measure. */
  worst: number;
}

function resolveSetMetric(options: SetSolveOptions): Metric {
  return options.metric ?? (options.raw === true ? apcaRawMetric : apcaMetric);
}

function measureAt(metric: Metric, color: OKLCH, background: RGB): number {
  return metric.measure(oklchToRGBGamut(color), background);
}

/** Lowest measure of `color` across `backgrounds`. */
function minAcross(
  metric: Metric,
  color: OKLCH,
  backgrounds: readonly RGB[],
): { min: number; index: number } {
  let min = Number.POSITIVE_INFINITY;
  let index = 0;
  for (let i = 0; i < backgrounds.length; i++) {
    const background = backgrounds[i];
    if (background === undefined) continue;
    const value = measureAt(metric, color, background);
    if (value < min) {
      min = value;
      index = i;
    }
  }
  return { min, index };
}

function minExtreme(
  seed: OKLCH,
  backgrounds: readonly RGB[],
  polarity: Polarity,
  metric: Metric,
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const background of backgrounds) {
    const far = solveContrast(seed, background, Number.POSITIVE_INFINITY, {
      polarity,
      metric,
    });
    if (far.lc < min) min = far.lc;
  }
  return min;
}

function worstExtremeIndex(
  seed: OKLCH,
  backgrounds: readonly RGB[],
  polarity: Polarity,
  metric: Metric,
): number {
  let min = Number.POSITIVE_INFINITY;
  let index = 0;
  for (let i = 0; i < backgrounds.length; i++) {
    const background = backgrounds[i];
    if (background === undefined) continue;
    const far = solveContrast(seed, background, Number.POSITIVE_INFINITY, {
      polarity,
      metric,
    });
    if (far.lc < min) {
      min = far.lc;
      index = i;
    }
  }
  return index;
}

interface SideSearch {
  color: OKLCH;
  lc: number;
  reached: boolean;
  polarity: Polarity;
  worst: number;
}

/**
 * Solve on one side against the backdrop whose extreme is weakest, then
 * re-aim if another member is still under the target at that lightness.
 */
function searchSide(
  seed: OKLCH,
  backgrounds: readonly RGB[],
  targetLc: number,
  polarity: Polarity,
  metric: Metric,
  tolerance: number,
): SideSearch {
  const tried = new Set<number>();
  let solved = solveContrast(
    seed,
    backgroundAt(backgrounds, worstExtremeIndex(seed, backgrounds, polarity, metric)),
    targetLc,
    { polarity, metric, tolerance },
  );

  for (let pass = 0; pass < backgrounds.length; pass++) {
    const across = minAcross(metric, solved.color, backgrounds);
    if (across.min + 1e-6 >= targetLc) {
      return {
        color: solved.color,
        lc: across.min,
        reached: true,
        polarity,
        worst: across.index,
      };
    }
    if (tried.has(across.index)) {
      return {
        color: solved.color,
        lc: across.min,
        reached: false,
        polarity,
        worst: across.index,
      };
    }
    tried.add(across.index);
    const next = solveContrast(seed, backgroundAt(backgrounds, across.index), targetLc, {
      polarity,
      metric,
      tolerance,
    });
    const nextMin = minAcross(metric, next.color, backgrounds).min;
    if (nextMin + 1e-9 < across.min) {
      return {
        color: solved.color,
        lc: across.min,
        reached: false,
        polarity,
        worst: across.index,
      };
    }
    solved = next;
  }

  const across = minAcross(metric, solved.color, backgrounds);
  return {
    color: solved.color,
    lc: across.min,
    reached: across.min + 1e-6 >= targetLc,
    polarity,
    worst: across.index,
  };
}

function backgroundAt(backgrounds: readonly RGB[], index: number): RGB {
  const background = backgrounds[index];
  if (background === undefined) {
    throw new Error(`solveAgainstSet: backdrop ${index} is missing`);
  }
  return background;
}

/**
 * Pick a polarity, then solve the seed against the worst backdrop in the set.
 *
 * The polarity is the one whose far extreme maximizes the minimum contrast
 * across `backgrounds`. The search then runs against that weakest member.
 * When the target is unreachable and `polarity` is omitted, the opposite
 * side is tried and the better worst-case result is kept (§6.2).
 *
 * `lc` is the minimum measure across the set, not the measure against only
 * the member that was searched. `reached` means that minimum meets `targetLc`.
 * A single-backdrop call with a locked polarity matches `solveContrast`.
 */
export function solveAgainstSet(
  seed: OKLCH,
  backgrounds: readonly RGB[],
  targetLc: number,
  options: SetSolveOptions = {},
): SetSolveResult {
  if (backgrounds.length === 0) {
    throw new Error("solveAgainstSet requires at least one backdrop");
  }
  const metric = resolveSetMetric(options);
  const tolerance = options.tolerance ?? metric.defaultTolerance;
  const chosen =
    options.polarity ??
    (minExtreme(seed, backgrounds, "darker", metric) >=
    minExtreme(seed, backgrounds, "lighter", metric)
      ? "darker"
      : "lighter");
  const first = searchSide(seed, backgrounds, targetLc, chosen, metric, tolerance);
  if (first.reached || options.polarity !== undefined) return first;

  const opposite: Polarity = chosen === "darker" ? "lighter" : "darker";
  const second = searchSide(seed, backgrounds, targetLc, opposite, metric, tolerance);
  if (second.reached || second.lc > first.lc) return second;
  return first;
}
