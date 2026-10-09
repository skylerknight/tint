/// <reference types="vite/client" />

declare module "virtual:tint" {
  import type { GenerationResult } from "@skylerknight/tint";
  const themes: GenerationResult[];
  export default themes;
}
