/**
 * Token normalization (docs/v4-spec.md §6.1).
 *
 * Names resolve to an ordinal and canonical state atoms. The result is
 * `{ kind, ordinal, states, ...options }`. `level` and `state` are not kept.
 * Unknown names and illegal states are issues (`path`, `message`, `didYouMean`);
 * this function does not throw. Preset renames (§9) are not applied here.
 */

import {
  compileLevelTable,
  isKind,
  isPlainObject,
  joinPath,
  KINDS,
  normalizeIssue,
  resolveLevel,
  suggestName,
  type NormalizeIssue,
} from "./levels.js";
import {
  ATOMIC_STATES,
  parseState,
  STATE_ALIASES,
  type CanonicalState,
} from "./states.js";
import type {
  ContrastNudge,
  Direction,
  Hue,
  Kind,
  KindLevelNames,
  LevelNames,
  LevelOrdinal,
} from "./types.js";

const CONTRAST_NUDGES = [
  "+1",
  "-1",
  "+2",
  "-2",
] as const satisfies readonly ContrastNudge[];
const DIRECTIONS = ["lighter", "darker"] as const satisfies readonly Direction[];

const TOKEN_KEYS = new Set([
  "kind",
  "level",
  "state",
  "on",
  "contrast",
  "direction",
  "chroma",
  "hue",
  "lc",
  "ratio",
  "step",
  "nudge",
]);

/**
 * A token after name resolution (§6.1).
 *
 * `states` is in apply order. A rest token has `[]`. `active` is already
 * `pressed`, and a compound is already split (`selected-hover` → selected, hover).
 */
export interface NormalizedToken {
  kind: Kind;
  ordinal: LevelOrdinal;
  states: CanonicalState[];
  on?: string;
  contrast?: ContrastNudge;
  direction?: Direction;
  chroma?: number;
  hue?: Hue;
  lc?: number;
  ratio?: number;
  step?: number;
  /** `false` disables auto-nudge (§2.4, §6.4). */
  nudge?: boolean;
}

export type NormalizeResult =
  { ok: true; token: NormalizedToken } | { ok: false; issues: NormalizeIssue[] };

export interface NormalizeOptions {
  /** `levels` config (§2.5). Omitted kinds keep the built-in names. */
  levels?: LevelNames;
  /** Dotted path of this token, e.g. `tokens.row.selected`. */
  path?: string;
  /** Path of the `levels` object. Default `levels`. */
  levelsPath?: string;
}

/**
 * Resolve one token (§3, §4, §6.1).
 *
 * A bad `levels` entry for this kind is reported at `levelsPath` and the
 * token's level is not guessed from a partial map. Other kinds in `levels`
 * are checked by `compileLevels`, not by this function.
 */
export function normalizeToken(
  token: unknown,
  options?: NormalizeOptions,
): NormalizeResult {
  const path = options?.path ?? "";
  const levelsPath = options?.levelsPath ?? "levels";
  if (!isPlainObject(token)) {
    return { ok: false, issues: [normalizeIssue(path, "Expected a token object.")] };
  }

  const issues: NormalizeIssue[] = [];
  for (const key of Object.keys(token)) {
    if (!TOKEN_KEYS.has(key)) {
      issues.push(normalizeIssue(joinPath(path, key), `Unknown token option "${key}".`));
    }
  }

  if (!isKind(token.kind)) {
    issues.push(kindIssue(path, token.kind));
    return { ok: false, issues };
  }
  const kind = token.kind;

  let ordinal: LevelOrdinal | undefined;
  const levelsConfig = options?.levels;
  if (levelsConfig !== undefined && !isPlainObject(levelsConfig)) {
    issues.push(normalizeIssue(levelsPath, "Expected level names."));
  } else {
    // `isPlainObject` narrows to a string record. The static type is still
    // `LevelNames`; bad alias targets are reported by `compileLevelTable`.
    const entry = (levelsConfig as LevelNames | undefined)?.[kind] as
      KindLevelNames | undefined;
    const table = compileLevelTable(kind, entry, joinPath(levelsPath, kind));
    if (!table.ok) {
      issues.push(...table.issues);
    } else {
      const level = resolveLevel(table.table, token.level, joinPath(path, "level"), {
        names: ATOMIC_STATES,
        aliases: STATE_ALIASES,
      });
      if (level.ok) ordinal = level.ordinal;
      else issues.push(...level.issues);
    }
  }

  let states: CanonicalState[] | undefined;
  const parsed = parseState(token.state, kind, joinPath(path, "state"));
  if (parsed.ok) states = parsed.states;
  else issues.push(...parsed.issues);

  const extra = readOptions(token, path, issues);
  if (issues.length > 0 || ordinal === undefined || states === undefined) {
    return { ok: false, issues };
  }

  const normalized: NormalizedToken = { kind, ordinal, states };
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
  on?: string;
  contrast?: ContrastNudge;
  direction?: Direction;
  chroma?: number;
  hue?: Hue;
  lc?: number;
  ratio?: number;
  step?: number;
  nudge?: boolean;
}

function readOptions(
  token: Record<string, unknown>,
  path: string,
  issues: NormalizeIssue[],
): TokenExtras {
  const extra: TokenExtras = {};

  if (present(token, "on")) {
    if (typeof token.on === "string") extra.on = token.on;
    else issues.push(normalizeIssue(joinPath(path, "on"), "Expected a string."));
  }

  if (present(token, "contrast")) {
    if (isContrast(token.contrast)) extra.contrast = token.contrast;
    else
      issues.push(
        normalizeIssue(joinPath(path, "contrast"), 'Expected "+1", "-1", "+2", or "-2".'),
      );
  }

  if (present(token, "direction")) {
    if (isDirection(token.direction)) extra.direction = token.direction;
    else
      issues.push(
        normalizeIssue(joinPath(path, "direction"), 'Expected "lighter" or "darker".'),
      );
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
  readFinite(token, "step", path, issues, (value) => {
    extra.step = value;
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
  if (extra.on !== undefined) token.on = extra.on;
  if (extra.contrast !== undefined) token.contrast = extra.contrast;
  if (extra.direction !== undefined) token.direction = extra.direction;
  if (extra.chroma !== undefined) token.chroma = extra.chroma;
  if (extra.hue !== undefined) token.hue = extra.hue;
  if (extra.lc !== undefined) token.lc = extra.lc;
  if (extra.ratio !== undefined) token.ratio = extra.ratio;
  if (extra.step !== undefined) token.step = extra.step;
  if (extra.nudge !== undefined) token.nudge = extra.nudge;
}

function present(token: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(token, key) && token[key] !== undefined;
}

function readFinite(
  token: Record<string, unknown>,
  key: "chroma" | "lc" | "ratio" | "step",
  path: string,
  issues: NormalizeIssue[],
  write: (value: number) => void,
): void {
  if (!present(token, key)) return;
  const value = token[key];
  if (typeof value === "number" && Number.isFinite(value)) write(value);
  else issues.push(normalizeIssue(joinPath(path, key), "Expected a finite number."));
}

function isContrast(value: unknown): value is ContrastNudge {
  return (
    typeof value === "string" && (CONTRAST_NUDGES as readonly string[]).includes(value)
  );
}

function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);
}

/**
 * Degree shift written `+12` / `-12` (§2.4). Absolute hues are numbers.
 * Shared with the v4 JSON Schema so the pattern cannot drift.
 */
export const HUE_SHIFT_PATTERN = /^[+-](?:\d+\.?\d*|\.\d+)$/;

function isHue(value: unknown): value is Hue {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && HUE_SHIFT_PATTERN.test(value);
}
