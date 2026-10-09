import type { Plugin } from "vite";
import type { TintUtilitiesOptions } from "../output/tailwind.js";

export interface TintVitePluginOptions extends TintUtilitiesOptions {
  /** Write `node_modules/.tint/intellisense.css`. Default true. */
  intellisense?: boolean;
}

export function tint(options: TintVitePluginOptions = {}): Plugin {
  void options;
  throw new Error("not implemented");
}
