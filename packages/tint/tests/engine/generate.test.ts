import { describe, expect, it } from "vitest";
import { generate } from "../../src/engine/generate.js";
import type { Config } from "../../src/config/types.js";
import { calcAPCAabs } from "../../src/contrast/apca.js";
import { rgbToOKLCH } from "../../src/color/convert.js";
import type {
  GeneratedLcVariant,
  GeneratedLsVariant,
  GenerationResult,
} from "../../src/engine/types.js";

const tokens = {
  surface: {
    $role: "surface",
    well: { ls: 0 },
    DEFAULT: { ls: 1 },
    raised: { ls: 2, $reference: true },
    highlight: { ls: 4 },
  },
  text: {
    $on: "surface",
    $role: "text",
    heading: { lc: 90 },
    body: { lc: 75 },
    muted: { lc: 45, $decorative: true },
  },
  border: {
    $on: "surface",
    $decorative: true,
    DEFAULT: { lc: 30 },
    subtle: { ls: 3 },
  },
  action: {
    $on: "surface",
    $role: "action",
    DEFAULT: { lc: 60, $reference: true },
    hover: { lc: 65 },
    soft: { ls: 3 },
  },
  on: {
    action: { lc: 60, $on: "action" },
    "action-soft": { lc: 75, $on: "action.soft" },
  },
} satisfies Config["tokens"];

const light: Config = {
  name: "light",
  mode: "light",
  colors: { brand: "#714ab5", base: "#ffffff", error: "#b54a4a" },
  tokens,
};

const dark: Config = {
  ...light,
  name: "dark",
  mode: "dark",
  selector: ".dark",
  prefersColorScheme: "dark",
  colors: { base: "#202124", brand: "#cba6f7", error: "#f7a6a6" },
};

function lc(
  result: ReturnType<typeof generate>,
  palette: string,
  group: string,
  variant: string,
) {
  const p = result.palettes.find((x) => x.name === palette)!;
  return p.tokens[group]![variant] as GeneratedLcVariant;
}
function ls(
  result: ReturnType<typeof generate>,
  palette: string,
  group: string,
  variant: string,
) {
  const p = result.palettes.find((x) => x.name === palette)!;
  return p.tokens[group]![variant] as GeneratedLsVariant;
}

describe("generate — structure", () => {
  it("puts base first, then colors in insertion order", () => {
    const result = generate(light);
    expect(result.palettes.map((p) => p.name)).toEqual(["base", "brand", "error"]);
  });

  it("keeps groups and variants in config order regardless of dependency order", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        on: { label: { lc: 75, $on: "action" } },
        action: { $on: "surface", DEFAULT: { lc: 60 } },
        surface: { DEFAULT: { ls: 1 } },
      },
    };
    const result = generate(config);
    expect(Object.keys(result.palettes[0]!.tokens)).toEqual(["on", "action", "surface"]);
    expect(result.palettes[0]!.tokens.on!.label!.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("marks reference variants and records resolved on targets", () => {
    const result = generate(light);
    expect(ls(result, "base", "surface", "raised").reference).toBe(true);
    expect(ls(result, "base", "surface", "DEFAULT").reference).toBeUndefined();
    expect(lc(result, "base", "text", "heading").on).toBe("surface.raised");
    expect(lc(result, "base", "on", "action").on).toBe("action.DEFAULT");
    expect(lc(result, "base", "on", "action-soft").on).toBe("action.soft");
  });

  it("carries selector and media hints", () => {
    const [l, d] = generate([light, dark]);
    expect(l!.selector).toBe(":root");
    expect(l!.prefersColorScheme).toBeUndefined();
    expect(d!.selector).toBe(".dark");
    expect(d!.prefersColorScheme).toBe("dark");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(generate(light))).toBe(JSON.stringify(generate(light)));
  });

  it("rejects invalid configs with a ConfigError", () => {
    expect(() => generate({ name: "x" })).toThrowError(/Invalid tint config/);
  });
});

describe("generate — lc variants", () => {
  it("hits requested contrast against the reference (light)", () => {
    const result = generate(light);
    for (const palette of ["base", "brand", "error"]) {
      const surface = ls(result, palette, "surface", "raised");
      for (const [variant, target] of [
        ["heading", 90],
        ["body", 75],
        ["muted", 45],
      ] as const) {
        const token = lc(result, palette, "text", variant);
        expect(token.kind).toBe("lc");
        expect(token.target).toBe(target);
        const measured = calcAPCAabs(token.rgb, surface.rgb);
        expect(measured).toBeGreaterThanOrEqual(target - 0.01);
        expect(measured).toBeLessThanOrEqual(target + 1.5);
        expect(token.lc).toBeCloseTo(measured, 3);
        // light mode text is darker than the surface
        expect(token.oklch.l).toBeLessThan(surface.oklch.l);
      }
    }
  });

  it("flips direction in dark mode", () => {
    const result = generate(dark);
    const surface = ls(result, "brand", "surface", "raised");
    const heading = lc(result, "brand", "text", "heading");
    expect(heading.oklch.l).toBeGreaterThan(surface.oklch.l);
    expect(calcAPCAabs(heading.rgb, surface.rgb)).toBeGreaterThanOrEqual(89.9);
  });

  it("keeps the seed hue", () => {
    const result = generate(light);
    const seedHue = rgbToOKLCH({ r: 0x71, g: 0x4a, b: 0xb5 }).h;
    const body = lc(result, "brand", "text", "body");
    expect(body.oklch.h).toBeCloseTo(seedHue, 0);
    expect(body.oklch.c).toBeGreaterThan(0.02);
  });

  it("foundation lc variants contrast against the mode baseline", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#3366cc" },
      tokens: { ink: { DEFAULT: { lc: 60 } } },
    };
    const token = lc(generate(config), "base", "ink", "DEFAULT");
    expect(token.on).toBeUndefined();
    expect(calcAPCAabs(token.rgb, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(
      59.9,
    );
    expect(token.oklch.l).toBeLessThan(1);
  });

  it("lc: 0 with $on returns the reference exactly", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 2 } },
        same: { $on: "surface", DEFAULT: { lc: 0 } },
      },
    };
    const result = generate(config);
    expect(result.palettes[0]!.tokens.same!.DEFAULT!.hex).toBe(
      result.palettes[0]!.tokens.surface!.DEFAULT!.hex,
    );
  });

  it("resolves shortcuts and pure", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        text: { $on: "surface", heading: { lc: "heading" }, pure: { lc: "pure" } },
        ink: { pure: { lc: "pure" } },
      },
    };
    const result = generate(config);
    expect(lc(result, "base", "text", "heading").target).toBe(90);
    expect(lc(result, "base", "text", "pure").hex).toBe("#000000");
    expect(lc(result, "base", "text", "pure").target).toBe(-1);
    expect(lc(result, "base", "ink", "pure").hex).toBe("#ffffff");
  });

  it("$invert flips the chosen direction", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        action: { $on: "surface", DEFAULT: { lc: 60 } },
        label: { $on: "action", normal: { lc: 45 }, inverted: { lc: 45, $invert: true } },
      },
    };
    const result = generate(config);
    const action = lc(result, "base", "action", "DEFAULT");
    const normal = lc(result, "base", "label", "normal");
    const inverted = lc(result, "base", "label", "inverted");
    expect(normal.oklch.l > action.oklch.l).not.toBe(inverted.oklch.l > action.oklch.l);
  });

  it("falls back to the other direction when the preferred one cannot reach the target", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        // a fairly light action fill: dark text is preferred and reaches high Lc
        action: { $on: "surface", DEFAULT: { lc: 35 } },
        label: { $on: "action", DEFAULT: { lc: 80 } },
      },
    };
    const result = generate(config);
    const label = lc(result, "base", "label", "DEFAULT");
    const action = lc(result, "base", "action", "DEFAULT");
    expect(label.lc).toBeGreaterThanOrEqual(
      Math.min(80, calcAPCAabs({ r: 0, g: 0, b: 0 }, action.rgb)) - 0.5,
    );
  });
});

describe("generate — ls variants", () => {
  it("steps lightness away from the foundation in the mode direction", () => {
    const l = generate(light);
    const d = generate(dark);
    const lw = ls(l, "base", "surface", "well");
    const l1 = ls(l, "base", "surface", "DEFAULT");
    const l2 = ls(l, "base", "surface", "raised");
    expect(lw.oklch.l).toBeCloseTo(1 - 0.015, 3);
    expect(l1.oklch.l).toBeCloseTo(lw.oklch.l - 0.02, 3);
    expect(l2.oklch.l).toBeCloseTo(lw.oklch.l - 0.04, 3);
    const dw = ls(d, "base", "surface", "well");
    const d2 = ls(d, "base", "surface", "raised");
    expect(dw.oklch.l).toBeCloseTo(0.15, 3);
    expect(d2.oklch.l).toBeCloseTo(0.15 + 0.04, 3);
  });

  it("honours config offset and scale precedence", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      offset: 0.05,
      scale: 0.01,
      colors: { base: "#fff" },
      tokens: {
        surface: { $scale: 0.03, a: { ls: 1 }, b: { ls: 1, $scale: 0.05 } },
        other: { a: { ls: 1 } },
        child: { $on: "surface", a: { ls: 1 } },
      },
    };
    const r = generate(config);
    expect(ls(r, "base", "surface", "a").oklch.l).toBeCloseTo(0.95 - 0.03, 3);
    expect(ls(r, "base", "surface", "b").oklch.l).toBeCloseTo(0.95 - 0.05, 3);
    expect(ls(r, "base", "other", "a").oklch.l).toBeCloseTo(0.95 - 0.01, 3);
    // child inherits surface's $scale (0.03) and steps from surface's reference
    // (a and b tie on value, so the first one, a, is the reference)
    expect(ls(r, "base", "child", "a").oklch.l).toBeCloseTo(0.95 - 0.03 - 0.03, 3);
  });

  it("caps chroma for surfaces", () => {
    const r = generate(light);
    expect(ls(r, "brand", "surface", "well").oklch.c).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(ls(r, "brand", "surface", "highlight").oklch.c).toBeLessThanOrEqual(
      0.08 + 1e-9,
    );
  });

  it("ls: pure and ls: 0 with $on", () => {
    const config: Config = {
      name: "t",
      mode: "dark",
      colors: { base: "#000" },
      tokens: {
        surface: { DEFAULT: { ls: 1 }, pure: { ls: "pure" } },
        same: { $on: "surface", DEFAULT: { ls: 0 } },
      },
    };
    const r = generate(config);
    expect(ls(r, "base", "surface", "pure").hex).toBe("#000000");
    expect(ls(r, "base", "surface", "pure").ls).toBe(-1);
    expect(r.palettes[0]!.tokens.same!.DEFAULT!.hex).toBe(
      r.palettes[0]!.tokens.surface!.DEFAULT!.hex,
    );
  });
});

describe("generate — overrides and chroma", () => {
  it("applies per-color overrides including comma lists", () => {
    const config: Config = {
      ...light,
      overrides: {
        "error,brand": { text: { heading: { lc: 60 } } },
        error: { action: { DEFAULT: { $chroma: 0 } } },
      },
    };
    const r = generate(config);
    expect(lc(r, "base", "text", "heading").target).toBe(90);
    expect(lc(r, "brand", "text", "heading").target).toBe(60);
    expect(lc(r, "error", "text", "heading").target).toBe(60);
    expect(lc(r, "error", "action", "DEFAULT").oklch.c).toBeLessThan(1e-6);
    expect(lc(r, "brand", "action", "DEFAULT").oklch.c).toBeGreaterThan(0.05);
  });

  it("$chroma scales seed chroma", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#714ab5" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        text: {
          $on: "surface",
          full: { lc: 75 },
          half: { lc: 75, $chroma: 0.5 },
          gray: { lc: 75, $chroma: 0 },
        },
      },
    };
    const r = generate(config);
    const full = lc(r, "base", "text", "full").oklch.c;
    const half = lc(r, "base", "text", "half").oklch.c;
    expect(half).toBeLessThan(full);
    expect(lc(r, "base", "text", "gray").oklch.c).toBeLessThan(1e-6);
  });
});

describe("generate — diagnostics", () => {
  it("reports unreachable contrast with a mid-tone hint", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        action: { $on: "surface", DEFAULT: { lc: 60 } },
        label: { $on: "action", DEFAULT: { lc: 100 } },
      },
    };
    const r = generate(config);
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain("contrast-unreachable");
    const diag = r.diagnostics.find((d) => d.code === "contrast-unreachable")!;
    expect(diag.path).toBe("base.label.DEFAULT");
    expect(diag.message).toMatch(/Lc 100/);
    expect(r.warnings).toContain(diag.message);
    expect(lc(r, "base", "label", "DEFAULT").lc).toBeLessThan(100);
  });

  it("reports below-minimum and role lint, but not for decorative tokens", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        text: {
          $on: "surface",
          $role: "text",
          tiny: { lc: 5 },
          low: { lc: 30 },
          ok: { lc: 30, $decorative: true },
        },
      },
    };
    const r = generate(config);
    const byPath = (p: string) =>
      r.diagnostics.filter((d) => d.path === p).map((d) => d.code);
    expect(byPath("base.text.tiny")).toEqual(
      expect.arrayContaining(["contrast-below-minimum", "role-contrast-low"]),
    );
    expect(byPath("base.text.low")).toEqual(["role-contrast-low"]);
    expect(byPath("base.text.ok")).toEqual([]);
  });

  it("warns on palette names that collide with Tailwind prefixes and on out-of-gamut oklch seeds", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff", text: "#333", vivid: "oklch(0.7 0.4 150)" },
      tokens: { surface: { DEFAULT: { ls: 1 } } },
    };
    const r = generate(config);
    const codes = r.diagnostics.map((d) => `${d.code}@${d.path}`);
    expect(codes).toContain("palette-name-conflict@text");
    expect(codes).toContain("seed-out-of-gamut@vivid");
    expect(r.diagnostics.map((d) => d.code)).not.toContain("contrast-unreachable");
  });

  it("produces no diagnostics for a well-formed real-world config", () => {
    const r = generate([light, dark]);
    expect(r.flatMap((x) => x.diagnostics)).toEqual([]);
  });
});

describe("generate — reference selection and $invert reporting", () => {
  it("prefers a DEFAULT variant as the automatic reference", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        action: { $on: "surface", DEFAULT: { lc: 60 }, strong: { lc: 75 } },
        on: { action: { lc: 60, $on: "action" } },
      },
    };
    const r = generate(config);
    expect(lc(r, "base", "action", "DEFAULT").reference).toBe(true);
    expect(lc(r, "base", "on", "action").on).toBe("action.DEFAULT");
  });

  it("reports the locked polarity's ceiling when $invert makes a target unreachable", () => {
    const config: Config = {
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        action: { $on: "surface", DEFAULT: { lc: 60 } },
        label: { $on: "action", DEFAULT: { lc: 100, $invert: true } },
      },
    };
    const r = generate(config);
    const diag = r.diagnostics.find((d) => d.code === "contrast-unreachable")!;
    const label = lc(r, "base", "label", "DEFAULT");
    expect(diag.data?.achievable).toBeCloseTo(label.lc, 3);
    expect(diag.hint).toMatch(/\$invert/);
    expect(r.diagnostics.map((d) => d.code)).not.toContain("reference-midtone");
  });

  it("flags decorative tokens on the generated variant", () => {
    const r = generate(light);
    expect(lc(r, "base", "text", "muted").decorative).toBe(true);
    expect(lc(r, "base", "text", "body").decorative).toBeUndefined();
    expect(lc(r, "base", "border", "DEFAULT").decorative).toBe(true);
  });
});
