/**
 * Kind functions for the 0–10 scale.
 *
 * `surface(0)`, `text(5)`, `border(4.5)`, `emphasis(8)`.
 * The number is the whole scale. Higher means more contrast against the backdrop.
 * There are no level names and no `state`. Hover and pressed are other numbers.
 * Options are `{ on?, chroma?, hue?, lc?, ratio?, nudge? }`.
 * `disabled(token)` mutes a token without changing its scale.
 */

import type { Kind, Token, TokenOptions } from "./types.js";

/** Flatten an intersection into one object type so equality checks see a single shape. */
type Flat<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Reject keys that are not on {@link TokenOptions}.
 * A bare `O extends TokenOptions` still accepts extra keys: excess-property
 * checks do not apply once `O` is inferred from the argument.
 */
type OnlyTokenOptions<O> = O & {
  [K in keyof O]: K extends keyof TokenOptions ? O[K] : never;
};

interface KindFn<K extends Kind> {
  (scale: number): { kind: K; scale: number };
  <const O extends TokenOptions>(
    scale: number,
    options: OnlyTokenOptions<O>,
  ): Flat<{ kind: K; scale: number } & O>;
}

function isOptions(value: unknown): value is TokenOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildToken(kind: Kind, scale: number, options: TokenOptions | undefined): Token {
  const token = { kind, scale } as Token;
  if (options === undefined) return token;
  if (options.on !== undefined) token.on = options.on;
  if (options.chroma !== undefined) token.chroma = options.chroma;
  if (options.hue !== undefined) token.hue = options.hue;
  if (options.lc !== undefined) token.lc = options.lc;
  if (options.ratio !== undefined) token.ratio = options.ratio;
  if (options.nudge !== undefined) token.nudge = options.nudge;
  return token;
}

function kindFunction<K extends Kind>(kind: K): KindFn<K> {
  function create(scale: number, options?: TokenOptions): Token {
    if (isOptions(scale)) {
      throw new TypeError(
        `${kind}() takes a scale number first. Options are the second argument.`,
      );
    }
    return buildToken(kind, scale, options);
  }
  return create as KindFn<K>;
}

/**
 * Contrast against the page, on the same 0–10 curve as the other kinds.
 * `surface(0)` matches the page. One unit is +3 Lc in light, +4 Lc in dark,
 * and ×2^0.1 on the WCAG ratio (1:1 at 0, 2:1 at 10).
 */
export const surface = kindFunction("surface");

/**
 * Contrast against its backdrop.
 * `text(5)` is body text (APCA Lc 75, WCAG 4.5:1).
 * One unit is +6 Lc, or ×1.15 on the WCAG ratio.
 */
export const text = kindFunction("text");

/**
 * Contrast against its backdrop.
 * `border(5)` is the WCAG non-text 3:1 rung.
 * One unit is +6 Lc, or ×2^0.2 on the WCAG ratio (1.5:1 at 0, 6:1 at 10).
 */
export const border = kindFunction("border");

/**
 * Contrast against its surface (`on`, or the base surface).
 * One pure curve: no tint branch and no polarity flip as the number grows.
 * One unit is +9 Lc in light, +10 Lc in dark, or ×7^0.1 on the WCAG ratio
 * (1:1 at 0, 7:1 at 10).
 * Hover and pressed are other tokens (`emphasis(7)`, `emphasis(9)`).
 */
export const emphasis = kindFunction("emphasis");

/**
 * Mute `token` without moving it on the scale.
 *
 * The engine desaturates the solved color and, when the color is not already
 * on its backdrop, steps lightness a short distance toward that backdrop.
 * The result is a solid color. `opts` may set `on`, `chroma`, `hue`, `lc`,
 * `ratio`, or `nudge`. They do not change `scale`.
 */
export function disabled<const O extends TokenOptions>(
  token: Token,
  options?: OnlyTokenOptions<O>,
): Flat<Token & { disabled: true }> {
  const next = { ...token, disabled: true as const };
  if (options === undefined) return next;
  if (options.on !== undefined) next.on = options.on;
  if (options.chroma !== undefined) next.chroma = options.chroma;
  if (options.hue !== undefined) next.hue = options.hue;
  if (options.lc !== undefined) next.lc = options.lc;
  if (options.ratio !== undefined) next.ratio = options.ratio;
  if (options.nudge !== undefined) next.nudge = options.nudge;
  return next;
}
