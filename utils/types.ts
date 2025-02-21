export type TintOptions = Record<string, string | number | string[] | number[]>;

export interface TintTheme {
  name: string;
  lightness: number;
  colors: Record<string, string>;
  tokens: Record<string, number>;
  overrides: Record<string, unknown>;
}
