import { defineConfig, surface, text } from "@skylerknight/tint";

// Minimal v4 config so `vite build` stays green. T11 migrates the example UI.
export default defineConfig({
  palette: {
    neutral: "#71717a",
    brand: "#7c3aed",
  },
  themes: {
    light: { mode: "light", selector: ".light", media: true },
    dark: { mode: "dark", selector: ".dark", media: true },
  },
  tokens: {
    surface: { DEFAULT: surface() },
    text: { body: text() },
  },
});
