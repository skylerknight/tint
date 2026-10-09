import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tint } from "@skylerknight/tint/vite";

export default defineConfig({
  // tint() must run before tailwindcss() so the @tint directive is expanded first.
  plugins: [tint(), tailwindcss()],
});
