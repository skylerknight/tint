import type { PluginCreator } from "postcss";
import type { TintUtilitiesOptions } from "../output/tailwind.js";

export interface TintPostCSSOptions extends TintUtilitiesOptions {
  /** Directory config paths resolve against (default `process.cwd()`). */
  root?: string;
}

export const tintPostCSS: PluginCreator<TintPostCSSOptions> = (options = {}) => {
  void options;
  throw new Error("not implemented");
};

tintPostCSS.postcss = true;
