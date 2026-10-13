// tint.config.ts
import { defineConfig, surface, text, border, emphasis } from "@skylerknight/tint";

export default defineConfig({
  contrast: { algorithm: "apca", level: "standard" },

  palette: {
    neutral: "#71717a",                                   // default palette (unprefixed)
    brand: { color: "#7c3aed", exact: true },
    danger: "#dc2626",
    warning: { color: "#d97706", tune: { action: emphasis("bold") } },
  },

  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: { mode: "dark", selector: ".dark", media: true, palette: { brand: "#a78bfa" } },
    // `.light-hc` is its own selector. extends would otherwise copy `.light`
    // and a second unconditional `.light` block would replace the light theme.
    "light-hc": {
      mode: "light",
      extends: "light",
      selector: ".light-hc",
      media: "(prefers-contrast: more)",
      contrast: { level: "more" },
    },
  },

  tokens: {
    surface: {
      sunken: surface("sunken"),
      DEFAULT: surface(),                                 // base: page
      raised: surface("raised"),                          // cards
      floating: surface("floating"),                      // popovers, dialogs
    },

    action: {                                             // solid button
      DEFAULT: emphasis(),
      hover: emphasis({ state: "hover" }),
      pressed: emphasis({ state: "pressed" }),
      disabled: emphasis({ state: "disabled" }),
      on: text({ on: "action" }),                         // passes on DEFAULT, hover, pressed
      "on-disabled": text({ state: "disabled", on: "action" }),
    },

    soft: {                                               // secondary / tonal button
      DEFAULT: emphasis("subtle"),
      hover: emphasis("subtle", { state: "hover" }),
      pressed: emphasis("subtle", { state: "pressed" }),
      on: text({ on: "soft" }),
    },

    border: {
      hairline: border("hairline"),                       // dividers
      DEFAULT: border(),
      firm: border("firm"),                               // inputs
      focus: border("firm", { on: "action" }),            // focus ring: non-text contrast (APCA Lc 60) on the action fill
    },

    text: {
      DEFAULT: text(),                                    // body
      strong: text("strong"),                             // headings
      muted: text("muted"),
      faint: text("faint"),                               // placeholder, meta
      disabled: text({ state: "disabled" }),
      link: text({ chroma: 1.2 }),
    },

    row: {                                                // list / table row
      DEFAULT: surface(),
      hover: surface({ state: "hover" }),
      selected: surface({ state: "selected" }),
      "selected-hover": surface({ state: "selected-hover" }),
      on: text({ on: "row" }),                            // passes on all four
    },
  },
});
