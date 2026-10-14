import {
  border,
  decorative,
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
 * Surface is signed lightness steps from the theme lightness. surface(0) is
 * that anchor, positive is raised, negative is sunken. One step is 0.02 in
 * light and 0.03 in dark.
 *
 * Light and dark use the mode shorthands: lightness 97 and 18.
 * surface.DEFAULT is an ordinary step on the same scale and is the painted
 * page. Text, border, and emphasis with no `on` solve against it. One light
 * step is 0.02, so surface(1) is L 0.99.
 * surface(1.5) is white. surface(2) is 0.01 past white, so it folds darker
 * and keeps palette chroma. Clamping that step onto white would park
 * disabled.surface(2) inside the 0.01 band between white and surface(1).
 * Dark has room, so the same positive steps stay lighter than the anchor.
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
      overlay: surface(3),
    },

    text: {
      faint: text(1),
      muted: text(3),
      body: text(5),
      strong: text(7),
    },

    border: {
      subtle: border(1),
      DEFAULT: border(3),
      strong: border(7),
      focus: border(8),
    },

    action: {
      DEFAULT: emphasis(5),
      hover: emphasis(4.5),
      pressed: emphasis(6),
      disabled: disabled.emphasis(5),
      on: text(5, { on: "action" }),
      "on-disabled": disabled.text(5, { on: "action.disabled" }),
    },

    soft: {
      DEFAULT: surface(2),
      hover: surface(3.5),
      pressed: surface(4),
      disabled: disabled.surface(2),
      on: text(5, { on: "soft" }),
      "on-disabled": disabled.text(5, { on: "soft.disabled" }),
    },

    input: {
      DEFAULT: decorative.border(1),
      placeholder: decorative.text(0),
      focus: border(8),
    },

    card: { DEFAULT: decorative.border(0) },

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
