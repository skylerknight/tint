import { defineConfig, border, emphasis, surface, text } from "@skylerknight/tint";

/**
 * Numeric-scale port of the v4 playground.
 *
 * Surfaces, text, borders, and soft fills use the scales that match the old
 * level tables (APCA). Solid actions are lightness steps chosen to land near
 * the old Lc 60 / 66 / 72 buttons; they will not match every palette exactly.
 * Selection is emphasis so it moves away from the page in both modes
 * (1.6 tint steps = 2 surface steps).
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
      selection: emphasis(1.6, { chroma: 1.5 }),
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
      DEFAULT: emphasis(15),
      hover: emphasis(16.5),
      pressed: emphasis(18),
      disabled: emphasis(3.5, { chroma: 0.3 }),
      on: text(3, { on: "action" }),
      "on-disabled": text(-1, { on: "action.disabled" }),
    },

    soft: {
      DEFAULT: emphasis(2),
      hover: emphasis(3),
      pressed: emphasis(4),
      on: text(3, { on: "soft" }),
    },
  },
});
