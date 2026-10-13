import {
  border,
  defineConfig,
  disabled,
  emphasis,
  surface,
  text,
} from "@skylerknight/tint";

/**
 * 0–10 prototype.
 *
 * Every kind is one contrast curve. `surface(0)` is the page, `text(5)` is
 * body text, and soft buttons are a surface plus a label — not emphasis.
 * Hover may step down (less contrast, lighter on a light page) or up.
 * `disabled.emphasis(n)` resolves that kind at n, then mutes it.
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
      DEFAULT: surface(0),
      sunken: surface(4),
      raised: surface(7),
      overlay: surface(10),
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
      DEFAULT: surface(5),
      hover: surface(6),
      pressed: surface(3),
      disabled: disabled.surface(5),
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
