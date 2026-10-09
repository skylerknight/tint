import type { OKLCH } from "../color/types.js";

/** Which side of the background the foreground sits on. */
export type Polarity = "lighter" | "darker";

export interface SolveOptions {
  /** Which side of the background to search. */
  polarity: Polarity;
  /** Use the raw (un-clipped) APCA curve. Default false. */
  raw?: boolean;
  /** Acceptable overshoot above the target. Default 0.25. */
  tolerance?: number;
}

export interface SolveResult {
  /** Gamut-mapped OKLCH color with the seed's hue (chroma may be reduced). */
  color: OKLCH;
  /** Achieved |Lc|. */
  lc: number;
  /** Whether `lc >= target`. */
  reached: boolean;
}
