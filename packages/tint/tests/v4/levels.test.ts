// @ts-nocheck — old level/state API, excluded on proto/numeric-scale
import { describe, expect, expectTypeOf, it } from "vitest";
import * as publicApi from "../../src/index.js";
import {
  emphasis,
  text,
  type AtomicState,
  type Kind,
  type LevelNames,
} from "../../src/v4/index.js";
import {
  compileLevelTable,
  compileLevels,
  DEFAULT_LEVEL_NAMES,
  DEFAULT_ORDINAL,
  KINDS,
  resolveLevel,
  suggestName,
  type LevelTable,
} from "../../src/v4/levels.js";
import { normalizeToken } from "../../src/v4/normalize.js";
import { ATOMIC_STATES, STATE_ALIASES } from "../../src/v4/states.js";

const STATE_HINTS = { names: ATOMIC_STATES, aliases: STATE_ALIASES };

function tableFor(
  kind: Kind,
  config?: Parameters<typeof compileLevelTable>[1],
): LevelTable {
  const result = compileLevelTable(kind, config);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("expected a level table");
  return result.table;
}

function issues<T extends { ok: boolean }>(
  result: T,
): T extends { ok: false; issues: infer I } ? I : never {
  expect(result.ok).toBe(false);
  if (result.ok || !("issues" in result)) throw new Error("expected issues");
  return result.issues as T extends { ok: false; issues: infer I } ? I : never;
}

describe("default level names (§3)", () => {
  it("matches the spec table, plus the universal default alias", () => {
    expect(DEFAULT_ORDINAL).toBe(3);
    expect(DEFAULT_LEVEL_NAMES).toEqual({
      surface: { sunken: 1, flat: 2, base: 3, raised: 4, floating: 5, default: 3 },
      text: { faint: 1, muted: 2, body: 3, strong: 4, max: 5, default: 3 },
      border: { hairline: 1, soft: 2, default: 3, firm: 4, heavy: 5 },
      emphasis: { quiet: 1, subtle: 2, default: 3, bold: 4, loud: 5 },
    });
  });

  it.each(KINDS)(
    "resolves every %s name, the default alias, and ordinals 1–5",
    (kind) => {
      const table = tableFor(kind);
      for (const [name, ordinal] of Object.entries(DEFAULT_LEVEL_NAMES[kind])) {
        expect(resolveLevel(table, name, "level")).toEqual({ ok: true, ordinal });
        const normalized = normalizeToken({ kind, level: name });
        expect(normalized).toEqual({
          ok: true,
          token: { kind, ordinal, states: [] },
        });
      }

      for (const ordinal of [1, 2, 3, 4, 5] as const) {
        expect(resolveLevel(table, ordinal, "level")).toEqual({ ok: true, ordinal });
        expect(resolveLevel(table, String(ordinal), "level")).toEqual({
          ok: true,
          ordinal,
        });
      }

      expect(resolveLevel(table, undefined, "level")).toEqual({ ok: true, ordinal: 3 });
      expect(
        resolveLevel(table, "default", "level").ok &&
          resolveLevel(table, "default", "level"),
      ).toEqual({
        ok: true,
        ordinal: 3,
      });
    },
  );

  it("treats default as ordinal 3 on surface and text, beside base and body", () => {
    expect(resolveLevel(tableFor("surface"), "default", "level")).toEqual({
      ok: true,
      ordinal: 3,
    });
    expect(resolveLevel(tableFor("surface"), "base", "level")).toEqual({
      ok: true,
      ordinal: 3,
    });
    expect(resolveLevel(tableFor("text"), "default", "level")).toEqual({
      ok: true,
      ordinal: 3,
    });
    expect(resolveLevel(tableFor("text"), "body", "level")).toEqual({
      ok: true,
      ordinal: 3,
    });
  });
});

describe("levels renaming (§2.5)", () => {
  it("merges aliases and keeps the built-in names", () => {
    const table = tableFor("text", { secondary: 2, tertiary: 1 });
    expect(table.replaced).toBe(false);
    expect(resolveLevel(table, "secondary", "level")).toEqual({ ok: true, ordinal: 2 });
    expect(resolveLevel(table, "tertiary", "level")).toEqual({ ok: true, ordinal: 1 });
    expect(resolveLevel(table, "muted", "level")).toEqual({ ok: true, ordinal: 2 });
    expect(resolveLevel(table, "faint", "level")).toEqual({ ok: true, ordinal: 1 });
    expect(resolveLevel(table, "body", "level")).toEqual({ ok: true, ordinal: 3 });
    expect(resolveLevel(table, "default", "level")).toEqual({ ok: true, ordinal: 3 });

    const normalized = normalizeToken(text("secondary"), {
      path: "tokens.copy.secondary",
      levels: { text: { secondary: 2, tertiary: 1 } },
    });
    expect(normalized).toEqual({
      ok: true,
      token: { kind: "text", ordinal: 2, states: [] },
    });
  });

  it("lets an alias retarget a built-in name without moving the omitted ordinal", () => {
    const table = tableFor("text", { body: 5, default: 4 });
    expect(resolveLevel(table, "body", "level")).toEqual({ ok: true, ordinal: 5 });
    expect(resolveLevel(table, "default", "level")).toEqual({ ok: true, ordinal: 4 });
    expect(resolveLevel(table, "strong", "level")).toEqual({ ok: true, ordinal: 4 });
    expect(resolveLevel(table, undefined, "level")).toEqual({ ok: true, ordinal: 3 });
    expect(
      normalizeToken({ kind: "text" }, { levels: { text: { default: 4 } } }),
    ).toEqual({
      ok: true,
      token: { kind: "text", ordinal: 3, states: [] },
    });
  });

  it("replaces names with $replace and still accepts ordinals 1–5", () => {
    const levels = {
      emphasis: { primary: 3, $replace: true },
    } as const satisfies LevelNames;
    const table = tableFor("emphasis", levels.emphasis);
    expect(table.replaced).toBe(true);
    expect(table.names).toEqual({ primary: 3 });
    expect(resolveLevel(table, "primary", "level")).toEqual({ ok: true, ordinal: 3 });
    expect(resolveLevel(table, 4, "level")).toEqual({ ok: true, ordinal: 4 });
    expect(resolveLevel(table, "5", "level")).toEqual({ ok: true, ordinal: 5 });
    expect(resolveLevel(table, undefined, "level")).toEqual({ ok: true, ordinal: 3 });

    expect(normalizeToken(emphasis("primary"), { levels })).toEqual({
      ok: true,
      token: { kind: "emphasis", ordinal: 3, states: [] },
    });
    expect(normalizeToken(emphasis(1), { levels })).toEqual({
      ok: true,
      token: { kind: "emphasis", ordinal: 1, states: [] },
    });

    const unknown = issues(
      resolveLevel(table, "bold", "tokens.action.level", STATE_HINTS),
    );
    expect(unknown).toEqual([
      {
        path: "tokens.action.level",
        message: 'Level "bold" is not an emphasis level. Valid levels: primary (or 1–5).',
      },
    ]);
    expect(unknown[0]).not.toHaveProperty("didYouMean");

    const droppedDefault = issues(resolveLevel(table, "default", "level", STATE_HINTS));
    expect(droppedDefault[0]?.message).toBe(
      'Level "default" is not an emphasis level. Valid levels: primary (or 1–5).',
    );
    expect(droppedDefault[0]).not.toHaveProperty("didYouMean");
  });

  it("treats $replace: false as a merge", () => {
    const table = tableFor("emphasis", { primary: 3, $replace: false });
    expect(table.replaced).toBe(false);
    expect(resolveLevel(table, "primary", "level")).toEqual({ ok: true, ordinal: 3 });
    expect(resolveLevel(table, "bold", "level")).toEqual({ ok: true, ordinal: 4 });
    expect(resolveLevel(table, "default", "level")).toEqual({ ok: true, ordinal: 3 });
  });

  it("accepts a $replace map with no names, so only numbers work", () => {
    const table = tableFor("surface", { $replace: true });
    expect(table.names).toEqual({});
    expect(resolveLevel(table, 2, "level")).toEqual({ ok: true, ordinal: 2 });
    expect(issues(resolveLevel(table, "sunken", "level"))[0]?.message).toBe(
      'Level "sunken" is not a surface level. Valid levels: 1–5.',
    );
  });

  it("does not mutate built-in names or the caller's config", () => {
    const before = { ...DEFAULT_LEVEL_NAMES.emphasis };
    const config = { primary: 3 as const, $replace: true as const };
    tableFor("emphasis", config);
    expect(DEFAULT_LEVEL_NAMES.emphasis).toEqual(before);
    expect(config).toEqual({ primary: 3, $replace: true });
  });
});

describe("unknown level names", () => {
  it("suggests a close level name and does not throw", () => {
    const table = tableFor("text");
    expect(() =>
      resolveLevel(table, "boddy", "tokens.text.strong.level", STATE_HINTS),
    ).not.toThrow();
    expect(resolveLevel(table, "boddy", "tokens.text.strong.level", STATE_HINTS)).toEqual(
      {
        ok: false,
        issues: [
          {
            path: "tokens.text.strong.level",
            message:
              'Level "boddy" is not a text level. Did you mean "body"? Valid levels: faint, muted, body, strong, max, default (or 1–5).',
            didYouMean: "body",
          },
        ],
      },
    );
    expect(resolveLevel(table, "Body", "level", STATE_HINTS)).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "body" }],
    });
    expect(
      resolveLevel(tableFor("surface"), "flaoting", "level", STATE_HINTS),
    ).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "floating", path: "level" }],
    });
  });

  it("suggests a state when the typo is not a level (§7.1)", () => {
    const table = tableFor("surface");
    expect(
      resolveLevel(table, "selcted", "tokens.row.selected.level", STATE_HINTS),
    ).toEqual({
      ok: false,
      issues: [
        {
          path: "tokens.row.selected.level",
          message:
            'Level "selcted" is not a surface level. Did you mean "selected"? That\'s a state, not a level. Valid levels: sunken, flat, base, raised, floating, default (or 1–5).',
          didYouMean: "selected",
        },
      ],
    });
    expect(resolveLevel(table, "active", "level", STATE_HINTS)).toMatchObject({
      ok: false,
      issues: [{ didYouMean: "pressed" }],
    });
    expect(resolveLevel(table, "selected", "level", STATE_HINTS).ok).toBe(false);
  });

  it("omits did-you-mean when nothing is close", () => {
    const issue = issues(
      resolveLevel(tableFor("text"), "zzzz", "tokens.text.level", STATE_HINTS),
    )[0];
    expect(issue).toEqual({
      path: "tokens.text.level",
      message:
        'Level "zzzz" is not a text level. Valid levels: faint, muted, body, strong, max, default (or 1–5).',
    });
    expect(issue).not.toHaveProperty("didYouMean");
    expect(suggestName("byze", Object.keys(DEFAULT_LEVEL_NAMES.surface))).toBeUndefined();
    expect(suggestName("baze", Object.keys(DEFAULT_LEVEL_NAMES.surface))).toBe("base");
    expect(suggestName("luod", Object.keys(DEFAULT_LEVEL_NAMES.emphasis))).toBe("loud");
  });

  it("rejects ordinals outside 1–5, including numeric strings other than those five", () => {
    const table = tableFor("border");
    expect(issues(resolveLevel(table, 0, "level"))[0]?.message).toContain(
      "Level 0 is not an ordinal 1–5",
    );
    expect(issues(resolveLevel(table, 6, "level"))[0]?.message).toContain(
      "Level 6 is not an ordinal 1–5",
    );
    expect(issues(resolveLevel(table, 1.5, "level"))[0]?.message).toContain(
      "Level 1.5 is not an ordinal 1–5",
    );
    expect(issues(resolveLevel(table, "6", "level"))[0]?.message).toContain(
      'Level "6" is not an ordinal 1–5',
    );
    expect(issues(resolveLevel(table, true, "level"))[0]?.message).toContain(
      "Expected a level name or an ordinal 1–5",
    );
    expect(issues(resolveLevel(table, null, "level"))[0]).not.toHaveProperty(
      "didYouMean",
    );
  });
});

describe("levels config issues", () => {
  it("reports a bad alias target, a bad $replace, and a shadowed ordinal", () => {
    const result = compileLevelTable("text", {
      secondary: 6 as unknown as 2,
      tertiary: true as unknown as 1,
      $replace: "yes" as unknown as boolean,
      "1": 2,
      $replaced: true,
    });
    const found = issues(result);
    const at = (path: string) => found.find((issue) => issue.path === path);
    expect(found).toHaveLength(5);
    expect(at("levels.text.$replace")?.message).toBe("Expected a boolean.");
    expect(at("levels.text.secondary")?.message).toBe(
      'Alias "secondary" must be an ordinal 1–5.',
    );
    expect(at("levels.text.tertiary")?.message).toBe(
      'Alias "tertiary" must be an ordinal 1–5.',
    );
    expect(at("levels.text.1")?.message).toContain("shadows an ordinal");
    expect(at("levels.text.$replaced")?.message).toContain(
      'Unknown levels option "$replaced"',
    );
  });

  it("rejects an unknown kind and a non-object map", () => {
    const kind = issues(compileLevels({ borders: { card: 4 } } as never));
    expect(kind[0]).toMatchObject({
      path: "levels.borders",
      didYouMean: "border",
    });
    expect(issues(compileLevels([] as never))[0]).toEqual({
      path: "levels",
      message: "Expected level names.",
    });
    expect(issues(compileLevelTable("surface", [] as never))[0]?.message).toBe(
      "Expected level names for surface.",
    );
  });

  it("compiles the spec example for every kind", () => {
    const compiled = compileLevels({
      text: { secondary: 2, tertiary: 1 },
      emphasis: { primary: 3, $replace: true },
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.tables.text.names.secondary).toBe(2);
    expect(compiled.tables.text.names.body).toBe(3);
    expect(compiled.tables.emphasis.names).toEqual({ primary: 3 });
    expect(compiled.tables.surface.names.sunken).toBe(1);
    expect(compiled.tables.border.names.default).toBe(3);
  });
});

describe("normalized token (§6.1)", () => {
  it("returns kind, ordinal, and states, and copies the other options", () => {
    const token = text({
      state: "disabled",
      on: "action",
      contrast: "+2",
      direction: "darker",
      chroma: 0,
      hue: "+12",
      lc: 70,
      ratio: 4.5,
      step: 0,
      nudge: false,
    });
    const result = normalizeToken(token, { path: "tokens.text.disabled" });
    expect(result).toEqual({
      ok: true,
      token: {
        kind: "text",
        ordinal: 3,
        states: ["disabled"],
        on: "action",
        contrast: "+2",
        direction: "darker",
        chroma: 0,
        hue: "+12",
        lc: 70,
        ratio: 4.5,
        step: 0,
        nudge: false,
      },
    });
    if (result.ok) {
      expect(result.token).not.toHaveProperty("level");
      expect(result.token).not.toHaveProperty("state");
      expect(Object.getPrototypeOf(result.token)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(result.token))).toEqual(result.token);
    }
    expect(token).not.toHaveProperty("ordinal");
  });

  it("normalizes a compound and an active alias while resolving a renamed level", () => {
    expect(
      normalizeToken(
        { kind: "emphasis", level: "primary", state: "selected-active" },
        {
          levels: { emphasis: { primary: 4, $replace: true } },
          path: "tokens.action.DEFAULT",
        },
      ),
    ).toEqual({
      ok: true,
      token: { kind: "emphasis", ordinal: 4, states: ["selected", "pressed"] },
    });
  });

  it("returns every problem and does not throw", () => {
    expect(() =>
      normalizeToken(
        { kind: "surface", level: "flaoting", state: "disabled-hover", nope: true },
        { path: "tokens.row" },
      ),
    ).not.toThrow();

    const result = normalizeToken(
      { kind: "surface", level: "flaoting", state: "disabled-hover", nope: true },
      { path: "tokens.row" },
    );
    const found = issues(result);
    expect(found.map((issue) => issue.path)).toEqual([
      "tokens.row.nope",
      "tokens.row.level",
      "tokens.row.state",
    ]);
    expect(found[1]).toMatchObject({ didYouMean: "floating" });
    expect(found[2]?.message).toContain(
      '"disabled" cannot combine with a temporary state',
    );
    expect(found[2]).not.toHaveProperty("didYouMean");
  });

  it("rejects a bad kind, a non-object, and a mistyped option", () => {
    expect(issues(normalizeToken(null, { path: "tokens.row" }))).toEqual([
      { path: "tokens.row", message: "Expected a token object." },
    ]);
    expect(
      issues(normalizeToken({ kind: "textt" }, { path: "tokens.copy" }))[0],
    ).toMatchObject({
      path: "tokens.copy.kind",
      didYouMean: "text",
    });
    expect(issues(normalizeToken({ kind: "text", nudge: "no" }))[0]?.path).toBe("nudge");
    expect(issues(normalizeToken({ kind: "text", on: 1 }))[0]?.message).toBe(
      "Expected a string.",
    );
  });

  it("is not on the v3 public entry", () => {
    expect(publicApi).not.toHaveProperty("normalizeToken");
    expect(publicApi).not.toHaveProperty("CANONICAL_STATES");
    expect(publicApi).not.toHaveProperty("compileLevels");
  });

  it("types the normalized ordinal and states", () => {
    expectTypeOf<AtomicState>().toMatchTypeOf<AtomicState>();
    const result = normalizeToken(emphasis("loud", { nudge: false }));
    if (!result.ok) throw new Error("expected a token");
    expectTypeOf(result.token.ordinal).toEqualTypeOf<1 | 2 | 3 | 4 | 5>();
    expectTypeOf(result.token.states).toEqualTypeOf<
      Array<"hover" | "pressed" | "focus" | "selected" | "checked" | "disabled">
    >();
    expect(result.token).toEqual({
      kind: "emphasis",
      ordinal: 5,
      states: [],
      nudge: false,
    });
  });
});
