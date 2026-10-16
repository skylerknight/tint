import type { Plugin } from "vite";

export interface TintVitePluginOptions {
  /** Config path. Ignored until the v5 engine can generate tokens. */
  config?: string;
}

/**
 * Vite plugin shell. The v4 generator moved to `legacy/`; this entry still
 * builds so the package export stays valid.
 */
export function tint(_options: TintVitePluginOptions = {}): Plugin {
  return {
    name: "tint",
    buildStart() {
      this.warn("tint: token generation is not available yet (v5 engine in progress).");
    },
  };
}
