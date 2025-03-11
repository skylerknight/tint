import {
  BackgroundColor,
  Color,
  Theme,
  type ColorBase,
  type CssColor,
  type RatiosObject,
} from 'npm:@adobe/leonardo-contrast-colors@1.0.0';
import type { TintOptions, TintTheme } from './types.ts';

/**
 *
 * @param obj
 * @param callback
 * @returns an object grouped by the result of the callback function
 */
function groupByObject<T>(
  obj: Record<string, T>,
  callback: (key: string, value: T) => string
): Record<string, Record<string, T>> {
  return Object.entries(obj).reduce<Record<string, Record<string, T>>>((acc, [key, value]) => {
    const groupKey = callback(key, value); // Determine the group key
    (acc[groupKey] ||= {})[key] = value;
    return acc;
  }, {});
}

/**
 *
 * @param input
 * @param word
 * @param position
 * @returns A new object with keys transformed by appending or prepending a word
 */
export function transformKeys<T>(input: Record<string, T>, word: string, position: 'prepend' | 'append') {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      const newKey = position === 'prepend' ? `${word}-${key}` : `${key}-${word}`;
      return [newKey, value];
    })
  );
}

/**
 *
 * @param lightDarkTokens
 * @returns An object with CSS variables generated from lightDarkTokens
 */
export function generateCSSVariables(lightDarkTokens: Record<string, string>) {
  return Object.entries(lightDarkTokens).reduce((acc: Record<string, string>, [key, value]) => {
    acc[`--color-${key}`] = value;
    return acc;
  }, {});
}

/**
 *
 * @param defaultTheme
 * @param defaultColor
 * @returns An object with CSS variables generated from defaultTheme
 */
export function generateDefaultCSSVariables(defaultTheme: TintTheme, defaultColor?: string) {
  const { colors, tokens } = defaultTheme;
  if (defaultColor === undefined) defaultColor = Object.keys(colors).at(0);
  return Object.keys(tokens).reduce((acc: Record<string, string>, token) => {
    acc[`--color-${token}`] = `var(--color-${token}-${defaultColor})`;
    return acc;
  }, {});
}

/**
 * @param lightDarkTokens
 * @returns An object with Tailwind utilities generated from lightDarkTokens
 * e.g. { 'surface-raised': 'var(--color-surface-raised)' }
 */
export function generateTailwindUtilities(lightDarkTokens: Record<string, string>) {
  return Object.keys(lightDarkTokens).reduce((acc: Record<string, string>, key) => {
    acc[key] = `var(--color-${key})`;
    return acc;
  }, {});
}

/**
 * @param tokens
 * @returns An object with Tailwind utilities generated from tokens
 * e.g. { 'surface-raised': 'var(--color-surface-raised)' }
 */
export function generateDefaultTailwindUtilities(tokens: Record<string, number>) {
  return Object.keys(tokens).reduce((acc: Record<string, string>, token) => {
    acc[token] = `var(--color-${token})`;
    return acc;
  }, {});
}

/**
 * @param defaultTheme
 * @returns An object with Tailwind class components for tints
 * e.g. { '.tint-primary': <CSSVariables> }
 */
export function generateTintComponents(defaultTheme: TintTheme) {
  const { colors } = defaultTheme;
  return Object.keys(colors).reduce((acc: { [tintClass: string]: Record<string, string> }, color) => {
    acc[`.tint-${color}`] = generateDefaultCSSVariables(defaultTheme, color);
    return acc;
  }, {});
}

/**
 *
 * @param theme
 * @returns An object containing color tokens
 * e.g. { 'surface-raised': '#f5f5f5' }
 */
export function generateColorTokensFromTheme(theme: TintTheme) {
  // Extract theme data
  let { lightness, colors, tokens, overrides } = theme;
  if (overrides) overrides = groupByObject(overrides, ([key]) => key.split('-').at(-1) ?? '');

  // Create Leo Colors
  const leoColors = Object.entries(colors).map(([name, value], index) => {
    let ratios: RatiosObject = transformKeys<number>(tokens, name, 'append');
    if (overrides && overrides?.[name]) ratios = { ...ratios, ...overrides[name] };

    const colorOptions: ColorBase = {
      name,
      ratios,
      smooth: true,
      colorspace: 'OKLCH',
      colorKeys: [value as CssColor],
    };

    return index === 0 ? new BackgroundColor(colorOptions) : new Color(colorOptions);
  });

  const leoTheme = new Theme({
    lightness,
    contrast: 1,
    output: 'HSL',
    colors: leoColors,
    backgroundColor: leoColors[0] as BackgroundColor,
  });

  delete leoTheme.contrastColorPairs.background;
  return leoTheme.contrastColorPairs;
}

export function generateLightDarkTokens(themes: TintTheme[]): Record<string, string> {
  const lightDarkTokens: Record<string, string> = {};
  const [lightTokens, darkTokens] = themes.map((theme) => generateColorTokensFromTheme(theme));

  for (const token of Object.keys(lightTokens)) {
    const light = lightTokens[token];
    const dark = darkTokens[token];
    // Generates light dark token e.g. suface-raised: light-dark(#f5f5f5, #1a1a1a)
    lightDarkTokens[token] = `light-dark(${light}, ${dark})`;
  }
  return lightDarkTokens;
}

export function convertTintOptionsToTheme(themeOptions: TintOptions): TintTheme {
  return Object.entries(themeOptions).reduce<TintTheme>((acc, [key, value]) => {
    let [option, ...rest]: string[] = key.split('-');

    // Add 's' to keys with multiple values (colors, tokens, overrides)
    if (rest.length) option += 's';

    // @ts-expect-error - TS doesn't know that option is a key of Theme
    acc[option] = rest.length ? { ...acc[option], [rest.join('-')]: value } : value;

    return acc;
  }, {} as TintTheme);
}

export function createLightAndDarkThemes(options: TintOptions): TintTheme[] {
  const lightThemeOptions: TintOptions = {};
  const darkThemeOptions: TintOptions = {};

  Object.entries(options).forEach(([key, value]) => {
    if (!value) return;

    let lightValue = value;
    let darkValue = value;

    if (Array.isArray(value)) {
      lightValue = value.at(0) ?? '';
      darkValue = value.at(1) || value.at(0) || '';
    }

    lightThemeOptions[key] = lightValue;
    darkThemeOptions[key] = darkValue || lightValue;
  });

  const lightTheme: TintTheme = convertTintOptionsToTheme(lightThemeOptions);
  const darkTheme: TintTheme = convertTintOptionsToTheme(darkThemeOptions);

  return [lightTheme, darkTheme];
}
