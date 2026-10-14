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
 * Sample card for the unified prototype.
 *
 * The page is surface.DEFAULT. The card sits on surface.raised.
 * Action is the primary button. Soft is the secondary button.
 * Light and dark follow the mode shorthands (lightness 97 and 18).
 * The selectors match the playground's light/dark radios.
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
    light: {
      mode: "light",
      selector: ":root:has(#scheme-light:checked)",
      media: true,
    },
    dark: {
      mode: "dark",
      selector: ":root:has(#scheme-dark:checked)",
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
      DEFAULT: surface(0),
      raised: surface(1),
    },

    text: {
      muted: text(3),
      body: text(5),
      strong: text(7),
    },

    border: {
      focus: border(8),
    },

    action: {
      DEFAULT: emphasis(5),
      hover: emphasis(4.5),
      disabled: disabled.emphasis(5),
      on: text(5, { on: "action" }),
      "on-disabled": disabled.text(5, { on: "action.disabled" }),
    },

    soft: {
      DEFAULT: surface(2),
      hover: surface(3.5),
      on: text(5, { on: "soft" }),
    },

    input: {
      DEFAULT: decorative.border(1),
      placeholder: decorative.text(0),
      focus: border(8),
    },

    card: { DEFAULT: decorative.border(0) },

    divider: { DEFAULT: decorative.border(0) },
  },
});
