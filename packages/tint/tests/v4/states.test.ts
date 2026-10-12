import { describe, expect, expectTypeOf, it } from "vitest";
import type { AtomicState, Kind } from "../../src/v4/types.js";
import { normalizeToken } from "../../src/v4/normalize.js";
import {
  ATOMIC_STATES,
  CANONICAL_STATES,
  DISABLED_STATE,
  PERSISTENT_STATES,
  STATE_ALIASES,
  STATE_APPLIES_TO,
  TEMPORARY_STATES,
  canonicalStatesFor,
  parseState,
  type CanonicalState,
} from "../../src/v4/states.js";

const KINDS = [
  "surface",
  "text",
  "border",
  "emphasis",
] as const satisfies readonly Kind[];

function issues(
  result:
    | { ok: true; states: CanonicalState[] }
    | { ok: false; issues: { path: string; message: string; didYouMean?: string }[] },
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected issues");
  return result.issues;
}

function grammarList(): string[] {
  const states: string[] = [...ATOMIC_STATES];
  for (const persistent of PERSISTENT_STATES) {
    for (const temporary of TEMPORARY_STATES) states.push(`${persistent}-${temporary}`);
    states.push(`${persistent}-${DISABLED_STATE}`);
  }
  return states;
}

describe("canonical states (§4)", () => {
  it("is the grammar, in one list, with no alias spellings", () => {
    expect(PERSISTENT_STATES).toEqual(["selected", "checked"]);
    expect(TEMPORARY_STATES).toEqual(["hover", "pressed", "focus"]);
    expect(DISABLED_STATE).toBe("disabled");
    expect(STATE_ALIASES).toEqual({ active: "pressed" });
    expect(ATOMIC_STATES).toEqual([
      "hover",
      "pressed",
      "focus",
      "selected",
      "checked",
      "disabled",
    ]);
    expect(CANONICAL_STATES).toEqual(grammarList());
    expect(CANONICAL_STATES).toEqual([
      "hover",
      "pressed",
      "focus",
      "selected",
      "checked",
      "disabled",
      "selected-hover",
      "selected-pressed",
      "selected-focus",
      "selected-disabled",
      "checked-hover",
      "checked-pressed",
      "checked-focus",
      "checked-disabled",
    ]);
    expect(CANONICAL_STATES).not.toContain("active");
    expect(CANONICAL_STATES).not.toContain("selected-active");
  });

  it("matches the applies-to column, and checked is emphasis and border only", () => {
    expect(STATE_APPLIES_TO).toEqual({
      hover: KINDS,
      pressed: KINDS,
      focus: KINDS,
      selected: KINDS,
      checked: ["emphasis", "border"],
      disabled: KINDS,
    });
    const withoutChecked = CANONICAL_STATES.filter(
      (state) => !state.split("-").includes("checked"),
    );
    expect(canonicalStatesFor("surface")).toEqual(withoutChecked);
    expect(canonicalStatesFor("text")).toEqual(withoutChecked);
    expect(canonicalStatesFor("emphasis")).toEqual(CANONICAL_STATES);
    expect(canonicalStatesFor("border")).toEqual(CANONICAL_STATES);
  });

  it("parses every canonical state into atoms for each kind it applies to", () => {
    for (const state of CANONICAL_STATES) {
      const atoms = state.split("-");
      for (const kind of KINDS) {
        const allowed = atoms.every(
          (part) => part !== "checked" || kind === "emphasis" || kind === "border",
        );
        const result = parseState(state, kind, `tokens.${kind}.state`);
        if (allowed) {
          expect(result, `${kind} ${state}`).toEqual({ ok: true, states: atoms });
        } else {
          expect(result.ok, `${kind} ${state}`).toBe(false);
        }
      }
    }
  });

  it("types canonical atoms as the atomic states minus the active alias", () => {
    expectTypeOf<CanonicalState>().toEqualTypeOf<Exclude<AtomicState, "active">>();
  });
});

describe("alias normalization (§4)", () => {
  it.each(KINDS)("rewrites active to pressed for %s", (kind) => {
    expect(parseState("active", kind)).toEqual({ ok: true, states: ["pressed"] });
    expect(parseState("selected-active", kind)).toEqual({
      ok: true,
      states: ["selected", "pressed"],
    });
    expect(parseState("ACTIVE", kind)).toEqual({
      ok: false,
      issues: [
        {
          path: "state",
          message: 'Unknown state "ACTIVE". Did you mean "pressed"?',
          didYouMean: "pressed",
        },
      ],
    });
  });

  it("rewrites checked-active on emphasis and border only", () => {
    expect(parseState("checked-active", "emphasis")).toEqual({
      ok: true,
      states: ["checked", "pressed"],
    });
    expect(parseState("checked-active", "border")).toEqual({
      ok: true,
      states: ["checked", "pressed"],
    });
    expect(issues(parseState("checked-active", "surface"))[0]?.message).toContain(
      "does not apply to surface",
    );
  });

  it("normalizes the alias inside a token, including a renamed level", () => {
    expect(
      normalizeToken(
        { kind: "text", level: "secondary", state: "active" },
        { levels: { text: { secondary: 2, tertiary: 1 } }, path: "tokens.copy.hover" },
      ),
    ).toEqual({
      ok: true,
      token: { kind: "text", ordinal: 2, states: ["pressed"] },
    });
    expect(
      normalizeToken(
        { kind: "emphasis", level: "bold", state: "hover" },
        { levels: { emphasis: { primary: 3, $replace: true } } },
      ).ok,
    ).toBe(false);
  });
});

describe("compound order (§4)", () => {
  it("accepts persistent then temporary, and persistent then disabled", () => {
    expect(parseState("selected-hover", "surface")).toEqual({
      ok: true,
      states: ["selected", "hover"],
    });
    expect(parseState("selected-pressed", "text")).toEqual({
      ok: true,
      states: ["selected", "pressed"],
    });
    expect(parseState("selected-focus", "border")).toEqual({
      ok: true,
      states: ["selected", "focus"],
    });
    expect(parseState("selected-disabled", "emphasis")).toEqual({
      ok: true,
      states: ["selected", "disabled"],
    });
    expect(parseState("checked-hover", "emphasis")).toEqual({
      ok: true,
      states: ["checked", "hover"],
    });
    expect(parseState("checked-pressed", "border")).toEqual({
      ok: true,
      states: ["checked", "pressed"],
    });
    expect(parseState("checked-focus", "emphasis")).toEqual({
      ok: true,
      states: ["checked", "focus"],
    });
    expect(parseState("checked-disabled", "border")).toEqual({
      ok: true,
      states: ["checked", "disabled"],
    });
  });

  it("suggests the canonical order and rejects disabled-hover", () => {
    expect(parseState("hover-selected", "surface", "tokens.row.state")).toEqual({
      ok: false,
      issues: [
        {
          path: "tokens.row.state",
          message:
            'State "hover-selected" is out of order. Persistent states come first, then disabled, then a temporary state: "selected-hover".',
          didYouMean: "selected-hover",
        },
      ],
    });
    expect(parseState("disabled-checked", "emphasis")).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "checked-disabled" }],
    });
    expect(parseState("active-selected", "text")).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "selected-pressed" }],
    });
    expect(parseState("focus-selected", "border")).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "selected-focus" }],
    });

    for (const raw of ["disabled-hover", "hover-disabled", "selected-disabled-hover"]) {
      const found = issues(parseState(raw, "surface", "tokens.row.state"));
      expect(found).toHaveLength(1);
      expect(found[0]?.message).toContain(
        '"disabled" cannot combine with a temporary state',
      );
      expect(found[0]).not.toHaveProperty("didYouMean");
    }
  });

  it("rejects duplicates, two persistent states, and two temporary states", () => {
    expect(parseState("hover-hover", "surface")).toEqual({
      ok: false,
      issues: [
        {
          path: "state",
          message: 'State "hover-hover" repeats "hover". Did you mean "hover"?',
          didYouMean: "hover",
        },
      ],
    });
    expect(parseState("pressed-active", "text")).toEqual({
      ok: false,
      issues: [
        {
          path: "state",
          message:
            'State "pressed-active" repeats "pressed" ("active" is an alias of "pressed"). Did you mean "pressed"?',
          didYouMean: "pressed",
        },
      ],
    });
    expect(parseState("active-active", "emphasis")).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "pressed" }],
    });
    expect(issues(parseState("checked-checked", "surface"))[0]?.message).toBe(
      'State "checked-checked" repeats "checked". "checked" applies to emphasis, border, not surface.',
    );
    expect(issues(parseState("checked-checked", "surface"))[0]).not.toHaveProperty(
      "didYouMean",
    );
    expect(issues(parseState("selected-checked", "emphasis"))[0]?.message).toContain(
      'only one of "selected" or "checked"',
    );
    expect(issues(parseState("hover-pressed", "text"))[0]?.message).toContain(
      "only one temporary state",
    );
    expect(issues(parseState("selected-hover-focus", "surface"))[0]?.message).toContain(
      "only one temporary state",
    );
  });

  it("rejects checked on surface and text, including compounds", () => {
    for (const kind of ["surface", "text"] as const) {
      for (const state of ["checked", "checked-hover", "checked-disabled"] as const) {
        const path = `tokens.row.${state}.state`;
        const found = issues(parseState(state, kind, path));
        expect(found[0]?.path).toBe(path);
        expect(found[0]?.message).toContain(`does not apply to ${kind}`);
        expect(found[0]?.message).toContain('"checked" applies to emphasis, border');
        expect(found[0]).not.toHaveProperty("didYouMean");
      }
    }
  });
});

describe("unknown state names", () => {
  it("suggests a canonical spelling, including inside a compound", () => {
    expect(parseState("hovver", "surface", "tokens.row.hover.state")).toEqual({
      ok: false,
      issues: [
        {
          path: "tokens.row.hover.state",
          message: 'Unknown state "hovver". Did you mean "hover"?',
          didYouMean: "hover",
        },
      ],
    });
    expect(parseState("actve", "text")).toEqual({
      ok: false,
      issues: [
        {
          path: "state",
          message: 'Unknown state "actve". Did you mean "pressed"?',
          didYouMean: "pressed",
        },
      ],
    });
    expect(parseState("selected-hovver", "emphasis")).toEqual({
      ok: false,
      issues: [
        {
          path: "state",
          message: 'Unknown state "selected-hovver". Did you mean "selected-hover"?',
          didYouMean: "selected-hover",
        },
      ],
    });
    expect(parseState("Hover", "border")).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "hover" }],
    });
  });

  it("omits did-you-mean when the typo cannot become a legal state", () => {
    const unknown = issues(parseState("zzzz", "surface"))[0];
    expect(unknown?.message).toContain('Unknown state "zzzz"');
    expect(unknown?.message).toContain("Valid states:");
    expect(unknown?.message).toContain("selected-hover");
    expect(unknown?.message).not.toContain("checked");
    expect(unknown).not.toHaveProperty("didYouMean");

    const repairedIllegal = issues(parseState("disabled-hovver", "text"))[0];
    expect(repairedIllegal?.message).toContain(
      '"disabled" cannot combine with a temporary state',
    );
    expect(repairedIllegal).not.toHaveProperty("didYouMean");

    const wrongKind = issues(parseState("cheked", "surface"))[0];
    expect(wrongKind?.message).toContain("does not apply to surface");
    expect(wrongKind).not.toHaveProperty("didYouMean");
  });

  it("rejects empty parts, empty strings, and non-strings without throwing", () => {
    expect(() => parseState("disabled-hover", "surface")).not.toThrow();
    expect(() => parseState(null, "text")).not.toThrow();
    expect(issues(parseState("", "emphasis"))[0]?.message).toBe(
      'State "" is not a state.',
    );
    expect(issues(parseState("selected-", "surface"))[0]?.message).toBe(
      'State "selected-" has an empty part.',
    );
    expect(issues(parseState("-hover", "surface"))[0]?.message).toContain("empty part");
    expect(issues(parseState(1, "text"))[0]?.message).toBe("Expected a state string.");
    expect(parseState(undefined, "surface")).toEqual({ ok: true, states: [] });
  });

  it("keeps a rest token and a default level name on the normalized token", () => {
    expect(normalizeToken({ kind: "surface", level: "sunken" })).toEqual({
      ok: true,
      token: { kind: "surface", ordinal: 1, states: [] },
    });
    expect(
      normalizeToken({ kind: "text", level: "default", state: "selected-hover" }),
    ).toEqual({
      ok: true,
      token: { kind: "text", ordinal: 3, states: ["selected", "hover"] },
    });
  });
});
