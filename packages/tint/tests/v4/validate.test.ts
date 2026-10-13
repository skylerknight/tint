import { describe, expect, it } from "vitest";
import * as publicApi from "../../src/index.js";
import { ConfigError as V3ConfigError } from "../../src/config/validate.js";
import { border, emphasis, surface, text } from "../../src/v4/kinds.js";
import { compileLevels, resolveLevel } from "../../src/v4/levels.js";
import { normalizeToken } from "../../src/v4/normalize.js";
import { ATOMIC_STATES, STATE_ALIASES, parseState } from "../../src/v4/states.js";
import {
  ConfigError,
  formatConfigIssues,
  type ConfigIssue,
  assertConfig,
  validateConfig,
} from "../../src/v4/index.js";

const STATE_HINTS = { names: ATOMIC_STATES, aliases: STATE_ALIASES };

function base(): Record<string, unknown> {
  return {
    palette: { neutral: "#71717a" },
    tokens: {
      surface: { DEFAULT: { kind: "surface" } },
      text: { DEFAULT: { kind: "text", on: "surface" } },
    },
  };
}

function issuesOf(input: unknown): ConfigIssue[] {
  const result = validateConfig(input);
  return result.ok ? [] : result.issues;
}

function at(issues: ConfigIssue[], path: string): ConfigIssue {
  const found = issues.filter((issue) => issue.path === path);
  expect(found, JSON.stringify(issues, null, 2)).toHaveLength(1);
  const only = found[0];
  if (only === undefined) throw new Error(`missing issue at ${path}`);
  return only;
}

function specExample(): Record<string, unknown> {
  return {
    contrast: { algorithm: "apca", level: "standard" },
    palette: {
      neutral: "#71717a",
      brand: { color: "#7c3aed", exact: true },
      danger: "#dc2626",
      warning: { color: "#d97706", tune: { action: emphasis("bold") } },
    },
    themes: {
      light: { mode: "light", selector: ".light", media: true },
      dark: {
        mode: "dark",
        selector: ".dark",
        media: true,
        palette: { brand: "#a78bfa" },
      },
      "light-hc": {
        mode: "light",
        extends: "light",
        media: "(prefers-contrast: more)",
        contrast: { level: "more" },
      },
    },
    tokens: {
      surface: {
        sunken: surface("sunken"),
        DEFAULT: surface(),
        raised: surface("raised"),
        floating: surface("floating"),
      },
      action: {
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        disabled: emphasis({ state: "disabled" }),
        on: text({ on: "action" }),
        "on-disabled": text({ state: "disabled", on: "action" }),
      },
      soft: {
        DEFAULT: emphasis("subtle"),
        hover: emphasis("subtle", { state: "hover" }),
        pressed: emphasis("subtle", { state: "pressed" }),
        on: text({ on: "soft" }),
      },
      border: {
        hairline: border("hairline"),
        DEFAULT: border(),
        firm: border("firm"),
        focus: border("heavy", { on: "action" }),
      },
      text: {
        DEFAULT: text(),
        strong: text("strong"),
        muted: text("muted"),
        faint: text("faint"),
        disabled: text({ state: "disabled" }),
        link: text({ chroma: 1.2 }),
      },
      row: {
        DEFAULT: surface(),
        hover: surface({ state: "hover" }),
        selected: surface({ state: "selected" }),
        "selected-hover": surface({ state: "selected-hover" }),
        on: text({ on: "row" }),
      },
    },
  };
}

describe("valid configs", () => {
  it("accepts a minimal config and returns the same object", () => {
    const input = base();
    const result = validateConfig(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config).toBe(input);
  });

  it("accepts the §8 example", () => {
    expect(issuesOf(specExample())).toEqual([]);
  });

  it("accepts omitted themes, string palette colors, and expert values in range", () => {
    expect(
      issuesOf({
        contrast: { algorithm: "wcag2", level: "max" },
        palette: { brand: "#4f46e5" },
        preset: "radix",
        output: {
          path: "./out",
          formats: ["css", "tailwind", "dtcg", "flat"],
          format: "hex",
          prefix: "tint",
        },
        tokens: {
          surface: { DEFAULT: { kind: "surface", step: 0 } },
          action: {
            DEFAULT: {
              kind: "emphasis",
              chroma: 2,
              ratio: 4.5,
              hue: "+12",
              nudge: false,
            },
          },
        },
      }),
    ).toEqual([]);
  });

  it("accepts chroma and step on the inclusive bounds", () => {
    expect(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          surface: {
            DEFAULT: { kind: "surface", chroma: 0, step: -12 },
            edge: { kind: "surface", chroma: 2, step: 12 },
          },
        },
      }),
    ).toEqual([]);
  });

  it("accepts lc 0 and 108 under apca, and ratio 1 and 21 under wcag2", () => {
    expect(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          text: { DEFAULT: { kind: "text", lc: 0 }, max: { kind: "text", lc: 108 } },
        },
      }),
    ).toEqual([]);
    expect(
      issuesOf({
        contrast: { algorithm: "wcag2" },
        palette: { neutral: "#000" },
        tokens: {
          text: { DEFAULT: { kind: "text", ratio: 1 }, max: { kind: "text", ratio: 21 } },
        },
      }),
    ).toEqual([]);
  });

  it("allows DEFAULT and a palette color named text", () => {
    expect(
      issuesOf({
        palette: { text: "#111" },
        tokens: { text: { DEFAULT: { kind: "text" }, strong: { kind: "text" } } },
      }),
    ).toEqual([]);
  });

  it("does not throw on a broken config", () => {
    expect(() =>
      validateConfig({ tokens: { row: { selected: { level: "selcted" } } } }),
    ).not.toThrow();
  });
});

describe("§7.1 repair format", () => {
  it('prints the spec message for level "selcted"', () => {
    const input = {
      palette: { neutral: "#71717a" },
      tokens: { row: { selected: { kind: "surface", level: "selcted" } } },
    };
    const result = validateConfig(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    const found = result.issues[0];
    expect(found).toEqual({
      path: "tokens.row.selected",
      message: 'level "selcted" is not a surface level.',
      expected: "Valid levels: sunken, flat, base, raised, floating (or 1\u20135)",
      hint: "Did you mean \"selected\"? That's a state: surface({ state: 'selected' })",
      didYouMean: "selected",
      fix: {
        path: "tokens.row.selected",
        replace: { kind: "surface", state: "selected" },
      },
    });
    const resolved = resolveLevel(
      {
        kind: "surface",
        replaced: false,
        names: {
          sunken: 1,
          flat: 2,
          base: 3,
          raised: 4,
          floating: 5,
          default: 3,
        },
      },
      "selcted",
      "tokens.row.selected.level",
      STATE_HINTS,
    );
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(found?.didYouMean).toBe(resolved.issues[0]?.didYouMean);

    const pretty = [
      '✖ tokens.row.selected: level "selcted" is not a surface level.',
      "    Did you mean \"selected\"? That's a state: surface({ state: 'selected' })",
      "    Valid levels: sunken, flat, base, raised, floating (or 1\u20135)",
      '    fix: { "path": "tokens.row.selected", "replace": { "kind": "surface", "state": "selected" } }',
    ].join("\n");
    expect(formatConfigIssues(result.issues)).toBe(pretty);
    expect(new ConfigError(result.issues).message).toBe(pretty);
  });

  it("suggests a level name and fixes the level field", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { card: { raised: { kind: "surface", level: "flaoting" } } },
      }),
      "tokens.card.raised.level",
    );
    expect(found.didYouMean).toBe("floating");
    expect(found.hint).toBe('Did you mean "floating"?');
    expect(found.fix).toEqual({ path: "tokens.card.raised.level", replace: "floating" });
    expect(found.message).toBe('Level "flaoting" is not a surface level.');
    expect(found.expected).toContain("floating");
  });
});

describe("on", () => {
  it("rejects an array and points at the hardest backdrop", () => {
    const input = {
      palette: { neutral: "#000" },
      tokens: { text: { DEFAULT: { kind: "text", on: ["surface", "row"] } } },
    };
    const before = JSON.parse(JSON.stringify(input)) as unknown;
    const found = at(issuesOf(input), "tokens.text.DEFAULT.on");
    expect(found.message).toContain("single string");
    expect(found.hint).toContain("Point at the hardest backdrop");
    expect(found.expected).toContain("group.token");
    expect(input).toEqual(before);
  });

  it("suggests an unknown group from one transposition", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          action: { DEFAULT: { kind: "emphasis" } },
          text: { DEFAULT: { kind: "text", on: "actoin" } },
        },
      }),
      "tokens.text.DEFAULT.on",
    );
    expect(found.message).toBe('Unknown backdrop "actoin".');
    expect(found.didYouMean).toBe("action");
    expect(found.fix).toEqual({ path: "tokens.text.DEFAULT.on", replace: "action" });
  });

  it("suggests an unknown token inside a known group", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          surface: {
            DEFAULT: { kind: "surface" },
            hover: { kind: "surface", state: "hover" },
          },
          text: { DEFAULT: { kind: "text", on: "surface.hovr" } },
        },
      }),
      "tokens.text.DEFAULT.on",
    );
    expect(found.didYouMean).toBe("surface.hover");
    expect(found.fix).toEqual({
      path: "tokens.text.DEFAULT.on",
      replace: "surface.hover",
    });
  });

  it("suggests a case-only group mismatch", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          action: { DEFAULT: { kind: "emphasis" } },
          text: { DEFAULT: { kind: "text", on: "Action" } },
        },
      }),
      "tokens.text.DEFAULT.on",
    );
    expect(found.didYouMean).toBe("action");
  });

  it("rejects a group target that has no DEFAULT token", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          row: { hover: { kind: "surface", state: "hover" } },
          text: { DEFAULT: { kind: "text", on: "row" } },
        },
      }),
      "tokens.text.DEFAULT.on",
    );
    expect(found.message).toContain("row.DEFAULT");
    expect(found.hint).toContain("DEFAULT");
  });

  it("rejects a three-part on path", () => {
    const found = at(
      issuesOf({
        ...base(),
        tokens: {
          surface: { DEFAULT: { kind: "surface" } },
          text: { DEFAULT: { kind: "text", on: "surface.DEFAULT.extra" } },
        },
      }),
      "tokens.text.DEFAULT.on",
    );
    expect(found.message).toContain("group.token");
  });

  it("rejects a self-reference through the group and through the token path", () => {
    const viaGroup = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { a: { DEFAULT: { kind: "surface", on: "a" } } },
      }),
      "tokens.a.DEFAULT.on",
    );
    expect(viaGroup.message).toContain('Token "a.DEFAULT"');
    const viaPath = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { a: { DEFAULT: { kind: "surface", on: "a.DEFAULT" } } },
      }),
      "tokens.a.DEFAULT.on",
    );
    expect(viaPath.message).toContain("cannot use itself");
  });

  it("reports a backdrop cycle", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: {
          a: { DEFAULT: { kind: "surface", on: "b" } },
          b: { DEFAULT: { kind: "surface", on: "a" } },
        },
      }),
      "tokens.a.DEFAULT.on",
    );
    expect(found.message).toBe("Backdrop cycle: a.DEFAULT → b.DEFAULT → a.DEFAULT.");
  });
});

describe("expert values", () => {
  it("rejects ratio under the default apca algorithm", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { DEFAULT: { kind: "text", ratio: 4.5 } } },
      }),
      "tokens.text.DEFAULT.ratio",
    );
    expect(found.message).toContain('only valid when contrast.algorithm is "wcag2"');
    expect(found.hint).toContain('defaults to "apca"');
  });

  it("rejects lc under wcag2 and keeps an in-range ratio", () => {
    const issues = issuesOf({
      contrast: { algorithm: "wcag2" },
      palette: { neutral: "#000" },
      tokens: { text: { DEFAULT: { kind: "text", lc: 60, ratio: 4.5 } } },
    });
    expect(issues.map((issue) => issue.path)).toEqual(["tokens.text.DEFAULT.lc"]);
    expect(issues[0]?.hint).toContain("wcag2");
    expect(issues[0]?.hint).toContain("ratio");
  });

  it("rejects lc above 108 and ratio above 21", () => {
    expect(
      at(
        issuesOf({
          palette: { neutral: "#000" },
          tokens: { text: { DEFAULT: { kind: "text", lc: 109 } } },
        }),
        "tokens.text.DEFAULT.lc",
      ).message,
    ).toContain("outside 0..108");
    expect(
      at(
        issuesOf({
          contrast: { algorithm: "wcag2" },
          palette: { neutral: "#000" },
          tokens: { text: { DEFAULT: { kind: "text", ratio: 22 } } },
        }),
        "tokens.text.DEFAULT.ratio",
      ).message,
    ).toContain("outside 1..21");
  });

  it("rejects chroma and step outside their ranges", () => {
    const issues = issuesOf({
      palette: { neutral: "#000" },
      tokens: { surface: { DEFAULT: { kind: "surface", chroma: 2.5, step: 13 } } },
    });
    expect(at(issues, "tokens.surface.DEFAULT.chroma").message).toBe(
      "chroma 2.5 is outside 0..2.",
    );
    expect(at(issues, "tokens.surface.DEFAULT.step").message).toBe(
      "step 13 is outside -12..12.",
    );
    expect(
      at(
        issuesOf({
          palette: { neutral: "#000" },
          tokens: { surface: { DEFAULT: { kind: "surface", chroma: -0.1 } } },
        }),
        "tokens.surface.DEFAULT.chroma",
      ).expected,
    ).toBe("a number from 0 to 2");
  });

  it("does not mark a numeric lc on a v4 token as a v3 key", () => {
    const issues = issuesOf({
      palette: { neutral: "#000" },
      tokens: { text: { DEFAULT: { kind: "text", lc: 70 } } },
    });
    expect(issues).toEqual([]);
  });
});

describe("names and Tailwind collisions", () => {
  it("rejects palette, group, and token names that fail the regex", () => {
    const issues = issuesOf({
      palette: { "1brand": "#000" },
      tokens: { "9group": { "bad name": { kind: "surface" } } },
    });
    expect(at(issues, "palette.1brand").message).toContain("/^[a-zA-Z][a-zA-Z0-9_-]*$/");
    expect(at(issues, "tokens.9group").message).toContain("Group name");
    expect(at(issues, "tokens.9group.bad name").message).toContain("Token name");
  });

  it("reports name-conflict for text.lg and border.x", () => {
    const issues = issuesOf({
      palette: { neutral: "#000" },
      tokens: {
        text: { lg: { kind: "text" }, strong: { kind: "text" } },
        border: { x: { kind: "border" }, firm: { kind: "border" } },
      },
    });
    const lg = at(issues, "tokens.text.lg");
    expect(lg.code).toBe("name-conflict");
    expect(lg.message).toContain("text-lg");
    const side = at(issues, "tokens.border.x");
    expect(side.code).toBe("name-conflict");
    expect(side.message).toContain("border-x");
    expect(issues.some((issue) => issue.path === "tokens.text.strong")).toBe(false);
    expect(issues.some((issue) => issue.path === "tokens.border.firm")).toBe(false);
  });

  it("matches Tailwind keywords case-insensitively", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { LG: { kind: "text" } } },
      }),
      "tokens.text.LG",
    );
    expect(found.code).toBe("name-conflict");
    expect(found.message).toContain("text-lg");
  });
});

describe("v3 configs", () => {
  it("points colors, lc, ls, and $on at the migration table", () => {
    const issues = issuesOf({
      colors: { base: "#fff" },
      palette: { neutral: "#fff" },
      tokens: {
        text: {
          $on: "surface",
          body: { lc: "body" },
          soft: { ls: 1 },
        },
      },
    });
    for (const path of [
      "colors",
      "tokens.text.$on",
      "tokens.text.body.lc",
      "tokens.text.soft.ls",
    ]) {
      const found = at(issues, path);
      expect(found.code).toBe("v3-config");
      expect(found.hint).toContain("migration table");
      expect(found.hint).toContain("docs/v4-spec.md §10");
    }
    expect(at(issues, "colors").expected).toBe("palette");
    expect(at(issues, "tokens.text.$on").expected).toBe("on");
  });

  it("rejects a v3 theme array", () => {
    const found = issuesOf([{ name: "light", mode: "light", colors: {}, tokens: {} }])[0];
    expect(found?.code).toBe("v3-config");
    expect(found?.message).toContain("array");
    expect(found?.hint).toContain("§10");
  });

  it("treats a string lc on a v4 token as a v3 shortcut", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { DEFAULT: { kind: "text", lc: "heading" } } },
      }),
      "tokens.text.DEFAULT.lc",
    );
    expect(found.code).toBe("v3-config");
    expect(found.hint).toContain("migration table");
  });
});

describe("one pass", () => {
  it("reports a level, an array on, a chroma range, and an unknown key together", () => {
    const issues = issuesOf({
      palette: { neutral: "#000" },
      extra: true,
      tokens: {
        row: {
          selected: { kind: "surface", level: "selcted", on: ["a", "b"], chroma: 9 },
        },
      },
    });
    expect(issues.map((issue) => issue.path).sort()).toEqual([
      "extra",
      "tokens.row.selected",
      "tokens.row.selected.chroma",
      "tokens.row.selected.on",
    ]);
    expect(
      issues.every((issue) => typeof issue.path === "string" && issue.message.length > 0),
    ).toBe(true);
    expect(at(issues, "tokens.row.selected").didYouMean).toBe("selected");
    expect(at(issues, "tokens.row.selected.on").hint).toContain(
      "Point at the hardest backdrop",
    );
    expect(at(issues, "extra").didYouMean).toBeUndefined();
  });

  it("gives every issue a path and a message on a kitchen-sink config", () => {
    const issues = issuesOf({
      colors: { base: "#fff" },
      palete: {},
      contrast: { algorith: "apca", level: "standrad" },
      palette: {},
      themes: { dark: { selector: 1 } },
      tokens: {
        text: {
          lg: { kind: "textt", on: "missing", chroma: "nope" },
          $on: "surface",
        },
      },
    });
    expect(issues.length).toBeGreaterThanOrEqual(5);
    for (const issue of issues) {
      expect(typeof issue.path).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });
});

describe("reuses level and state normalization", () => {
  it("keeps the parseState message for an illegal combination", () => {
    const parsed = parseState("disabled-hover", "surface", "tokens.row.hover.state");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { row: { hover: { kind: "surface", state: "disabled-hover" } } },
      }),
      "tokens.row.hover.state",
    );
    expect(found.message).toBe(parsed.issues[0]?.message);
    expect(found.didYouMean).toBeUndefined();
  });

  it("keeps the parseState suggestion and adds a fix", () => {
    const parsed = parseState("hovver", "text", "tokens.text.hover.state");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { hover: { kind: "text", state: "hovver" } } },
      }),
      "tokens.text.hover.state",
    );
    expect(found.message).toBe(parsed.issues[0]?.message);
    expect(found.didYouMean).toBe("hover");
    expect(found.fix).toEqual({ path: "tokens.text.hover.state", replace: "hover" });
  });

  it("reuses an out-of-order state repair", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { row: { hover: { kind: "surface", state: "hover-selected" } } },
      }),
      "tokens.row.hover.state",
    );
    expect(found.didYouMean).toBe("selected-hover");
    expect(found.fix).toEqual({
      path: "tokens.row.hover.state",
      replace: "selected-hover",
    });
    expect(found.message).toContain("selected-hover");
  });

  it("reuses compileLevels for an unknown kind and a bad alias", () => {
    const kind = compileLevels({ surfce: { card: 4 } } as never);
    expect(kind.ok).toBe(false);
    if (kind.ok) return;
    const found = at(
      issuesOf({
        ...base(),
        levels: { surfce: { card: 4 } },
      }),
      "levels.surfce",
    );
    expect(found.message).toBe(kind.issues[0]?.message);
    expect(found.didYouMean).toBe("surface");

    const alias = compileLevels({ text: { secondary: 9 } } as never);
    expect(alias.ok).toBe(false);
    if (alias.ok) return;
    const aliasIssue = alias.issues.find(
      (issue) => issue.path === "levels.text.secondary",
    );
    const validated = at(
      issuesOf({
        ...base(),
        levels: { text: { secondary: 9 } },
      }),
      "levels.text.secondary",
    );
    expect(validated.message).toBe(aliasIssue?.message);
  });

  it("reuses the normalize message for a bad hue", () => {
    const normalized = normalizeToken(
      { kind: "text", hue: "nope" },
      { path: "tokens.text.DEFAULT" },
    );
    expect(normalized.ok).toBe(false);
    if (normalized.ok) return;
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { DEFAULT: { kind: "text", hue: "nope" } } },
      }),
      "tokens.text.DEFAULT.hue",
    );
    expect(found.message).toBe(normalized.issues[0]?.message);
  });

  it("suggests a mistyped token field", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { DEFAULT: { kind: "text", direciton: "lighter" } } },
      }),
      "tokens.text.DEFAULT.direciton",
    );
    expect(found.message).toContain("direciton");
    expect(found.didYouMean).toBe("direction");
    expect(found.expected).toContain("nudge");
  });

  it("fixes a mistyped kind", () => {
    const found = at(
      issuesOf({
        palette: { neutral: "#000" },
        tokens: { text: { DEFAULT: { kind: "textt" } } },
      }),
      "tokens.text.DEFAULT.kind",
    );
    expect(found.didYouMean).toBe("text");
    expect(found.fix).toEqual({ path: "tokens.text.DEFAULT.kind", replace: "text" });
  });
});

describe("the rest of the config", () => {
  it("suggests a mistyped top-level key and a contrast enum", () => {
    const key = at(issuesOf({ ...base(), palete: {} }), "palete");
    expect(key.didYouMean).toBe("palette");
    expect(key.hint).toContain("palette");
    const algorithm = at(
      issuesOf({
        ...base(),
        contrast: { algorithm: "apcaa" },
      }),
      "contrast.algorithm",
    );
    expect(algorithm.didYouMean).toBe("apca");
    expect(algorithm.fix).toEqual({ path: "contrast.algorithm", replace: "apca" });
    const level = at(
      issuesOf({
        ...base(),
        contrast: { level: "standrad" },
      }),
      "contrast.level",
    );
    expect(level.didYouMean).toBe("standard");
  });

  it("accepts a CSS-identifier prefix and rejects one that is not", () => {
    expect(issuesOf({ ...base(), output: { prefix: "tint" } })).toEqual([]);
    expect(issuesOf({ ...base(), output: { prefix: "_brand" } })).toEqual([]);
    expect(issuesOf({ ...base(), output: { prefix: "-ink" } })).toEqual([]);
    const digit = at(
      issuesOf({ ...base(), output: { prefix: "9tint" } }),
      "output.prefix",
    );
    expect(digit.message).toContain("CSS identifier");
    const spaced = at(
      issuesOf({ ...base(), output: { prefix: "tint ink" } }),
      "output.prefix",
    );
    expect(spaced.expected).toContain("CSS identifier");
    const empty = at(issuesOf({ ...base(), output: { prefix: "" } }), "output.prefix");
    expect(empty.message).toContain("CSS identifier");
    const number = at(issuesOf({ ...base(), output: { prefix: 1 } }), "output.prefix");
    expect(number.message).toBe("output.prefix must be a CSS identifier.");
  });

  it("rejects an unknown preset and a v3 json format", () => {
    const preset = at(issuesOf({ ...base(), preset: "materiall" }), "preset");
    expect(preset.didYouMean).toBe("material");
    const format = at(
      issuesOf({
        ...base(),
        output: { formats: ["css", "json"] },
      }),
      "output.formats.1",
    );
    expect(format.code).toBe("v3-config");
    expect(format.hint).toContain("dtcg");
    expect(format.hint).toContain("flat");
  });

  it("requires theme mode unless extends is set, and suggests a theme", () => {
    const missing = at(
      issuesOf({
        ...base(),
        themes: { dark: { selector: ".dark" } },
      }),
      "themes.dark.mode",
    );
    expect(missing.message).toContain("missing mode");
    const extended = issuesOf({
      ...base(),
      themes: {
        light: { mode: "light" },
        dark: { extends: "ligh" },
      },
    });
    expect(at(extended, "themes.dark.extends").didYouMean).toBe("light");
    expect(
      issuesOf({
        ...base(),
        themes: { dark: { extends: "light" }, light: { mode: "light" } },
      }).some((issue) => issue.path === "themes.dark.mode"),
    ).toBe(false);
  });

  it("rejects a theme extends cycle and a theme algorithm override", () => {
    const cycle = at(
      issuesOf({
        ...base(),
        themes: {
          light: { extends: "dark" },
          dark: { extends: "light" },
        },
      }),
      "themes.light.extends",
    );
    expect(cycle.message).toBe("Theme extends cycle: light → dark → light.");
    const algorithm = at(
      issuesOf({
        ...base(),
        themes: { dark: { mode: "dark", contrast: { algorithm: "wcag2" } } },
      }),
      "themes.dark.contrast.algorithm",
    );
    expect(algorithm.message).toContain("cannot override contrast.algorithm");
  });

  it("rejects a theme that extends itself and a bad mode", () => {
    const self = at(
      issuesOf({
        ...base(),
        themes: { light: { extends: "light" } },
      }),
      "themes.light.extends",
    );
    expect(self.message).toContain("cannot extend itself");
    const mode = at(
      issuesOf({
        ...base(),
        themes: { dark: { mode: "Dark" } },
      }),
      "themes.dark.mode",
    );
    expect(mode.didYouMean).toBe("dark");
  });

  it("checks state step config", () => {
    const step = at(
      issuesOf({
        ...base(),
        states: { emphasis: { hover: 1, step: 0.02 } },
      }),
      "states.emphasis.step",
    );
    expect(step.message).toContain("states.surface");
    const typo = at(
      issuesOf({
        ...base(),
        states: { text: { hovver: 1 } },
      }),
      "states.text.hovver",
    );
    expect(typo.didYouMean).toBe("hover");
    const size = at(
      issuesOf({
        ...base(),
        states: { surface: { step: { light: 0 } } },
      }),
      "states.surface.step.light",
    );
    expect(size.message).toContain("greater than 0");
    const count = at(
      issuesOf({
        ...base(),
        states: { surface: { step: 0.02 } },
      }),
      "states.surface.step",
    );
    expect(count.message).toContain("not a count");
    const checked = at(
      issuesOf({
        ...base(),
        states: { surface: { checked: 1 } },
      }),
      "states.surface.checked",
    );
    expect(checked.message).toContain("does not apply to surface");
    expect(
      issuesOf({
        ...base(),
        states: {
          emphasis: { hover: 1, pressed: 3 },
          surface: { step: { light: 0.02, dark: 0.035 } },
        },
      }),
    ).toEqual([]);
  });

  it("rejects a second default palette color and an empty color", () => {
    const issues = issuesOf({
      palette: {
        neutral: { color: "#000", default: true },
        brand: { color: "  ", default: true },
      },
      tokens: { surface: { DEFAULT: { kind: "surface" } } },
    });
    expect(at(issues, "palette.brand.default").message).toContain("Only one");
    expect(at(issues, "palette.brand.color").message).toContain("CSS color");
  });

  it("checks exact and tune against the token index", () => {
    const exact = at(
      issuesOf({
        palette: { brand: { color: "#000", exact: true } },
        tokens: { surface: { DEFAULT: { kind: "surface" } } },
      }),
      "palette.brand.exact",
    );
    expect(exact.message).toContain("emphasis");
    const path = at(
      issuesOf({
        palette: { brand: { color: "#000", exact: "action" } },
        tokens: { action: { DEFAULT: { kind: "emphasis" } } },
      }),
      "palette.brand.exact",
    );
    expect(path.didYouMean).toBe("action.DEFAULT");
    expect(path.fix).toEqual({ path: "palette.brand.exact", replace: "action.DEFAULT" });
    const tune = at(
      issuesOf({
        palette: { brand: { color: "#000", tune: { actoin: { chroma: 3 } } } },
        tokens: { action: { DEFAULT: { kind: "emphasis" } } },
      }),
      "palette.brand.tune.actoin",
    );
    expect(tune.didYouMean).toBe("action");
    expect(
      at(
        issuesOf({
          palette: { brand: { color: "#000", tune: { action: { chroma: 3 } } } },
          tokens: { action: { DEFAULT: { kind: "emphasis" } } },
        }),
        "palette.brand.tune.action.chroma",
      ).message,
    ).toContain("outside 0..2");
  });

  it("rejects an empty palette, an empty group, and a non-object token", () => {
    expect(
      at(
        issuesOf({
          palette: {},
          tokens: { surface: { DEFAULT: { kind: "surface" } } },
        }),
        "palette",
      ).message,
    ).toContain("at least one");
    expect(
      at(
        issuesOf({
          palette: { neutral: "#000" },
          tokens: { surface: {} },
        }),
        "tokens.surface",
      ).message,
    ).toContain("no tokens");
    expect(
      at(
        issuesOf({
          palette: { neutral: "#000" },
          tokens: { surface: { DEFAULT: "white" } },
        }),
        "tokens.surface.DEFAULT",
      ).message,
    ).toContain("token object");
  });

  it("rejects a non-object config and a missing palette", () => {
    const root = issuesOf(null)[0];
    expect(root?.path).toBe("");
    expect(root?.message).toContain("config object");
    expect(
      at(issuesOf({ tokens: { surface: { DEFAULT: { kind: "surface" } } } }), "palette")
        .message,
    ).toContain("Missing");
  });
});

describe("assertConfig", () => {
  it("returns the config when it is valid", () => {
    const input = base();
    expect(assertConfig(input)).toBe(input);
  });

  it("throws ConfigError with the issue list", () => {
    expect(() => assertConfig({ palette: { neutral: "#000" } })).toThrow(ConfigError);
    try {
      assertConfig({ palette: { neutral: "#000" } });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(error).toBeInstanceOf(Error);
      const configError = error as ConfigError;
      expect(configError.name).toBe("ConfigError");
      expect(configError.issues.length).toBeGreaterThan(0);
      expect(configError.message).toContain("tokens");
    }
  });

  it("prefixes the pretty message when asked", () => {
    const error = new ConfigError(
      [{ path: "palette", message: "Missing palette." }],
      "Invalid tint config",
    );
    expect(error.message).toBe("Invalid tint config\n✖ palette: Missing palette.");
  });

  it("is not the v3 ConfigError and is the public validator", () => {
    expect(ConfigError).not.toBe(V3ConfigError);
    expect(publicApi.formatConfigIssues).toBe(formatConfigIssues);
    expect(publicApi.validateConfig).toBe(validateConfig);
    expect(publicApi.ConfigError).toBe(ConfigError);
  });
});
