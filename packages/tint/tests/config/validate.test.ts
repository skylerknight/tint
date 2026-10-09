import { describe, expect, it, vi } from "vitest";
import { assertConfig, ConfigError, validateConfig } from "../../src/config/validate.js";
import type { Issue } from "../../src/config/validate.js";

vi.mock("../../src/color/parse.js", () => ({
  tryParseColor: (s: string) => (/^#[0-9a-f]{6}$/i.test(s) ? { r: 0, g: 0, b: 0 } : null),
}));

/** A minimal valid config; spread overrides onto it to build failing cases. */
function base(): Record<string, unknown> {
  return {
    name: "theme",
    mode: "light",
    colors: { base: "#ffffff", brand: "#3366ff" },
    tokens: {
      surface: { default: { ls: 0 }, raised: { ls: 1 } },
      text: { $on: "surface", heading: { lc: "heading" }, body: { lc: 80 } },
    },
  };
}

function issuesOf(input: unknown): Issue[] {
  const result = validateConfig(input);
  return result.ok ? [] : result.issues;
}

/** Assert that exactly one issue has `path` and that its message contains `text`. */
function expectIssue(issues: Issue[], path: string, text: string): Issue {
  const found = issues.filter((i) => i.path === path);
  expect(
    found,
    `expected an issue at "${path}"; got ${JSON.stringify(issues)}`,
  ).toHaveLength(1);
  const only = found[0]!;
  expect(only.message).toContain(text);
  return only;
}

describe("validateConfig: accepts valid configs", () => {
  it("returns the same object on success", () => {
    const input = base();
    const result = validateConfig(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config).toBe(input);
  });

  it("accepts every optional top-level key", () => {
    expect(
      issuesOf({
        ...base(),
        selector: ".theme",
        prefersColorScheme: "dark",
        prefersContrast: "more",
        scale: 0.03,
        offset: 0.1,
        overrides: { brand: { text: { body: { lc: 70 } } } },
        output: { path: "./out", formats: ["css", "json", "tailwind", "flat"] },
      }),
    ).toEqual([]);
  });

  it("accepts { value } color objects and the DEFAULT variant name", () => {
    const config = base();
    config.colors = { brand: { value: "#112233" } };
    config.tokens = { surface: { DEFAULT: { ls: 0 }, raised: { ls: 2 } } };
    expect(issuesOf(config)).toEqual([]);
  });

  it("accepts every lc shortcut and ls: pure", () => {
    const config = base();
    config.tokens = {
      surface: { default: { ls: 0 }, pure: { ls: "pure" } },
      text: {
        $on: "surface",
        a: { lc: "heading" },
        b: { lc: "body" },
        c: { lc: "muted" },
        d: { lc: "placeholder" },
        e: { lc: "disabled" },
        f: { lc: "pure" },
      },
    };
    expect(issuesOf(config)).toEqual([]);
  });

  it("accepts group $invert when only a variant carries $on", () => {
    const config = base();
    config.tokens = {
      surface: { default: { ls: 0 } },
      text: { $invert: true, body: { lc: 80, $on: "surface" } },
    };
    expect(issuesOf(config)).toEqual([]);
  });

  it("accepts a chain of $on links that is not a cycle", () => {
    const config = base();
    config.tokens = {
      surface: { default: { ls: 0 }, raised: { ls: 1 } },
      text: { $on: "surface.raised", body: { lc: 80 } },
      icon: { $on: "text.body", default: { lc: 60 } },
    };
    expect(issuesOf(config)).toEqual([]);
  });
});

describe("validateConfig: top level", () => {
  it("rejects non-objects", () => {
    for (const input of [null, undefined, 42, "x", [], () => undefined]) {
      expectIssue(issuesOf(input), "", "plain object");
    }
  });

  it("rejects unknown keys with a hint listing valid keys", () => {
    const issue = expectIssue(
      issuesOf({ ...base(), scales: 1 }),
      "scales",
      'Unknown key "scales"',
    );
    expect(issue.hint).toContain("name, mode");
  });

  it("requires a non-empty name", () => {
    expectIssue(issuesOf({ ...base(), name: "" }), "name", "non-empty string");
    expectIssue(issuesOf({ ...base(), name: 3 }), "name", "non-empty string");
    const { name: _unused, ...withoutName } = base();
    expectIssue(issuesOf(withoutName), "name", "non-empty string");
  });

  it("requires mode to be light or dark", () => {
    expectIssue(issuesOf({ ...base(), mode: "dim" }), "mode", '"light", "dark"');
  });

  it("validates selector, prefersColorScheme, prefersContrast", () => {
    expectIssue(issuesOf({ ...base(), selector: 1 }), "selector", "Expected a string");
    expectIssue(
      issuesOf({ ...base(), prefersColorScheme: "x" }),
      "prefersColorScheme",
      "one of",
    );
    expectIssue(
      issuesOf({ ...base(), prefersContrast: "high" }),
      "prefersContrast",
      '"more"',
    );
  });

  it("validates scale and offset ranges", () => {
    expectIssue(issuesOf({ ...base(), scale: 0 }), "scale", "between 0.001 and 0.1");
    expectIssue(issuesOf({ ...base(), scale: 0.2 }), "scale", "between 0.001 and 0.1");
    expectIssue(issuesOf({ ...base(), scale: "0.02" }), "scale", "Expected a number");
    expectIssue(issuesOf({ ...base(), offset: -0.1 }), "offset", "between 0 and 0.5");
    expectIssue(issuesOf({ ...base(), offset: 0.6 }), "offset", "between 0 and 0.5");
    expectIssue(issuesOf({ ...base(), offset: NaN }), "offset", "between 0 and 0.5");
  });
});

describe("validateConfig: colors", () => {
  it("requires at least one color", () => {
    expectIssue(issuesOf({ ...base(), colors: {} }), "colors", "at least one color");
    expectIssue(issuesOf({ ...base(), colors: "red" }), "colors", "at least one color");
  });

  it("rejects invalid color values via tryParseColor", () => {
    const issue = expectIssue(
      issuesOf({ ...base(), colors: { brand: "not-a-color" } }),
      "colors.brand",
      'Invalid color "not-a-color"',
    );
    expect(issue.hint).toBeDefined();
    expectIssue(
      issuesOf({ ...base(), colors: { brand: { value: "nope" } } }),
      "colors.brand",
      'Invalid color "nope"',
    );
  });

  it("rejects non-string, non-object values and strict object shape", () => {
    expectIssue(
      issuesOf({ ...base(), colors: { brand: 1 } }),
      "colors.brand",
      "{ value: string }",
    );
    expectIssue(
      issuesOf({ ...base(), colors: { brand: { value: "#000000", alpha: 1 } } }),
      "colors.brand.alpha",
      'Unknown key "alpha"',
    );
    expectIssue(
      issuesOf({ ...base(), colors: { brand: { val: "#000000" } } }),
      "colors.brand.value",
      "Expected a string",
    );
  });

  it("rejects color names that are not CSS identifiers", () => {
    const issue = expectIssue(
      issuesOf({ ...base(), colors: { "1brand": "#000000" } }),
      "colors.1brand",
      'Invalid name "1brand"',
    );
    expect(issue.hint).toContain("start with a letter");
    expectIssue(
      issuesOf({ ...base(), colors: { "my color": "#000000" } }),
      "colors.my color",
      "Invalid name",
    );
  });
});

describe("validateConfig: tokens and groups", () => {
  it("requires at least one group", () => {
    expectIssue(
      issuesOf({ ...base(), tokens: {} }),
      "tokens",
      "at least one token group",
    );
    expectIssue(
      issuesOf({ ...base(), tokens: [] }),
      "tokens",
      "at least one token group",
    );
  });

  it("rejects non-object groups and groups without variants", () => {
    expectIssue(
      issuesOf({ ...base(), tokens: { surface: 1 } }),
      "tokens.surface",
      "token group object",
    );
    expectIssue(
      issuesOf({ ...base(), tokens: { surface: { $role: "surface" } } }),
      "tokens.surface",
      "at least one variant",
    );
  });

  it("rejects invalid group and variant names", () => {
    expectIssue(
      issuesOf({ ...base(), tokens: { "bad group": { a: { ls: 0 } } } }),
      "tokens.bad group",
      "Invalid name",
    );
    expectIssue(
      issuesOf({ ...base(), tokens: { surface: { "-a": { ls: 0 } } } }),
      "tokens.surface.-a",
      "Invalid name",
    );
  });

  it("rejects unknown $ keys on a group, with a special hint for $reference", () => {
    const issues = issuesOf({
      ...base(),
      tokens: { surface: { $reference: true, $referenc: true, a: { ls: 0 } } },
    });
    const ref = expectIssue(
      issues,
      "tokens.surface.$reference",
      'Unknown key "$reference"',
    );
    expect(ref.hint).toContain("mark the variant instead");
    const typo = expectIssue(
      issues,
      "tokens.surface.$referenc",
      'Unknown key "$referenc"',
    );
    expect(typo.hint).toContain("$on, $role, $decorative, $invert, $scale, $chroma");
  });

  it("validates group-level $on format, $role, booleans, $scale and $chroma", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        surface: { a: { ls: 0 } },
        text: {
          $on: "surface.",
          $role: "label",
          $decorative: "yes",
          $invert: 1,
          $scale: 0.5,
          $chroma: 3,
          a: { lc: 80 },
        },
      },
    });
    expectIssue(issues, "tokens.text.$on", '"group" or "group.variant"');
    expectIssue(issues, "tokens.text.$role", '"surface", "text"');
    expectIssue(issues, "tokens.text.$decorative", "Expected a boolean");
    expectIssue(issues, "tokens.text.$invert", "Expected a boolean");
    expectIssue(issues, "tokens.text.$scale", "between 0.001 and 0.1");
    expectIssue(issues, "tokens.text.$chroma", "between 0 and 2");
    expect(issues).toHaveLength(6);
  });

  it("rejects $on strings with bad shapes", () => {
    for (const on of ["", ".surface", "surface.raised.x", "1surface", "a b"]) {
      expectIssue(
        issuesOf({
          ...base(),
          tokens: { surface: { a: { ls: 0 } }, text: { $on: on, a: { lc: 1 } } },
        }),
        "tokens.text.$on",
        '"group" or "group.variant"',
      );
    }
  });

  it("allows at most one $reference per group", () => {
    const issue = expectIssue(
      issuesOf({
        ...base(),
        tokens: {
          surface: { a: { ls: 0, $reference: true }, b: { ls: 1, $reference: true } },
        },
      }),
      "tokens.surface",
      "Only one variant per group may have $reference",
    );
    expect(issue.message).toContain('"a", "b"');
  });

  it("requires $on when a group sets $invert", () => {
    const issue = expectIssue(
      issuesOf({ ...base(), tokens: { surface: { $invert: true, a: { ls: 0 } } } }),
      "tokens.surface.$invert",
      "$invert requires $on",
    );
    expect(issue.hint).toContain("group or on one of its variants");
  });
});

describe("validateConfig: variants", () => {
  function tokensWith(variant: unknown, group: Record<string, unknown> = {}) {
    return {
      ...base(),
      tokens: { surface: { ok: { ls: 0 } }, g: { ...group, v: variant } },
    };
  }

  it("rejects non-object variants", () => {
    expectIssue(issuesOf(tokensWith(80)), "tokens.g.v", "Expected a variant object");
    expectIssue(issuesOf(tokensWith(null)), "tokens.g.v", "Expected a variant object");
  });

  it("requires exactly one of lc / ls", () => {
    expectIssue(
      issuesOf(tokensWith({ lc: 80, ls: 1 })),
      "tokens.g.v",
      'both "lc" and "ls"',
    );
    expectIssue(issuesOf(tokensWith({ $reference: true })), "tokens.g.v", '"lc" or "ls"');
  });

  it("validates lc values", () => {
    for (const lc of [-1, 109, "bold", NaN, null]) {
      const issue = expectIssue(
        issuesOf(tokensWith({ lc })),
        "tokens.g.v.lc",
        "between 0 and 108",
      );
      expect(issue.hint).toContain("heading, body, muted, placeholder, disabled, pure");
    }
  });

  it("validates ls values", () => {
    for (const ls of [-1, "white", Infinity, true]) {
      expectIssue(issuesOf(tokensWith({ ls })), "tokens.g.v.ls", 'number >= 0 or "pure"');
    }
  });

  it("rejects keys that do not belong to an lc variant", () => {
    const issue = expectIssue(
      issuesOf(tokensWith({ lc: 80, $scale: 0.02 })),
      "tokens.g.v.$scale",
      'Unknown key "$scale"',
    );
    expect(issue.hint).toContain("lc, $reference, $on, $decorative, $invert, $chroma");
    expectIssue(
      issuesOf(tokensWith({ lc: 80, $role: "text" })),
      "tokens.g.v.$role",
      "Unknown key",
    );
  });

  it("rejects keys that do not belong to an ls variant", () => {
    const issue = expectIssue(
      issuesOf(tokensWith({ ls: 1, $invert: true })),
      "tokens.g.v.$invert",
      'Unknown key "$invert"',
    );
    expect(issue.hint).toContain("ls, $reference, $on, $decorative, $scale, $chroma");
  });

  it("validates variant-level option types and ranges", () => {
    const issues = issuesOf(
      tokensWith({
        ls: 1,
        $reference: "yes",
        $on: "x..y",
        $decorative: 0,
        $scale: 1,
        $chroma: -1,
      }),
    );
    expectIssue(issues, "tokens.g.v.$reference", "Expected a boolean");
    expectIssue(issues, "tokens.g.v.$on", '"group" or "group.variant"');
    expectIssue(issues, "tokens.g.v.$decorative", "Expected a boolean");
    expectIssue(issues, "tokens.g.v.$scale", "between 0.001 and 0.1");
    expectIssue(issues, "tokens.g.v.$chroma", "between 0 and 2");
    expectIssue(
      issuesOf(tokensWith({ lc: 1, $invert: "no" })),
      "tokens.g.v.$invert",
      "boolean",
    );
  });

  it("requires an effective $on for a variant with $invert", () => {
    const issue = expectIssue(
      issuesOf(tokensWith({ lc: 80, $invert: true })),
      "tokens.g.v.$invert",
      "$invert requires $on",
    );
    expect(issue.hint).toContain("variant or on its group");
    expect(issuesOf(tokensWith({ lc: 80, $invert: true }, { $on: "surface" }))).toEqual(
      [],
    );
    expect(issuesOf(tokensWith({ lc: 80, $invert: true, $on: "surface" }))).toEqual([]);
  });
});

describe("validateConfig: $on targets", () => {
  it("reports unknown groups and variants, at the group or variant path", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        surface: { a: { ls: 0 } },
        text: { $on: "panel", a: { lc: 1 }, b: { lc: 2, $on: "surface.nope" } },
      },
    });
    expectIssue(issues, "tokens.text.$on", 'Unknown group "panel"');
    expectIssue(issues, "tokens.text.b.$on", 'Unknown variant "nope" in group "surface"');
    expect(issues).toHaveLength(2);
  });

  it("reports a group-level unknown target once even with many variants", () => {
    const issues = issuesOf({
      ...base(),
      tokens: { text: { $on: "nope", a: { lc: 1 }, b: { lc: 2 }, c: { lc: 3 } } },
    });
    expect(issues).toHaveLength(1);
    expectIssue(issues, "tokens.text.$on", 'Unknown group "nope"');
  });

  it("rejects a variant pointing at itself", () => {
    expectIssue(
      issuesOf({ ...base(), tokens: { text: { a: { lc: 1, $on: "text.a" } } } }),
      "tokens.text.a.$on",
      "may not point to the variant itself (text.a)",
    );
  });

  it("rejects a group whose $on resolves to its own reference variant", () => {
    const issues = issuesOf({
      ...base(),
      tokens: { text: { $on: "text", low: { lc: 10 }, high: { lc: 90 } } },
    });
    expectIssue(
      issues,
      "tokens.text.$on",
      "may not point to the variant itself (text.high)",
    );
  });

  it("detects a two-node cycle through group-level $on", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        surface: { $on: "text", raised: { ls: 1 } },
        text: { $on: "surface", body: { lc: 80 } },
      },
    });
    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.message).toContain("Circular $on reference");
    expect(issue.message).toMatch(
      /surface\.raised -> text\.body -> surface\.raised|text\.body -> surface\.raised -> text\.body/,
    );
    expect(["tokens.surface.$on", "tokens.text.$on"]).toContain(issue.path);
  });

  it("detects variant-level and mixed cycles, reporting each cycle once", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        a: { x: { lc: 10, $on: "b.y" }, z: { lc: 20 } },
        b: { y: { lc: 30, $on: "c" } },
        c: { $on: "a.x", w: { lc: 40 } },
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("a.x -> b.y -> c.w -> a.x");
    expect(issues[0]!.path).toBe("tokens.a.x.$on");
  });

  it("detects a cycle through an implicit reference variant", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        surface: { default: { ls: 0 }, raised: { ls: 1, $on: "text" } },
        text: { $on: "surface", body: { lc: 80 }, heading: { lc: 90 } },
      },
    });
    // surface's reference is `raised` (highest ls); text's reference is `heading`.
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain(
      "surface.raised -> text.heading -> surface.raised",
    );
  });

  it("does not report a cycle when a chain merely shares a target", () => {
    expect(
      issuesOf({
        ...base(),
        tokens: {
          surface: { default: { ls: 0 } },
          text: { $on: "surface", a: { lc: 1 }, b: { lc: 2, $on: "text.a" } },
        },
      }),
    ).toEqual([]);
  });
});

describe("validateConfig: overrides", () => {
  function withOverrides(overrides: unknown) {
    return { ...base(), overrides };
  }

  it("must be an object of objects", () => {
    expectIssue(issuesOf(withOverrides([])), "overrides", "keyed by color name");
    expectIssue(
      issuesOf(withOverrides({ brand: 1 })),
      "overrides.brand",
      "keyed by group name",
    );
    expectIssue(
      issuesOf(withOverrides({ brand: { text: "x" } })),
      "overrides.brand.text",
      "keyed by variant name",
    );
    expectIssue(
      issuesOf(withOverrides({ brand: { text: { body: 70 } } })),
      "overrides.brand.text.body",
      "Expected an override object",
    );
  });

  it("checks every color in a comma-separated key", () => {
    const issues = issuesOf(
      withOverrides({ "brand, warning,danger": { text: { body: { lc: 1 } } } }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      path: "overrides.brand, warning,danger",
      message: 'Unknown color "warning"',
    });
    expect(issues[1]).toMatchObject({
      path: "overrides.brand, warning,danger",
      message: 'Unknown color "danger"',
    });
    expect(
      issuesOf(withOverrides({ "brand,base": { text: { body: { lc: 1 } } } })),
    ).toEqual([]);
  });

  it("checks group and variant existence", () => {
    expectIssue(
      issuesOf(withOverrides({ brand: { panel: { body: { lc: 1 } } } })),
      "overrides.brand.panel",
      'Unknown group "panel"',
    );
    expectIssue(
      issuesOf(withOverrides({ brand: { text: { caption: { lc: 1 } } } })),
      "overrides.brand.text.caption",
      'Unknown variant "caption" in group "text"',
    );
  });

  it("rejects lc on ls variants and ls on lc variants", () => {
    const lc = expectIssue(
      issuesOf(withOverrides({ brand: { surface: { raised: { lc: 50 } } } })),
      "overrides.brand.surface.raised.lc",
      'Cannot override "lc" on an ls variant',
    );
    expect(lc.hint).toBe('use "ls"');
    expectIssue(
      issuesOf(withOverrides({ brand: { text: { body: { ls: 2 } } } })),
      "overrides.brand.text.body.ls",
      'Cannot override "ls" on an lc variant',
    );
  });

  it("validates override value types and ranges", () => {
    const issues = issuesOf(
      withOverrides({
        brand: {
          text: {
            body: { lc: "bold", $scale: 5, $decorative: 1, $invert: "x", $chroma: 9 },
          },
          surface: { raised: { ls: -2 } },
        },
      }),
    );
    expectIssue(issues, "overrides.brand.text.body.lc", "between 0 and 108");
    expectIssue(issues, "overrides.brand.text.body.$scale", "between 0.001 and 0.1");
    expectIssue(issues, "overrides.brand.text.body.$decorative", "boolean");
    expectIssue(issues, "overrides.brand.text.body.$invert", "boolean");
    expectIssue(issues, "overrides.brand.text.body.$chroma", "between 0 and 2");
    expectIssue(issues, "overrides.brand.surface.raised.ls", 'number >= 0 or "pure"');
    expect(issues).toHaveLength(6);
  });

  it("requires at least one key and rejects unknown keys", () => {
    expectIssue(
      issuesOf(withOverrides({ brand: { text: { body: {} } } })),
      "overrides.brand.text.body",
      "at least one of lc, ls, $scale, $decorative, $invert, $chroma",
    );
    const issue = expectIssue(
      issuesOf(withOverrides({ brand: { text: { body: { lc: 1, $role: "x" } } } })),
      "overrides.brand.text.body.$role",
      'Unknown key "$role"',
    );
    expect(issue.hint).toContain("lc, ls, $scale");
  });

  it("requires an effective $on for an $invert override", () => {
    expectIssue(
      issuesOf(withOverrides({ brand: { surface: { raised: { $invert: true } } } })),
      "overrides.brand.surface.raised.$invert",
      "requires the variant to have an effective $on",
    );
    expect(
      issuesOf(withOverrides({ brand: { text: { body: { $invert: true } } } })),
    ).toEqual([]);
    expect(
      issuesOf(withOverrides({ brand: { surface: { raised: { $invert: false } } } })),
    ).toEqual([]);
  });

  it("accepts lc shortcuts in overrides", () => {
    expect(
      issuesOf(withOverrides({ brand: { text: { body: { lc: "pure" } } } })),
    ).toEqual([]);
  });
});

describe("validateConfig: output", () => {
  it("validates shape, path and formats", () => {
    expectIssue(issuesOf({ ...base(), output: "css" }), "output", "Expected an object");
    expectIssue(
      issuesOf({ ...base(), output: { dir: "x" } }),
      "output.dir",
      'Unknown key "dir"',
    );
    expectIssue(
      issuesOf({ ...base(), output: { path: 1 } }),
      "output.path",
      "Expected a string",
    );
    expectIssue(
      issuesOf({ ...base(), output: { formats: "css" } }),
      "output.formats",
      "array",
    );
    expectIssue(
      issuesOf({ ...base(), output: { formats: ["css", "scss"] } }),
      "output.formats.1",
      '"css", "json", "tailwind", "flat"',
    );
  });
});

describe("validateConfig: collects all issues", () => {
  it("reports issues across every section in one pass", () => {
    const issues = issuesOf({
      name: "",
      mode: "dusk",
      scale: 7,
      bogus: true,
      colors: { brand: "red", "2nd": "#000000" },
      tokens: {
        surface: {
          $reference: true,
          a: { ls: 0 },
          b: { ls: 1, $reference: true },
          c: { ls: 2, $reference: true },
        },
        text: { $on: "missing", $invert: "x", h: { lc: 200 }, b: { lc: 80, ls: 1 } },
      },
      overrides: { nope: { surface: { zzz: { lc: 1 } } } },
      output: { formats: ["pdf"] },
    });
    const paths = issues.map((i) => i.path).sort();
    expect(paths).toEqual(
      [
        "bogus",
        "colors.2nd",
        "colors.brand",
        "mode",
        "name",
        "output.formats.0",
        "overrides.nope",
        "overrides.nope.surface.zzz",
        "scale",
        "tokens.surface",
        "tokens.surface.$reference",
        "tokens.text.$invert",
        "tokens.text.$on",
        "tokens.text.b",
        "tokens.text.h.lc",
      ].sort(),
    );
  });

  it("reports several independent token problems together", () => {
    const issues = issuesOf({
      ...base(),
      tokens: {
        surface: { a: { ls: "lots" }, b: { lc: "big" } },
        text: { $on: "surface.zzz", $invert: true, a: { lc: 1, $invert: true } },
        icon: { $on: "icon", a: { lc: 1 } },
      },
    });
    expect(issues.map((i) => i.path).sort()).toEqual(
      [
        "tokens.icon.$on",
        "tokens.surface.a.ls",
        "tokens.surface.b.lc",
        "tokens.text.$on",
      ].sort(),
    );
  });
});

describe("assertConfig / ConfigError", () => {
  it("returns the config when valid", () => {
    const input = base();
    expect(assertConfig(input)).toBe(input);
  });

  it("throws a ConfigError listing every issue with path and hint", () => {
    let error: unknown;
    try {
      assertConfig({ ...base(), mode: "x", extra: 1 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const configError = error as ConfigError;
    expect(configError.name).toBe("ConfigError");
    expect(configError.issues).toHaveLength(2);
    expect(configError.message).toBe(
      [
        "Invalid tint config:",
        '  - extra: Unknown key "extra" (valid config keys are: name, mode, selector, prefersColorScheme, prefersContrast, scale, offset, colors, tokens, overrides, output)',
        '  - mode: Expected one of "light", "dark"',
      ].join("\n"),
    );
  });

  it("supports a custom prefix", () => {
    const error = new ConfigError([{ path: "", message: "boom" }], "Nope");
    expect(error.message).toBe("Nope:\n  - boom");
  });
});
