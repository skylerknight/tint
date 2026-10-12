import { describe, expect, it } from "vitest";
import { calcAPCAabs } from "../../src/contrast/apca.js";
import { wcag2Ratio } from "../../src/contrast/wcag2.js";
import { maxChromaForLs } from "../../src/engine/generate.js";
import { border, emphasis, surface, text } from "../../src/v4/kinds.js";
import { PAGE } from "../../src/v4/graph.js";
import {
  generateV4,
  type PaletteResultV4,
  type SolvedTokenV4,
} from "../../src/v4/engine.js";
import { contrastTarget, type ContrastAlgorithm } from "../../src/v4/targets.js";

const PALETTE = {
  neutral: "#71717a",
  brand: "#4f46e5",
  danger: "#dc2626",
  warning: "#ca8a04",
  success: "#059669",
  info: "#0284c7",
} as const;

/**
 * Rest tokens plus states, and text whose backdrop is the whole row set
 * (default, hover, pressed, selected). Targets stay reachable without the
 * label auto-nudge in §6.4, which this milestone does not run.
 */
function sampleConfig(algorithm: ContrastAlgorithm) {
  return {
    contrast: { algorithm },
    palette: PALETTE,
    themes: {
      light: { mode: "light" as const },
      dark: { mode: "dark" as const },
    },
    tokens: {
      surface: {
        DEFAULT: surface(),
        sunken: surface("sunken"),
        raised: surface("raised"),
        hover: surface({ state: "hover" }),
        pressed: surface({ state: "pressed" }),
      },
      row: {
        DEFAULT: surface(),
        hover: surface({ state: "hover" }),
        pressed: surface({ state: "pressed" }),
        selected: surface({ state: "selected" }),
        on: text({ on: "row" }),
        "on-hover": text({ state: "hover", on: "row" }),
        "on-pressed": text({ state: "pressed", on: "row" }),
      },
      action: {
        quiet: emphasis("quiet"),
        subtle: emphasis("subtle"),
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        bold: emphasis("bold"),
        loud: emphasis("loud"),
        disabled: emphasis({ state: "disabled" }),
      },
      ink: {
        faint: text("faint"),
        muted: text("muted"),
        DEFAULT: text(),
        strong: text("strong"),
        max: text("max"),
        hover: text({ state: "hover" }),
        pressed: text({ state: "pressed" }),
        disabled: text({ state: "disabled" }),
      },
      line: {
        hairline: border("hairline"),
        soft: border("soft"),
        DEFAULT: border(),
        firm: border("firm"),
        heavy: border("heavy"),
        hover: border({ state: "hover" }),
        pressed: border({ state: "pressed" }),
        disabled: border({ state: "disabled" }),
      },
    },
  };
}

function token(palette: PaletteResultV4, id: string): SolvedTokenV4 {
  const found = palette.tokens.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing ${palette.name}.${id}`);
  return found;
}

function backdropRgb(palette: PaletteResultV4, id: string) {
  if (id === PAGE) return palette.page.rgb;
  return token(palette, id).color.rgb;
}

function measure(
  algorithm: ContrastAlgorithm,
  fg: SolvedTokenV4,
  bg: PaletteResultV4,
  id: string,
) {
  const background = backdropRgb(bg, id);
  return algorithm === "apca"
    ? calcAPCAabs(fg.color.rgb, background)
    : wcag2Ratio(fg.color.rgb, background);
}

/** Level target plus §4 state steps. Disabled and non-contrast kinds are skipped. */
function expectedTarget(
  algorithm: ContrastAlgorithm,
  entry: SolvedTokenV4,
): number | "max" | "skip" {
  if (entry.generated || entry.states.includes("disabled")) return "skip";
  const cell = contrastTarget(algorithm, entry.kind, entry.ordinal);
  if (cell.type === "step" || cell.type === "tint") return "skip";
  let target: number | "max" = cell.type === "max" ? "max" : cell.value;
  for (const state of entry.states) {
    if (target === "max") continue;
    const steps =
      state === "hover" || state === "focus"
        ? 1
        : state === "pressed" || state === "selected"
          ? 2
          : 0;
    if (steps === 0) continue;
    target = algorithm === "apca" ? target + 6 * steps : target * 1.15 ** steps;
  }
  return target;
}

function slop(algorithm: ContrastAlgorithm): number {
  // 8-bit sRGB can move APCA by a fraction of an Lc. WCAG stays closer.
  return algorithm === "apca" ? 1 : 0.05;
}

describe("generateV4", () => {
  const algorithms = ["apca", "wcag2"] as const;

  it("meets every non-disabled contrast target on every backdrop", () => {
    for (const algorithm of algorithms) {
      const themes = generateV4(sampleConfig(algorithm));
      expect(themes.map((theme) => theme.name)).toEqual(["light", "dark"]);
      for (const theme of themes) {
        expect(theme.diagnostics, `${algorithm}/${theme.name}`).toEqual([]);
        expect(theme.palettes.map((palette) => palette.name)).toEqual(
          Object.keys(PALETTE),
        );
        for (const palette of theme.palettes) {
          for (const entry of palette.tokens) {
            const target = expectedTarget(algorithm, entry);
            if (target === "skip") continue;
            expect(entry.backdrop.length, entry.id).toBeGreaterThan(0);
            if (target === "max") {
              expect(entry.color.oklch.l, entry.id).toBe(
                entry.polarity === "lighter" ? 1 : 0,
              );
              continue;
            }
            expect(entry.mode, entry.id).toBe("contrast");
            expect(
              entry.reached,
              `${algorithm}/${theme.mode}/${palette.name}.${entry.id}`,
            ).toBe(true);
            expect(entry.target).toBeCloseTo(target, 6);
            for (const id of entry.backdrop) {
              const achieved = measure(algorithm, entry, palette, id);
              expect(
                achieved,
                `${algorithm}/${theme.mode}/${palette.name}.${entry.id} vs ${id} (${achieved} < ${target})`,
              ).toBeGreaterThanOrEqual(target - slop(algorithm));
            }
          }
        }
      }
    }
  });

  it("orders hover and pressed by contrast against the backdrop", () => {
    for (const algorithm of algorithms) {
      for (const theme of generateV4(sampleConfig(algorithm))) {
        for (const palette of theme.palettes) {
          const groups = [
            ["surface.DEFAULT", "surface.hover", "surface.pressed"],
            ["action.DEFAULT", "action.hover", "action.pressed"],
            ["ink.DEFAULT", "ink.hover", "ink.pressed"],
            ["line.DEFAULT", "line.hover", "line.pressed"],
            ["row.on", "row.on-hover", "row.on-pressed"],
          ] as const;
          for (const [restId, hoverId, pressedId] of groups) {
            const rest = token(palette, restId);
            const hover = token(palette, hoverId);
            const pressed = token(palette, pressedId);
            // Same host backdrop for the trio. Row labels share the whole set;
            // ordering is checked against every member.
            const members = rest.backdrop;
            for (const id of members) {
              const restLc = measure(algorithm, rest, palette, id);
              const hoverLc = measure(algorithm, hover, palette, id);
              const pressedLc = measure(algorithm, pressed, palette, id);
              const where = `${algorithm}/${theme.mode}/${palette.name} ${restId} vs ${id}`;
              expect(hoverLc, where).toBeGreaterThanOrEqual(restLc - slop(algorithm));
              expect(pressedLc, where).toBeGreaterThanOrEqual(hoverLc - slop(algorithm));
            }
          }
        }
      }
    }
  });

  it("locks direction and never reports disabled tokens", () => {
    for (const algorithm of algorithms) {
      const config = {
        contrast: { algorithm },
        palette: { neutral: "#71717a" },
        themes: {
          light: { mode: "light" as const },
          dark: { mode: "dark" as const },
        },
        tokens: {
          surface: { DEFAULT: surface() },
          ink: {
            darker: text({ direction: "darker" }),
            lighter: text({ direction: "lighter" }),
            impossible:
              algorithm === "apca"
                ? text({ direction: "lighter", lc: 108 })
                : text({ direction: "lighter", ratio: 21 }),
            disabled:
              algorithm === "apca"
                ? text({ state: "disabled", direction: "lighter", lc: 108 })
                : text({ state: "disabled", direction: "lighter", ratio: 21 }),
          },
        },
      };
      for (const theme of generateV4(config)) {
        const palette = theme.palettes[0];
        if (palette === undefined) throw new Error("missing palette");
        const ground = token(palette, "surface.DEFAULT").color.oklch.l;
        expect(token(palette, "ink.darker").color.oklch.l).toBeLessThan(ground);
        expect(token(palette, "ink.lighter").color.oklch.l).toBeGreaterThan(ground);
        expect(token(palette, "ink.impossible").polarity).toBe("lighter");
        expect(token(palette, "ink.disabled").polarity).toBe("lighter");
        const paths = theme.diagnostics.map((diagnostic) => diagnostic.path);
        expect(paths.some((path) => path.includes("disabled"))).toBe(false);
        expect(paths).toContain(`neutral.ink.impossible`);
        for (const diagnostic of theme.diagnostics) {
          expect(diagnostic.code).toBe("contrast-unreachable");
          expect(diagnostic.severity).toBe("warning");
        }
      }
    }
  });

  it("is deterministic", () => {
    const config = sampleConfig("apca");
    expect(JSON.stringify(generateV4(config))).toBe(JSON.stringify(generateV4(config)));
    expect(JSON.stringify(generateV4(sampleConfig("wcag2")))).toBe(
      JSON.stringify(generateV4(sampleConfig("wcag2"))),
    );
  });

  it("applies chroma, hue, step, and state-count overrides", () => {
    const themes = generateV4({
      contrast: { algorithm: "apca" },
      palette: { brand: "#4f46e5" },
      themes: { light: { mode: "light" }, dark: { mode: "dark" } },
      states: { border: { hover: 3 }, surface: { step: { light: 0.04, dark: 0.05 } } },
      tokens: {
        surface: {
          DEFAULT: surface(),
          lifted: surface({ step: 4 }),
          flat: surface({ chroma: 2 }),
        },
        ink: {
          gray: text({ chroma: 0 }),
          shifted: emphasis("quiet", { hue: 200 }),
        },
        line: {
          DEFAULT: border("hairline"),
          hover: border("hairline", { state: "hover" }),
        },
      },
    });
    for (const theme of themes) {
      const palette = theme.palettes[0];
      if (palette === undefined) throw new Error("missing palette");
      expect(token(palette, "ink.gray").color.oklch.c).toBe(0);
      const shifted = token(palette, "ink.shifted");
      expect(shifted.color.oklch.h).toBeCloseTo(200, 5);
      const flat = token(palette, "surface.flat");
      expect(flat.color.oklch.c).toBeLessThanOrEqual(maxChromaForLs(0) + 1e-9);
      const base = token(palette, "surface.DEFAULT").color.oklch.l;
      const lifted = token(palette, "surface.lifted").color.oklch.l;
      expect(lifted).toBeGreaterThan(base);
      // Hairline is Lc 15. hover: 3 adds three ΔLc 6 steps → 33.
      expect(token(palette, "line.hover").target).toBeCloseTo(33, 6);
    }
    const light = themes.find((theme) => theme.mode === "light");
    const dark = themes.find((theme) => theme.mode === "dark");
    expect(light?.palettes[0]?.page.oklch.l).toBeCloseTo(1 - 2 * 0.04, 6);
    expect(dark?.palettes[0]?.page.oklch.l).toBeCloseTo(0.15, 6);
  });
});
