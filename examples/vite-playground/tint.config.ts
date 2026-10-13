import { defineConfig, border, emphasis, surface, text } from "@skylerknight/tint";

/**
 * v3 playground, migrated by hand with docs/v4-spec.md §10.
 *
 * `colors.base` is the default palette (`neutral`). Dark seeds are theme
 * palette deltas. `ls` steps become elevation levels, `lc` shortcuts become
 * levels, and the separate `on` group moves inside each fill.
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
      // ls 0..n → elevation. `selection` is the selected state of the page.
      well: surface("sunken"),
      DEFAULT: surface(),
      raised: surface("raised"),
      lowlight: surface("flat"),
      highlight: surface("floating"),
      selection: surface({ state: "selected" }),
    },

    text: {
      // lc 90 / heading → strong. lc 75 / body. lc 50 / muted. lc 40 / placeholder → faint.
      strong: text("strong"),
      body: text(),
      muted: text("muted"),
      faint: text("faint"),
    },

    border: {
      // lc 25 → soft. subtle (ls, decorative) → hairline. lc 40 → default.
      // The v3 ring (lc 65) is a firm border used as the focus ring.
      subtle: border("hairline"),
      DEFAULT: border("soft"),
      strong: border(),
      focus: border("firm"),
    },

    action: {
      // lc 60 → emphasis default. hover / active → states. `on.action` moves here.
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      disabled: emphasis({ state: "disabled" }),
      on: text({ on: "action" }),
      "on-disabled": text({ state: "disabled", on: "action" }),
    },

    soft: {
      // action.soft / soft-hover / soft-active → emphasis subtle and its states.
      DEFAULT: emphasis("subtle"),
      hover: emphasis("subtle", { state: "hover" }),
      pressed: emphasis("subtle", { state: "pressed" }),
      on: text({ on: "soft" }),
    },
  },
});
