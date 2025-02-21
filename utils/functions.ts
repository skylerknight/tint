import {
  BackgroundColor,
  Color,
  Theme,
  type ColorBase,
  type CssColor,
  type RatiosObject,
} from 'npm:@adobe/leonardo-contrast-colors@1.0.0';
import type { TintOptions, TintTheme } from './types.ts';

export function transformKeys<T>(input: Record<string, T>, word: string, position: 'prepend' | 'append') {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      const newKey = position === 'prepend' ? `${word}-${key}` : `${key}-${word}`;
      return [newKey, value];
    })
  );
}

export function generateCSSVariables(lightDarkTokens: Record<string, string>) {
  return Object.entries(lightDarkTokens).reduce((acc: Record<string, string>, [key, value]) => {
    acc[`--color-${key}`] = value;
    return acc;
  }, {});
}

export function generateDefaultCSSVariables(defaultTheme: TintTheme, defaultColor?: string) {
  const { colors, tokens } = defaultTheme;
  if (defaultColor === undefined) defaultColor = Object.keys(colors).at(0);
  return Object.keys(tokens).reduce((acc: Record<string, string>, token) => {
    acc[`--color-${token}`] = `var(--color-${token}-${defaultColor})`;
    return acc;
  }, {});
}

export function generateTailwindUtilities(lightDarkTokens: Record<string, string>) {
  return Object.keys(lightDarkTokens).reduce((acc: Record<string, string>, key) => {
    acc[key] = `var(--color-${key})`;
    return acc;
  }, {});
}

export function generateDefaultTailwindUtilities(tokens: Record<string, number>) {
  return Object.keys(tokens).reduce((acc: Record<string, string>, token) => {
    acc[token] = `var(--color-${token})`;
    return acc;
  }, {});
}

export function generateTintComponents(defaultTheme: TintTheme) {
  const { colors } = defaultTheme;
  return Object.keys(colors).reduce((acc: { [tintClass: string]: Record<string, string> }, color) => {
    acc[`.tint-${color}`] = generateDefaultCSSVariables(defaultTheme, color);
    return acc;
  }, {});
}

export function generateColorTokensFromTheme(theme: TintTheme) {
  // Extract theme data
  let { lightness, colors, tokens, overrides } = theme;
  if (overrides) overrides = Object.groupBy(Object.entries(overrides), ([key]) => key.split('-').at(-1) ?? '');

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
    output: 'OKLCH',
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
    const type = option as keyof TintTheme;

    // @ts-expect-error - TS doesn't know that option is a key of Theme
    acc[type] = rest.length ? { ...acc[type], [rest.join('-')]: value } : value;

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
