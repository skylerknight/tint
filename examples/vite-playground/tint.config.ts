import {
  border,
  defineConfig,
  disabled,
  emphasis,
  surface,
  text,
} from "@skylerknight/tint";

/**
 * Unified prototype.
 *
 * Emphasis, text, and border stay on the 0–10 contrast curve.
 * Surface is signed lightness steps from the page: 0 is the page, positive
 * is raised, negative is sunken. One step is 0.02 in light and 0.03 in dark.
 *
 * The light page is lightness 92, not the mode shorthand 96. At 96, surface(2)
 * is already white, so surface(3) and surface(4) would clip to the same color.
 * 92 leaves those soft steps 0.02 apart (surface(4) lands on white).
 * Soft fills are surfaces; the label is text(5) on that surface.
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
    light: { mode: "light", lightness: 92, selector: ".light", media: true },
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

  overrides: {
    "warning,error": {
      action: { DEFAULT: emphasis(8.5) },
    },
  },

  tokens: {
    surface: {
      sunken: surface(-1),
      DEFAULT: surface(0),
      raised: surface(1),
      overlay: surface(2),
    },

    text: {
      faint: text(1),
      muted: text(3),
      body: text(5),
      strong: text(8),
    },

    border: {
      subtle: border(1),
      DEFAULT: border(3),
      strong: border(7),
      focus: border(8),
    },

    action: {
      DEFAULT: emphasis(8),
      hover: emphasis(7),
      pressed: emphasis(9),
      disabled: disabled.emphasis(8),
      on: text(5, { on: "action" }),
      "on-disabled": disabled.text(5, { on: "action.disabled" }),
    },

    soft: {
      DEFAULT: surface(2),
      hover: surface(3),
      pressed: surface(4),
      disabled: disabled.surface(2),
      on: text(5, { on: "soft" }),
      "on-disabled": disabled.text(5, { on: "soft.disabled" }),
    },

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
