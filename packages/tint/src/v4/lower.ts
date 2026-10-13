/**
 * Lower a normalized token into a solver intent (docs/v4-spec.md §4, §5, §6.2).
 *
 * Surfaces become elevation steps from an anchor. Emphasis 1–2 become tint
 * steps from the backdrop. Emphasis 3–5 become a contrast target from
 * `ladders.ts`. Scales between those blend at realize time. Text and border
 * are contrast ladders. `lc` / `ratio` / `chroma` / `hue` override that result.
 *
 * This module does not read backdrop colors. The engine supplies the anchor.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { maxChromaForLs } from "../engine/generate.js";
import type { Polarity } from "../contrast/types.js";
import { preferredPolarity } from "../contrast/solve.js";
import { GLOBAL_CONTRAST_SHIFT } from "./constants.js";
import {
  EMPHASIS_SOLID_MIN,
  EMPHASIS_TINT_MAX,
  contrastAt,
  emphasisContrast,
} from "./ladders.js";
import type { CanonicalState } from "./states.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  Direction,
  Hue,
  Kind,
  Mode,
  StateSteps,
} from "./types.js";
import type { NormalizedToken } from "./normalize.js";

/** One surface step in OKLCH lightness (§4). Overridable via `states.surface.step`. */
export const SURFACE_STEP = { light: 0.02, dark: 0.03 } as const;

/**
 * Emphasis 1–2, state steps on those tints, and non-surface `step` overrides (§4).
 * Overridable via `states.emphasis.step`.
 *
 * Dark keeps the light step's ratio to a surface step:
 * `0.025 * (0.03 / 0.02) = 0.0375`. One tint stays 1.25 surface steps in both modes.
 */
export const TINT_STEP = { light: 0.025, dark: 0.0375 } as const;

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
  /** Resolved size of one emphasis tint step for this theme's mode. */
  tintStep: number;
  /** Theme polarity. Picks the emphasis contrast row. */
  mode: Mode;
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
   * 0..1 blend from the tint at {@link EMPHASIS_TINT_MAX} toward a contrast
   * solve at `blendTarget` (the emphasis(3) rung). Set only for scales in
   * (2, 3). The engine lerps lightness; this module does not see the backdrop.
   */
  readonly blend?: number;
  /** Contrast target of the solid end of a blend. */
  readonly blendTarget?: number;
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
  scale: number;
  seed: OKLCH;
  blend?: number;
  blendTarget?: number;
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

/** Resolved tint step (§4). A missing side keeps {@link TINT_STEP}. */
export function tintStepSize(mode: Mode, states: StateSteps | undefined): number {
  const configured = states?.emphasis?.step;
  if (mode === "light") return configured?.light ?? TINT_STEP.light;
  return configured?.dark ?? TINT_STEP.dark;
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
  const scale = honorOptions ? shiftedScale(token, ctx) : token.scale;
  const draft = fromScale(token.kind, scale, ctx);
  if (honorOptions) applyOptions(draft, token);
  if (honorOptions) applyContrastBypass(draft, token, ctx);
  draft.seed = paintSeed(ctx.seed, draft, token.kind);
  return freeze(draft, token);
}

/**
 * `contrast.level` still shifts text and border scales (`more` +1, `max` +2).
 * Surface and emphasis scales are literal step counts and are not shifted.
 */
function shiftedScale(token: NormalizedToken, ctx: LowerContext): number {
  if (token.kind !== "text" && token.kind !== "border") return token.scale;
  return token.scale + GLOBAL_CONTRAST_SHIFT[ctx.contrastLevel];
}

function fromScale(kind: Kind, scale: number, ctx: LowerContext): Draft {
  const draft: Draft = {
    mode: "lightness",
    target: 0,
    elevation: 0,
    away: 0,
    stepSize: kind === "surface" ? ctx.surfaceStep : ctx.tintStep,
    chroma: 1,
    scale,
    seed: ctx.seed,
  };
  if (kind === "surface") {
    draft.elevation = scale;
    draft.stepSize = ctx.surfaceStep;
    return draft;
  }
  if (kind === "emphasis") {
    if (scale <= EMPHASIS_TINT_MAX) {
      draft.away = scale;
      draft.stepSize = ctx.tintStep;
      return draft;
    }
    if (scale >= EMPHASIS_SOLID_MIN) {
      draft.mode = "contrast";
      draft.target = emphasisContrast(ctx.algorithm, ctx.mode, scale);
      return draft;
    }
    draft.away = EMPHASIS_TINT_MAX;
    draft.stepSize = ctx.tintStep;
    draft.blend = scale - EMPHASIS_TINT_MAX;
    draft.blendTarget = emphasisContrast(ctx.algorithm, ctx.mode, EMPHASIS_SOLID_MIN);
    return draft;
  }
  const target = contrastAt(kind, ctx.algorithm, scale);
  draft.mode = "contrast";
  draft.target = target ?? 0;
  return draft;
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

function applyOptions(draft: Draft, token: NormalizedToken): void {
  if (token.chroma !== undefined) draft.chroma = token.chroma;
  if (token.hue !== undefined) draft.hue = token.hue;
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
  const withBlend =
    draft.mode === "lightness" &&
    draft.blend !== undefined &&
    draft.blendTarget !== undefined
      ? { ...intent, blend: draft.blend, blendTarget: draft.blendTarget }
      : intent;
  if (draft.direction !== undefined) return { ...withBlend, direction: draft.direction };
  return withBlend;
}

function reports(_token: NormalizedToken, draft: Draft): boolean {
  return draft.mode === "contrast";
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
