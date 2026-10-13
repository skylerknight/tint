import { describe, expect, it } from "vitest";
import { emphasis, generate, surface, text } from "../../src/index.js";
import {
  BORDER_LADDER,
  TEXT_BODY_SCALE,
  TEXT_LADDER,
  ladderValue,
} from "../../src/v4/ladders.js";
import { resolveConfig } from "../../src/v4/resolve.js";
import { defineConfig } from "../../src/v4/define.js";

function approx(value: number, expected: number, digits = 4): void {
  expect(value).toBeCloseTo(expected, digits);
}

describe("contrast ladders", () => {
  it("hits the published stops", () => {
    for (let scale = 1; scale <= 5; scale++) {
      expect(ladderValue(TEXT_LADDER.apca, scale, false)).toBe(
        TEXT_LADDER.apca[scale - 1],
      );
      expect(ladderValue(TEXT_LADDER.wcag2, scale, true)).toBe(
        TEXT_LADDER.wcag2[scale - 1],
      );
      expect(ladderValue(BORDER_LADDER.apca, scale, false)).toBe(
        BORDER_LADDER.apca[scale - 1],
      );
      expect(ladderValue(BORDER_LADDER.wcag2, scale, true)).toBe(
        BORDER_LADDER.wcag2[scale - 1],
      );
    }
  });

  it("interpolates APCA in a straight line and WCAG by ratio", () => {
    approx(ladderValue(TEXT_LADDER.apca, 2.5, false), (60 + 75) / 2);
    const geometric = 3.75 * Math.sqrt(4.5 / 3.75);
    approx(ladderValue(TEXT_LADDER.wcag2, 2.5, true), geometric);
    expect(ladderValue(TEXT_LADDER.wcag2, TEXT_BODY_SCALE, true)).toBe(4.5);
  });

  it("extrapolates past the ends of the table", () => {
    approx(ladderValue(TEXT_LADDER.apca, 0, false), 30);
    approx(ladderValue(TEXT_LADDER.apca, -1, false), 15);
    approx(ladderValue(TEXT_LADDER.apca, 6, false), 110);
    approx(ladderValue(TEXT_LADDER.wcag2, 0, true), 3 / (3.75 / 3));
    approx(ladderValue(BORDER_LADDER.wcag2, 1.5, true), 1.25 * Math.sqrt(1.6 / 1.25));
  });
});

describe("overrides", () => {
  it("applies a comma-separated key to each named palette", () => {
    const resolved = resolveConfig({
      palette: { neutral: "#71717a", warning: "#d97706", info: "#2563eb" },
      tokens: {
        action: { DEFAULT: { kind: "emphasis", scale: 4 } },
      },
      overrides: {
        "warning, info": { action: { DEFAULT: { kind: "emphasis", scale: 5 } } },
      },
    });
    expect(resolved.ok, JSON.stringify(resolved.issues)).toBe(true);
    const scaleOf = (palette: string) =>
      resolved.config.expansions
        .find((entry) => entry.palette === palette)
        ?.tokens.find((token) => token.id === "action.DEFAULT")?.value.scale;
    expect(scaleOf("neutral")).toBe(4);
    expect(scaleOf("warning")).toBe(5);
    expect(scaleOf("info")).toBe(5);
  });

  it("lets overrides win over palette tune", () => {
    const resolved = resolveConfig({
      palette: {
        warning: { color: "#d97706", tune: { "action.DEFAULT": { chroma: 0.5 } } },
      },
      tokens: { action: { DEFAULT: { kind: "emphasis", scale: 4 } } },
      overrides: {
        warning: { action: { DEFAULT: { kind: "emphasis", scale: 6, chroma: 1.2 } } },
      },
    });
    expect(resolved.ok, JSON.stringify(resolved.issues)).toBe(true);
    const token = resolved.config.expansions[0]?.tokens.find(
      (entry) => entry.id === "action.DEFAULT",
    );
    expect(token?.value.scale).toBe(6);
    expect(token?.value.chroma).toBe(1.2);
  });
});

describe("lightness polarity", () => {
  it("maps mode shorthand onto the current page values", () => {
    const resolved = resolveConfig({
      palette: { neutral: "#71717a" },
      themes: {
        light: { mode: "light" },
        dark: { mode: "dark" },
      },
      tokens: { text: { DEFAULT: { kind: "text", scale: 3 } } },
    });
    expect(resolved.ok, JSON.stringify(resolved.issues)).toBe(true);
    const light = resolved.config.themes.find((theme) => theme.name === "light");
    const dark = resolved.config.themes.find((theme) => theme.name === "dark");
    expect(light).toMatchObject({ mode: "light", lightness: 96 });
    expect(dark).toMatchObject({ mode: "dark", lightness: 15 });
  });

  it("infers polarity from lightness and warns in the middle", () => {
    const config = defineConfig({
      palette: { neutral: "#71717a" },
      themes: {
        paper: { lightness: 92 },
        ink: { lightness: 12 },
        mid: { lightness: 70 },
        mixed: { mode: "dark", lightness: 96 },
      },
      tokens: { surface: { DEFAULT: surface(0) }, text: { DEFAULT: text(3) } },
    });
    const themes = generate(config);
    const byName = Object.fromEntries(themes.map((theme) => [theme.name, theme]));
    expect(byName.paper?.mode).toBe("light");
    expect(byName.ink?.mode).toBe("dark");
    expect(byName.mid?.mode).toBe("light");
    expect(byName.paper?.palettes[0]?.page.oklch.l).toBeCloseTo(0.92, 5);
    expect(byName.ink?.palettes[0]?.page.oklch.l).toBeCloseTo(0.12, 5);
    expect(byName.mid?.diagnostics.some((item) => item.code === "page-lightness")).toBe(
      true,
    );
    expect(byName.paper?.diagnostics.some((item) => item.code === "page-lightness")).toBe(
      false,
    );
    expect(byName.mixed?.mode).toBe("light");
    expect(byName.mixed?.diagnostics.some((item) => item.code === "mode-lightness")).toBe(
      true,
    );
  });
});

describe("kind lints", () => {
  it("warns when text is under the body stop and names the lowest passing scale", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          text: { DEFAULT: text(3), faint: text(1) },
        },
      }),
    );
    const faint = theme?.diagnostics.find((item) => item.code === "text-below-body");
    expect(faint?.message).toContain("APCA body text");
    expect(faint?.message).toContain("Lc 75");
    expect(faint?.message).toContain(`Lowest passing scale is ${TEXT_BODY_SCALE}`);
    expect(faint?.path).toBe("neutral.text.faint");
    expect(theme?.diagnostics.some((item) => item.path === "neutral.text.DEFAULT")).toBe(
      false,
    );
  });

  it("warns when a solid emphasis fill misses non-text 3:1", () => {
    const [theme] = generate(
      defineConfig({
        contrast: { algorithm: "wcag2" },
        palette: { neutral: "#ffffff" },
        themes: { light: { lightness: 96 } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: { DEFAULT: emphasis(1), on: text(3, { on: "action" }) },
        },
      }),
    );
    expect(theme?.diagnostics.some((item) => item.code === "emphasis-non-text")).toBe(
      false,
    );
    const solid = generate(
      defineConfig({
        contrast: { algorithm: "wcag2" },
        palette: { neutral: "#ffffff" },
        themes: { light: { lightness: 96 } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: { DEFAULT: emphasis(8, { chroma: 0.2 }) },
        },
      }),
    )[0];
    const lint = solid?.diagnostics.find((item) => item.code === "emphasis-non-text");
    expect(lint?.message).toContain("WCAG 3:1");
    expect(lint?.path).toBe("neutral.action.DEFAULT");
  });

  it("warns when adjacent surfaces share a lightness", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0), same: surface(0.1), raised: surface(2) },
        },
      }),
    );
    const lint = theme?.diagnostics.find(
      (item) => item.code === "surface-indistinguishable",
    );
    expect(lint?.message).toContain("surface.DEFAULT");
    expect(lint?.message).toContain("surface.same");
    expect(lint?.data?.tokens).toEqual(["surface.DEFAULT", "surface.same"]);
  });
});
