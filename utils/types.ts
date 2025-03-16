import type { CssColor } from 'npm:@adobe/leonardo-contrast-colors@1.0.0';

export interface TintConfig {
  defaults?: TintDefaults;
  themes: Array<TintTheme>;
  variants: Array<TintVariant>;
}

export interface TintDefaults {
  variant: string;
  theme: string;
}

export interface TintTheme {
  name: string;
  lightness: number;
  colors: Record<string, CssColor>;
  tokens: TokenGroup;
  overrides?: TintOverrides;
}

export interface TintVariant {
  name: string;
  light?: string;
  dark?: string;
  highContrast?: string;
  lowContrast?: string;
}

export type TokenGroup = {
  [key: string]: number | TokenGroup;
};

export type TokenMap = Record<string, number | TokenGroup>;

export type TokenOverride<T extends TintTheme> = {
  [Token in keyof T['tokens']]?: {
    [State: string]: Partial<Record<keyof T['colors'], string | number>>;
  };
};

export type ColorOverride<T extends TintTheme> = {
  [Color in keyof T['colors']]?: {
    [Token in keyof T['tokens']]?: Record<string, string | number>;
  };
};

export type TintOverrides = TokenOverride<TintTheme> | ColorOverride<TintTheme>;

export type TintThemeResource = {
  themeSelector: string;
  base: Record<string, string>;
  colors: Record<string, string>;
  components: Record<string, Record<string, string>>;
};
