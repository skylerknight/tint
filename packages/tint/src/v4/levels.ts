/**
 * Level names and `levels` renaming (docs/v4-spec.md §2.5, §3).
 *
 * Every kind has ordinals 1–5. Names are aliases. `default` is a universal
 * alias for ordinal 3, which is also the ordinal used when `level` is omitted.
 * `$replace: true` drops the built-in names, including `default`. Numbers stay
 * valid either way. Unknown names are issues; nothing here throws.
 */

import type { Kind, KindLevelNames, LevelNames, LevelOrdinal } from "./types.js";

/** Kinds in spec order (§3). */
export const KINDS = [
  "surface",
  "text",
  "border",
  "emphasis",
  "decorative",
] as const satisfies readonly Kind[];

/** Ordinal used when `level` is omitted. Every kind's `*` row is 3 (§3). */
export const DEFAULT_ORDINAL = 3 satisfies LevelOrdinal;

/**
 * Built-in name → ordinal (§3).
 *
 * `default` is listed on surface and text as well as border and emphasis.
 * On border and emphasis it is the ordinal-3 name from the table. On surface
 * and text the table's own names are `base` and `body`; `default` is the
 * extra universal alias for the same ordinal.
 */
export const DEFAULT_LEVEL_NAMES = {
  surface: { sunken: 1, flat: 2, base: 3, raised: 4, floating: 5, default: 3 },
  text: { faint: 1, muted: 2, body: 3, strong: 4, max: 5, default: 3 },
  border: { hairline: 1, soft: 2, default: 3, firm: 4, heavy: 5 },
  emphasis: { quiet: 1, subtle: 2, default: 3, bold: 4, loud: 5 },
  // Unused by the numeric-scale prototype. The record has to cover every kind.
  decorative: { hairline: 1, soft: 2, default: 3, ornament: 4, icon: 5 },
} as const satisfies Record<Kind, Record<string, LevelOrdinal>>;

/**
 * Structured issue for a name that did not resolve (§7.1, §9).
 * `didYouMean` is omitted when nothing is close enough to suggest.
 */
export interface NormalizeIssue {
  /** Dotted location, e.g. `tokens.row.selected.level`. */
  path: string;
  message: string;
  /** Closest known name, when there is one. */
  didYouMean?: string;
}

/** One kind's resolved name table. */
export interface LevelTable {
  kind: Kind;
  /** True when `$replace` dropped the built-in names (§2.5). */
  replaced: boolean;
  /**
   * Name → ordinal. Built-ins plus aliases, or only the aliases when
   * `replaced` is true. Numeric levels are not stored here; 1–5 always resolve.
   */
  names: Readonly<Record<string, LevelOrdinal>>;
}

export type LevelTableResult =
  { ok: true; table: LevelTable } | { ok: false; issues: NormalizeIssue[] };

export type LevelTables = { [K in Kind]: LevelTable };

export type CompileLevelsResult =
  { ok: true; tables: LevelTables } | { ok: false; issues: NormalizeIssue[] };

export type ResolveLevelResult =
  { ok: true; ordinal: LevelOrdinal } | { ok: false; issues: NormalizeIssue[] };

/** State words a level typo may be aiming at (§4, §7.1). */
export interface StateSuggestions {
  readonly names: readonly string[];
  /** Alias spelling → canonical state. `active` → `pressed`. */
  readonly aliases?: Readonly<Record<string, string>>;
}

const ORDINAL_STRINGS = ["1", "2", "3", "4", "5"] as const;

export function normalizeIssue(
  path: string,
  message: string,
  didYouMean?: string,
): NormalizeIssue {
  if (didYouMean === undefined) return { path, message };
  return { path, message, didYouMean };
}

export function joinPath(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

export function isOrdinal(value: unknown): value is LevelOrdinal {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/**
 * Closest candidate under restricted Damerau-Levenshtein (adjacent
 * transpositions count as one edit). Comparison is case-insensitive; the
 * returned spelling is the candidate's. Short inputs only forgive one edit,
 * so `base` is not silently read as `body`.
 */
export function suggestName(
  input: string,
  candidates: readonly string[],
): string | undefined {
  const needle = input.toLowerCase();
  const threshold = input.length <= 4 ? 1 : input.length <= 8 ? 2 : 3;
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = editDistance(needle, candidate.toLowerCase());
    if (score > threshold) continue;
    // The input itself is not a correction. A case-only difference scores 0
    // and is a correction, because lookup is case-sensitive.
    if (score === 0 && candidate === input) continue;
    if (
      best === undefined ||
      score < bestScore ||
      (score === bestScore && candidate < best)
    ) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Resolve one kind's `levels` entry (§2.5).
 *
 * Missing config merges nothing on top of the defaults. `$replace: true`
 * starts from an empty name map. Ordinals 1–5 are not aliases and are not
 * stored. A bad entry fails the whole kind: callers do not see a partial map.
 */
export function compileLevelTable(
  kind: Kind,
  config: KindLevelNames | undefined,
  path = joinPath("levels", kind),
): LevelTableResult {
  if (config === undefined) {
    return { ok: true, table: tableFrom(kind, false, { ...DEFAULT_LEVEL_NAMES[kind] }) };
  }
  if (!isPlainObject(config)) {
    return {
      ok: false,
      issues: [normalizeIssue(path, `Expected level names for ${kind}.`)],
    };
  }

  const issues: NormalizeIssue[] = [];
  let replaced = false;
  if (Object.prototype.hasOwnProperty.call(config, "$replace")) {
    const flag = config.$replace;
    if (typeof flag === "boolean") replaced = flag;
    else issues.push(normalizeIssue(joinPath(path, "$replace"), "Expected a boolean."));
  }

  const names: Record<string, LevelOrdinal> = {};
  if (!replaced) {
    for (const [name, ordinal] of Object.entries(DEFAULT_LEVEL_NAMES[kind])) {
      names[name] = ordinal;
    }
  }

  for (const key of Object.keys(config)) {
    if (key === "$replace") continue;
    const keyPath = joinPath(path, key);
    if (key.startsWith("$")) {
      issues.push(
        normalizeIssue(
          keyPath,
          `Unknown levels option "${key}". The only option is "$replace".`,
        ),
      );
      continue;
    }
    if (isOrdinalString(key) || key === "") {
      issues.push(
        normalizeIssue(
          keyPath,
          key === ""
            ? "Level name must not be empty."
            : `Level name "${key}" shadows an ordinal. Numbers 1–5 are always valid.`,
        ),
      );
      continue;
    }
    const value = config[key];
    if (!isOrdinal(value)) {
      issues.push(normalizeIssue(keyPath, `Alias "${key}" must be an ordinal 1–5.`));
      continue;
    }
    names[key] = value;
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, table: tableFrom(kind, replaced, names) };
}

/**
 * Resolve every kind, and reject keys that are not kinds.
 * One bad kind fails the whole config; the issues still cover every problem.
 */
export function compileLevels(levels?: LevelNames, path = "levels"): CompileLevelsResult {
  if (levels !== undefined && !isPlainObject(levels)) {
    return { ok: false, issues: [normalizeIssue(path, "Expected level names.")] };
  }

  const source = (levels ?? {}) as Record<string, unknown>;
  const issues: NormalizeIssue[] = [];
  for (const key of Object.keys(source)) {
    if (isKind(key)) continue;
    const suggestion = suggestName(key, KINDS);
    const valid = KINDS.join(", ");
    issues.push(
      normalizeIssue(
        joinPath(path, key),
        suggestion === undefined
          ? `Unknown kind "${key}". Valid kinds: ${valid}.`
          : `Unknown kind "${key}". Did you mean "${suggestion}"? Valid kinds: ${valid}.`,
        suggestion,
      ),
    );
  }

  const tables = {} as LevelTables;
  for (const kind of KINDS) {
    const entry = source[kind] as KindLevelNames | undefined;
    const result = compileLevelTable(kind, entry, joinPath(path, kind));
    if (result.ok) tables[kind] = result.table;
    else issues.push(...result.issues);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, tables };
}

/**
 * Resolve a token `level` against a compiled table (§3, §6.1).
 *
 * `undefined` is the omitted level: ordinal {@link DEFAULT_ORDINAL}, even
 * when `$replace` removed the name `default` or pointed that name elsewhere.
 * Numbers 1–5 and the strings `"1"`–`"5"` always resolve. Anything else is
 * a name. A close state word is reported as a state, not offered as a level.
 */
export function resolveLevel(
  table: LevelTable,
  level: unknown,
  path: string,
  states?: StateSuggestions,
): ResolveLevelResult {
  if (level === undefined) return { ok: true, ordinal: DEFAULT_ORDINAL };
  if (isOrdinal(level)) return { ok: true, ordinal: level };
  if (typeof level === "string" && isOrdinalString(level)) {
    return { ok: true, ordinal: Number(level) as LevelOrdinal };
  }

  const listed = Object.keys(table.names);
  const valid =
    listed.length === 0
      ? "Valid levels: 1–5."
      : `Valid levels: ${listed.join(", ")} (or 1–5).`;
  if (typeof level === "number") {
    return {
      ok: false,
      issues: [normalizeIssue(path, `Level ${level} is not an ordinal 1–5. ${valid}`)],
    };
  }
  if (typeof level !== "string") {
    return {
      ok: false,
      issues: [normalizeIssue(path, `Expected a level name or an ordinal 1–5. ${valid}`)],
    };
  }
  if (isDigitString(level)) {
    return {
      ok: false,
      issues: [normalizeIssue(path, `Level "${level}" is not an ordinal 1–5. ${valid}`)],
    };
  }

  const named = table.names[level];
  if (named !== undefined) return { ok: true, ordinal: named };

  const levelSuggestion = suggestName(level, Object.keys(table.names));
  if (levelSuggestion !== undefined) {
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `Level "${level}" is not ${kindPhrase(table.kind)} level. Did you mean "${levelSuggestion}"? ${valid}`,
          levelSuggestion,
        ),
      ],
    };
  }

  const stateSuggestion = suggestState(level, states);
  if (stateSuggestion !== undefined) {
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `Level "${level}" is not ${kindPhrase(table.kind)} level. Did you mean "${stateSuggestion}"? That's a state, not a level. ${valid}`,
          stateSuggestion,
        ),
      ],
    };
  }

  return {
    ok: false,
    issues: [
      normalizeIssue(
        path,
        `Level "${level}" is not ${kindPhrase(table.kind)} level. ${valid}`,
      ),
    ],
  };
}

function kindPhrase(kind: Kind): string {
  return kind === "emphasis" ? "an emphasis" : `a ${kind}`;
}

function tableFrom(
  kind: Kind,
  replaced: boolean,
  names: Record<string, LevelOrdinal>,
): LevelTable {
  return { kind, replaced, names };
}

function isOrdinalString(value: string): value is (typeof ORDINAL_STRINGS)[number] {
  return (ORDINAL_STRINGS as readonly string[]).includes(value);
}

function isDigitString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function suggestState(
  input: string,
  states: StateSuggestions | undefined,
): string | undefined {
  if (states === undefined) return undefined;
  const aliases = states.aliases ?? {};
  const exact = Object.prototype.hasOwnProperty.call(aliases, input)
    ? aliases[input]
    : states.names.includes(input)
      ? input
      : undefined;
  if (exact !== undefined && exact !== "") return exact;

  const suggested = suggestName(input, [...states.names, ...Object.keys(aliases)]);
  if (suggested === undefined) return undefined;
  return aliases[suggested] ?? suggested;
}

/**
 * Restricted Damerau-Levenshtein distance. An adjacent transposition is one
 * edit, which is what a swapped pair of letters in a level name usually is.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevPrev = new Array<number>(n + 1).fill(0);
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let best = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        best = Math.min(best, (prevPrev[j - 2] ?? 0) + 1);
      }
      curr[j] = best;
    }
    prevPrev = prev;
    prev = curr;
  }

  return prev[n] ?? n;
}
