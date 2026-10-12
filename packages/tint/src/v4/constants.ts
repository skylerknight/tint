/**
 * Tunable defaults for v4 contrast targets.
 *
 * Spec: docs/v4-spec.md §2.1, §5, §12. These numbers are the only place the
 * level ladders and shift sizes are written down; `targets.ts` turns them
 * into cells the solver can look up.
 */

/** Ordinals are 1–5 (§3). Shifts clamp to this range (§5). */
export const MIN_ORDINAL = 1;
export const MAX_ORDINAL = 5;

/**
 * Global `contrast.level` (§2.1, §5): how many ordinals to add before lookup.
 * `standard` is the unshifted table.
 */
export const GLOBAL_CONTRAST_SHIFT = {
  standard: 0,
  more: 1,
  max: 2,
} as const;

/**
 * Per-token `contrast` nudge (§2.4, §5). `+1` / `-1` are the common case;
 * `+2` / `-2` are the same shift with a larger step.
 */
export const TOKEN_CONTRAST_SHIFT = {
  "+1": 1,
  "-1": -1,
  "+2": 2,
  "-2": -2,
} as const;

/**
 * APCA |Lc| by ordinal (§5.1). Text ordinal 5 is "max" and is not listed.
 * Emphasis ordinals 1–2 are tint steps, not Lc.
 *
 * APCA references used to place the rungs: Lc 15 non-text minimum, 30 spot,
 * 45 large text/UI, 60 content text, 75 body text, 90 preferred body.
 */
export const APCA_TEXT_LC = { 1: 45, 2: 60, 3: 75, 4: 90 } as const;
export const APCA_BORDER_LC = { 1: 15, 2: 30, 3: 45, 4: 60, 5: 75 } as const;
export const APCA_EMPHASIS_LC = { 3: 60, 4: 75, 5: 90 } as const;

/**
 * WCAG 2 contrast ratios by ordinal (§5.2, §12).
 * Body text (text ordinal 3) is 4.5:1 (AA). The text ladder is 3 / 3.5 / 4.5 / 7 / max.
 * Text ordinal 5 is "max". Emphasis ordinals 1–2 are tint steps, not ratios.
 */
export const WCAG2_BODY_TEXT_RATIO = 4.5;

export const WCAG2_TEXT_RATIO = {
  1: 3,
  2: 3.5,
  3: WCAG2_BODY_TEXT_RATIO,
  4: 7,
} as const;
export const WCAG2_BORDER_RATIO = { 1: 1.5, 2: 2, 3: 3, 4: 4.5, 5: 7 } as const;
export const WCAG2_EMPHASIS_RATIO = { 3: 3, 4: 4.5, 5: 7 } as const;

/** Emphasis ordinals 1–2: tint-step multipliers. No Lc or ratio target (§5). */
export const EMPHASIS_TINT_STEPS = { 1: 1, 2: 2 } as const;

/**
 * How many levels auto-nudge may move an emphasis token to rescue a label
 * (§6.4). Open question 6 asks whether +2 is the right cap; this is that cap.
 * The search walks lightness in fine steps and stops at the contrast target
 * of this many ordinals above the token (clamped to ordinal 5).
 */
export const NUDGE_MAX_LEVELS = 2;

/**
 * Surface elevation relative to the page, in steps (§5). `0` is the page
 * ("page" / "page (offset)" in the spec tables). The OKLCH L size of one
 * step is a state concern (§4), not part of this table.
 */
export const SURFACE_STEP_OFFSET = { 1: -2, 2: -1, 3: 0, 4: 1, 5: 2 } as const;
