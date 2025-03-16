import type { TintTheme } from './types.ts';

export const DEFAULT_TINT_THEME: TintTheme = {
  name: 'default',
  lightness: 85,
  colors: {
    base: 'oklch(100% 0 0deg)',
    brand: 'oklch(67.53% 0.18 264.61deg)',
  },
  tokens: {
    surface: -1.35,
    'surface-raised': -1.2,
    action: 4,
    'action-hover': 5,
    'action-active': 3,
  },
};
