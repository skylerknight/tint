import { initializePlugin } from './utils/functions.ts';
import type { Config } from 'npm:tailwindcss@4.0.7';
import type { TintConfig } from './utils/types.ts';

const tint = initializePlugin();

export default (options: TintConfig) => ({ plugins: [tint(options)] } as Config);
