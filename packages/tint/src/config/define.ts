import type { Config } from "./types.js";
import { assertConfig, ConfigError } from "./validate.js";

/**
 * Validate a tint config (or an array of configs for multi-theme setups) and return
 * it unchanged, preserving literal types so token names flow through to callers.
 */
export function defineConfig<const T extends Config>(config: T): T;
export function defineConfig<const T extends readonly Config[]>(configs: T): T;
export function defineConfig(
  input: Config | readonly Config[],
): Config | readonly Config[] {
  if (Array.isArray(input)) {
    input.forEach((config, index) => {
      try {
        assertConfig(config);
      } catch (error) {
        if (error instanceof ConfigError) {
          throw new ConfigError(error.issues, `Invalid tint config (theme ${index + 1})`);
        }
        throw error;
      }
    });
    return input;
  }
  assertConfig(input);
  return input;
}
