/**
 * Kind functions for the unified scale.
 *
 * `surface(0)`, `text(5)`, `border(4.5)`, `emphasis(5)`.
 * `emphasis`, `text`, and `border` are contrast steps on 0–10. Higher means
 * more contrast against the backdrop. `surface` is signed lightness steps
 * from the page, −10..10. There are no level names and no `state`. Hover and
 * pressed are other numbers.
 * Options are `{ on?, chroma?, hue?, lc?, ratio?, nudge? }`.
 * `disabled.emphasis(n)` and the other `disabled.<kind>(n)` build that kind at
 * `n`, then the engine mutes it. There is no `disabled(token)` wrapper.
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
 * Signed lightness steps from the page.
 * `0` is the page, positive is raised, negative is sunken.
 * One step is 0.02 in light mode and 0.03 in dark mode. Decimals are real steps.
 * Valid range is −10..10.
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
 * `emphasis(0)` clears the non-text floor. The lint measures WCAG 3:1, so the
 * APCA anchors are the Lc values that first clear that ratio on the mode page:
 * Lc 53.5 in light, Lc 22 in dark. WCAG `emphasis(0)` is 3:1.
 * `emphasis(10)` is Lc 90 in light, Lc 100 in dark, and WCAG 7:1.
 * One step is +3.65 Lc in light, +7.8 Lc in dark, or ×(7/3)^0.1 on the ratio.
 * Decimals interpolate (linear in Lc, geometric in the ratio).
 * Hover and pressed are other tokens (`emphasis(4.5)`, `emphasis(6)`).
 */
export const emphasis = kindFunction("emphasis");

interface DisabledFn<K extends Kind> {
  (scale: number): { kind: K; scale: number; disabled: true };
  <const O extends TokenOptions>(
    scale: number,
    options: OnlyTokenOptions<O>,
  ): Flat<{ kind: K; scale: number; disabled: true } & O>;
}

function disabledKind<K extends Kind>(kind: K): DisabledFn<K> {
  function create(scale: number, options?: TokenOptions): Token {
    if (isOptions(scale)) {
      throw new TypeError(
        `disabled.${kind}() takes a scale number first. Options are the second argument.`,
      );
    }
    const token = buildToken(kind, scale, options);
    token.disabled = true;
    return token;
  }
  return create as DisabledFn<K>;
}

/**
 * Build a kind at scale `n` ("how strong it would have been"), then mark it
 * for muting.
 *
 * The engine desaturates the solved color (chroma ×0.3) and steps lightness
 * at most 0.06 toward the backdrop. The result is a solid color. The scale
 * stays `n`. `opts` may set `on`, `chroma`, `hue`, `lc`, `ratio`, or `nudge`.
 */
export const disabled = {
  emphasis: disabledKind("emphasis"),
  text: disabledKind("text"),
  surface: disabledKind("surface"),
  border: disabledKind("border"),
};
