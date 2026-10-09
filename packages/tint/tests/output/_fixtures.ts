/**
 * Hand-built `GenerationResult` fixtures for the output and audit tests.
 * These never call `generate()` so the formatters can be tested in isolation
 * from the engine.
 */
import type { RGB, OKLCH } from "../../src/color/types.js";
import type { Diagnostic } from "../../src/engine/diagnostics.js";
import type {
  GeneratedColor,
  GeneratedLcVariant,
  GeneratedLsVariant,
  GeneratedPalette,
  GeneratedVariant,
  GenerationResult,
} from "../../src/engine/types.js";

function hexToRGB(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function color(hex: string, l: number, c: number, h: number): GeneratedColor {
  const oklch: OKLCH = { l, c, h };
  return { hex, rgb: hexToRGB(hex), oklch };
}

interface LcSpec {
  hex: string;
  oklch: [number, number, number];
  lc: number;
  target?: number;
  on?: string;
  reference?: true;
}

interface LsSpec {
  hex: string;
  oklch: [number, number, number];
  ls: number;
  on?: string;
  reference?: true;
}

export function lc(spec: LcSpec): GeneratedLcVariant {
  const [l, c, h] = spec.oklch;
  const token: GeneratedLcVariant = {
    ...color(spec.hex, l, c, h),
    kind: "lc",
    lc: spec.lc,
    target: spec.target ?? spec.lc,
  };
  if (spec.on !== undefined) token.on = spec.on;
  if (spec.reference) token.reference = true;
  return token;
}

export function ls(spec: LsSpec): GeneratedLsVariant {
  const [l, c, h] = spec.oklch;
  const token: GeneratedLsVariant = {
    ...color(spec.hex, l, c, h),
    kind: "ls",
    ls: spec.ls,
  };
  if (spec.on !== undefined) token.on = spec.on;
  if (spec.reference) token.reference = true;
  return token;
}

export function palette(
  name: string,
  seed: GeneratedColor,
  tokens: Record<string, Record<string, GeneratedVariant>>,
): GeneratedPalette {
  return { name, seed, tokens };
}

interface ResultSpec {
  name: string;
  mode: "light" | "dark";
  selector?: string;
  prefersColorScheme?: "light" | "dark";
  prefersContrast?: "more" | "less" | "custom";
  palettes: GeneratedPalette[];
  diagnostics?: Diagnostic[];
}

export function result(spec: ResultSpec): GenerationResult {
  const diagnostics = spec.diagnostics ?? [];
  const out: GenerationResult = {
    name: spec.name,
    mode: spec.mode,
    selector: spec.selector ?? ":root",
    palettes: spec.palettes,
    diagnostics,
    warnings: diagnostics.map((d) => d.message),
  };
  if (spec.prefersColorScheme) out.prefersColorScheme = spec.prefersColorScheme;
  if (spec.prefersContrast) out.prefersContrast = spec.prefersContrast;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Standard theme: palettes `base` and `brand`, groups surface/text/action/on */
/* ------------------------------------------------------------------------ */

type Hexes = {
  surface: string;
  raised: string;
  heading: string;
  body: string;
  muted: string;
  action: string;
  onAction: string;
};

function standardPalette(name: string, seed: GeneratedColor, hue: number, x: Hexes) {
  const dark = seed.oklch.l < 0.5;
  const surfaceL = dark ? 0.22 : 0.99;
  return palette(name, seed, {
    surface: {
      DEFAULT: ls({
        hex: x.surface,
        oklch: [surfaceL, 0.005, hue],
        ls: 0,
        reference: true,
      }),
      raised: ls({ hex: x.raised, oklch: [dark ? 0.26 : 0.97, 0.008, hue], ls: 1 }),
    },
    text: {
      heading: lc({
        hex: x.heading,
        oklch: [dark ? 0.96 : 0.2, 0.02, hue],
        lc: 90,
        on: "surface.DEFAULT",
      }),
      body: lc({
        hex: x.body,
        oklch: [dark ? 0.87 : 0.32, 0.03, hue],
        lc: 80,
        on: "surface.DEFAULT",
      }),
      muted: lc({
        hex: x.muted,
        oklch: [dark ? 0.7 : 0.52, 0.03, hue],
        lc: 60,
        on: "surface.DEFAULT",
      }),
    },
    action: {
      DEFAULT: lc({
        hex: x.action,
        oklch: [dark ? 0.78 : 0.55, 0.19, hue],
        lc: 60,
        on: "surface.DEFAULT",
        reference: true,
      }),
    },
    on: {
      action: lc({
        hex: x.onAction,
        oklch: [dark ? 0 : 1, 0, 0],
        lc: 75,
        on: "action.DEFAULT",
      }),
    },
  });
}

export const light = result({
  name: "light",
  mode: "light",
  palettes: [
    standardPalette("base", color("#5c6b7a", 0.52, 0.03, 250), 250, {
      surface: "#fcfcfd",
      raised: "#f5f6f8",
      heading: "#1a1d21",
      body: "#33383f",
      muted: "#6b7280",
      action: "#4c6ef5",
      onAction: "#ffffff",
    }),
    standardPalette("brand", color("#7048e8", 0.52, 0.22, 295), 295, {
      surface: "#fbf9ff",
      raised: "#f3effc",
      heading: "#1c1033",
      body: "#352a52",
      muted: "#6e6487",
      action: "#7048e8",
      onAction: "#ffffff",
    }),
  ],
});

export const dark = result({
  name: "dark",
  mode: "dark",
  selector: ".dark",
  prefersColorScheme: "dark",
  palettes: [
    standardPalette("base", color("#1c1c1c", 0.24, 0.0, 0), 250, {
      surface: "#1c1d20",
      raised: "#25272b",
      heading: "#f2f3f5",
      body: "#d4d7dc",
      muted: "#9aa0a9",
      action: "#74a4fc",
      onAction: "#000000",
    }),
    standardPalette("brand", color("#1f1a2e", 0.24, 0.04, 295), 295, {
      surface: "#1f1a2e",
      raised: "#28223a",
      heading: "#f3effc",
      body: "#d6cfe8",
      muted: "#a197bb",
      action: "#b197fc",
      onAction: "#000000",
    }),
  ],
});

/** Light theme with a `prefers-contrast` preference, for media-query joins. */
export const highContrast = result({
  name: "light-hc",
  mode: "light",
  prefersColorScheme: "light",
  prefersContrast: "more",
  palettes: [
    palette("base", color("#000000", 0, 0, 0), {
      text: {
        DEFAULT: lc({ hex: "#000000", oklch: [0, 0, 0], lc: 106 }),
      },
    }),
  ],
});

/* ------------------------------------------------------------------------ */
/* Shortcut fixture: `bg` and `text` groups collide with Tailwind prefixes   */
/* ------------------------------------------------------------------------ */

function shortcutPalette(
  name: string,
  hue: number,
  bg: string,
  bgMuted: string,
  text: string,
  textHeading: string,
) {
  return palette(name, color(bg, 0.98, 0.01, hue), {
    bg: {
      DEFAULT: ls({ hex: bg, oklch: [0.98, 0.01, hue], ls: 0, reference: true }),
      muted: ls({ hex: bgMuted, oklch: [0.95, 0.015, hue], ls: 2 }),
    },
    text: {
      DEFAULT: lc({
        hex: text,
        oklch: [0.3, 0.03, hue],
        lc: 80,
        on: "bg.DEFAULT",
        reference: true,
      }),
      heading: lc({
        hex: textHeading,
        oklch: [0.18, 0.03, hue],
        lc: 90,
        on: "bg.DEFAULT",
      }),
    },
  });
}

export const withBg = result({
  name: "light",
  mode: "light",
  palettes: [
    shortcutPalette("base", 250, "#f9fafb", "#eef0f3", "#2f3338", "#15181c"),
    shortcutPalette("brand", 295, "#faf7ff", "#efe9fb", "#3a2d5c", "#1b1233"),
  ],
});

/** One palette with every Tailwind utility-prefix group, one `DEFAULT` token each. */
export const allPrefixes = result({
  name: "light",
  mode: "light",
  palettes: [
    palette(
      "base",
      color("#808080", 0.6, 0, 0),
      Object.fromEntries(
        [
          "text",
          "bg",
          "background",
          "border",
          "outline",
          "ring",
          "accent",
          "caret",
          "fill",
          "stroke",
          "decoration",
          "divide",
          "placeholder",
          "shadow",
        ].map((group) => [
          group,
          { DEFAULT: ls({ hex: "#808080", oklch: [0.6, 0, 0], ls: 0, reference: true }) },
        ]),
      ),
    ),
  ],
});

/* ------------------------------------------------------------------------ */
/* Structure mismatch: `brand.text.subtle` replaces `brand.text.muted`       */
/* ------------------------------------------------------------------------ */

export const inconsistent = result({
  name: "dark-alt",
  mode: "dark",
  selector: ".dark",
  palettes: dark.palettes.map((p) => {
    if (p.name !== "brand") return p;
    const { muted, ...rest } = p.tokens.text as Record<string, GeneratedVariant>;
    return palette(p.name, p.seed, {
      ...p.tokens,
      text: { ...rest, subtle: muted as GeneratedVariant },
    });
  }),
});

/* ------------------------------------------------------------------------ */
/* Name conflict: `text.muted` and `bg.muted` both simplify to `base-muted`  */
/* once their utility-prefix group names are dropped.                        */
/* ------------------------------------------------------------------------ */

export const conflicting = result({
  name: "light",
  mode: "light",
  palettes: [
    palette("base", color("#ffffff", 1, 0, 0), {
      text: {
        muted: lc({ hex: "#111111", oklch: [0.17, 0, 0], lc: 60, on: "bg.DEFAULT" }),
      },
      bg: {
        DEFAULT: ls({ hex: "#ffffff", oklch: [1, 0, 0], ls: 0, reference: true }),
        muted: ls({ hex: "#eeeeee", oklch: [0.95, 0, 0], ls: 2 }),
      },
    }),
  ],
});

/* ------------------------------------------------------------------------ */
/* Diagnostics: one unreachable target (fail) and one low role target (warn) */
/* ------------------------------------------------------------------------ */

export const withDiagnostics = result({
  name: "light",
  mode: "light",
  palettes: [
    palette("base", color("#5c6b7a", 0.52, 0.03, 250), {
      surface: {
        DEFAULT: ls({
          hex: "#e9ecef",
          oklch: [0.94, 0.005, 250],
          ls: 0,
          reference: true,
        }),
      },
      text: {
        heading: lc({
          hex: "#101214",
          oklch: [0.15, 0.01, 250],
          lc: 82.4,
          target: 90,
          on: "surface.DEFAULT",
        }),
        body: lc({
          hex: "#2b3036",
          oklch: [0.3, 0.02, 250],
          lc: 75.1,
          target: 75,
          on: "surface.DEFAULT",
        }),
        muted: lc({
          hex: "#8a9099",
          oklch: [0.64, 0.02, 250],
          lc: 40.2,
          target: 40,
          on: "surface.DEFAULT",
        }),
        edge: lc({
          hex: "#2e3237",
          oklch: [0.31, 0.01, 250],
          lc: 74.6,
          target: 75,
          on: "surface.DEFAULT",
        }),
        pure: lc({
          hex: "#000000",
          oklch: [0, 0, 0],
          lc: 100.3,
          target: -1,
          on: "surface.DEFAULT",
        }),
      },
      action: {
        DEFAULT: lc({
          hex: "#3b5bdb",
          oklch: [0.5, 0.2, 265],
          lc: 70,
          on: "surface.DEFAULT",
          reference: true,
        }),
      },
      border: {
        DEFAULT: ls({
          hex: "#d0d4da",
          oklch: [0.87, 0.008, 250],
          ls: 3,
          on: "surface.DEFAULT",
        }),
      },
    }),
  ],
  diagnostics: [
    {
      severity: "warning",
      code: "contrast-unreachable",
      message:
        "base.text.heading: requested Lc 90 but only Lc 82.4 is reachable against surface.DEFAULT",
      path: "base.text.heading",
      hint: "Lighten the surface or lower the target.",
      data: { requested: 90, achieved: 82.4 },
    },
    {
      severity: "warning",
      code: "role-contrast-low",
      message: "base.text.muted: Lc 40 is below the recommended minimum of 45 for text",
      path: "base.text.muted",
      data: { role: "text", minimum: 45, requested: 40 },
    },
  ],
});
