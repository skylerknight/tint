import { describe, expect, it } from "vitest";
import { wcag2Ratio } from "../../src/contrast/wcag2.js";
import {
  decorative,
  disabled,
  emphasis,
  generate,
  surface,
  text,
  toCSS,
} from "../../src/index.js";
import { border } from "../../src/v4/kinds.js";
import {
  BORDER_APCA_UNIT,
  BORDER_NON_TEXT_SCALE,
  BORDER_WCAG_UNIT,
  EMPHASIS_APCA_UNIT,
  EMPHASIS_WCAG_UNIT,
  SCALE_MAX,
  SCALE_MIN,
  SOLID_EMPHASIS_SCALE,
  SURFACE_DISTINCT_DELTA,
  DECORATIVE_SCALE_MAX,
  DECORATIVE_SCALE_MIN,
  DECORATIVE_STEP,
  SURFACE_SCALE_MAX,
  SURFACE_SCALE_MIN,
  TEXT_APCA_UNIT,
  TEXT_BODY_SCALE,
  TEXT_WCAG_UNIT,
  borderTarget,
  emphasisTarget,
  textTarget,
} from "../../src/v4/ladders.js";
import { SURFACE_STEP, surfaceLightness } from "../../src/v4/lower.js";
import { resolveConfig } from "../../src/v4/resolve.js";
import { defineConfig } from "../../src/v4/define.js";
import { validateConfig } from "../../src/v4/validate.js";
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
    expect(textTarget("wcag2", 0)).toBeCloseTo(3, 8);
    expect(textTarget("wcag2", 10)).toBeCloseTo(6.75, 8);
    expect(borderTarget("wcag2", BORDER_NON_TEXT_SCALE)).toBeCloseTo(3, 8);
    expect(borderTarget("apca", 0)).toBe(15);
    expect(emphasisTarget("apca", "light", 0)).toBe(53.7);
    expect(emphasisTarget("apca", "dark", 0)).toBe(22);
    expect(emphasisTarget("apca", "light", 10)).toBe(90);
    expect(emphasisTarget("apca", "dark", 10)).toBe(100);
    expect(emphasisTarget("apca", "light", 5)).toBe(71.85);
    expect(emphasisTarget("apca", "dark", 5)).toBe(61);
    expect(emphasisTarget("wcag2", "light", 0)).toBeCloseTo(3, 8);
    expect(emphasisTarget("wcag2", "dark", 0)).toBeCloseTo(3, 8);
    expect(emphasisTarget("wcag2", "light", 10)).toBeCloseTo(7, 8);
    expect(emphasisTarget("wcag2", "dark", 10)).toBeCloseTo(7, 8);
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
  });

  it("is strictly monotonic for every kind, in both algorithms and both modes", () => {
    const algorithms: ContrastAlgorithm[] = ["apca", "wcag2"];
    const modes: Mode[] = ["light", "dark"];
    const kinds: Exclude<Kind, "surface" | "decorative">[] = [
      "text",
      "border",
      "emphasis",
    ];
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
      for (const kind of ["text", "border", "emphasis"] as const) {
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
            disabled: disabled.emphasis(8, { nudge: false }),
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

  it("does not park disabled.surface(2) on the page", () => {
    const themes = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { lightness: 92 }, dark: { mode: "dark" } },
        tokens: {
          surface: {
            page: surface(0),
            raised: surface(1),
            soft: disabled.surface(2),
          },
        },
      }),
    );
    for (const theme of themes) {
      const palette = theme.palettes[0];
      const soft = palette?.tokens.find((token) => token.id === "surface.soft");
      const page = palette?.page.oklch.l ?? 0;
      const raised =
        palette?.tokens.find((token) => token.id === "surface.raised")?.color.oklch.l ??
        0;
      const lightness = soft?.color.oklch.l ?? 0;
      expect(Math.abs(lightness - page), theme.name).toBeGreaterThanOrEqual(0.01 - 1e-9);
      expect(Math.abs(lightness - raised), theme.name).toBeGreaterThanOrEqual(
        0.01 - 1e-9,
      );
    }
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
            disabled: disabled.emphasis(8),
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
    expect(light).toMatchObject({ mode: "light", lightness: 97 });
    expect(dark).toMatchObject({ mode: "dark", lightness: 18 });
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
  it("does not treat muted or faint text as a body-text failure", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          text: { DEFAULT: text(5), faint: text(1), muted: text(3) },
        },
      }),
    );
    expect(theme?.diagnostics.some((item) => item.code === "text-below-body")).toBe(
      false,
    );
  });

  it("still warns when a body-or-higher scale targets below body text", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(0) },
          text: { forced: text(6, { lc: 30 }) },
        },
      }),
    );
    const lint = theme?.diagnostics.find((item) => item.code === "text-below-body");
    expect(lint?.message).toContain("APCA body text");
    expect(lint?.message).toContain("Lc 75");
    expect(lint?.message).toContain(`Lowest passing scale is ${TEXT_BODY_SCALE}`);
    expect(lint?.path).toBe("neutral.text.forced");
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

  it("starts APCA emphasis at a fill that clears non-text 3:1", () => {
    const themes = generate(
      defineConfig({
        palette: {
          neutral: "#ffffff",
          brand: "#7c3aed",
          // Hue that needs the most Lc before a light-page fill reaches 3:1.
          edge: "oklch(0.7 0.25 15)",
        },
        themes: {
          light: { mode: "light" },
          dark: { mode: "dark" },
        },
        tokens: {
          ramp: { n0: emphasis(0), mid: emphasis(5), n10: emphasis(10) },
        },
      }),
    );
    for (const theme of themes) {
      for (const palette of theme.palettes) {
        const n0 = palette.tokens.find((token) => token.id === "ramp.n0");
        const mid = palette.tokens.find((token) => token.id === "ramp.mid");
        const n10 = palette.tokens.find((token) => token.id === "ramp.n10");
        expect(n0, palette.name).toBeDefined();
        expect(mid, palette.name).toBeDefined();
        expect(n10, palette.name).toBeDefined();
        if (!n0 || !mid || !n10) continue;
        const ratio = wcag2Ratio(n0.color.rgb, palette.page.rgb);
        expect(ratio, `${theme.mode} ${palette.name}`).toBeGreaterThanOrEqual(3);
        expect(n0.achieved).toBeLessThan(mid.achieved);
        expect(mid.achieved).toBeLessThan(n10.achieved);
      }
      expect(theme.diagnostics.some((item) => item.code === "emphasis-non-text")).toBe(
        false,
      );
    }
  });

  it("warns when adjacent surfaces share a lightness", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface(1), same: surface(1), raised: surface(-1) },
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

describe("surface lightness steps", () => {
  const integers: number[] = [];
  for (let n = SURFACE_SCALE_MIN; n <= SURFACE_SCALE_MAX; n += 1) integers.push(n);
  const samples = [-1.5, -0.5, 0.5, 1.5];

  const themes = generate(
    defineConfig({
      palette: { neutral: "#ffffff", brand: "#7c3aed" },
      themes: {
        light: { mode: "light" },
        dark: { mode: "dark" },
        // Enough headroom that soft 2/3/4 stay on the raised side of the page.
        lifted: { lightness: 92 },
      },
      tokens: {
        surface: Object.fromEntries(
          [...integers, ...samples].map((scale) => [stepName(scale), surface(scale)]),
        ),
        soft: {
          DEFAULT: surface(2),
          hover: surface(3),
          pressed: surface(4),
          disabled: disabled.surface(2),
        },
      },
    }),
  );

  it("steps from the page by 0.02 in light and 0.03 in dark", () => {
    for (const theme of themes) {
      if (theme.name === "lifted") continue;
      const step = SURFACE_STEP[theme.mode];
      for (const palette of theme.palettes) {
        const pageL = palette.page.oklch.l;
        for (const scale of [-2, -1, 0, 1, 2, -0.5, 0.5, 1.5]) {
          const token = palette.tokens.find(
            (entry) => entry.id === `surface.${stepName(scale)}`,
          );
          expect(token?.mode, `${theme.name} ${scale}`).toBe("lightness");
          const linear = pageL + scale * step;
          const expected = surfaceLightness(pageL, scale, step);
          expect(expected, `${theme.name} ${scale}`).toBeCloseTo(clamp01(linear), 6);
          expect(
            token?.color.oklch.l,
            `${theme.name} ${palette.name} ${scale}`,
          ).toBeCloseTo(expected, 4);
          if (scale > 0) {
            expect(
              token?.color.oklch.l,
              `${theme.name} ${scale} stays at or above the anchor`,
            ).toBeGreaterThanOrEqual(pageL - 1e-6);
          }
          if (scale < 0) {
            expect(
              token?.color.oklch.l,
              `${theme.name} ${scale} stays at or below the anchor`,
            ).toBeLessThanOrEqual(pageL + 1e-6);
          }
        }
      }
    }
  });

  it("gives every unclipped step its own color in both modes", () => {
    for (const theme of themes) {
      if (theme.name === "lifted") continue;
      const step = SURFACE_STEP[theme.mode];
      for (const palette of theme.palettes) {
        const pageL = palette.page.oklch.l;
        for (let i = 1; i < integers.length; i++) {
          const prevScale = integers[i - 1] ?? 0;
          const nextScale = integers[i] ?? 0;
          const prevL = clamp01(pageL + prevScale * step);
          const nextL = clamp01(pageL + nextScale * step);
          if (Math.abs(nextL - prevL) + 1e-9 < SURFACE_DISTINCT_DELTA) continue;
          const prev = palette.tokens.find(
            (entry) => entry.id === `surface.${stepName(prevScale)}`,
          );
          const next = palette.tokens.find(
            (entry) => entry.id === `surface.${stepName(nextScale)}`,
          );
          const label = `${theme.mode} ${palette.name} ${prevScale} vs ${nextScale}`;
          const delta = Math.abs((next?.color.oklch.l ?? 0) - (prev?.color.oklch.l ?? 0));
          expect(delta, label).toBeGreaterThanOrEqual(SURFACE_DISTINCT_DELTA - 1e-6);
          // 8-bit sRGB crushes the first few hundredths of OKLCH lightness to
          // black. Steps that actually leave that floor must differ as hex.
          const floor = Math.min(prev?.color.oklch.l ?? 0, next?.color.oklch.l ?? 0);
          if (floor >= 0.05 && nextL < 1) {
            expect(next?.color.hex, label).not.toBe(prev?.color.hex);
          }
        }
        const shown = [-1, 0, 1, 2].map(
          (scale) =>
            palette.tokens.find((entry) => entry.id === `surface.${stepName(scale)}`)
              ?.color.hex,
        );
        expect(new Set(shown).size, `${theme.mode} ${palette.name} -1..2`).toBe(4);
      }
    }
  });

  it("places a decimal surface between its integer neighbors", () => {
    const light = themes.find((theme) => theme.name === "light");
    const palette = light?.palettes.find((entry) => entry.name === "neutral");
    const at = (scale: number) =>
      palette?.tokens.find((entry) => entry.id === `surface.${stepName(scale)}`)?.color
        .oklch.l ?? 0;
    expect(at(0.5)).toBeGreaterThan(at(0));
    expect(at(0.5)).toBeLessThan(at(1));
    expect(at(-0.5)).toBeLessThan(at(0));
    expect(at(-0.5)).toBeGreaterThan(at(-1));
  });

  it("clamps a step past white and keeps it at or above the lightness 97 page", () => {
    const light = themes.find((theme) => theme.name === "light");
    const dark = themes.find((theme) => theme.name === "dark");
    const neutral = light?.palettes.find((entry) => entry.name === "neutral");
    const brand = light?.palettes.find((entry) => entry.name === "brand");
    const darkNeutral = dark?.palettes.find((entry) => entry.name === "neutral");
    const at = (palette: typeof neutral, scale: number) =>
      palette?.tokens.find((entry) => entry.id === `surface.${stepName(scale)}`)?.color
        .oklch.l ?? 0;
    const pageL = neutral?.page.oklch.l ?? 0;
    expect(pageL).toBeCloseTo(0.97, 4);
    expect(at(neutral, -1)).toBeCloseTo(0.95, 4);
    expect(at(neutral, 0)).toBeCloseTo(0.97, 4);
    expect(at(neutral, 1)).toBeCloseTo(0.99, 4);
    expect(at(neutral, 1.5)).toBeCloseTo(1, 4);
    expect(at(neutral, 2)).toBeCloseTo(1, 4);
    expect(at(neutral, 2)).toBeGreaterThanOrEqual(pageL);
    expect(at(neutral, 3)).toBeCloseTo(1, 4);
    expect(at(neutral, 5)).toBeCloseTo(1, 4);
    const clamped = brand?.tokens.find((entry) => entry.id === "surface.n2");
    expect(clamped?.color.hex).toBe("#ffffff");
    const headroom = (theme: typeof light, id: string) =>
      theme?.diagnostics.some(
        (item) => item.code === "surface-no-headroom" && item.path.endsWith(id),
      );
    expect(headroom(light, "surface.n1_5")).toBe(false);
    expect(headroom(light, "surface.n2")).toBe(true);
    expect(at(darkNeutral, -1)).toBeCloseTo(0.15, 4);
    expect(at(darkNeutral, 0)).toBeCloseTo(0.18, 4);
    expect(at(darkNeutral, 5)).toBeCloseTo(0.33, 4);
    expect(headroom(dark, "surface.n5")).toBe(false);
    expect(headroom(dark, "surface.n-7")).toBe(true);
  });

  it("paints surface.DEFAULT and re-solves body text against that step", () => {
    function paint(scale: number) {
      const [theme] = generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          themes: { light: { mode: "light" } },
          tokens: {
            surface: { DEFAULT: surface(scale), raised: surface(1) },
            text: { body: text(5) },
          },
        }),
      );
      const palette = theme?.palettes[0];
      const token = (id: string) => palette?.tokens.find((entry) => entry.id === id);
      return { palette, token };
    }

    const anchor = paint(0);
    const raised = paint(1);
    const sunken = paint(-0.5);
    expect(anchor.palette?.page.oklch.l).toBeCloseTo(0.97, 4);
    expect(anchor.token("surface.DEFAULT")?.color.oklch.l).toBeCloseTo(0.97, 4);
    expect(anchor.token("surface.DEFAULT")?.color.hex).toBe(anchor.palette?.page.hex);

    expect(raised.token("surface.DEFAULT")?.color.oklch.l).toBeCloseTo(0.99, 4);
    expect(raised.token("surface.DEFAULT")?.color.hex).not.toBe(raised.palette?.page.hex);
    expect(raised.token("surface.raised")?.color.hex).toBe(
      raised.token("surface.DEFAULT")?.color.hex,
    );
    const body = raised.token("text.body");
    expect(body?.backdrop).toEqual(["surface.DEFAULT"]);
    expect(body?.worst).toBe("surface.DEFAULT");
    expect(body?.color.hex).not.toBe(anchor.token("text.body")?.color.hex);
    expect(body?.achieved).toBeGreaterThan(70);
    const againstAnchor = wcag2Ratio(
      body?.color.rgb ?? { r: 0, g: 0, b: 0 },
      raised.palette?.page.rgb ?? { r: 0, g: 0, b: 0 },
    );
    const againstDefault = wcag2Ratio(
      body?.color.rgb ?? { r: 0, g: 0, b: 0 },
      raised.token("surface.DEFAULT")?.color.rgb ?? { r: 0, g: 0, b: 0 },
    );
    expect(againstDefault).not.toBeCloseTo(againstAnchor, 2);

    expect(sunken.token("surface.DEFAULT")?.color.oklch.l).toBeCloseTo(0.96, 4);
    expect(sunken.token("text.body")?.color.hex).not.toBe(
      anchor.token("text.body")?.color.hex,
    );
    expect(sunken.token("text.body")?.backdrop).toEqual(["surface.DEFAULT"]);
  });

  it("keeps sibling surfaces on the theme anchor when surface.DEFAULT moves", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: {
            DEFAULT: surface(1),
            anchor: surface(0),
            sunken: surface(-1),
          },
          text: { body: text(5) },
        },
      }),
    );
    const palette = theme?.palettes[0];
    const token = (id: string) => palette?.tokens.find((entry) => entry.id === id);
    expect(palette?.page.oklch.l).toBeCloseTo(0.97, 4);
    expect(token("surface.anchor")?.color.oklch.l).toBeCloseTo(0.97, 4);
    expect(token("surface.anchor")?.color.hex).toBe(palette?.page.hex);
    expect(token("surface.DEFAULT")?.color.oklch.l).toBeCloseTo(0.99, 4);
    expect(token("surface.DEFAULT")?.color.hex).not.toBe(palette?.page.hex);
    expect(token("surface.sunken")?.color.oklch.l).toBeCloseTo(0.95, 4);
    expect(token("text.body")?.backdrop).toEqual(["surface.DEFAULT"]);
    expect(token("text.body")?.worst).toBe("surface.DEFAULT");
  });

  it("orders raised, page, and sunken at the lightness extremes", () => {
    for (const lightness of [0, 50, 97, 100]) {
      const [theme] = generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          themes: { paper: { lightness } },
          tokens: {
            surface: {
              sunken: surface(-1),
              DEFAULT: surface(0),
              raised: surface(1),
            },
          },
        }),
      );
      const palette = theme?.palettes[0];
      const lightnessOf = (id: string) =>
        palette?.tokens.find((entry) => entry.id === id)?.color.oklch.l ?? -1;
      const sunken = lightnessOf("surface.sunken");
      const page = lightnessOf("surface.DEFAULT");
      const raised = lightnessOf("surface.raised");
      const anchor = lightness / 100;
      const step = theme?.mode === "dark" ? SURFACE_STEP.dark : SURFACE_STEP.light;
      const label = `lightness ${lightness}`;
      expect(raised, label).toBeGreaterThanOrEqual(page - 1e-6);
      expect(page, label).toBeGreaterThanOrEqual(sunken - 1e-6);
      expect(page, label).toBeCloseTo(anchor, 4);
      const headroom = (id: string) =>
        theme?.diagnostics.some(
          (item) => item.code === "surface-no-headroom" && item.path.endsWith(id),
        );
      if (anchor + step <= 1 + 1e-9) {
        expect(raised, label).toBeGreaterThan(page);
        expect(headroom("surface.raised"), label).toBe(false);
      } else {
        expect(raised, label).toBeCloseTo(page, 4);
        expect(headroom("surface.raised"), label).toBe(true);
      }
      if (anchor - step >= -1e-9) {
        expect(page, label).toBeGreaterThan(sunken);
        expect(headroom("surface.sunken"), label).toBe(false);
      } else {
        expect(sunken, label).toBeCloseTo(page, 4);
        expect(headroom("surface.sunken"), label).toBe(true);
      }
    }
  });

  it("steps surface(n, { on }) from that surface and rejects a cycle", () => {
    const nested = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { lifted: { lightness: 92 }, light: { mode: "light" } },
        tokens: {
          panel: { DEFAULT: surface(1) },
          card: {
            DEFAULT: surface(2, { on: "panel" }),
            sunken: surface(-1, { on: "panel" }),
          },
          plain: { DEFAULT: surface(2), sunken: surface(-1) },
        },
      }),
    );
    const lifted = nested.find((entry) => entry.name === "lifted");
    const palette = lifted?.palettes[0];
    const at = (id: string) =>
      palette?.tokens.find((entry) => entry.id === id)?.color.oklch.l ?? -1;
    expect(at("panel.DEFAULT")).toBeCloseTo(0.94, 4);
    expect(at("card.DEFAULT")).toBeCloseTo(0.98, 4);
    expect(at("card.sunken")).toBeCloseTo(0.92, 4);
    expect(at("plain.DEFAULT")).toBeCloseTo(0.96, 4);
    expect(at("plain.sunken")).toBeCloseTo(0.9, 4);
    expect(at("card.DEFAULT")).toBeGreaterThan(at("panel.DEFAULT"));
    expect(at("card.DEFAULT")).not.toBeCloseTo(at("plain.DEFAULT"), 3);

    const [tight] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          panel: { DEFAULT: surface(1) },
          card: { DEFAULT: surface(1, { on: "panel" }) },
        },
      }),
    );
    const tightPalette = tight?.palettes[0];
    const tightAt = (id: string) =>
      tightPalette?.tokens.find((entry) => entry.id === id)?.color.oklch.l ?? -1;
    expect(tightAt("panel.DEFAULT")).toBeCloseTo(0.99, 4);
    expect(tightAt("card.DEFAULT")).toBeCloseTo(1, 4);
    expect(tightAt("card.DEFAULT")).toBeGreaterThanOrEqual(tightAt("panel.DEFAULT"));
    expect(
      tight?.diagnostics.some(
        (item) =>
          item.code === "surface-no-headroom" && item.path.endsWith("card.DEFAULT"),
      ),
    ).toBe(true);

    expect(() =>
      generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          themes: { light: { mode: "light" } },
          tokens: {
            a: { DEFAULT: surface(1, { on: "b" }) },
            b: { DEFAULT: surface(1, { on: "a" }) },
          },
        }),
      ),
    ).toThrow(/Backdrop cycle/);
  });

  it("keeps soft surface(2), surface(3), and surface(4) distinct when the page has room", () => {
    for (const name of ["lifted", "dark"] as const) {
      const theme = themes.find((entry) => entry.name === name);
      for (const palette of theme?.palettes ?? []) {
        const hex = (id: string) =>
          palette.tokens.find((entry) => entry.id === id)?.color.hex;
        const rest = hex("soft.DEFAULT");
        const hover = hex("soft.hover");
        const pressed = hex("soft.pressed");
        expect(rest, `${name} ${palette.name}`).toBeDefined();
        expect(new Set([rest, hover, pressed]).size, `${name} ${palette.name}`).toBe(3);
      }
    }
  });
});

describe("scale range", () => {
  function issuesFor(token: { kind: string; scale: number }) {
    const result = validateConfig({
      palette: { neutral: "#ffffff" },
      tokens: { sample: { DEFAULT: token } },
    });
    return result.ok ? [] : result.issues;
  }

  it("accepts the ends of each range, including decimals", () => {
    for (const token of [
      { kind: "emphasis", scale: SCALE_MIN },
      { kind: "text", scale: SCALE_MAX },
      { kind: "border", scale: 4.5 },
      { kind: "surface", scale: SURFACE_SCALE_MIN },
      { kind: "surface", scale: 0 },
      { kind: "surface", scale: SURFACE_SCALE_MAX },
      { kind: "surface", scale: -1.5 },
    ]) {
      expect(issuesFor(token), JSON.stringify(token)).toEqual([]);
    }
  });

  it("accepts emphasis, text, and border outside 0..10", () => {
    for (const kind of ["emphasis", "text", "border"] as const) {
      for (const scale of [-0.1, -1, 10.1, 11]) {
        expect(issuesFor({ kind, scale }), `${kind}(${scale})`).toEqual([]);
      }
    }
  });

  it("rejects surface outside -10..10", () => {
    for (const scale of [-10.1, -11, 10.1, 11]) {
      const issues = issuesFor({ kind: "surface", scale });
      const scaleIssue = issues.find((issue) => issue.path.endsWith(".scale"));
      expect(scaleIssue?.message, `surface(${scale})`).toContain(
        `outside ${SURFACE_SCALE_MIN}..${SURFACE_SCALE_MAX}`,
      );
      expect(scaleIssue?.message).toContain("signed lightness");
    }
  });

  it("fails generation when surface leaves -10..10", () => {
    expect(() =>
      generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          tokens: { surface: { DEFAULT: surface(-11) } },
        }),
      ),
    ).toThrow(/surface\(n\) is signed lightness steps from the page/);
  });

  it("warns when a plain contrast scale leaves 0..10", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          sample: {
            low: text(-1),
            high: emphasis(11),
            mark: decorative(-1),
          },
        },
      }),
    );
    const warnings = theme?.diagnostics.filter(
      (item) => item.code === "scale-out-of-range",
    );
    expect(warnings?.map((item) => item.path).sort()).toEqual([
      "neutral.sample.high",
      "neutral.sample.low",
    ]);
    expect(
      warnings?.find((item) => item.path === "neutral.sample.low")?.message,
    ).toContain("below the accessible floor for text");
    expect(
      warnings?.find((item) => item.path === "neutral.sample.high")?.message,
    ).toContain("above the achievable ceiling for emphasis");
    expect(warnings?.some((item) => item.path === "neutral.sample.mark")).toBe(false);
  });

  it("does not warn when scale 10 is past the achievable contrast", () => {
    const [theme] = generate(
      defineConfig({
        palette: { brand: "#7c3aed" },
        themes: { light: { lightness: 92 } },
        tokens: { sample: { strong: text(10), edge: emphasis(10) } },
      }),
    );
    expect(
      theme?.diagnostics.some(
        (item) =>
          item.code === "contrast-unreachable" &&
          (item.path === "brand.sample.strong" || item.path === "brand.sample.edge"),
      ),
    ).toBe(false);
  });

  it("warns only when decorative resolves to the same color as its backdrop", () => {
    const [theme] = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: { light: { mode: "light" } },
        tokens: {
          sample: {
            flat: decorative(0),
            hairline: decorative(1.5),
            faint: decorative(1),
          },
        },
      }),
    );
    const flat = theme?.diagnostics.filter(
      (item) => item.code === "decorative-indistinguishable",
    );
    expect(flat?.map((item) => item.path)).toEqual(["neutral.sample.flat"]);
    expect(flat?.[0]?.message).toContain("same color");
    expect(
      theme?.diagnostics.some(
        (item) =>
          item.path === "neutral.sample.hairline" || item.path === "neutral.sample.faint",
      ),
    ).toBe(false);
  });

  it("rejects a decorative flag and a scale outside -10..10", () => {
    expect(() =>
      generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          tokens: {
            bad: { DEFAULT: { kind: "surface", scale: 0, decorative: true } },
          },
        }),
      ),
    ).toThrow(/decorative is its own kind/);
    expect(() =>
      generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          tokens: { mark: { DEFAULT: decorative(11) } },
        }),
      ),
    ).toThrow(/decorative\(n\) is signed lightness steps away from its backdrop/);
    expect(() =>
      generate(
        defineConfig({
          palette: { neutral: "#ffffff" },
          tokens: { mark: { DEFAULT: { kind: "decorative", scale: 2, chroma: 1 } } },
        }),
      ),
    ).toThrow(/takes a scale and an optional on/);
  });

  it("steps decorative lightness away from the backdrop in both modes", () => {
    const steps = [1, 2, 5, 10] as const;
    const themes = generate(
      defineConfig({
        palette: { neutral: "#ffffff" },
        themes: {
          light: { mode: "light" },
          dark: { mode: "dark" },
        },
        tokens: {
          surface: { DEFAULT: surface(0) },
          mark: {
            n1: decorative(1),
            n2: decorative(2),
            n5: decorative(5),
            n10: decorative(10),
            back: decorative(-1),
          },
        },
      }),
    );
    for (const theme of themes) {
      const palette = theme.palettes[0];
      if (palette === undefined) throw new Error("missing palette");
      const anchor = theme.mode === "light" ? 0.97 : 0.18;
      const sign = theme.mode === "light" ? -1 : 1;
      const lights: number[] = [];
      for (const step of steps) {
        const token = palette.tokens.find((entry) => entry.id === `mark.n${step}`);
        if (token === undefined) throw new Error(`missing mark.n${step}`);
        expect(token.kind).toBe("decorative");
        expect(token.backdrop).toEqual(["surface.DEFAULT"]);
        expect(token.color.oklch.l).toBeCloseTo(
          anchor + sign * step * DECORATIVE_STEP,
          4,
        );
        expect(token.color.oklch.c).toBeLessThan(1e-6);
        const ratio = wcag2Ratio(token.color.rgb, palette.page.rgb);
        if (step <= 2) expect(ratio).toBeLessThan(1.3);
        if (step === 10) {
          expect(ratio).toBeGreaterThan(3);
          expect(ratio).toBeLessThan(7);
        }
        lights.push(token.color.oklch.l);
      }
      for (let i = 1; i < lights.length; i++) {
        expect(sign * ((lights[i] ?? 0) - (lights[i - 1] ?? 0))).toBeGreaterThan(0);
      }
      const back = palette.tokens.find((entry) => entry.id === "mark.back");
      if (back === undefined) throw new Error("missing mark.back");
      expect(sign * (back.color.oklch.l - anchor)).toBeLessThan(0);
    }
    expect(DECORATIVE_SCALE_MIN).toBe(-10);
    expect(DECORATIVE_SCALE_MAX).toBe(10);
  });
});

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function targetOf(
  kind: Exclude<Kind, "surface" | "decorative">,
  algorithm: ContrastAlgorithm,
  mode: Mode,
  scale: number,
): number {
  if (kind === "emphasis") return emphasisTarget(algorithm, mode, scale);
  if (kind === "border") return borderTarget(algorithm, scale);
  return textTarget(algorithm, scale);
}

function stepName(scale: number): string {
  return `n${String(scale).replace(".", "_")}`;
}
