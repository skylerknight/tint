import type { RGB, OKLCH } from "../color/types.js";

/** Which side of the background the foreground sits on. */
export type Polarity = "lighter" | "darker";

/**
 * A contrast measure that increases as the foreground moves away from the
 * background along OKLCH lightness, on one polarity. `solveContrast` bisects
 * L against it.
 *
 * `apca` returns |Lc|. `wcag2` returns a WCAG 2 contrast ratio (>= 1).
 * Omitting the metric keeps the v3 APCA behavior.
 */
export interface Metric {
  readonly id: "apca" | "wcag2";
  /**
   * Targets at or below this skip the search and sit on the background
   * lightness. APCA: 0. WCAG 2: 1 (identical colors).
   */
  readonly neutral: number;
  /**
   * What to report for that early result. `0` preserves the v3 APCA result
   * (`lc: 0`). `"measure"` stores `measure()` of the returned color.
   */
  readonly neutralResult: 0 | "measure";
  /**
   * `absolute`: stop when `achieved - target <= tolerance` (Lc points).
   * `relative`: stop when `achieved <= target * (1 + tolerance)`.
   */
  readonly toleranceMode: "absolute" | "relative";
  /** Used when `SolveOptions.tolerance` is omitted. */
  readonly defaultTolerance: number;
  measure(foreground: RGB, background: RGB): number;
}

export interface SolveOptions {
  /** Which side of the background to search. */
  polarity: Polarity;
  /**
   * Use the raw (un-clipped) APCA curve. Default false.
   * Ignored when `metric` is set; the metric owns the measure.
   */
  raw?: boolean;
  /**
   * Acceptable overshoot above the target.
   * APCA: absolute Lc (default 0.25). WCAG 2: fraction of the target
   * (default 0.02, i.e. within ×1.02).
   */
  tolerance?: number;
  /**
   * Contrast measure to search. Default: clipped APCA |Lc|
   * (`apcaRawMetric` when `raw` is set).
   */
  metric?: Metric;
}

export interface SolveResult {
  /** Gamut-mapped OKLCH color with the seed's hue (chroma may be reduced). */
  color: OKLCH;
  /**
   * Achieved measure of the active metric. For the default APCA metric this
   * is |Lc| (v3). For the WCAG 2 metric it is the contrast ratio.
   */
  lc: number;
  /** Whether the achieved measure is at least the target. */
  reached: boolean;
}
