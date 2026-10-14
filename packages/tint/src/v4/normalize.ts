/**
 * Token normalization for the numeric-scale prototype.
 *
 * A token is `{ kind, scale, ...options }`. `scale` is a finite number.
 * Surface stays inside −10..10. Emphasis, text, and border may leave 0..10;
 * that is a warning from the engine, not an error here.
 * Level names, `state`, `contrast`, `step`, and `direction` are rejected
 * with a pointer at the replacement. This function does not throw.
 */

import { SURFACE_SCALE_MAX, SURFACE_SCALE_MIN } from "./ladders.js";
import {
  isKind,
  isPlainObject,
  joinPath,
  KINDS,
  normalizeIssue,
  suggestName,
  type NormalizeIssue,
} from "./levels.js";
import type { CanonicalState } from "./states.js";
import type { Hue, Kind } from "./types.js";

const TOKEN_KEYS = new Set([
  "kind",
  "scale",
  "disabled",
  "decorative",
  "on",
  "chroma",
  "hue",
  "lc",
  "ratio",
  "nudge",
]);

/**
 * Fields the level/state API used. Kept out of {@link TOKEN_KEYS} so a config
 * that still sets them gets a specific message instead of "unknown option".
 */
const REMOVED: Readonly<Record<string, string>> = {
  level: "Level names were removed. Pass the scale as a number, as in text(3).",
  state:
    "States were removed. Add another token with its own scale (hover: emphasis(5)).",
  contrast: "The contrast nudge was removed. Change the scale instead.",
  step: "The step option was removed. The scale is the position.",
  direction:
    "direction was removed. Higher emphasis, text, and border scales are more contrast. Higher surface scales are lighter.",
  $role: "Configs are explicit. There is no $role. The token's kind is the role.",
};

/**
 * A token after normalization.
 *
 * `states` stays an empty list so the on-graph's state linker is a no-op
 * instead of a rewrite. Nothing on this branch writes a state into it.
 */
export interface NormalizedToken {
  kind: Kind;
  scale: number;
  states: CanonicalState[];
  /** Muting treatment. The scale is the token's own scale. */
  disabled?: boolean;
  /** Decorative intent. Contrast-floor and out-of-range warnings are suppressed. */
  decorative?: boolean;
  on?: string;
  chroma?: number;
  hue?: Hue;
  lc?: number;
  ratio?: number;
  /** `false` disables auto-nudge. */
  nudge?: boolean;
}

export type NormalizeResult =
  { ok: true; token: NormalizedToken } | { ok: false; issues: NormalizeIssue[] };

export interface NormalizeOptions {
  /** Dotted path of this token, e.g. `tokens.row.selected`. */
  path?: string;
  /** Ignored. Level tables are not part of this branch. */
  levels?: unknown;
  levelsPath?: string;
}

/** Resolve one token. Unknown names are issues; this function does not throw. */
export function normalizeToken(
  token: unknown,
  options?: NormalizeOptions,
): NormalizeResult {
  const path = options?.path ?? "";
  if (!isPlainObject(token)) {
    return { ok: false, issues: [normalizeIssue(path, "Expected a token object.")] };
  }

  const issues: NormalizeIssue[] = [];
  for (const key of Object.keys(token)) {
    if (TOKEN_KEYS.has(key)) continue;
    const removed = REMOVED[key];
    if (removed !== undefined) {
      issues.push(normalizeIssue(joinPath(path, key), removed));
      continue;
    }
    issues.push(normalizeIssue(joinPath(path, key), `Unknown token option "${key}".`));
  }

  if (!isKind(token.kind)) {
    issues.push(kindIssue(path, token.kind));
    return { ok: false, issues };
  }
  const kind = token.kind;

  let scale: number | undefined;
  if (!present(token, "scale")) {
    issues.push(
      normalizeIssue(
        joinPath(path, "scale"),
        `Missing scale. ${kind}() takes a number, as in ${kind}(1).`,
      ),
    );
  } else if (typeof token.scale === "number" && Number.isFinite(token.scale)) {
    if (
      kind === "surface" &&
      (token.scale < SURFACE_SCALE_MIN || token.scale > SURFACE_SCALE_MAX)
    ) {
      issues.push(
        normalizeIssue(
          joinPath(path, "scale"),
          `scale ${token.scale} is outside ${SURFACE_SCALE_MIN}..${SURFACE_SCALE_MAX}. surface(n) is signed lightness steps from the page: 0 is the page, positive is raised, negative is sunken.`,
        ),
      );
    } else {
      scale = token.scale;
    }
  } else {
    issues.push(normalizeIssue(joinPath(path, "scale"), "Expected a finite number."));
  }

  const extra = readOptions(token, path, issues);
  if (issues.length > 0 || scale === undefined) return { ok: false, issues };

  const normalized: NormalizedToken = { kind, scale, states: [] };
  assignOptions(normalized, extra);
  return { ok: true, token: normalized };
}

function kindIssue(path: string, kind: unknown): NormalizeIssue {
  const at = joinPath(path, "kind");
  const valid = KINDS.join(", ");
  if (typeof kind !== "string") {
    return normalizeIssue(at, `Expected a token kind (${valid}).`);
  }
  const suggestion = suggestName(kind, KINDS);
  return normalizeIssue(
    at,
    suggestion === undefined
      ? `Unknown kind "${kind}". Valid kinds: ${valid}.`
      : `Unknown kind "${kind}". Did you mean "${suggestion}"? Valid kinds: ${valid}.`,
    suggestion,
  );
}

interface TokenExtras {
  disabled?: boolean;
  decorative?: boolean;
  on?: string;
  chroma?: number;
  hue?: Hue;
  lc?: number;
  ratio?: number;
  nudge?: boolean;
}

function readOptions(
  token: Record<string, unknown>,
  path: string,
  issues: NormalizeIssue[],
): TokenExtras {
  const extra: TokenExtras = {};

  if (present(token, "disabled")) {
    if (typeof token.disabled === "boolean") extra.disabled = token.disabled;
    else issues.push(normalizeIssue(joinPath(path, "disabled"), "Expected a boolean."));
  }

  if (present(token, "decorative")) {
    if (typeof token.decorative !== "boolean") {
      issues.push(normalizeIssue(joinPath(path, "decorative"), "Expected a boolean."));
    } else if (token.decorative === true && token.kind === "surface") {
      issues.push(
        normalizeIssue(
          joinPath(path, "decorative"),
          "There is no decorative.surface. decorative covers text, border, and emphasis.",
        ),
      );
    } else if (token.decorative === true) {
      extra.decorative = true;
    }
  }

  if (present(token, "on")) {
    if (typeof token.on === "string") extra.on = token.on;
    else issues.push(normalizeIssue(joinPath(path, "on"), "Expected a string."));
  }

  readFinite(token, "chroma", path, issues, (value) => {
    extra.chroma = value;
  });
  readFinite(token, "lc", path, issues, (value) => {
    extra.lc = value;
  });
  readFinite(token, "ratio", path, issues, (value) => {
    extra.ratio = value;
  });

  if (present(token, "hue")) {
    if (isHue(token.hue)) extra.hue = token.hue;
    else
      issues.push(
        normalizeIssue(joinPath(path, "hue"), "Expected a hue number or a + / - shift."),
      );
  }

  if (present(token, "nudge")) {
    if (typeof token.nudge === "boolean") extra.nudge = token.nudge;
    else issues.push(normalizeIssue(joinPath(path, "nudge"), "Expected a boolean."));
  }

  return extra;
}

function assignOptions(token: NormalizedToken, extra: TokenExtras): void {
  if (extra.disabled === true) token.disabled = true;
  if (extra.decorative === true) token.decorative = true;
  if (extra.on !== undefined) token.on = extra.on;
  if (extra.chroma !== undefined) token.chroma = extra.chroma;
  if (extra.hue !== undefined) token.hue = extra.hue;
  if (extra.lc !== undefined) token.lc = extra.lc;
  if (extra.ratio !== undefined) token.ratio = extra.ratio;
  if (extra.nudge !== undefined) token.nudge = extra.nudge;
}

function present(token: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(token, key) && token[key] !== undefined;
}

function readFinite(
  token: Record<string, unknown>,
  key: "chroma" | "lc" | "ratio",
  path: string,
  issues: NormalizeIssue[],
  write: (value: number) => void,
): void {
  if (!present(token, key)) return;
  const value = token[key];
  if (typeof value === "number" && Number.isFinite(value)) write(value);
  else issues.push(normalizeIssue(joinPath(path, key), "Expected a finite number."));
}

/**
 * Degree shift written `+12` / `-12`. Absolute hues are numbers.
 * Shared with the v4 JSON Schema so the pattern cannot drift.
 */
export const HUE_SHIFT_PATTERN = /^[+-](?:\d+\.?\d*|\.\d+)$/;

function isHue(value: unknown): value is Hue {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && HUE_SHIFT_PATTERN.test(value);
}
