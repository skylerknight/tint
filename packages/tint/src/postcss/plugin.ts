import type { Plugin, PluginCreator } from "postcss";

export interface TintPostCSSOptions {
  /** Directory config paths resolve against. Ignored until the v5 engine lands. */
  root?: string;
}

const PLUGIN_NAME = "postcss-tint";

/**
 * PostCSS plugin shell. `@tint` rules are left in place and warned, because
 * the v5 engine cannot generate tokens yet.
 */
export const tintPostCSS: PluginCreator<TintPostCSSOptions> = () => {
  return {
    postcssPlugin: PLUGIN_NAME,
    Once(root, { result }) {
      root.walkAtRules("tint", (atRule) => {
        result.warn(
          "@tint is not available yet. The v5 engine is in progress; see docs/v5-milestone-1.md.",
          { node: atRule },
        );
      });
    },
  } satisfies Plugin;
};

tintPostCSS.postcss = true;
