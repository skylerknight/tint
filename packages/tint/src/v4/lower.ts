/**
 * Lower a normalized token into a solver intent.
 *
 * `surface(n)` is signed lightness steps from an anchor (`elevation`). With no
 * `on`, the anchor is the theme lightness. With `on`, it is that surface's
 * resolved lightness. One step is {@link SURFACE_STEP}: 0.02 in light, 0.03 in
 * dark. Positive is raised (lighter), negative is sunken, and 0 matches the
 * anchor. Decimals are real steps. `surface.DEFAULT` uses the same scale.
 * This is not a contrast solve.
 *
 * Lightness is `clamp(anchor + elevation * step, 0, 1)` in both modes. A
 * positive step stays at or above the anchor. A negative step stays at or
 * below it. A step past white or black stops on that edge. See
 * {@link surfaceLightness}.
 *
 * `decorative(n)` is also lightness, but the steps leave the backdrop rather
 * than the theme anchor. One step is {@link DECORATIVE_STEP} (0.04) in both
 * modes. Positive is more distinct (darker on light, lighter on dark).
 * Negative goes the other way. The result clamps at black and white. Decimals
 * are real steps.
 *
 * `emphasis`, `text`, and `border` are contrast targets from `ladders.ts`.
 * `lc` / `ratio` replace that target. Disabled tokens are solved, then muted.
 *
 * This module does not read backdrop colors. The engine supplies the anchor.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { maxChromaForLs } from "../engine/generate.js";
import type { Polarity } from "../contrast/types.js";
import { preferredPolarity } from "../contrast/solve.js";
import { GLOBAL_CONTRAST_SHIFT } from "./constants.js";
import { DECORATIVE_STEP, MODE_PAGE_LIGHTNESS, contrastAt } from "./ladders.js";
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
 * How far a disabled color moves toward its backdrop, in OKLCH lightness.
 * Small on purpose: the scale position stays, and the color stays solid.
 */
export const DISABLED_APPROACH = 0.06;

/**
 * Share of the gap to the backdrop that a disabled color may close.
 *
 * Closing the whole gap parked `disabled.surface(2)` on the page. Half of
 * that gap is exactly one surface step, so the muted color would match
 * `surface(1)`. A quarter of the gap stays off the page and off that
 * neighbor (0.01 in light, 0.015 in dark).
 */
export const DISABLED_GAP_FRACTION = 0.25;

/**
 * Dark page lightness (mode shorthand 18). The page sits off black.
 * Spec Q1 / Q7 leave the baseline open; see {@link pageLightness}.
 */
export const DARK_PAGE_L = MODE_PAGE_LIGHTNESS.dark / 100;

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
  /** Theme mode. Emphasis and surface units differ by mode. */
  mode: Mode;
  /** Palette hue and chroma. Lightness is solved later. */
  seed: OKLCH;
  /** Resolved size of one surface step for this theme's mode. */
  surfaceStep: number;
  /** Resolved size of one emphasis tint step for this theme's mode. */
  tintStep: number;
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
   * diagnostic. Disabled tokens and lightness kinds (surface, decorative).
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
}

/**
 * Light page is the mode shorthand (lightness 97, L 0.97). That is 1.5 light
 * steps below white when the step is 0.02, so `surface(1)` still fits and
 * `surface(1.5)` lands on white. The dark page is {@link DARK_PAGE_L}, or two
 * steps above black when the configured step is larger.
 */
export function pageLightness(mode: Mode, step: number): number {
  if (mode === "light") return clamp01(MODE_PAGE_LIGHTNESS.light / 100);
  return clamp01(Math.max(DARK_PAGE_L, 2 * step));
}

/**
 * Lightness for a surface step.
 *
 * `clamp(anchor + elevation * step, 0, 1)`. Positive steps stay at or above
 * the anchor. Negative steps stay at or below it. The same formula is used
 * in light and dark; only {@link SURFACE_STEP} differs. A step that would
 * pass white or black stops on that edge. Landing exactly on 0 or 1 does
 * not. The engine warns `surface-no-headroom` when the unclamped value is
 * outside that range.
 *
 * On the lightness 97 page (step 0.02), `surface(1)` is L 0.99 and
 * `surface(1.5)` is white. `surface(2)` is 0.01 past white, so it clamps
 * to white. It does not fold darker, and it cannot cross `surface(-1)`.
 */
export function surfaceLightness(
  anchorL: number,
  elevation: number,
  step: number,
): number {
  if (!(step > 0)) return clamp01(anchorL);
  return clamp01(anchorL + elevation * step);
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
 * Surface, decorative, and emphasis scales are literal step counts and are
 * not shifted.
 */
function shiftedScale(token: NormalizedToken, ctx: LowerContext): number {
  if (token.kind !== "text" && token.kind !== "border") return token.scale;
  return token.scale + GLOBAL_CONTRAST_SHIFT[ctx.contrastLevel];
}

function fromScale(kind: Kind, scale: number, ctx: LowerContext): Draft {
  if (kind === "surface") {
    return {
      mode: "lightness",
      target: 0,
      elevation: scale,
      away: 0,
      stepSize: ctx.surfaceStep,
      chroma: 1,
      scale,
      seed: ctx.seed,
    };
  }
  if (kind === "decorative") {
    return {
      mode: "lightness",
      target: 0,
      elevation: 0,
      away: scale,
      stepSize: DECORATIVE_STEP,
      chroma: 1,
      scale,
      seed: ctx.seed,
    };
  }
  return {
    mode: "contrast",
    target: contrastAt(kind, ctx.algorithm, ctx.mode, scale),
    elevation: 0,
    away: 0,
    stepSize: ctx.tintStep,
    chroma: 1,
    scale,
    seed: ctx.seed,
  };
}

/**
 * Desaturate `color` and step it toward `backdropL` without crossing it.
 * The caller keeps the token's scale. The result has no alpha.
 */
export function muteDisabled(color: OKLCH, backdropL: number): OKLCH {
  const distance = backdropL - color.l;
  const gap = Math.abs(distance);
  const step = Math.min(DISABLED_APPROACH, gap * DISABLED_GAP_FRACTION);
  return {
    l: clamp01(color.l + Math.sign(distance) * step),
    c: Math.max(0, color.c * DISABLED_CHROMA),
    h: color.h,
  };
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
  let lightness = surfaceLightness(anchorL, intent.elevation, intent.stepSize);
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
 * `lc` / `ratio` replace the scale target, including a disabled state's
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
  if (kind === "decorative") return DEFAULT_STATE_COUNT[state];
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
  if (kind === "surface" || kind === "decorative") {
    chroma = Math.min(chroma, maxChromaForLs(Math.abs(draft.scale)));
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
  if (token.disabled === true) return false;
  return draft.mode === "contrast";
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
