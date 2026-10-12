import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { schemaPath, schemaText } from "../../scripts/build-schema.js";
import { CANONICAL_STATES, canonicalStatesFor } from "../../src/v4/states.js";

const committed = readFileSync(schemaPath, "utf8");
const schema: object = JSON.parse(committed) as object;

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    palette: { neutral: "#71717a" },
    tokens: { text: { DEFAULT: { kind: "text" } } },
    ...overrides,
  };
}

/** Spec §8, the whole example, in the JSON form kind functions return. */
const SPEC_EXAMPLE = {
  $schema: "https://tint.dev/schema/v4.json",
  contrast: { algorithm: "apca", level: "standard" },
  palette: {
    neutral: "#71717a",
    brand: { color: "#7c3aed", exact: true },
    danger: "#dc2626",
    warning: {
      color: "#d97706",
      tune: { action: { kind: "emphasis", level: "bold" } },
    },
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
      sunken: { kind: "surface", level: "sunken" },
      DEFAULT: { kind: "surface" },
      raised: { kind: "surface", level: "raised" },
      floating: { kind: "surface", level: "floating" },
    },
    action: {
      DEFAULT: { kind: "emphasis" },
      hover: { kind: "emphasis", state: "hover" },
      pressed: { kind: "emphasis", state: "pressed" },
      disabled: { kind: "emphasis", state: "disabled" },
      on: { kind: "text", on: "action" },
      "on-disabled": { kind: "text", state: "disabled", on: "action" },
    },
    soft: {
      DEFAULT: { kind: "emphasis", level: "subtle" },
      hover: { kind: "emphasis", level: "subtle", state: "hover" },
      pressed: { kind: "emphasis", level: "subtle", state: "pressed" },
      on: { kind: "text", on: "soft" },
    },
    border: {
      hairline: { kind: "border", level: "hairline" },
      DEFAULT: { kind: "border" },
      firm: { kind: "border", level: "firm" },
      focus: { kind: "border", level: "heavy", on: "action" },
    },
    text: {
      DEFAULT: { kind: "text" },
      strong: { kind: "text", level: "strong" },
      muted: { kind: "text", level: "muted" },
      faint: { kind: "text", level: "faint" },
      disabled: { kind: "text", state: "disabled" },
      link: { kind: "text", chroma: 1.2 },
    },
    row: {
      DEFAULT: { kind: "surface" },
      hover: { kind: "surface", state: "hover" },
      selected: { kind: "surface", state: "selected" },
      "selected-hover": { kind: "surface", state: "selected-hover" },
      on: { kind: "text", on: "row" },
    },
  },
};

/** Spec §8 JSON excerpt, unchanged. */
const SPEC_EXCERPT = {
  $schema: "https://tint.dev/schema/v4.json",
  palette: {
    neutral: "#71717a",
    brand: { color: "#7c3aed", exact: true },
  },
  tokens: {
    action: {
      DEFAULT: { kind: "emphasis" },
      hover: { kind: "emphasis", state: "hover" },
      on: { kind: "text", on: "action" },
    },
  },
};

const valid = [
  {
    name: "minimal palette and token",
    config: {
      palette: { neutral: "#000" },
      tokens: { text: { DEFAULT: { kind: "text" } } },
    },
  },
  {
    name: "ordinals, ordinal strings, and built-in level names",
    config: base({
      tokens: {
        surface: {
          a: { kind: "surface", level: 1 },
          b: { kind: "surface", level: "2" },
          c: { kind: "text", level: "body" },
          d: { kind: "border", level: 5 },
          e: { kind: "emphasis", level: "loud" },
        },
      },
    }),
  },
  {
    name: "custom level aliases and $replace",
    config: base({
      levels: {
        text: { secondary: 2, tertiary: 1 },
        emphasis: { primary: 3, $replace: true },
      },
      tokens: {
        text: { secondary: { kind: "text", level: "secondary" } },
        action: { DEFAULT: { kind: "emphasis", level: "primary" } },
      },
    }),
  },
  {
    name: "active alias and checked compounds",
    config: base({
      tokens: {
        action: {
          DEFAULT: { kind: "emphasis", state: "active" },
          selected: { kind: "emphasis", state: "selected-active" },
          checked: { kind: "border", state: "checked-disabled" },
          alias: { kind: "border", state: "checked-active" },
        },
      },
    }),
  },
  {
    name: "theme extends without repeating mode",
    config: base({
      themes: {
        light: { mode: "light" },
        hc: { extends: "light", contrast: { level: "more" } },
      },
    }),
  },
  {
    name: "palette tune paths and exact token path",
    config: base({
      palette: {
        brand: {
          color: "#7c3aed",
          default: true,
          exact: "action.DEFAULT",
          tune: {
            action: { kind: "emphasis", level: "bold" },
            "action.hover": { chroma: 0.5 },
            "soft.*": { state: "hover" },
          },
        },
      },
    }),
  },
  {
    name: "expert options and chroma bounds",
    config: base({
      tokens: {
        text: {
          DEFAULT: {
            kind: "text",
            level: 4,
            contrast: "+1",
            direction: "darker",
            chroma: 0,
            hue: 240,
            lc: 75,
            ratio: 4.5,
            step: 1,
            nudge: false,
            on: "surface",
          },
          shift: {
            kind: "text",
            level: "5",
            contrast: "-2",
            direction: "lighter",
            chroma: 2,
            hue: "+12",
          },
          neg: { kind: "emphasis", hue: "-0.5", state: "focus" },
        },
      },
    }),
  },
  {
    name: "state steps and every output format",
    config: base({
      states: {
        emphasis: { hover: 1, pressed: 3, active: 2 },
        surface: { hover: 1, step: { light: 0.02, dark: 0.035 } },
      },
      output: {
        path: "./tint",
        formats: ["css", "tailwind", "dtcg", "flat"],
        format: "rgb",
      },
    }),
  },
  {
    name: "preset, wcag2, and a theme palette delta",
    config: base({
      preset: "polaris",
      contrast: { algorithm: "wcag2", level: "max" },
      themes: {
        dark: {
          mode: "dark",
          selector: ".dark",
          media: "(prefers-color-scheme: dark)",
          contrast: { level: "max" },
          palette: { brand: { color: "#a78bfa", exact: false } },
        },
      },
      output: { format: "hex" },
    }),
  },
  {
    name: "every canonical state on a kind it applies to",
    config: everyCanonicalState(),
  },
] as const;

const invalid: { name: string; config: unknown; keyword: string; path: string }[] = [
  {
    name: "missing palette",
    config: { tokens: { text: { DEFAULT: { kind: "text" } } } },
    keyword: "required",
    path: "",
  },
  {
    name: "missing tokens",
    config: { palette: { neutral: "#000" } },
    keyword: "required",
    path: "",
  },
  {
    name: "empty palette",
    config: base({ palette: {} }),
    keyword: "minProperties",
    path: "/palette",
  },
  {
    name: "unknown kind",
    config: base({ tokens: { text: { DEFAULT: { kind: "fill" } } } }),
    keyword: "enum",
    path: "/tokens/text/DEFAULT/kind",
  },
  {
    name: "state out of order",
    config: base({
      tokens: { row: { hover: { kind: "surface", state: "hover-selected" } } },
    }),
    keyword: "enum",
    path: "/tokens/row/hover/state",
  },
  {
    name: "disabled combined with hover",
    config: base({
      tokens: { action: { DEFAULT: { kind: "emphasis", state: "disabled-hover" } } },
    }),
    keyword: "enum",
    path: "/tokens/action/DEFAULT/state",
  },
  {
    name: "checked on a surface",
    config: base({
      tokens: { row: { selected: { kind: "surface", state: "checked" } } },
    }),
    keyword: "enum",
    path: "/tokens/row/selected/state",
  },
  {
    name: "level 0",
    config: base({ tokens: { text: { DEFAULT: { kind: "text", level: 0 } } } }),
    keyword: "anyOf",
    path: "/tokens/text/DEFAULT/level",
  },
  {
    name: "unknown contrast algorithm",
    config: base({ contrast: { algorithm: "wcag3" } }),
    keyword: "enum",
    path: "/contrast/algorithm",
  },
  {
    name: "theme with neither mode nor extends",
    config: base({ themes: { bare: {} } }),
    keyword: "anyOf",
    path: "/themes/bare",
  },
];

function everyCanonicalState(): Record<string, unknown> {
  const emphasis: Record<string, unknown> = {};
  for (const state of CANONICAL_STATES) {
    emphasis[state] = { kind: "emphasis", state };
  }
  emphasis.alias = { kind: "emphasis", state: "selected-active" };

  const surface: Record<string, unknown> = { DEFAULT: { kind: "surface" } };
  for (const state of canonicalStatesFor("surface")) {
    surface[state] = { kind: "surface", state };
  }

  return {
    palette: { neutral: "#71717a" },
    tokens: { emphasis, surface },
  };
}

function assertValid(config: unknown): void {
  const ok = validate(config);
  expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

function assertInvalid(config: unknown, keyword: string, path: string): void {
  const ok = validate(config);
  expect(ok, "expected the fixture to fail").toBe(false);
  const errors = validate.errors ?? [];
  const matched = errors.some(
    (error) => error.keyword === keyword && error.instancePath === path,
  );
  expect(matched, JSON.stringify(errors, null, 2)).toBe(true);
}

describe("v4 JSON Schema", () => {
  it("matches the generator byte for byte", async () => {
    expect(committed).toBe(await schemaText());
  });

  it("is draft 2020-12 and published at the spec URL", () => {
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://tint.dev/schema/v4.json",
    });
  });

  it("is shipped from the package and ajv stays a devDependency", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      files: string[];
      exports: Record<string, unknown>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.files).toContain("schema");
    expect(manifest.exports["./schema/v4.json"]).toBe("./schema/v4.json");
    expect(manifest.dependencies ?? {}).not.toHaveProperty("ajv");
    expect(manifest.devDependencies).toHaveProperty("ajv");
  });

  it("accepts the spec §8 example", () => {
    assertValid(SPEC_EXAMPLE);
  });

  it("accepts the spec §8 JSON excerpt", () => {
    assertValid(SPEC_EXCERPT);
  });

  it.each(valid)("accepts $name", ({ config }) => {
    assertValid(config);
  });

  it.each(invalid)("rejects $name", ({ config, keyword, path }) => {
    assertInvalid(config, keyword, path);
  });
});
