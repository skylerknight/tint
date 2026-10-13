import { describe, expect, expectTypeOf, it } from "vitest";
import * as publicApi from "../../src/index.js";
import {
  border,
  defineConfig,
  emphasis,
  surface,
  text,
  type Config,
  type Level,
  type State,
  type TokenOptions,
} from "../../src/v4/index.js";

const kinds = [
  ["surface", surface],
  ["text", text],
  ["border", border],
  ["emphasis", emphasis],
] as const;

describe("kind functions", () => {
  it.each(kinds)("%s call shapes match the documented JSON", (kind, fn) => {
    const call = fn as (level?: Level | TokenOptions, options?: TokenOptions) => unknown;
    expect(call()).toEqual({ kind });
    expect(call("bold")).toEqual({ kind, level: "bold" });
    expect(call(4)).toEqual({ kind, level: 4 });
    expect(call({ state: "hover" })).toEqual({ kind, state: "hover" });
    expect(call("subtle", { state: "selected-hover", on: "row" })).toEqual({
      kind,
      level: "subtle",
      state: "selected-hover",
      on: "row",
    });
  });

  it("keeps the spec's returned-data example field for field", () => {
    // §2.4: { "kind": "emphasis", "level": 3, "state": "hover", "on": "surface" }
    expect(emphasis(3, { state: "hover", on: "surface" })).toEqual({
      kind: "emphasis",
      level: 3,
      state: "hover",
      on: "surface",
    });
  });

  it("keeps names as written instead of resolving them", () => {
    expect(emphasis("bold")).toEqual({ kind: "emphasis", level: "bold" });
    expect(emphasis("subtle")).not.toEqual({ kind: "emphasis", level: 2 });
    expect(text({ state: "active" })).toEqual({ kind: "text", state: "active" });
    expect(surface()).not.toHaveProperty("level");
  });

  it("copies every option and drops undefined so JSON round-trips", () => {
    const samples = [
      emphasis(),
      emphasis("bold"),
      emphasis(4),
      emphasis({ state: "hover" }),
      emphasis("subtle", { state: "selected-hover", on: "row" }),
      emphasis(3, { state: "hover", on: "surface" }),
      text({
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
      }),
      border("heavy", { hue: -15, contrast: "-1", direction: "lighter" }),
      surface("raised", { on: "panel", step: 2 }),
      emphasis({ on: "row", state: undefined } as unknown as TokenOptions),
    ];

    for (const sample of samples) {
      expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
    }

    expect(text({ chroma: 0, step: 0 })).toEqual({ kind: "text", chroma: 0, step: 0 });
    expect(emphasis({ on: "row", state: undefined } as unknown as TokenOptions)).toEqual({
      kind: "emphasis",
      on: "row",
    });
  });

  it("returns a new plain object and does not mutate the options", () => {
    const options = { state: "hover" as const, on: "row", chroma: 1 };
    const token = emphasis("subtle", options);
    expect(token).not.toBe(options);
    expect(options).toEqual({ state: "hover", on: "row", chroma: 1 });
    expect(Object.getPrototypeOf(token)).toBe(Object.prototype);
    expect(emphasis()).not.toBe(emphasis());
  });

  it("is on the public entry", () => {
    expect(publicApi.emphasis).toBe(emphasis);
    expect(publicApi.surface).toBe(surface);
    expect(publicApi).not.toHaveProperty("V4_SCAFFOLD");
  });
});

describe("kind types", () => {
  it("preserves each emphasis call shape", () => {
    expectTypeOf(emphasis()).toEqualTypeOf<{ kind: "emphasis" }>();
    expectTypeOf(emphasis("bold")).toEqualTypeOf<{ kind: "emphasis"; level: "bold" }>();
    expectTypeOf(emphasis(4)).toEqualTypeOf<{ kind: "emphasis"; level: 4 }>();
    expectTypeOf(emphasis({ state: "hover" })).toEqualTypeOf<{
      kind: "emphasis";
      state: "hover";
    }>();
    expectTypeOf(
      emphasis("subtle", { state: "selected-hover", on: "row" }),
    ).toEqualTypeOf<{
      kind: "emphasis";
      level: "subtle";
      state: "selected-hover";
      on: "row";
    }>();
    expectTypeOf(surface("sunken")).toEqualTypeOf<{ kind: "surface"; level: "sunken" }>();
    expectTypeOf(text()).toEqualTypeOf<{ kind: "text" }>();
    expectTypeOf(border({ on: "action" })).toEqualTypeOf<{
      kind: "border";
      on: "action";
    }>();
  });

  it("locks option keys so unknown ones are type errors", () => {
    expectTypeOf<keyof TokenOptions>().toEqualTypeOf<
      | "state"
      | "on"
      | "contrast"
      | "direction"
      | "chroma"
      | "hue"
      | "lc"
      | "ratio"
      | "step"
      | "nudge"
    >();
    expectTypeOf<TokenOptions>().toHaveProperty("nudge");
    expectTypeOf<TokenOptions>().toHaveProperty("state");
    expectTypeOf<TokenOptions>().toHaveProperty("on");
    expectTypeOf<TokenOptions>().not.toHaveProperty("kind");
    expectTypeOf<TokenOptions>().not.toHaveProperty("level");
    expectTypeOf<TokenOptions>().not.toHaveProperty("nope");
    expectTypeOf<TokenOptions>().not.toHaveProperty("bogus");
    expectTypeOf<TokenOptions>().not.toHaveProperty("$on");

    expectTypeOf<keyof Config>().toEqualTypeOf<
      | "contrast"
      | "palette"
      | "themes"
      | "levels"
      | "states"
      | "preset"
      | "tokens"
      | "output"
    >();
    expectTypeOf<Config>().not.toHaveProperty("colors");
    expectTypeOf<Config>().not.toHaveProperty("seeds");
    expectTypeOf<Config>().not.toHaveProperty("name");

    expectTypeOf<"selected-hover">().toMatchTypeOf<State>();
    expectTypeOf<"hover">().toMatchTypeOf<State>();
    expectTypeOf<"active">().toMatchTypeOf<State>();
    expectTypeOf<"hovered">().not.toMatchTypeOf<State>();
    expectTypeOf<4>().toMatchTypeOf<1 | 2 | 3 | 4 | 5>();
    expectTypeOf<6>().not.toMatchTypeOf<1 | 2 | 3 | 4 | 5>();

    // @ts-expect-error `nope` is not a token option (§2.4)
    emphasis({ nope: true });
    // @ts-expect-error `bogus` is not a token option (§2.4)
    emphasis("subtle", { state: "hover", bogus: true });
    // @ts-expect-error 6 is not a level ordinal (§3)
    emphasis(6);
    // @ts-expect-error contrast nudges are ±1 or ±2 (§2.4)
    emphasis({ contrast: "+3" });
    // @ts-expect-error direction is `lighter` or `darker` (§2.4)
    emphasis({ direction: "invert" });
    // @ts-expect-error unknown state (§4)
    surface({ state: "hovered" });
    // @ts-expect-error hue shifts use a leading + or - (§2.4)
    text({ hue: "12" });
  });
});

describe("defineConfig", () => {
  it("returns the same reference", () => {
    const input = {
      palette: { neutral: "#71717a" },
      tokens: { action: { DEFAULT: emphasis() } },
    };
    expect(defineConfig(input)).toBe(input);
  });

  it("preserves literal palette and token names", () => {
    const config = defineConfig({
      contrast: { algorithm: "apca", level: "standard" },
      palette: {
        neutral: "#71717a",
        brand: { color: "#7c3aed", exact: true },
      },
      themes: {
        light: { mode: "light", selector: ".light", media: true },
        dark: {
          mode: "dark",
          selector: ".dark",
          media: true,
          palette: { brand: "#a78bfa" },
        },
      },
      tokens: {
        action: {
          DEFAULT: emphasis(),
          hover: emphasis({ state: "hover" }),
          on: text({ on: "action" }),
        },
      },
      output: { path: "tint", formats: ["css", "dtcg"], format: "oklch", prefix: "tint" },
    });

    expectTypeOf(config.palette).toHaveProperty("neutral");
    expectTypeOf(config.palette).toHaveProperty("brand");
    expectTypeOf(config.themes).toHaveProperty("light");
    expectTypeOf(config.themes).toHaveProperty("dark");
    expectTypeOf(config.tokens).toHaveProperty("action");
    expectTypeOf(config.tokens.action).toHaveProperty("DEFAULT");
    expectTypeOf(config.tokens.action).toHaveProperty("hover");
    expectTypeOf(config.tokens.action).toHaveProperty("on");
    expectTypeOf(config.contrast.algorithm).toEqualTypeOf<"apca">();
    expectTypeOf(config.output.format).toEqualTypeOf<"oklch">();
    expectTypeOf(config.output.prefix).toEqualTypeOf<"tint">();
  });

  it("accepts the §8 example", () => {
    const config = defineConfig({
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
          selector: ".light-hc",
          media: "(prefers-contrast: more)",
          contrast: { level: "more" },
        },
      },
      levels: {
        text: { secondary: 2, tertiary: 1 },
        emphasis: { primary: 3, $replace: true },
      },
      states: {
        emphasis: { hover: 1, pressed: 3 },
        surface: { step: { light: 0.02, dark: 0.035 } },
      },
      preset: "shadcn",
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
          focus: border("firm", { on: "action" }),
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
    });

    expect(config.tokens.action.DEFAULT).toEqual({ kind: "emphasis" });
    expect(config.tokens.action.hover).toEqual({ kind: "emphasis", state: "hover" });
    expect(config.palette.warning.tune.action).toEqual({
      kind: "emphasis",
      level: "bold",
    });
  });

  it("rejects a config missing required keys or using unknown ones", () => {
    // @ts-expect-error palette and tokens are required (§2)
    defineConfig({});
    defineConfig({
      palette: { neutral: "#71717a" },
      tokens: {},
      // @ts-expect-error `seeds` is not a v4 config key (§2)
      seeds: { neutral: "#71717a" },
    });
  });
});
