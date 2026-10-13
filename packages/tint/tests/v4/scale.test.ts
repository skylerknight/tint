import { describe, expect, it } from "vitest";
import { wcag2Ratio } from "../../src/contrast/wcag2.js";
import { disabled, emphasis, generate, surface, text, toCSS } from "../../src/index.js";
import { border } from "../../src/v4/kinds.js";
import {
  BORDER_APCA_UNIT,
  BORDER_NON_TEXT_SCALE,
  BORDER_WCAG_UNIT,
  EMPHASIS_APCA_UNIT,
  EMPHASIS_WCAG_UNIT,
  SOLID_EMPHASIS_SCALE,
  SURFACE_APCA_UNIT,
  TEXT_APCA_UNIT,
  TEXT_BODY_SCALE,
  TEXT_WCAG_UNIT,
  borderTarget,
  emphasisTarget,
  surfaceTarget,
  textTarget,
} from "../../src/v4/ladders.js";
import { resolveConfig } from "../../src/v4/resolve.js";
import { defineConfig } from "../../src/v4/define.js";
import type { ContrastAlgorithm, Kind, Mode } from "../../src/v4/types.js";

function approx(value: number, expected: number, digits = 4): void {
  expect(value).toBeCloseTo(expected, digits);
}

const STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
];

describe("contrast ladders", () => {
  it("anchors body text, the border 3:1 rung, and the ends of each curve", () => {
    expect(textTarget("apca", TEXT_BODY_SCALE)).toBe(75);
    expect(textTarget("wcag2", TEXT_BODY_SCALE)).toBe(4.5);
    expect(textTarget("apca", 0)).toBe(45);
    expect(borderTarget("wcag2", BORDER_NON_TEXT_SCALE)).toBeCloseTo(3, 8);
    expect(borderTarget("apca", 0)).toBe(15);
    expect(emphasisTarget("apca", "light", 0)).toBe(0);
    expect(emphasisTarget("apca", "light", 10)).toBe(90);
    expect(emphasisTarget("apca", "dark", 10)).toBe(100);
    expect(emphasisTarget("wcag2", "light", 0)).toBeCloseTo(1, 8);
    expect(emphasisTarget("wcag2", "dark", 10)).toBeCloseTo(7, 8);
    expect(surfaceTarget("apca", "light", 0)).toBe(0);
    expect(surfaceTarget("wcag2", "light", 10)).toBeCloseTo(2, 8);
  });

  it("gives each kind a constant unit", () => {
    approx(textTarget("apca", 6) - textTarget("apca", 5), TEXT_APCA_UNIT);
    approx(textTarget("wcag2", 6) / textTarget("wcag2", 5), TEXT_WCAG_UNIT);
    approx(borderTarget("apca", 4) - borderTarget("apca", 3), BORDER_APCA_UNIT);
    approx(borderTarget("wcag2", 4) / borderTarget("wcag2", 3), BORDER_WCAG_UNIT);
    approx(
      emphasisTarget("apca", "light", 8) - emphasisTarget("apca", "light", 7),
      EMPHASIS_APCA_UNIT.light,
    );
    approx(
      emphasisTarget("apca", "dark", 8) - emphasisTarget("apca", "dark", 7),
      EMPHASIS_APCA_UNIT.dark,
    );
    approx(
      emphasisTarget("wcag2", "light", 8) / emphasisTarget("wcag2", "light", 7),
      EMPHASIS_WCAG_UNIT,
    );
    approx(
      surfaceTarget("apca", "dark", 4) - surfaceTarget("apca", "dark", 3),
      SURFACE_APCA_UNIT.dark,
    );
  });

  it("interpolates decimals halfway between the surrounding integers", () => {
    approx(textTarget("apca", 4.5), (textTarget("apca", 4) + textTarget("apca", 5)) / 2);
    approx(
      textTarget("wcag2", 4.5),
      Math.sqrt(textTarget("wcag2", 4) * textTarget("wcag2", 5)),
    );
    approx(
      emphasisTarget("apca", "dark", 7.5),
      (emphasisTarget("apca", "dark", 7) + emphasisTarget("apca", "dark", 8)) / 2,
    );
    approx(
      emphasisTarget("wcag2", "light", 8.5),
      Math.sqrt(
        emphasisTarget("wcag2", "light", 8) * emphasisTarget("wcag2", "light", 9),
      ),
    );
    approx(
      borderTarget("apca", 2.5),
      (borderTarget("apca", 2) + borderTarget("apca", 3)) / 2,
    );
    approx(
      surfaceTarget("wcag2", "dark", 3.5),
      Math.sqrt(surfaceTarget("wcag2", "dark", 3) * surfaceTarget("wcag2", "dark", 4)),
    );
  });

  it("is strictly monotonic for every kind, in both algorithms and both modes", () => {
    const algorithms: ContrastAlgorithm[] = ["apca", "wcag2"];
    const modes: Mode[] = ["light", "dark"];
    const kinds: Kind[] = ["surface", "text", "border", "emphasis"];
    for (const algorithm of algorithms) {
      for (const mode of modes) {
        for (const kind of kinds) {
          const values = STEPS.map((scale) => targetOf(kind, algorithm, mode, scale));
          for (let i = 1; i < values.length; i++) {
            const prev = values[i - 1];
            const next = values[i];
            expect(next, `${kind} ${algorithm} ${mode} ${STEPS[i]}`).toBeGreaterThan(
              prev ?? 0,
            );
          }
        }
      }
    }
  });
});

describe("solved scales", () => {
  const themes = generate(
    defineConfig({
      palette: { brand: "#7c3aed" },
      themes: {
        light: { mode: "light" },
        dark: { mode: "dark" },
      },
      tokens: {
        surface: Object.fromEntries(
          STEPS.map((scale) => [stepName(scale), surface(scale)]),
        ),
        text: Object.fromEntries(STEPS.map((scale) => [stepName(scale), text(scale)])),
        border: Object.fromEntries(
          STEPS.map((scale) => [stepName(scale), border(scale)]),
        ),
        emphasis: Object.fromEntries(
          STEPS.map((scale) => [stepName(scale), emphasis(scale, { nudge: false })]),
        ),
      },
    }),
  );

  it("moves lightness in one direction as the scale rises", () => {
    for (const theme of themes) {
      const palette = theme.palettes[0];
      if (palette === undefined) throw new Error("missing palette");
      const sign = theme.mode === "light" ? -1 : 1;
      for (const kind of ["surface", "text", "border", "emphasis"] as const) {
        const colors = STEPS.map((scale) => {
          const token = palette.tokens.find(
            (entry) => entry.id === `${kind}.${stepName(scale)}`,
          );
          if (token === undefined) throw new Error(`missing ${kind} ${scale}`);
          return token.color.oklch.l;
        });
        for (let i = 1; i < colors.length; i++) {
          const prev = colors[i - 1] ?? 0;
          const next = colors[i] ?? 0;
          expect(
            sign * (next - prev),
            `${theme.mode} ${kind} ${STEPS[i]}`,
          ).toBeGreaterThanOrEqual(-1e-4);
        }
        const first = colors[0] ?? 0;
        const last = colors[colors.length - 1] ?? 0;
        expect(Math.abs(last - first), `${theme.mode} ${kind} span`).toBeGreaterThan(
          0.05,
        );
      }
    }
  });

  it("places a decimal step between its integer neighbors", () => {
    const light = themes.find((theme) => theme.name === "light");
    const token = (id: string) =>
      light?.palettes[0]?.tokens.find((entry) => entry.id === id);
    const mid = token("emphasis.n4_5")?.color.oklch.l ?? 0;
    const low = token("emphasis.n4")?.color.oklch.l ?? 0;
    const high = token("emphasis.n5")?.color.oklch.l ?? 0;
    expect(mid).toBeLessThan(low);
    expect(mid).toBeGreaterThan(high);
  });
});

describe("disabled treatment", () => {
  it("keeps the scale, lowers chroma, stays near the solved color, and emits a solid", () => {
    const [theme] = generate(
      defineConfig({
        palette: { brand: "#7c3aed" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: {
            DEFAULT: emphasis(8, { nudge: false }),
            disabled: disabled(emphasis(8, { nudge: false })),
          },
        },
      }),
    );
    const palette = theme?.palettes[0];
    const rest = palette?.tokens.find((token) => token.id === "action.DEFAULT");
    const muted = palette?.tokens.find((token) => token.id === "action.disabled");
    if (palette === undefined || rest === undefined || muted === undefined) {
      throw new Error("missing tokens");
    }
    expect(muted.scale).toBe(rest.scale);
    expect(muted.disabled).toBe(true);
    expect(muted.color.oklch.c).toBeLessThan(rest.color.oklch.c);
    expect(Math.abs(muted.color.oklch.l - rest.color.oklch.l)).toBeLessThanOrEqual(
      0.06 + 1e-6,
    );
    expect(Math.abs(muted.color.oklch.l - palette.page.oklch.l)).toBeLessThan(
      Math.abs(rest.color.oklch.l - palette.page.oklch.l),
    );
    expect(muted.color.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(rest.color.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(muted.color.rgb).not.toHaveProperty("a");
  });

  it("writes only solid colors", () => {
    const themes = generate(
      defineConfig({
        palette: { brand: "#7c3aed" },
        themes: { light: { mode: "light" }, dark: { mode: "dark" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: {
            DEFAULT: emphasis(8),
            disabled: disabled(emphasis(8)),
            on: text(5, { on: "action" }),
          },
        },
      }),
    );
    const css = toCSS(themes);
    expect(css).not.toMatch(/oklch\([^)]*\//);
    expect(css).not.toMatch(/#[0-9a-fA-F]{8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    for (const theme of themes) {
      for (const palette of theme.palettes) {
        expect(palette.page.hex).toMatch(/^#[0-9a-f]{6}$/);
        for (const token of palette.tokens) {
          expect(token.color.hex, token.id).toMatch(/^#[0-9a-f]{6}$/);
          expect(wcag2Ratio(token.color.rgb, palette.page.rgb)).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("hover and pressed", () => {
  it("may step either way and still differ from the rest fill", () => {
    const themes = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" }, dark: { mode: "dark" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          action: {
            DEFAULT: emphasis(8, { nudge: false }),
            hover: emphasis(7, { nudge: false }),
            pressed: emphasis(9, { nudge: false }),
          },
        },
      }),
    );
    for (const theme of themes) {
      const palette = theme.palettes[0];
      const at = (id: string) => palette?.tokens.find((token) => token.id === id);
      const rest = at("action.DEFAULT");
      const hover = at("action.hover");
      const pressed = at("action.pressed");
      if (rest === undefined || hover === undefined || pressed === undefined) {
        throw new Error("missing action tokens");
      }
      expect(Math.abs(hover.color.oklch.l - rest.color.oklch.l)).toBeGreaterThan(0.01);
      expect(Math.abs(pressed.color.oklch.l - rest.color.oklch.l)).toBeGreaterThan(0.01);
      expect(hover.achieved).toBeGreaterThan(1);
      expect(pressed.achieved).toBeGreaterThan(hover.achieved);
      if (theme.mode === "light") {
        expect(hover.color.oklch.l).toBeGreaterThan(rest.color.oklch.l);
        expect(pressed.color.oklch.l).toBeLessThan(rest.color.oklch.l);
      } else {
        expect(hover.color.oklch.l).toBeLessThan(rest.color.oklch.l);
        expect(pressed.color.oklch.l).toBeGreaterThan(rest.color.oklch.l);
      }
    }
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

  it("rejects $role", () => {
    const resolved = resolveConfig({
      palette: { neutral: "#ffffff" },
      tokens: { text: { DEFAULT: { kind: "text", scale: 5, $role: "text" } } },
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.issues?.some((issue) => issue.message.includes("$role"))).toBe(true);
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
      tokens: { text: { DEFAULT: { kind: "text", scale: 5 } } },
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
      tokens: { surface: { DEFAULT: surface(0) }, text: { DEFAULT: text(5) } },
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
          text: { DEFAULT: text(5), faint: text(1) },
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
          action: { DEFAULT: emphasis(2), on: text(5, { on: "action" }) },
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
          action: {
            DEFAULT: emphasis(SOLID_EMPHASIS_SCALE, { ratio: 1.2, nudge: false }),
          },
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
          surface: { DEFAULT: surface(4), same: surface(4), raised: surface(8) },
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

function targetOf(
  kind: Kind,
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (kind === "surface") return surfaceTarget(algorithm, mode, scale);
  if (kind === "emphasis") return emphasisTarget(algorithm, mode, scale);
  if (kind === "border") return borderTarget(algorithm, scale);
  return textTarget(algorithm, scale);
}

function stepName(scale: number): string {
  return `n${String(scale).replace(".", "_")}`;
}
