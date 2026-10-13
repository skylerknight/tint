import { describe, expect, it } from "vitest";
import { emphasis, generate, surface, text } from "../../src/index.js";
import {
  BORDER_LADDER,
  EMPHASIS_LADDER,
  TEXT_BODY_SCALE,
  TEXT_MIN_SCALE,
  TEXT_LADDER,
  emphasisContrast,
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

  it("places emphasis solids on a mode-aware ladder", () => {
    expect(emphasisContrast("apca", "light", 9)).toBe(EMPHASIS_LADDER.apca.light[0]);
    expect(emphasisContrast("apca", "light", 10)).toBe(EMPHASIS_LADDER.apca.light[1]);
    expect(emphasisContrast("apca", "light", 11)).toBe(EMPHASIS_LADDER.apca.light[2]);
    expect(emphasisContrast("apca", "dark", 9)).toBe(EMPHASIS_LADDER.apca.dark[0]);
    expect(emphasisContrast("apca", "dark", 11)).toBe(EMPHASIS_LADDER.apca.dark[2]);
    approx(emphasisContrast("apca", "light", 9.5), (62 + 74) / 2);
    approx(emphasisContrast("apca", "dark", 9.5), (75 + 87) / 2);
    approx(emphasisContrast("wcag2", "light", 9.5), 3 * Math.sqrt(4.5 / 3));
    expect(emphasisContrast("wcag2", "dark", 9)).toBe(3);
    expect(emphasisContrast("wcag2", "light", 11)).toBe(7);
    approx(emphasisContrast("apca", "light", 12), 90 + (90 - 74));
    approx(emphasisContrast("apca", "dark", 12), 100 + (100 - 87));
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
  it("warns when text is under the minimum and lets muted text through", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          text: {
            DEFAULT: text(3),
            muted: text(2),
            faint: text(1),
            ghost: text(0),
          },
          action: {
            disabled: emphasis(1, { chroma: 0.3 }),
            "on-disabled": text(-1, { on: "action.disabled", chroma: 0.3 }),
          },
        },
      }),
    );
    const ghost = theme?.diagnostics.find((item) => item.code === "text-below-body");
    expect(ghost?.message).toContain("APCA minimum text");
    expect(ghost?.message).toContain("Lc 45");
    expect(ghost?.message).toContain(`Lowest passing scale is ${TEXT_MIN_SCALE}`);
    expect(ghost?.path).toBe("neutral.text.ghost");
    for (const path of [
      "neutral.text.DEFAULT",
      "neutral.text.muted",
      "neutral.text.faint",
      "neutral.action.on-disabled",
    ]) {
      expect(theme?.diagnostics.some((item) => item.path === path)).toBe(false);
    }
  });

  it("uses the WCAG 3:1 floor and exempts disabled text", () => {
    const [theme] = generate(
      defineConfig({
        contrast: { algorithm: "wcag2" },
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          text: { faint: text(1), ghost: text(0) },
          action: {
            disabled: emphasis(1),
            "on-disabled": text(0, { on: "action.disabled" }),
          },
        },
      }),
    );
    const ghost = theme?.diagnostics.find((item) => item.code === "text-below-body");
    expect(ghost?.message).toContain("WCAG 2 minimum text");
    expect(ghost?.message).toContain("ratio 3");
    expect(ghost?.path).toBe("neutral.text.ghost");
    expect(theme?.diagnostics.some((item) => item.path === "neutral.text.faint")).toBe(
      false,
    );
    expect(
      theme?.diagnostics.some((item) => item.path === "neutral.action.on-disabled"),
    ).toBe(false);
  });

  it("warns when a solid emphasis fill misses non-text 3:1", () => {
    const [theme] = generate(
      defineConfig({
        contrast: { algorithm: "wcag2" },
        palette: { neutral: "#ffffff" },
        themes: { light: { lightness: 96 } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: { DEFAULT: emphasis(2), on: text(3, { on: "action" }) },
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
          action: { DEFAULT: emphasis(9, { ratio: 2, chroma: 0.2 }) },
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

describe("calibrated emphasis", () => {
  function tokenL(
    mode: "light" | "dark",
    scale: number,
    algorithm: "apca" | "wcag2" = "apca",
  ): { l: number; mode: string; achieved: number; target?: number } {
    const [theme] = generate(
      defineConfig({
        contrast: { algorithm },
        palette: { neutral: "#ffffff" },
        themes: { only: { mode } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: { DEFAULT: emphasis(scale) },
        },
      }),
    );
    const token = theme?.palettes[0]?.tokens.find(
      (entry) => entry.id === "action.DEFAULT",
    );
    if (token === undefined) throw new Error("missing action.DEFAULT");
    return {
      l: token.color.oklch.l,
      mode: token.mode,
      achieved: token.achieved,
      ...(token.target !== undefined ? { target: token.target } : {}),
    };
  }

  it("keeps the soft ramp on even tint steps", () => {
    const light2 = tokenL("light", 2);
    const dark2 = tokenL("dark", 2);
    expect(light2.mode).toBe("lightness");
    expect(dark2.mode).toBe("lightness");
    expect(light2.l).toBeCloseTo(0.96 - 2 * 0.025, 2);
    expect(dark2.l).toBeCloseTo(0.15 + 2 * 0.0375, 2);
    expect(tokenL("light", 2.5).l).toBeCloseTo(0.96 - 3 * 0.025, 2);
    expect(tokenL("light", 3).l).toBeCloseTo(0.96 - 4 * 0.025, 2);
    expect(tokenL("dark", 3).l).toBeCloseTo(0.15 + 4 * 0.0375, 2);
    const lightStep = Math.abs(tokenL("light", 2).l - tokenL("light", 3).l);
    const darkStep = Math.abs(tokenL("dark", 2).l - tokenL("dark", 3).l);
    expect(lightStep).toBeGreaterThan(0.04);
    expect(darkStep).toBeGreaterThan(0.06);
  });

  it("puts the disabled floor at emphasis(1) without an lc override", () => {
    for (const mode of ["light", "dark"] as const) {
      const row = tokenL(mode, 1);
      expect(row.mode).toBe("contrast");
      expect(row.target).toBeCloseTo(15, 5);
      expect(row.achieved).toBeGreaterThan(14);
      const half = tokenL(mode, 0.5);
      const page = mode === "light" ? 0.96 : 0.15;
      expect(half.mode).toBe("lightness");
      const between =
        mode === "light"
          ? half.l < page && half.l > row.l
          : half.l > page && half.l < row.l;
      expect(between).toBe(true);
    }
  });

  it("solves emphasis 9–11 against the backdrop", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const scale of [9, 9.5, 10, 11]) {
        const row = tokenL(mode, scale);
        expect(row.mode).toBe("contrast");
        expect(row.target).toBeCloseTo(emphasisContrast("apca", mode, scale), 5);
        expect(row.achieved).toBeGreaterThan(row.target! - 1);
      }
    }
    const wcag = tokenL("light", 10, "wcag2");
    expect(wcag.target).toBeCloseTo(4.5, 5);
    expect(wcag.achieved).toBeGreaterThan(4.4);
  });

  it("blends lightness from the tint at 3 into the solid at 9", () => {
    for (const mode of ["light", "dark"] as const) {
      const tint = tokenL(mode, 3);
      const mid = tokenL(mode, 6);
      const solid = tokenL(mode, 9);
      expect(mid.mode).toBe("lightness");
      const toward =
        mode === "light"
          ? mid.l < tint.l && mid.l > solid.l
          : mid.l > tint.l && mid.l < solid.l;
      expect(toward).toBe(true);
      expect(mid.l).toBeCloseTo((tint.l + solid.l) / 2, 2);
    }
  });

  it("keeps integer steps visible from the soft ramp through the first solid", () => {
    for (const mode of ["light", "dark"] as const) {
      const scales = [2, 3, 4, 5, 6, 7, 8, 9];
      const levels = scales.map((scale) => tokenL(mode, scale).l);
      for (let i = 1; i < levels.length; i++) {
        const delta = Math.abs((levels[i] ?? 0) - (levels[i - 1] ?? 0));
        expect(delta).toBeGreaterThan(0.03);
        expect(delta).toBeLessThan(0.12);
      }
    }
  });

  it("lets body text sit on a solid fill in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      const [theme] = generate(
        defineConfig({
          palette: { brand: mode === "light" ? "#7c3aed" : "#a78bfa" },
          themes: { only: { mode } },
          tokens: {
            surface: { DEFAULT: surface(0) },
            action: {
              DEFAULT: emphasis(9),
              hover: emphasis(9.5),
              pressed: emphasis(10),
              on: text(3, { on: "action" }),
            },
          },
        }),
      );
      const on = theme?.palettes[0]?.tokens.find((entry) => entry.id === "action.on");
      expect(on?.achieved).toBeGreaterThanOrEqual(75 - 0.5);
      expect(theme?.diagnostics.some((item) => item.code === "label-unreachable")).toBe(
        false,
      );
      expect(
        theme?.diagnostics.some((item) => item.code === "contrast-unreachable"),
      ).toBe(false);
    }
  });
});
