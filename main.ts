import plugin from 'npm:tailwindcss/plugin';
import { defaultOptions } from './utils/constants.ts';
import type { TintOptions } from './utils/types.ts';
import {
  createLightAndDarkThemes,
  generateCSSVariables,
  generateDefaultCSSVariables,
  generateDefaultTailwindUtilities,
  generateLightDarkTokens,
  generateTailwindUtilities,
  generateTintComponents,
} from './utils/functions.ts';

let colorUtilities: Record<string, string>;
let defaultColorUtilies: Record<string, string>;

export default plugin.withOptions(
  (_options: TintOptions = defaultOptions) => {
    const [lightTheme, darkTheme] = createLightAndDarkThemes(_options);
    const lightDarkTokens = generateLightDarkTokens([lightTheme, darkTheme]);

    const cssVariables = generateCSSVariables(lightDarkTokens);
    const defaultCSSVariables = generateDefaultCSSVariables(lightTheme);
    const tintComponents = generateTintComponents(lightTheme);

    colorUtilities = generateTailwindUtilities(lightDarkTokens);
    defaultColorUtilies = generateDefaultTailwindUtilities(lightTheme.tokens);

    return ({ addBase, addComponents }) => {
      addBase({
        ':root': { ...cssVariables, ...defaultCSSVariables },
      });

      addComponents(tintComponents);
    };
  },
  () => ({
    theme: {
      extend: {
        colors: {
          ...colorUtilities,
          ...defaultColorUtilies,
        },
      },
    },
  })
);
