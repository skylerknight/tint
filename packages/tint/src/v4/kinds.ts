/**
 * Kind functions for the numeric-scale prototype.
 *
 * `surface(0)`, `text(3)`, `border(2.5)`, `emphasis(4)`.
 * The number is the whole scale. There are no level names and no `state`.
 * Options are `{ on?, chroma?, hue?, lc?, ratio?, nudge? }`.
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
 * One step is 0.02 in light mode and 0.03 in dark mode.
 */
export const surface = kindFunction("surface");

/**
 * Contrast-ladder steps against the backdrop.
 * `text(3)` is body text (APCA Lc 75, WCAG 4.5:1).
 */
export const text = kindFunction("text");

/**
 * Contrast-ladder steps against the backdrop.
 * `border(4)` is the non-text 3:1 rung on the WCAG table.
 */
export const border = kindFunction("border");

/**
 * Soft tints through solid fills, on one 1..5 scale.
 * `emphasis(1)` and `emphasis(2)` are lightness steps from the backdrop
 * (0.025 in light mode, 0.0375 in dark mode). `emphasis(3)` through
 * `emphasis(5)` are a contrast ladder against that backdrop. Values between
 * 2 and 3 blend lightness from the tint into the first solid rung.
 */
export const emphasis = kindFunction("emphasis");
