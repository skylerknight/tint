import type { OKLCH } from "./types.js";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const normalizeHue = (h: number): number => ((h % 360) + 360) % 360;
const clampChroma = (c: number): number => Math.max(0, c);

/** Create an OKLCH color, clamping l to 0..1, c to >= 0 and wrapping h to 0..360. */
export function oklch(l: number, c: number, h: number): OKLCH {
  return { l: clamp01(l), c: clampChroma(c), h: normalizeHue(h) };
}

/** Return a copy with lightness replaced (clamped to 0..1). */
export function setLightness(color: OKLCH, l: number): OKLCH {
  return { l: clamp01(l), c: color.c, h: color.h };
}

/** Return a copy with chroma replaced (clamped to >= 0). */
export function setChroma(color: OKLCH, c: number): OKLCH {
  return { l: color.l, c: clampChroma(c), h: color.h };
}

/** Return a copy with chroma multiplied by `factor` (0 = gray, 1 = unchanged). */
export function scaleChroma(color: OKLCH, factor: number): OKLCH {
  return setChroma(color, color.c * factor);
}

/** Return a copy with hue replaced (wrapped to 0..360). */
export function setHue(color: OKLCH, h: number): OKLCH {
  return { l: color.l, c: color.c, h: normalizeHue(h) };
}

/**
 * Linearly mix two OKLCH colors; `t` = 0 yields `a`, 1 yields `b`.
 * Hue follows the shortest arc. An achromatic endpoint adopts the other's hue
 * so mixing toward gray does not drag the hue through 0.
 */
export function mixOKLCH(a: OKLCH, b: OKLCH, t: number): OKLCH {
  const k = clamp01(t);
  const ha = isAchromatic(a) && !isAchromatic(b) ? b.h : a.h;
  const hb = isAchromatic(b) && !isAchromatic(a) ? a.h : b.h;

  let delta = hb - ha;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;

  return {
    l: a.l + (b.l - a.l) * k,
    c: a.c + (b.c - a.c) * k,
    h: normalizeHue(ha + delta * k),
  };
}

/** True when chroma is below `threshold` (i.e. the color is a gray). */
export function isAchromatic(color: OKLCH, threshold = 1e-4): boolean {
  return color.c < threshold;
}

/**
 * Format as a CSS `oklch()` string: L as a percentage and H in degrees with
 * `precision` decimals (default 2), C with `precision + 2` decimals.
 * Example: `oklch(70.00% 0.1500 250.00)`.
 */
export function formatOKLCH(color: OKLCH, precision = 2): string {
  const p = Math.max(0, Math.floor(precision));
  const l = (color.l * 100).toFixed(p);
  const c = color.c.toFixed(p + 2);
  const h = color.h.toFixed(p);
  return `oklch(${l}% ${c} ${h})`;
}
