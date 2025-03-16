import chroma from 'npm:chroma-js@3.1.2';
import plugin from 'npm:tailwindcss@4.0.7/plugin';
import { BackgroundColor, Color, Theme, type CssColor, type RatiosObject } from 'npm:@adobe/leonardo-contrast-colors@1.0.0';
import type { TintTheme, TintConfig, TintThemeResource } from './types.ts';

import { DEFAULT_TINT_THEME } from './constants.ts';

/**
 * Modifies the keys of an input object by prepending or appending a specified word.
 *
 * @param input - The input object with string keys.
 * @param word - The word to prepend or append to the keys.
 * @param position - The position to place the word ('prepend' or 'append').
 * @returns A new object with modified keys.
 */
export function modifyKeys<T>(input: Record<string, T>, word: string, position: 'prepend' | 'append') {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [position === 'prepend' ? `${word}-${key}` : `${key}-${word}`, value])
  );
}

/**
 * Flattens the keys of a nested object.
 *
 * @param obj - The object to flatten.
 * @param separator - The separator to use for the flattened keys.
 * @returns A new object with flattened keys.
 */
export function flattenKeys<T>(obj: Record<string, T>, separator = '-'): Record<string, T> {
  function recurse(currentObj: Record<string, T>, currentKey = ''): Record<string, T> {
    return Object.entries(currentObj).reduce((acc: Record<string, T>, [key, value]) => {
      let newKey = key === 'default' ? currentKey : `${currentKey}${separator}${key}`;
      if (newKey.startsWith(separator)) newKey = newKey.slice(1);

      if (typeof value === 'object' && value !== null) {
        Object.assign(acc, recurse(value as Record<string, T>, newKey));
      } else {
        acc[newKey] = value as T;
      }
      return acc;
    }, {});
  }

  return recurse(obj);
}

/**
 * Determines the type of overrides present in the theme.
 *
 * @param theme - The theme containing overrides.
 * @returns The type of overrides ('token-centric', 'color-centric', or null).
 */
export function overrideType(theme: TintTheme): 'token-centric' | 'color-centric' | null {
  if (!theme.overrides || !Object.keys(theme.overrides).length) return null;

  const firstKey = Object.keys(theme.overrides)[0];
  return firstKey in theme.tokens ? 'token-centric' : firstKey in theme.colors ? 'color-centric' : null;
}

/**
 * Extracts color tokens from the theme and converts them to Leo colors.
 *
 * @param theme - The theme containing colors and lightness.
 * @returns An object mapping color names to their corresponding CSS colors.
 */
export function extractColorTokens(theme: TintTheme): Record<string, CssColor> {
  const { lightness, colors } = theme;
  const colorRatiosMap = colorRatios(theme);

  const leoColors = Object.entries(colors).map(([name, value], index) => {
    return new (index === 0 ? BackgroundColor : Color)({
      name,
      ratios: colorRatiosMap[name] as RatiosObject,
      colorKeys: [value],
    });
  });

  const leoTheme = new Theme({
    lightness,
    saturation: 100,
    colors: leoColors,
    backgroundColor: leoColors[0] as BackgroundColor,
  });

  delete leoTheme.contrastColorPairs.background;
  return colorPairsToOKLCH(leoTheme.contrastColorPairs);
}

/**
 * Computes color ratios for the theme.
 *
 * @param theme - The theme containing colors and tokens.
 * @returns An object mapping color names to their corresponding ratios.
 */
export function colorRatios(theme: TintTheme) {
  const overrides = colorOverrides(theme);

  return Object.fromEntries(
    Object.keys(theme.colors).map((color) => [color, { ...modifyKeys(theme.tokens, color, 'append'), ...overrides[color] }])
  );
}

/**
 * Retrieves color overrides from the theme.
 *
 * @param theme - The theme containing overrides.
 * @returns An object mapping color names to their corresponding overrides.
 */
export function colorOverrides(theme: TintTheme): Record<string, Record<string, number>> {
  if (!theme.overrides) return {};

  const structure = overrideType(theme);

  return Object.entries(flattenKeys<number>(theme.overrides as unknown as Record<string, number>)).reduce(
    (acc, [override, value]) => {
      const parts = override.split('-');
      const color = structure === 'color-centric' ? parts.shift() : parts.pop();
      if (!color) return acc;

      acc[color] ||= {};
      acc[color][structure === 'color-centric' ? `${parts.join('-')}-${color}` : override] = value;
      return acc;
    },
    {} as Record<string, Record<string, number>>
  );
}

/**
 * Converts color contrast pairs to OKLCH format.
 *
 * @param colorContrastPairs - The color contrast pairs to convert.
 * @returns An object mapping token names to their corresponding OKLCH colors.
 */
export function colorPairsToOKLCH(colorContrastPairs: Record<string, CssColor>): Record<string, CssColor> {
  return Object.fromEntries(
    Object.keys(colorContrastPairs).map((token) => {
      const color = colorContrastPairs[token];
      if (!color) throw new Error(`Invalid color for token: ${token}`);

      const [l, c, h] = chroma(color).oklch();
      return [token, `oklch(${(l * 100).toFixed(2)}% ${c === 0 ? 0 : c.toFixed(2)} ${isNaN(h) ? 0 : h.toFixed(2)})`];
    })
  ) as Record<string, CssColor>;
}

/**
 * Converts tokens into CSS variables.
 *
 * @param tokens - The tokens to convert.
 * @returns An object mapping CSS variable names to their values.
 */
export function tokensToCSSVars(tokens: Record<string, string>) {
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--color-${key}`, value]));
}

/**
 * Generates default CSS variables for a given theme.
 *
 * @param theme - The theme containing color tokens.
 * @param defaultColor - An optional default color to use.
 * @returns An object mapping CSS variable names to their corresponding values.
 */
export function defaultCSSVars(theme: TintTheme, defaultColor?: string) {
  const color = defaultColor ?? Object.keys(theme.colors)[0];

  return Object.fromEntries(Object.keys(theme.tokens).map((token) => [`--color-${token}`, `var(--color-${token}-${color})`]));
}

/**
 * Generates light and dark tokens for a set of themes.
 *
 * @param themes - An array of themes containing light and dark tokens.
 * @returns An object mapping token names to their corresponding light-dark values.
 */
export function lightDarkTokens(themes: TintTheme[]): Record<string, string> {
  const [lightTokens, darkTokens] = themes.map(extractColorTokens);

  return Object.fromEntries(
    Object.keys(lightTokens).map((token) => [token, `light-dark(${lightTokens[token]}, ${darkTokens[token]})`])
  );
}

/**
 * Creates default Tailwind utilities for the theme.
 *
 * @param theme - The theme containing tokens.
 * @returns An object mapping utility names to their corresponding CSS variable values.
 */
export function defaultTailwindUtils(theme: TintTheme) {
  return Object.fromEntries(Object.keys(theme.tokens).map((token) => [token, `var(--color-${token})`]));
}

/**
 * Generates Tailwind utilities from tokens.
 *
 * @param tokens - The tokens to convert into Tailwind utilities.
 * @returns An object mapping utility class names to their corresponding CSS variable values.
 */
export function tailwindUtilities(tokens: Record<string, string>) {
  return Object.fromEntries(Object.keys(tokens).map((key) => [key, `var(--color-${key})`]));
}

/**
 * Creates tint classes for each color in the theme.
 *
 * @param theme - The theme containing colors.
 * @returns An object mapping tint class names to their corresponding CSS variables.
 */
export function createTintClasses(theme: TintTheme) {
  return Object.fromEntries(Object.keys(theme.colors).map((color) => [`.tint-${color}`, defaultCSSVars(theme, color)]));
}

/**
 * Merges multiple tint classes into a single object.
 *
 * @param baseTints - An object mapping tint class names to their properties.
 * @returns A merged object of tint classes.
 */
export function mergeTintClasses(baseTints: Record<string, Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(baseTints).map(([tintClass, props]) => [
      tintClass,
      Object.fromEntries(Object.entries(props).map(([prop, value]) => [prop, String(value)])),
    ])
  );
}
/**
 * Processes a theme by flattening tokens and extracting color tokens.
 */
export function processTheme(theme: TintTheme): TintThemeResource {
  const flattenedTokens = flattenKeys(theme.tokens);
  const processedTheme = { ...theme, tokens: flattenedTokens };
  const colorTokens = extractColorTokens(processedTheme);

  return {
    themeSelector: `[data-theme="${theme.name}"]`,
    base: {
      ...tokensToCSSVars(colorTokens),
      ...defaultCSSVars(processedTheme),
    },
    colors: {
      ...tailwindUtilities(colorTokens),
      ...defaultTailwindUtils(processedTheme),
    },
    components: createTintClasses(processedTheme),
  };
}

/**
 * Merges an array of theme resources into Tailwind CSS base and component styles.
 *
 * @param resources - Array of processed theme resources.
 * @returns An object containing merged base styles and component styles.
 */
export function mergeThemeResources(resources: TintThemeResource[]) {
  return {
    baseStyles: Object.fromEntries(resources.map(({ themeSelector, base }) => [themeSelector, base])),
    componentStyles: mergeTintClasses(Object.assign({}, ...resources.map(({ components }) => components))),
  };
}

/**
 * Generates the Tailwind theme extension for colors.
 *
 * @param themes - Array of themes to process.
 * @returns An object with the extended color tokens for Tailwind.
 */
export function generateThemeExtension(themes: TintTheme[]) {
  return Object.assign(
    {},
    ...themes.map((theme) => {
      const processedTheme = { ...theme, tokens: flattenKeys(theme.tokens) };
      const colorTokens = extractColorTokens(processedTheme);
      return Object.assign(tailwindUtilities(colorTokens), defaultTailwindUtils(processedTheme));
    })
  );
}

/**
 * Initializes the Tint Tailwind plugin, extracting theme data and generating necessary styles.
 *
 * @returns A Tailwind CSS plugin configured with theme extension and styling utilities.
 */
export function initializePlugin() {
  return plugin.withOptions(
    (options: TintConfig | undefined) => {
      return ({ addBase, addComponents }) => {
        if (!options) return;

        const { themes = [] } = options;
        const allThemes = themes.length ? themes : [DEFAULT_TINT_THEME];

        const tintThemeResources = allThemes.map(processTheme);
        const { baseStyles, componentStyles } = mergeThemeResources(tintThemeResources);

        addBase(baseStyles);
        addComponents(componentStyles);
      };
    },
    (options?: TintConfig) => {
      const themes = options?.themes?.length ? options.themes : [DEFAULT_TINT_THEME];

      return {
        theme: {
          extend: {
            colors: generateThemeExtension(themes),
          },
        },
      };
    }
  );
}
