/**
 * Lower a normalized token into a solver intent (docs/v4-spec.md §4, §5, §6.2).
 *
 * Surfaces become elevation steps from an anchor. Emphasis 1–2 become tint
 * steps from the backdrop. Emphasis 3–5, text, and border become a metric
 * target from `targets.ts`. States then fold left to right. `lc` / `ratio` /
 * `step` / `direction` / `chroma` / `hue` override that result.
 *
 * This module does not read backdrop colors. The engine supplies the anchor.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { maxChromaForLs } from "../engine/generate.js";
import type { Polarity } from "../contrast/types.js";
import { preferredPolarity } from "../contrast/solve.js";
import type { CanonicalState } from "./states.js";
import { contrastTarget, shiftOrdinal, type ContrastShift } from "./targets.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  Direction,
  Hue,
  Kind,
  LevelOrdinal,
  Mode,
  StateSteps,
} from "./types.js";
import type { NormalizedToken } from "./normalize.js";

/** One surface step in OKLCH lightness (§4). Overridable via `states.surface.step`. */
export const SURFACE_STEP = { light: 0.02, dark: 0.03 } as const;

/** Emphasis 1–2, and the lightness size of a non-surface `step` override (§4). */
export const TINT_STEP = 0.025;

/** One contrast step for emphasis 3–5, text, and border (§4). */
export const APCA_STATE_DELTA = 6;
export const WCAG_STATE_RATIO = 1.15;

/** Disabled contrast (§4). These tokens are never contrast-linted. */
export const DISABLED_TARGET = { apca: 15, wcag2: 1.5 } as const;

export const SELECTED_CHROMA = 1.5;
export const DISABLED_CHROMA = 0.3;

/**
 * Dark page lightness. Matches the v3 dark foundation offset so the page sits
 * off black. Spec Q1 / Q7 leave the baseline open; see {@link pageLightness}.
 */
export const DARK_PAGE_L = 0.15;

const DEFAULT_STATE_COUNT = {
  hover: 1,
  pressed: 2,
  focus: 1,
  selected: 2,
  checked: 0,
  disabled: 0,
} as const satisfies Record<CanonicalState, number>;

export interface LowerContext {
  algorithm: ContrastAlgorithm;
  contrastLevel: ContrastLevel;
  /** Palette hue and chroma. Lightness is solved later. */
  seed: OKLCH;
  /** Resolved size of one surface step for this theme's mode. */
  surfaceStep: number;
  states?: StateSteps;
}

/** What the solver should do for one token. Seed chroma and hue are already applied. */
export interface SolverIntent {
  readonly mode: "contrast" | "max" | "lightness";
  /** Metric target. Unused for `max` and `lightness`. */
  readonly target: number;
  /** Signed elevation steps from the anchor. Surfaces, before state steps. */
  readonly elevation: number;
  /** Further steps away from the backdrop (tints and state steps). */
  readonly away: number;
  /** OKLCH lightness moved by one elevation or away step. */
  readonly stepSize: number;
  readonly seed: OKLCH;
  readonly direction?: Direction;
  /**
   * When false, a missed contrast target is not a `contrast-unreachable`
   * diagnostic. Disabled tokens, border 1–2, surfaces, tints, and `max`.
   */
  readonly report: boolean;
}

interface Draft {
  mode: "contrast" | "max" | "lightness";
  target: number;
  elevation: number;
  away: number;
  stepSize: number;
  chroma: number;
  hue?: Hue;
  direction?: Direction;
  ordinal: LevelOrdinal;
  seed: OKLCH;
}

/**
 * Light page sits two steps below white, so `floating` (step +2) reaches
 * white instead of clamping on top of `raised`. The dark page is the v3
 * dark offset, or two steps above black when the configured step is larger.
 */
export function pageLightness(mode: Mode, step: number): number {
  if (mode === "light") return clamp01(1 - 2 * step);
  return clamp01(Math.max(DARK_PAGE_L, 2 * step));
}

export function surfaceStepSize(mode: Mode, states: StateSteps | undefined): number {
  const configured = states?.surface?.step;
  if (mode === "light") return configured?.light ?? SURFACE_STEP.light;
  return configured?.dark ?? SURFACE_STEP.dark;
}

/**
 * Compile one token.
 *
 * `honorOptions` is false for a rest the graph generated. Those nodes copy
 * the dependent token's options, which belong to the authored state token.
 */
export function lowerToken(
  token: NormalizedToken,
  ctx: LowerContext,
  honorOptions: boolean,
): SolverIntent {
  const shift = contrastShift(token, ctx, honorOptions);
  const ordinal = shiftOrdinal(token.ordinal, shift);
  const draft = fromCell(token.kind, ordinal, ctx);
  if (honorOptions) applyOptions(draft, token);
  if (honorOptions && token.step !== undefined) applyStep(draft, token, ctx);
  for (const state of token.states) applyState(draft, state, token, ctx, shift);
  if (honorOptions) applyContrastBypass(draft, token, ctx);
  draft.seed = paintSeed(ctx.seed, draft, token.kind);
  return freeze(draft, token);
}

/**
 * Place a lightness intent.
 *
 * Elevation is signed and always moves lighter as the step count rises, in
 * both modes (§3). State and tint steps then move away from the backdrop.
 * `direction` locks the side of the backdrop and uses the absolute distance.
 */
export function realizeLightness(
  intent: SolverIntent,
  anchorL: number,
  backdropL: number,
  backdrop: RGB,
): number {
  if (intent.direction !== undefined) {
    const magnitude =
      (Math.abs(intent.elevation) + Math.abs(intent.away)) * intent.stepSize;
    const sign = intent.direction === "lighter" ? 1 : -1;
    return clamp01(backdropL + sign * magnitude);
  }
  let lightness = clamp01(anchorL + intent.elevation * intent.stepSize);
  if (intent.away !== 0) {
    lightness = clamp01(
      lightness +
        awaySign(lightness, backdropL, backdrop) * intent.away * intent.stepSize,
    );
  }
  return lightness;
}

function contrastShift(
  token: NormalizedToken,
  ctx: LowerContext,
  honorOptions: boolean,
): ContrastShift {
  if (honorOptions && token.contrast !== undefined) {
    return { contrastLevel: ctx.contrastLevel, contrast: token.contrast };
  }
  return { contrastLevel: ctx.contrastLevel };
}

function fromCell(kind: Kind, ordinal: LevelOrdinal, ctx: LowerContext): Draft {
  // `ordinal` is already shifted. Looking the cell up with `contrastLevel`
  // again would shift a second time.
  const cell = contrastTarget(ctx.algorithm, kind, ordinal);
  const draft: Draft = {
    mode: "lightness",
    target: 0,
    elevation: 0,
    away: 0,
    stepSize: kind === "surface" ? ctx.surfaceStep : TINT_STEP,
    chroma: 1,
    ordinal,
    seed: ctx.seed,
  };
  if (cell.type === "contrast") {
    draft.mode = "contrast";
    draft.target = cell.value;
  } else if (cell.type === "max") {
    draft.mode = "max";
  } else if (cell.type === "tint") {
    draft.away = cell.steps;
    draft.stepSize = TINT_STEP;
  } else {
    draft.elevation = cell.offset;
    draft.stepSize = ctx.surfaceStep;
  }
  return draft;
}

function applyOptions(draft: Draft, token: NormalizedToken): void {
  if (token.chroma !== undefined) draft.chroma = token.chroma;
  if (token.hue !== undefined) draft.hue = token.hue;
  if (token.direction !== undefined) draft.direction = token.direction;
}

/** `step` replaces the level cell. Later states still add (§2.4, §5). */
function applyStep(draft: Draft, token: NormalizedToken, ctx: LowerContext): void {
  const step = token.step;
  if (step === undefined) return;
  draft.mode = "lightness";
  if (token.kind === "surface") {
    draft.elevation = step;
    draft.away = 0;
    draft.stepSize = ctx.surfaceStep;
    return;
  }
  draft.elevation = 0;
  draft.away = Math.abs(step);
  draft.stepSize = TINT_STEP;
  if (step < 0 && draft.direction === undefined) draft.direction = "darker";
}

function applyState(
  draft: Draft,
  state: CanonicalState,
  token: NormalizedToken,
  ctx: LowerContext,
  shift: ContrastShift,
): void {
  const kind = token.kind;
  if (state === "disabled") {
    draft.mode = "contrast";
    draft.target =
      ctx.algorithm === "apca" ? DISABLED_TARGET.apca : DISABLED_TARGET.wcag2;
    draft.elevation = 0;
    draft.away = 0;
    draft.chroma *= DISABLED_CHROMA;
    return;
  }
  // "at least default": raise the pre-shift ordinal to 3, then shift once.
  if (state === "checked") {
    const raised = shiftOrdinal(token.ordinal < 3 ? 3 : token.ordinal, shift);
    if (raised !== draft.ordinal) {
      const promoted = fromCell(kind, raised, ctx);
      draft.mode = promoted.mode;
      draft.target = promoted.target;
      draft.elevation = promoted.elevation;
      draft.away = promoted.away;
      draft.stepSize = promoted.stepSize;
      draft.ordinal = promoted.ordinal;
    }
  }
  if (state === "selected") draft.chroma *= SELECTED_CHROMA;
  addSteps(draft, stateStepCount(kind, state, ctx.states), ctx);
}

/**
 * `lc` / `ratio` replace the folded target, including a disabled state's
 * Lc 15 / 1.5:1. Disabled chroma and the "never lint" rule still apply.
 */
function applyContrastBypass(
  draft: Draft,
  token: NormalizedToken,
  ctx: LowerContext,
): void {
  if (ctx.algorithm === "apca" && token.lc !== undefined) {
    draft.mode = "contrast";
    draft.target = token.lc;
    draft.elevation = 0;
    draft.away = 0;
    return;
  }
  if (ctx.algorithm === "wcag2" && token.ratio !== undefined) {
    draft.mode = "contrast";
    draft.target = token.ratio;
    draft.elevation = 0;
    draft.away = 0;
  }
}

function addSteps(draft: Draft, count: number, ctx: LowerContext): void {
  if (count === 0 || draft.mode === "max") return;
  if (draft.mode === "contrast") {
    draft.target =
      ctx.algorithm === "apca"
        ? draft.target + count * APCA_STATE_DELTA
        : draft.target * WCAG_STATE_RATIO ** count;
    return;
  }
  draft.away += count;
}

/** Step count for one state atom (§4). `disabled` is 0; `applyState` handles it. */
export function stateStepCount(
  kind: Kind,
  state: CanonicalState,
  states: StateSteps | undefined,
): number {
  const table = states?.[kind];
  if (table !== undefined) {
    if (state === "pressed") {
      if (typeof table.pressed === "number") return table.pressed;
      if (typeof table.active === "number") return table.active;
    } else if (state !== "disabled") {
      const value = table[state];
      if (typeof value === "number") return value;
    }
  }
  return DEFAULT_STATE_COUNT[state];
}

function paintSeed(palette: OKLCH, draft: Draft, kind: Kind): OKLCH {
  let chroma = Math.max(0, palette.c * draft.chroma);
  if (kind === "surface") {
    chroma = Math.min(
      chroma,
      maxChromaForLs(Math.abs(draft.elevation) + Math.abs(draft.away)),
    );
  }
  return {
    l: palette.l,
    c: chroma,
    h: draft.hue === undefined ? palette.h : resolveHue(palette.h, draft.hue),
  };
}

function resolveHue(base: number, hue: Hue): number {
  const value = typeof hue === "number" ? hue : base + Number(hue);
  return ((value % 360) + 360) % 360;
}

function awaySign(lightness: number, backdropL: number, backdrop: RGB): 1 | -1 {
  if (lightness > backdropL + 1e-6) return 1;
  if (lightness < backdropL - 1e-6) return -1;
  const polarity: Polarity = preferredPolarity(backdrop);
  return polarity === "lighter" ? 1 : -1;
}

function freeze(draft: Draft, token: NormalizedToken): SolverIntent {
  const intent: SolverIntent = {
    mode: draft.mode,
    target: draft.target,
    elevation: draft.elevation,
    away: draft.away,
    stepSize: draft.stepSize,
    seed: draft.seed,
    report: reports(token, draft),
  };
  if (draft.direction !== undefined) return { ...intent, direction: draft.direction };
  return intent;
}

function reports(token: NormalizedToken, draft: Draft): boolean {
  if (token.states.includes("disabled")) return false;
  if (draft.mode !== "contrast") return false;
  if (token.kind === "border" && draft.ordinal <= 2) return false;
  if (token.kind === "surface") return false;
  if (token.kind === "emphasis" && draft.ordinal <= 2) return false;
  return true;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
