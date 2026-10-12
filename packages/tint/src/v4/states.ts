/**
 * State parser (docs/v4-spec.md §4).
 *
 * `CANONICAL_STATES` is the source of truth for every legal `state` string.
 * It is built from the grammar constants below so a later JSON Schema export
 * can read one list. `active` is an input alias of `pressed` and is not in
 * that list. Unknown names and illegal combinations are issues, not throws.
 *
 * Grammar, in written order:
 * 1. At most one persistent state: `selected` or `checked`.
 * 2. Optionally `disabled`.
 * 3. Optionally one temporary state: `hover`, `pressed`, or `focus`.
 *
 * `disabled` does not combine with a temporary state. `checked` applies to
 * emphasis and border only. Anything else in §4 applies to every kind.
 */

import type { Kind } from "./types.js";
import { normalizeIssue, suggestName, type NormalizeIssue } from "./levels.js";

/** Canonical atomic states. `active` is not one of them (§4). */
export const ATOMIC_STATES = [
  "hover",
  "pressed",
  "focus",
  "selected",
  "checked",
  "disabled",
] as const;

export type CanonicalState = (typeof ATOMIC_STATES)[number];

/** Toggled states. At most one, and it is written first. */
export const PERSISTENT_STATES = [
  "selected",
  "checked",
] as const satisfies readonly CanonicalState[];

/** Pointer and keyboard states. At most one, and it is written last. */
export const TEMPORARY_STATES = [
  "hover",
  "pressed",
  "focus",
] as const satisfies readonly CanonicalState[];

/** Blocks temporary states. Written after a persistent state when both are set. */
export const DISABLED_STATE = "disabled" as const satisfies CanonicalState;

/** Input spelling → canonical atom. The only alias in §4. */
export const STATE_ALIASES = { active: "pressed" } as const satisfies Record<
  string,
  CanonicalState
>;

const ALL_KINDS = [
  "surface",
  "text",
  "border",
  "emphasis",
] as const satisfies readonly Kind[];

/** §4 "applies to" column. Compounds inherit the strictest part. */
export const STATE_APPLIES_TO = {
  hover: ALL_KINDS,
  pressed: ALL_KINDS,
  focus: ALL_KINDS,
  selected: ALL_KINDS,
  checked: ["emphasis", "border"],
  disabled: ALL_KINDS,
} as const satisfies Record<CanonicalState, readonly Kind[]>;

/**
 * Every legal `state` string, alias spellings excluded.
 *
 * Order: atoms in §4 table order, then `selected-*`, then `checked-*`.
 * T5 should generate the JSON Schema enum from this value.
 */
export const CANONICAL_STATES: readonly string[] = buildCanonicalStates();

export type ParseStateResult =
  { ok: true; states: CanonicalState[] } | { ok: false; issues: NormalizeIssue[] };

/** Subset of {@link CANONICAL_STATES} that applies to `kind`. */
export function canonicalStatesFor(kind: Kind): readonly string[] {
  return CANONICAL_STATES.filter((state) =>
    state.split("-").every((part) => isCanonicalState(part) && appliesTo(part, kind)),
  );
}

/**
 * Parse a `state` string into canonical atoms in apply order (§4, §6.1).
 *
 * `undefined` is a rest token: `states` is `[]`. `active` becomes `pressed`.
 * `selected-hover` becomes `["selected", "hover"]`.
 */
export function parseState(state: unknown, kind: Kind, path = "state"): ParseStateResult {
  if (state === undefined) return { ok: true, states: [] };
  if (typeof state !== "string") {
    return { ok: false, issues: [normalizeIssue(path, "Expected a state string.")] };
  }
  if (state === "") {
    return { ok: false, issues: [normalizeIssue(path, 'State "" is not a state.')] };
  }

  const rawParts = state.split("-");
  if (rawParts.some((part) => part === "")) {
    return {
      ok: false,
      issues: [normalizeIssue(path, `State "${state}" has an empty part.`)],
    };
  }

  const resolved = rawParts.map(resolvePart);
  const unknown = resolved.find(
    (part) => part.canonical === undefined && part.suggested === undefined,
  );
  if (unknown !== undefined) {
    const where = state === unknown.raw ? "" : ` in "${state}"`;
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `Unknown state "${unknown.raw}"${where}. Valid states: ${validList(kind)}.`,
        ),
      ],
    };
  }

  const atoms = resolved.map((part) => part.canonical ?? part.suggested);
  const interpreted = atoms.filter((part): part is CanonicalState => part !== undefined);
  if (interpreted.length !== resolved.length) {
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `Unknown state "${state}". Valid states: ${validList(kind)}.`,
        ),
      ],
    };
  }

  const hadUnknown = resolved.some((part) => part.canonical === undefined);
  const ordered = orderStates(interpreted);
  if (!ordered.ok) {
    return { ok: false, issues: [combinationIssue(path, state, kind, ordered)] };
  }

  const offender = kindOffender(ordered.states, kind);
  if (offender !== undefined) {
    return {
      ok: false,
      issues: [kindIssue(path, state, kind, offender)],
    };
  }

  if (hadUnknown) {
    const repaired = ordered.states.join("-");
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `Unknown state "${state}". Did you mean "${repaired}"?`,
          repaired,
        ),
      ],
    };
  }

  if (!sameSequence(interpreted, ordered.states)) {
    const repaired = ordered.states.join("-");
    return {
      ok: false,
      issues: [
        normalizeIssue(
          path,
          `State "${state}" is out of order. Persistent states come first, then disabled, then a temporary state: "${repaired}".`,
          repaired,
        ),
      ],
    };
  }

  return { ok: true, states: ordered.states };
}

function buildCanonicalStates(): readonly string[] {
  const states: string[] = [...ATOMIC_STATES];
  for (const persistent of PERSISTENT_STATES) {
    for (const temporary of TEMPORARY_STATES) states.push(`${persistent}-${temporary}`);
    states.push(`${persistent}-${DISABLED_STATE}`);
  }
  return states;
}

interface ResolvedPart {
  raw: string;
  canonical?: CanonicalState;
  suggested?: CanonicalState;
}

function resolvePart(raw: string): ResolvedPart {
  const alias = aliasTarget(raw);
  if (alias !== undefined) return { raw, canonical: alias };
  if (isCanonicalState(raw)) return { raw, canonical: raw };

  const candidates = [...ATOMIC_STATES, ...Object.keys(STATE_ALIASES)];
  const suggestion = suggestName(raw, candidates);
  if (suggestion === undefined) return { raw };
  const mapped =
    aliasTarget(suggestion) ?? (isCanonicalState(suggestion) ? suggestion : undefined);
  return mapped === undefined ? { raw } : { raw, suggested: mapped };
}

type OrderFailure =
  | { ok: false; reason: "duplicate"; state: CanonicalState }
  | { ok: false; reason: "persistent" }
  | { ok: false; reason: "temporary" }
  | { ok: false; reason: "disabled-temporary"; temporary: readonly CanonicalState[] };

type OrderResult = { ok: true; states: CanonicalState[] } | OrderFailure;

function orderStates(parts: readonly CanonicalState[]): OrderResult {
  const seen = new Set<CanonicalState>();
  for (const part of parts) {
    if (seen.has(part)) {
      return { ok: false, reason: "duplicate", state: part };
    }
    seen.add(part);
  }

  const persistent = parts.filter(isPersistent);
  const temporary = parts.filter(isTemporary);
  const disabled = parts.filter((part) => part === DISABLED_STATE);
  if (persistent.length > 1) return { ok: false, reason: "persistent" };
  if (disabled.length > 0 && temporary.length > 0) {
    return { ok: false, reason: "disabled-temporary", temporary };
  }
  if (temporary.length > 1) return { ok: false, reason: "temporary" };

  const states: CanonicalState[] = [];
  const firstPersistent = persistent[0];
  const firstTemporary = temporary[0];
  if (firstPersistent !== undefined) states.push(firstPersistent);
  if (disabled.length > 0) states.push(DISABLED_STATE);
  if (firstTemporary !== undefined) states.push(firstTemporary);
  return { ok: true, states };
}

function combinationIssue(
  path: string,
  raw: string,
  kind: Kind,
  failure: OrderFailure,
): NormalizeIssue {
  switch (failure.reason) {
    case "duplicate":
      return duplicateIssue(path, raw, kind, failure.state);
    case "persistent":
      return normalizeIssue(
        path,
        `State "${raw}" is not a valid combination. A state can include only one of "selected" or "checked".`,
      );
    case "temporary":
      return normalizeIssue(
        path,
        `State "${raw}" is not a valid combination. A state can include only one temporary state ("hover", "pressed", or "focus").`,
      );
    case "disabled-temporary":
      return normalizeIssue(
        path,
        `State "${raw}" is not a valid combination. "disabled" cannot combine with a temporary state (${quoteList(failure.temporary)}).`,
      );
    default: {
      const unreachable: never = failure;
      return unreachable;
    }
  }
}

function duplicateIssue(
  path: string,
  raw: string,
  kind: Kind,
  state: CanonicalState,
): NormalizeIssue {
  const parts = raw.split("-");
  const alias = parts.find((part) => aliasTarget(part) === state && part !== state);
  const message =
    alias === undefined
      ? `State "${raw}" repeats "${state}".`
      : `State "${raw}" repeats "${state}" ("${alias}" is an alias of "${state}").`;
  if (!appliesTo(state, kind)) {
    const applies = STATE_APPLIES_TO[state].join(", ");
    return normalizeIssue(
      path,
      `${message} "${state}" applies to ${applies}, not ${kind}.`,
    );
  }
  return normalizeIssue(path, `${message} Did you mean "${state}"?`, state);
}

function kindIssue(
  path: string,
  raw: string,
  kind: Kind,
  offender: CanonicalState,
): NormalizeIssue {
  const applies = STATE_APPLIES_TO[offender].join(", ");
  return normalizeIssue(
    path,
    `State "${raw}" does not apply to ${kind}. "${offender}" applies to ${applies}. Valid states: ${validList(kind)}.`,
  );
}

function kindOffender(
  states: readonly CanonicalState[],
  kind: Kind,
): CanonicalState | undefined {
  return states.find((state) => !appliesTo(state, kind));
}

function appliesTo(state: CanonicalState, kind: Kind): boolean {
  return (STATE_APPLIES_TO[state] as readonly Kind[]).includes(kind);
}

function validList(kind: Kind): string {
  return canonicalStatesFor(kind).join(", ");
}

function isPersistent(state: CanonicalState): boolean {
  return (PERSISTENT_STATES as readonly string[]).includes(state);
}

function isTemporary(state: CanonicalState): boolean {
  return (TEMPORARY_STATES as readonly string[]).includes(state);
}

function isCanonicalState(value: string): value is CanonicalState {
  return (ATOMIC_STATES as readonly string[]).includes(value);
}

function aliasTarget(part: string): CanonicalState | undefined {
  if (!Object.prototype.hasOwnProperty.call(STATE_ALIASES, part)) return undefined;
  return STATE_ALIASES[part as keyof typeof STATE_ALIASES];
}

function sameSequence(
  a: readonly CanonicalState[],
  b: readonly CanonicalState[],
): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

function quoteList(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
