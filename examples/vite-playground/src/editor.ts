/**
 * Live playground state. Calls the tint engine directly (not `virtual:tint`)
 * and swaps the theme custom properties in a style element.
 *
 * The package entry pulls in the Node loader, so the browser imports the
 * engine and CSS emitter from source. That stays inside this example.
 */

import { ConfigError } from "../../../packages/tint/src/v4/errors.ts";
import { generateV4 as generate } from "../../../packages/tint/src/v4/engine.ts";
import type { EngineDiagnosticV4 } from "../../../packages/tint/src/v4/diagnostics.ts";
import type { GenerationResultV4 } from "../../../packages/tint/src/v4/engine.ts";
import {
  border,
  decorative,
  disabled,
  emphasis,
  surface,
  text,
} from "../../../packages/tint/src/v4/kinds.ts";
import { toCSS } from "../../../packages/tint/src/v4/output/css.ts";

export const PALETTES = [
  "neutral",
  "brand",
  "info",
  "success",
  "warning",
  "error",
] as const;

export type PaletteName = (typeof PALETTES)[number];

export interface PaletteColors {
  neutral: string;
  brand: string;
  info: string;
  success: string;
  warning: string;
  error: string;
}

export interface EditorState {
  sharePalette: boolean;
  light: { lightness: number; palette: PaletteColors };
  dark: { lightness: number; palette: PaletteColors };
  action: { rest: number; hover: number; pressed: number };
  soft: { rest: number; hover: number; pressed: number };
  surface: { sunken: number; raised: number; overlay: number };
  text: { faint: number; muted: number; body: number; strong: number };
  border: { subtle: number; default: number; strong: number; focus: number };
}

export const SCALE_RANGE = { min: 0, max: 10, step: 0.5 } as const;
export const SURFACE_RANGE = { min: -10, max: 10, step: 0.5 } as const;
export const LIGHTNESS_RANGE = { min: 0, max: 100, step: 1 } as const;

const STORAGE_KEY = "tint-playground-editor-v2";

export const DEFAULT_STATE: EditorState = {
  sharePalette: false,
  light: {
    lightness: 92,
    palette: {
      neutral: "#ffffff",
      brand: "#7c3aed",
      info: "#2563eb",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
    },
  },
  dark: {
    lightness: 15,
    palette: {
      neutral: "#1c1c1f",
      brand: "#a78bfa",
      info: "#60a5fa",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
    },
  },
  action: { rest: 5, hover: 4.5, pressed: 6 },
  soft: { rest: 2, hover: 3.5, pressed: 4 },
  surface: { sunken: -1, raised: 1, overlay: 3 },
  text: { faint: 1, muted: 3, body: 5, strong: 7 },
  border: { subtle: 1, default: 3, strong: 7, focus: 8 },
};

export interface LiveDiagnostic {
  severity: EngineDiagnosticV4["severity"];
  theme: string;
  path: string;
  message: string;
  hint: string;
}

export interface LiveResult {
  diagnostics: LiveDiagnostic[];
  error?: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapScale(value: number, min: number, max: number): number {
  const snapped = Math.round(clamp(value, min, max) * 2) / 2;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function snapLightness(value: number): number {
  return Math.round(clamp(value, LIGHTNESS_RANGE.min, LIGHTNESS_RANGE.max));
}

export function normalizeHex(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (match === null) return null;
  const hex = match[1] ?? "";
  const full =
    hex.length === 3 ? [...hex].map((channel) => channel + channel).join("") : hex;
  return `#${full}`;
}

function isPalette(value: unknown): value is PaletteColors {
  if (typeof value !== "object" || value === null) return false;
  return PALETTES.every((name) => {
    const color = (value as Record<string, unknown>)[name];
    return typeof color === "string" && normalizeHex(color) !== null;
  });
}

function isScaleGroup(
  value: unknown,
  keys: readonly string[],
  min: number,
  max: number,
): boolean {
  if (typeof value !== "object" || value === null) return false;
  return keys.every((key) => {
    const scale = (value as Record<string, unknown>)[key];
    return (
      typeof scale === "number" && Number.isFinite(scale) && scale >= min && scale <= max
    );
  });
}

function normalizeState(value: unknown): EditorState | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const light = raw.light as Record<string, unknown> | undefined;
  const dark = raw.dark as Record<string, unknown> | undefined;
  if (typeof raw.sharePalette !== "boolean") return null;
  if (light === undefined || dark === undefined) return null;
  if (typeof light.lightness !== "number" || typeof dark.lightness !== "number")
    return null;
  if (!isPalette(light.palette) || !isPalette(dark.palette)) return null;
  if (!isScaleGroup(raw.action, ["rest", "hover", "pressed"], 0, 10)) return null;
  if (!isScaleGroup(raw.soft, ["rest", "hover", "pressed"], -10, 10)) return null;
  if (!isScaleGroup(raw.surface, ["sunken", "raised", "overlay"], -10, 10)) return null;
  if (!isScaleGroup(raw.text, ["faint", "muted", "body", "strong"], 0, 10)) return null;
  if (!isScaleGroup(raw.border, ["subtle", "default", "strong", "focus"], 0, 10))
    return null;

  const state = clone(raw) as EditorState;
  state.light.lightness = snapLightness(state.light.lightness);
  state.dark.lightness = snapLightness(state.dark.lightness);
  for (const name of PALETTES) {
    state.light.palette[name] =
      normalizeHex(state.light.palette[name]) ?? DEFAULT_STATE.light.palette[name];
    state.dark.palette[name] =
      normalizeHex(state.dark.palette[name]) ?? DEFAULT_STATE.dark.palette[name];
  }
  state.action.rest = snapScale(state.action.rest, 0, 10);
  state.action.hover = snapScale(state.action.hover, 0, 10);
  state.action.pressed = snapScale(state.action.pressed, 0, 10);
  state.soft.rest = snapScale(state.soft.rest, -10, 10);
  state.soft.hover = snapScale(state.soft.hover, -10, 10);
  state.soft.pressed = snapScale(state.soft.pressed, -10, 10);
  state.surface.sunken = snapScale(state.surface.sunken, -10, 10);
  state.surface.raised = snapScale(state.surface.raised, -10, 10);
  state.surface.overlay = snapScale(state.surface.overlay, -10, 10);
  state.text.faint = snapScale(state.text.faint, 0, 10);
  state.text.muted = snapScale(state.text.muted, 0, 10);
  state.text.body = snapScale(state.text.body, 0, 10);
  state.text.strong = snapScale(state.text.strong, 0, 10);
  state.border.subtle = snapScale(state.border.subtle, 0, 10);
  state.border.default = snapScale(state.border.default, 0, 10);
  state.border.strong = snapScale(state.border.strong, 0, 10);
  state.border.focus = snapScale(state.border.focus, 0, 10);
  return state;
}

export function loadState(): EditorState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return clone(DEFAULT_STATE);
    return normalizeState(JSON.parse(saved)) ?? clone(DEFAULT_STATE);
  } catch {
    return clone(DEFAULT_STATE);
  }
}

export function saveState(state: EditorState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function defaultState(): EditorState {
  return clone(DEFAULT_STATE);
}

function paletteBlock(colors: PaletteColors, indent: string): string {
  return PALETTES.map((name) => `${indent}${name}: "${colors[name]}",`).join("\n");
}

function num(value: number): string {
  const snapped = Object.is(value, -0) ? 0 : value;
  return String(snapped);
}

/** A `tint.config.ts` equivalent of the current editor state. */
export function configSource(state: EditorState): string {
  const darkPalette = state.sharePalette
    ? ""
    : `
      palette: {
${paletteBlock(state.dark.palette, "        ")}
      },`;
  return `import {
  border,
  decorative,
  defineConfig,
  disabled,
  emphasis,
  surface,
  text,
} from "@skylerknight/tint";

export default defineConfig({
  contrast: { algorithm: "apca", level: "standard" },

  palette: {
${paletteBlock(state.light.palette, "    ")}
  },

  themes: {
    light: { mode: "light", lightness: ${num(state.light.lightness)}, selector: ".light", media: true },
    dark: {
      mode: "dark",
      lightness: ${num(state.dark.lightness)},
      selector: ".dark",
      media: true,${darkPalette}
    },
  },

  overrides: {
    "warning,error": {
      action: { DEFAULT: emphasis(8.5) },
    },
  },

  tokens: {
    surface: {
      sunken: surface(${num(state.surface.sunken)}),
      DEFAULT: surface(0),
      raised: surface(${num(state.surface.raised)}),
      overlay: surface(${num(state.surface.overlay)}),
    },

    text: {
      faint: text(${num(state.text.faint)}),
      muted: text(${num(state.text.muted)}),
      body: text(${num(state.text.body)}),
      strong: text(${num(state.text.strong)}),
    },

    border: {
      subtle: border(${num(state.border.subtle)}),
      DEFAULT: border(${num(state.border.default)}),
      strong: border(${num(state.border.strong)}),
      focus: border(${num(state.border.focus)}),
    },

    action: {
      DEFAULT: emphasis(${num(state.action.rest)}),
      hover: emphasis(${num(state.action.hover)}),
      pressed: emphasis(${num(state.action.pressed)}),
      disabled: disabled.emphasis(${num(state.action.rest)}),
      on: text(${num(state.text.body)}, { on: "action" }),
      "on-disabled": disabled.text(${num(state.text.body)}, { on: "action.disabled" }),
    },

    soft: {
      DEFAULT: surface(${num(state.soft.rest)}),
      hover: surface(${num(state.soft.hover)}),
      pressed: surface(${num(state.soft.pressed)}),
      disabled: disabled.surface(${num(state.soft.rest)}),
      on: text(${num(state.text.body)}, { on: "soft" }),
      "on-disabled": disabled.text(${num(state.text.body)}, { on: "soft.disabled" }),
    },

    input: {
      DEFAULT: border(4),
      placeholder: decorative.text(0),
      focus: border(${num(state.border.focus)}),
    },

    divider: { DEFAULT: decorative.border(0) },

    icon: { DEFAULT: decorative.text(2) },

    ramp: {
      n0: emphasis(0),
      n1: emphasis(1),
      n2: emphasis(2),
      n3: emphasis(3),
      n4: emphasis(4),
      n5: emphasis(5),
      n6: emphasis(6),
      n7: emphasis(7),
      n8: emphasis(8),
      n9: emphasis(9),
      n10: emphasis(10),
    },
  },
});
`;
}

function buildConfig(state: EditorState) {
  const dark: {
    mode: "dark";
    lightness: number;
    selector: string;
    media: true;
    palette?: PaletteColors;
  } = {
    mode: "dark",
    lightness: state.dark.lightness,
    selector: ".dark",
    media: true,
  };
  if (!state.sharePalette) dark.palette = { ...state.dark.palette };

  return {
    contrast: { algorithm: "apca" as const, level: "standard" as const },
    palette: { ...state.light.palette },
    themes: {
      light: {
        mode: "light" as const,
        lightness: state.light.lightness,
        selector: ".light",
        media: true,
      },
      dark,
    },
    overrides: {
      "warning,error": {
        action: { DEFAULT: emphasis(8.5) },
      },
    },
    tokens: {
      surface: {
        sunken: surface(state.surface.sunken),
        DEFAULT: surface(0),
        raised: surface(state.surface.raised),
        overlay: surface(state.surface.overlay),
      },
      text: {
        faint: text(state.text.faint),
        muted: text(state.text.muted),
        body: text(state.text.body),
        strong: text(state.text.strong),
      },
      border: {
        subtle: border(state.border.subtle),
        DEFAULT: border(state.border.default),
        strong: border(state.border.strong),
        focus: border(state.border.focus),
      },
      action: {
        DEFAULT: emphasis(state.action.rest),
        hover: emphasis(state.action.hover),
        pressed: emphasis(state.action.pressed),
        disabled: disabled.emphasis(state.action.rest),
        on: text(state.text.body, { on: "action" }),
        "on-disabled": disabled.text(state.text.body, { on: "action.disabled" }),
      },
      soft: {
        DEFAULT: surface(state.soft.rest),
        hover: surface(state.soft.hover),
        pressed: surface(state.soft.pressed),
        disabled: disabled.surface(state.soft.rest),
        on: text(state.text.body, { on: "soft" }),
        "on-disabled": disabled.text(state.text.body, { on: "soft.disabled" }),
      },
      input: {
        DEFAULT: border(4),
        placeholder: decorative.text(0),
        focus: border(state.border.focus),
      },
      divider: { DEFAULT: decorative.border(0) },
      icon: { DEFAULT: decorative.text(2) },
      ramp: {
        n0: emphasis(0),
        n1: emphasis(1),
        n2: emphasis(2),
        n3: emphasis(3),
        n4: emphasis(4),
        n5: emphasis(5),
        n6: emphasis(6),
        n7: emphasis(7),
        n8: emphasis(8),
        n9: emphasis(9),
        n10: emphasis(10),
      },
    },
  };
}

function liveStyle(): HTMLStyleElement {
  const existing = document.getElementById("tint-live");
  if (existing instanceof HTMLStyleElement) return existing;
  const style = document.createElement("style");
  style.id = "tint-live";
  document.head.appendChild(style);
  return style;
}

function collectDiagnostics(results: readonly GenerationResultV4[]): LiveDiagnostic[] {
  const diagnostics: LiveDiagnostic[] = [];
  for (const theme of results) {
    for (const item of theme.diagnostics) {
      diagnostics.push({
        severity: item.severity,
        theme: item.theme,
        path: item.path,
        message: item.message,
        hint: item.hint,
      });
    }
  }
  return diagnostics;
}

/** Rebuild both themes and replace their custom properties. No reload. */
export function applyState(state: EditorState): LiveResult {
  try {
    const results = generate(buildConfig(state));
    liveStyle().textContent = toCSS(results, { comments: false });
    return { diagnostics: collectDiagnostics(results) };
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return { diagnostics: [], error: message };
  }
}
