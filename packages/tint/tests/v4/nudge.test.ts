// @ts-nocheck — old level/state API, excluded on proto/numeric-scale
import { describe, expect, it } from "vitest";
import { auditV4, formatAuditTable } from "../../src/audit/index.js";
import { emphasis, surface, text } from "../../src/v4/kinds.js";
import {
  generateV4,
  type GenerationResultV4,
  type PaletteResultV4,
  type SolvedTokenV4,
} from "../../src/v4/engine.js";

function token(palette: PaletteResultV4, id: string): SolvedTokenV4 {
  const found = palette.tokens.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing ${palette.name}.${id}`);
  return found;
}

function themeNamed(themes: readonly GenerationResultV4[], mode: "light" | "dark") {
  const found = themes.find((theme) => theme.mode === mode);
  if (found === undefined) throw new Error(`missing ${mode}`);
  return found;
}

function paletteOf(theme: GenerationResultV4): PaletteResultV4 {
  const palette = theme.palettes[0];
  if (palette === undefined) throw new Error("missing palette");
  return palette;
}

function codes(theme: GenerationResultV4): string[] {
  return theme.diagnostics.map((diagnostic) => diagnostic.code);
}

/**
 * Body text sitting on a solid emphasis. In APCA dark mode the solved fill
 * is not light enough for the label, so nudge has work to do.
 */
function button(options?: { nudge?: false; algorithm?: "apca" | "wcag2" }) {
  const algorithm = options?.algorithm ?? "apca";
  const fill = options?.nudge === false ? emphasis({ nudge: false }) : emphasis();
  return {
    contrast: { algorithm },
    palette: { brand: "#7c3aed" },
    themes: {
      dark: { mode: "dark" as const },
      light: { mode: "light" as const },
    },
    tokens: {
      surface: { DEFAULT: surface() },
      action: {
        DEFAULT: fill,
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        on: text({ on: "action" }),
      },
    },
  };
}

function exactConfig(color: string) {
  return {
    contrast: { algorithm: "apca" as const },
    palette: { brand: { color, exact: true } },
    themes: { light: { mode: "light" as const } },
    tokens: {
      surface: { DEFAULT: surface() },
      action: {
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        on: text({ on: "action" }),
      },
    },
  };
}

describe("auto-nudge", () => {
  it("moves dark-mode emphasis until body text passes", () => {
    const nudged = themeNamed(generateV4(button()), "dark");
    const held = themeNamed(generateV4(button({ nudge: false })), "dark");
    const palette = paletteOf(nudged);
    const frozen = paletteOf(held);
    const on = token(palette, "action.on");
    const rest = token(palette, "action.DEFAULT");
    const hover = token(palette, "action.hover");

    expect(on.reached).toBe(true);
    expect(on.target).toBeDefined();
    expect(on.achieved).toBeGreaterThanOrEqual((on.target ?? 0) - 1e-6);
    expect(rest.reached).toBe(true);
    expect(rest.color.oklch.l).toBeGreaterThan(
      token(frozen, "action.DEFAULT").color.oklch.l,
    );
    expect(hover.color.oklch.l).toBeGreaterThan(
      token(frozen, "action.hover").color.oklch.l,
    );

    const diagnostic = nudged.diagnostics.find((item) => item.code === "emphasis-nudged");
    expect(diagnostic?.severity).toBe("info");
    expect(diagnostic?.data?.delta).toBeGreaterThan(0);
    expect(diagnostic?.data?.delta).toBeCloseTo(
      rest.color.oklch.l - token(frozen, "action.DEFAULT").color.oklch.l,
      4,
    );
    expect(codes(nudged)).not.toContain("label-unreachable");
  });

  it("reports label-unreachable when nudge is disabled", () => {
    const held = themeNamed(generateV4(button({ nudge: false })), "dark");
    const on = token(paletteOf(held), "action.on");
    expect(on.reached).toBe(false);
    expect(codes(held)).toContain("label-unreachable");
    expect(codes(held)).not.toContain("emphasis-nudged");
    const diagnostic = held.diagnostics.find((item) => item.code === "label-unreachable");
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.data?.achieved).toBeLessThan(diagnostic?.data?.target ?? 0);
    expect(diagnostic?.message).toContain("action.on");
  });

  it("does not nudge when the label already passes", () => {
    const dark = themeNamed(generateV4(button({ algorithm: "wcag2" })), "dark");
    expect(token(paletteOf(dark), "action.on").reached).toBe(true);
    expect(codes(dark)).not.toContain("emphasis-nudged");
    expect(codes(dark)).not.toContain("label-unreachable");
  });
});

describe("exact", () => {
  it("snaps #7c3aed in light mode and re-derives states", () => {
    const light = themeNamed(generateV4(exactConfig("#7c3aed")), "light");
    const palette = paletteOf(light);
    const rest = token(palette, "action.DEFAULT");
    const hover = token(palette, "action.hover");
    const on = token(palette, "action.on");
    expect(rest.color.hex).toBe("#7c3aed");
    expect(hover.color.oklch.l).toBeLessThan(rest.color.oklch.l);
    expect(on.reached).toBe(true);
    expect(codes(light)).not.toContain("exact-rejected");
  });

  it("rejects #c4b5fd and names the failing pair", () => {
    const light = themeNamed(generateV4(exactConfig("#c4b5fd")), "light");
    const rest = token(paletteOf(light), "action.DEFAULT");
    expect(rest.color.hex).not.toBe("#c4b5fd");
    const diagnostic = light.diagnostics.find((item) => item.code === "exact-rejected");
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.data?.pair).toEqual(["action.DEFAULT", "surface.DEFAULT"]);
    expect(diagnostic?.message).toContain("action.DEFAULT");
    expect(diagnostic?.message).toContain("surface.DEFAULT");
  });
});

describe("lints", () => {
  it("flags two tokens that match in every theme and palette color", () => {
    const themes = generateV4({
      palette: { neutral: "#71717a", brand: "#4f46e5" },
      themes: { light: { mode: "light" }, dark: { mode: "dark" } },
      tokens: {
        surface: { DEFAULT: surface() },
        row: { DEFAULT: surface() },
      },
    });
    const diagnostic = themes[0]?.diagnostics.find(
      (item) => item.code === "duplicate-token",
    );
    expect(diagnostic?.severity).toBe("info");
    expect(diagnostic?.data?.tokens).toEqual(["surface.DEFAULT", "row.DEFAULT"]);
    expect(themes.every((theme) => codes(theme).includes("duplicate-token"))).toBe(true);
  });

  it("does not flag tokens that differ", () => {
    const themes = generateV4({
      palette: { neutral: "#71717a", brand: "#4f46e5" },
      themes: { light: { mode: "light" }, dark: { mode: "dark" } },
      tokens: {
        surface: { DEFAULT: surface() },
        ink: { DEFAULT: text() },
      },
    });
    expect(themes.every((theme) => !codes(theme).includes("duplicate-token"))).toBe(true);
  });

  it("flags an emphasis fill that leaves the palette hue", () => {
    const light = themeNamed(
      generateV4({
        palette: { warning: "#ca8a04" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface() },
          action: { loud: emphasis("loud") },
        },
      }),
      "light",
    );
    const diagnostic = light.diagnostics.find(
      (item) => item.code === "hue-identity-lost",
    );
    expect(diagnostic?.severity).toBe("info");
    expect(diagnostic?.path).toBe("warning.action.loud");
    expect(diagnostic?.data?.delta).toBeGreaterThan(0.35);
  });

  it("does not flag an emphasis fill that stays near the palette color", () => {
    const light = themeNamed(
      generateV4({
        palette: { brand: "#7c3aed" },
        themes: { light: { mode: "light" } },
        tokens: {
          surface: { DEFAULT: surface() },
          action: { DEFAULT: emphasis() },
        },
      }),
      "light",
    );
    expect(codes(light)).not.toContain("hue-identity-lost");
  });

  it("flags raw lc, ratio, and step", () => {
    const apca = generateV4({
      contrast: { algorithm: "apca" },
      palette: { brand: "#7c3aed" },
      themes: { light: { mode: "light" } },
      tokens: {
        surface: { DEFAULT: surface(), lifted: surface({ step: 2 }) },
        ink: { DEFAULT: text({ lc: 60 }) },
      },
    });
    const wcag = generateV4({
      contrast: { algorithm: "wcag2" },
      palette: { brand: "#7c3aed" },
      themes: { light: { mode: "light" } },
      tokens: {
        surface: { DEFAULT: surface() },
        ink: { DEFAULT: text({ ratio: 4.5 }) },
      },
    });
    const diagnostics = [
      ...(apca[0]?.diagnostics ?? []),
      ...(wcag[0]?.diagnostics ?? []),
    ].filter((item) => item.code === "expert-value");
    const paths = diagnostics.map((item) => item.path);
    expect(paths).toContain("tokens.surface.lifted");
    expect(paths).toContain("tokens.ink.DEFAULT");
    expect(diagnostics.every((item) => item.severity === "info")).toBe(true);
    expect(diagnostics.map((item) => item.data?.fields)).toEqual(
      expect.arrayContaining([["step"], ["lc"], ["ratio"]]),
    );
  });

  it("does not flag tokens that use levels", () => {
    const themes = generateV4({
      palette: { brand: "#7c3aed" },
      themes: { light: { mode: "light" } },
      tokens: {
        surface: { DEFAULT: surface() },
        ink: { DEFAULT: text(), strong: text("strong") },
      },
    });
    expect(codes(themes[0]!)).not.toContain("expert-value");
  });

  it("flags an oklch() palette color outside sRGB", () => {
    const themes = generateV4({
      palette: { brand: "oklch(0.7 0.4 30)" },
      themes: { light: { mode: "light" } },
      tokens: { surface: { DEFAULT: surface() } },
    });
    const diagnostic = themes[0]?.diagnostics.find(
      (item) => item.code === "color-out-of-gamut",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.palette).toBe("brand");
    expect(diagnostic?.data?.mapped).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("does not flag an in-gamut palette color", () => {
    const themes = generateV4({
      palette: { brand: "oklch(0.6 0.02 260)" },
      themes: { light: { mode: "light" } },
      tokens: { surface: { DEFAULT: surface() } },
    });
    expect(codes(themes[0]!)).not.toContain("color-out-of-gamut");
  });
});

describe("audit v4", () => {
  it("adds kind, level, and state columns", () => {
    const dark = themeNamed(generateV4(button()), "dark");
    const report = auditV4(dark);
    const on = report.rows.find((row) => row.group === "action" && row.variant === "on");
    const hover = report.rows.find(
      (row) => row.group === "action" && row.variant === "hover",
    );
    const ground = report.rows.find(
      (row) => row.group === "surface" && row.variant === "DEFAULT",
    );
    expect(on).toMatchObject({ kind: "text", level: 3, state: "-", status: "pass" });
    expect(hover).toMatchObject({ kind: "emphasis", level: 3, state: "hover" });
    expect(ground).toMatchObject({
      kind: "surface",
      level: 3,
      state: "-",
      status: "n/a",
    });

    const header = formatAuditTable(report).split("\n")[0] ?? "";
    expect(header).toContain("Kind");
    expect(header).toContain("Level");
    expect(header).toContain("State");
  });
});
