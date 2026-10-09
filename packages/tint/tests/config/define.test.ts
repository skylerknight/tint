import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { defineConfig } from "../../src/config/define.js";
import { ConfigError } from "../../src/config/validate.js";
import type { Config } from "../../src/config/types.js";

vi.mock("../../src/color/parse.js", () => ({
  tryParseColor: (s: string) => (/^#[0-9a-f]{6}$/i.test(s) ? { r: 0, g: 0, b: 0 } : null),
}));

const valid = {
  name: "theme",
  mode: "light",
  colors: { brand: "#3366ff" },
  tokens: {
    surface: { default: { ls: 0 } },
    text: { $on: "surface", body: { lc: 80 } },
  },
} as const satisfies Config;

describe("defineConfig", () => {
  it("returns the very same object reference", () => {
    const input = { ...valid };
    expect(defineConfig(input)).toBe(input);
  });

  it("preserves literal types", () => {
    const config = defineConfig({
      name: "theme",
      mode: "dark",
      colors: { brand: "#3366ff" },
      tokens: { surface: { default: { ls: 0 } } },
    });
    expectTypeOf(config.name).toEqualTypeOf<"theme">();
    expectTypeOf(config.mode).toEqualTypeOf<"dark">();
    expectTypeOf(config.tokens).toHaveProperty("surface");
    expectTypeOf(config.tokens.surface).toHaveProperty("default");
    expectTypeOf(config.colors).toHaveProperty("brand");
  });

  it("validates arrays, returning the same array reference", () => {
    const configs = [valid, { ...valid, name: "other", mode: "dark" }] as const;
    const result = defineConfig(configs);
    expect(result).toBe(configs);
    expectTypeOf(result).toEqualTypeOf<typeof configs>();
  });

  it("throws a ConfigError with every issue", () => {
    expect(() =>
      defineConfig({ ...valid, mode: "x", scale: 9 } as unknown as Config),
    ).toThrow(ConfigError);
    try {
      defineConfig({ ...valid, mode: "x", scale: 9 } as unknown as Config);
    } catch (error) {
      expect((error as ConfigError).issues.map((i) => i.path)).toEqual(["mode", "scale"]);
      expect((error as ConfigError).message).toMatch(/^Invalid tint config:\n/);
    }
  });

  it("prefixes array errors with the theme index", () => {
    const bad = [valid, { ...valid, colors: {} }] as unknown as Config[];
    expect(() => defineConfig(bad)).toThrow(
      /^Invalid tint config \(theme 2\):\n  - colors: /,
    );
  });
});
