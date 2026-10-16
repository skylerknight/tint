/**
 * Level → contrast target tables (docs/v4-spec.md §5).
 *
 * A cell is either a finite contrast target (APCA |Lc| or a WCAG 2 ratio),
 * `"max"`, an emphasis tint step, or a surface elevation step. Surfaces and
 * emphasis ordinals 1–2 are not contrast-targeted (§5 notes); their labels are.
 */
import {
  APCA_BORDER_LC,
  APCA_EMPHASIS_LC,
  APCA_TEXT_LC,
  EMPHASIS_TINT_STEPS,
  GLOBAL_CONTRAST_SHIFT,
  MAX_ORDINAL,
  MIN_ORDINAL,
  SURFACE_STEP_OFFSET,
  TOKEN_CONTRAST_SHIFT,
  WCAG2_BORDER_RATIO,
  WCAG2_EMPHASIS_RATIO,
  WCAG2_TEXT_RATIO,
} from "./constants.js";

/** §2.1 `contrast.algorithm`. */
export type ContrastAlgorithm = "apca" | "wcag2";

/** Token kind (§3). Structural stand-in until the shared kind type lands. */
export type TargetKind = "text" | "border" | "emphasis" | "surface";

/** Ordinal prominence, 1–5 (§3). Names are resolved before this lookup. */
export type Ordinal = 1 | 2 | 3 | 4 | 5;

/** §2.1 `contrast.level`. */
export type ContrastPreference = keyof typeof GLOBAL_CONTRAST_SHIFT;

/** §2.4 token `contrast` nudge. */
export type ContrastNudge = keyof typeof TOKEN_CONTRAST_SHIFT;

export const CONTRAST_ALGORITHMS = ["apca", "wcag2"] as const;
export const TARGET_KINDS = ["text", "border", "emphasis", "surface"] as const;
export const ORDINALS = [1, 2, 3, 4, 5] as const satisfies readonly Ordinal[];

/** Finite contrast target. The unit comes from the algorithm: |Lc| or a ratio. */
export interface ContrastValue {
  readonly type: "contrast";
  readonly value: number;
}

/** Highest contrast the polarity can reach (text ordinal 5, §5). */
export interface MaxTarget {
  readonly type: "max";
}

/**
 * Emphasis ordinals 1–2. `steps` is the tint-step multiplier (×1, ×2).
 * There is no Lc or ratio target.
 */
export interface TintTarget {
  readonly type: "tint";
  readonly steps: 1 | 2;
}

/**
 * Surface elevation. `offset` is in steps relative to the page; `0` is the page.
 */
export interface StepTarget {
  readonly type: "step";
  readonly offset: -2 | -1 | 0 | 1 | 2;
}

export type ContrastTarget = ContrastValue | MaxTarget | TintTarget | StepTarget;

const MAX_TARGET = { type: "max" } as const satisfies MaxTarget;

function contrast(value: number): ContrastValue {
  return { type: "contrast", value };
}

function textRow(levels: {
  readonly 1: number;
  readonly 2: number;
  readonly 3: number;
  readonly 4: number;
}): readonly ContrastTarget[] {
  return [
    contrast(levels[1]),
    contrast(levels[2]),
    contrast(levels[3]),
    contrast(levels[4]),
    MAX_TARGET,
  ];
}

function borderRow(levels: {
  readonly 1: number;
  readonly 2: number;
  readonly 3: number;
  readonly 4: number;
  readonly 5: number;
}): readonly ContrastTarget[] {
  return [
    contrast(levels[1]),
    contrast(levels[2]),
    contrast(levels[3]),
    contrast(levels[4]),
    contrast(levels[5]),
  ];
}

function emphasisRow(solids: {
  readonly 3: number;
  readonly 4: number;
  readonly 5: number;
}): readonly ContrastTarget[] {
  return [
    { type: "tint", steps: EMPHASIS_TINT_STEPS[1] },
    { type: "tint", steps: EMPHASIS_TINT_STEPS[2] },
    contrast(solids[3]),
    contrast(solids[4]),
    contrast(solids[5]),
  ];
}

function surfaceRow(): readonly ContrastTarget[] {
  return [
    { type: "step", offset: SURFACE_STEP_OFFSET[1] },
    { type: "step", offset: SURFACE_STEP_OFFSET[2] },
    { type: "step", offset: SURFACE_STEP_OFFSET[3] },
    { type: "step", offset: SURFACE_STEP_OFFSET[4] },
    { type: "step", offset: SURFACE_STEP_OFFSET[5] },
  ];
}

/** §5.1 and §5.2, indexed by ordinal (position 0 is ordinal 1). */
export const LEVEL_TARGETS: {
  readonly [algorithm in ContrastAlgorithm]: {
    readonly [kind in TargetKind]: readonly ContrastTarget[];
  };
} = {
  apca: {
    text: textRow(APCA_TEXT_LC),
    border: borderRow(APCA_BORDER_LC),
    emphasis: emphasisRow(APCA_EMPHASIS_LC),
    surface: surfaceRow(),
  },
  wcag2: {
    text: textRow(WCAG2_TEXT_RATIO),
    border: borderRow(WCAG2_BORDER_RATIO),
    emphasis: emphasisRow(WCAG2_EMPHASIS_RATIO),
    surface: surfaceRow(),
  },
};

export interface ContrastShift {
  /** Global `contrast.level` (§2.1, §5). Default `standard` (shift 0). */
  contrastLevel?: ContrastPreference;
  /** Per-token `contrast` nudge (§2.4, §5). */
  contrast?: ContrastNudge;
}

function clampOrdinal(n: number): Ordinal {
  if (n <= MIN_ORDINAL) return 1;
  if (n >= MAX_ORDINAL) return 5;
  if (n === 2 || n === 3 || n === 4) return n;
  throw new Error(`contrast ordinal ${n} is out of range`);
}

/**
 * Apply the global contrast preference and the per-token nudge, then clamp
 * to ordinals 1–5 (§5: capped at 5; a negative nudge cannot fall below 1).
 *
 * The two shifts add. `text(3)` with `contrast.level: 'more'` and
 * `contrast: '+1'` looks up ordinal 5.
 */
export function shiftOrdinal(level: Ordinal, shift?: ContrastShift): Ordinal {
  const global = GLOBAL_CONTRAST_SHIFT[shift?.contrastLevel ?? "standard"];
  const token = shift?.contrast === undefined ? 0 : TOKEN_CONTRAST_SHIFT[shift.contrast];
  return clampOrdinal(level + global + token);
}

function cellAt(row: readonly ContrastTarget[], level: Ordinal): ContrastTarget {
  const cell = row[level - 1];
  if (cell === undefined) {
    throw new Error(`missing contrast target for ordinal ${level}`);
  }
  return cell;
}

/**
 * Contrast target for one kind and ordinal (§5).
 * Pass `contrastLevel` / `contrast` to shift the ordinal before lookup.
 */
export function contrastTarget(
  algorithm: ContrastAlgorithm,
  kind: TargetKind,
  level: Ordinal,
  shift?: ContrastShift,
): ContrastTarget {
  return cellAt(LEVEL_TARGETS[algorithm][kind], shiftOrdinal(level, shift));
}
