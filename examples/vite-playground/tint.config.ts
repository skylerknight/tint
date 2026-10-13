import { defineConfig, border, emphasis, surface, text } from "@skylerknight/tint";

/**
 * Calibrated-emphasis port of the v4 playground.
 *
 * Surfaces, text, and borders keep the numeric contrast ladders. Soft fills
 * sit on whole and half steps (2 / 2.5 / 3 = the old 2 / 3 / 4 tint steps).
 * Solid actions sit on the contrast ladder: 9 / 9.5 / 10 match the old
 * Lc 62 / 68 / 74 buttons in light mode and the nudged Lc 75 / 81 / 87
 * buttons in dark mode, so `action.on` can reach body text in both.
 * Disabled is emphasis(1), the Lc 15 floor — no raw `lc`. Selection is the
 * half step under soft (one tint step; the old selection was 1.6).
 */
export default defineConfig({
  contrast: { algorithm: "apca", level: "standard" },

  palette: {
    neutral: "#ffffff",
    brand: "#7c3aed",
    info: "#2563eb",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },

  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: {
      mode: "dark",
      selector: ".dark",
      media: true,
      palette: {
        neutral: "#1c1c1f",
        brand: "#a78bfa",
        info: "#60a5fa",
        success: "#4ade80",
        warning: "#fbbf24",
        error: "#f87171",
      },
    },
  },

  tokens: {
    surface: {
      well: surface(-2),
      DEFAULT: surface(0),
      raised: surface(1),
      lowlight: surface(-1),
      highlight: surface(2),
      selection: emphasis(1.5, { chroma: 1.5 }),
    },

    text: {
      strong: text(4),
      body: text(3),
      muted: text(2),
      faint: text(1),
    },

    border: {
      subtle: border(1),
      DEFAULT: border(2),
      strong: border(3),
      focus: border(4),
    },

    action: {
      DEFAULT: emphasis(9),
      hover: emphasis(9.5),
      pressed: emphasis(10),
      disabled: emphasis(1, { chroma: 0.3 }),
      on: text(3, { on: "action" }),
      "on-disabled": text(-1, { on: "action.disabled", chroma: 0.3 }),
    },

    soft: {
      DEFAULT: emphasis(2),
      hover: emphasis(2.5),
      pressed: emphasis(3),
      on: text(3, { on: "soft" }),
    },
  },
});
