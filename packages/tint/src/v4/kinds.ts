/**
 * Kind functions (docs/v4-spec.md §2.4, §3, §4).
 *
 * Each call returns JSON-serializable data. Omitted arguments are omitted
 * from the object: `emphasis()` is `{ kind: "emphasis" }`, not level 3.
 * Names stay as written (`"bold"`, `"active"`, `"selected-hover"`).
 */

import type { Kind, Level, Token, TokenOptions } from "./types.js";

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
  (): { kind: K };
  <const L extends Level>(level: L): Flat<{ kind: K; level: L }>;
  <const O extends TokenOptions>(options: OnlyTokenOptions<O>): Flat<{ kind: K } & O>;
  <const L extends Level, const O extends TokenOptions>(
    level: L,
    options: OnlyTokenOptions<O>,
  ): Flat<{ kind: K; level: L } & O>;
}

function isOptions(value: unknown): value is TokenOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildToken(
  kind: Kind,
  level: Level | undefined,
  options: TokenOptions | undefined,
): Token {
  const token = { kind } as Token;
  if (level !== undefined) token.level = level;
  if (options === undefined) return token;

  // Copy defined fields only. `exactOptionalPropertyTypes` rejects assigning
  // the indexed union in one statement, and JSON drops undefined anyway.
  if (options.state !== undefined) token.state = options.state;
  if (options.on !== undefined) token.on = options.on;
  if (options.contrast !== undefined) token.contrast = options.contrast;
  if (options.direction !== undefined) token.direction = options.direction;
  if (options.chroma !== undefined) token.chroma = options.chroma;
  if (options.hue !== undefined) token.hue = options.hue;
  if (options.lc !== undefined) token.lc = options.lc;
  if (options.ratio !== undefined) token.ratio = options.ratio;
  if (options.step !== undefined) token.step = options.step;
  if (options.nudge !== undefined) token.nudge = options.nudge;
  return token;
}

function kindFunction<K extends Kind>(kind: K): KindFn<K> {
  function create(levelOrOptions?: Level | TokenOptions, options?: TokenOptions): Token {
    if (typeof levelOrOptions === "string" || typeof levelOrOptions === "number") {
      return buildToken(kind, levelOrOptions, options);
    }
    if (isOptions(levelOrOptions)) return buildToken(kind, undefined, levelOrOptions);
    return buildToken(kind, undefined, undefined);
  }
  return create as KindFn<K>;
}

/** Elevation. Higher sits closer to the light in both modes (§3). Default level `base`. */
export const surface = kindFunction("surface");

/** Legibility against its backdrop (§3). Default level `body`. */
export const text = kindFunction("text");

/** Definition (§3). Levels 1–2 are decorative. Default level `default`. */
export const border = kindFunction("border");

/**
 * Prominence (§3). Levels 1–2 are tinted surfaces; 3–5 are solids.
 * Default level `default`.
 */
export const emphasis = kindFunction("emphasis");
