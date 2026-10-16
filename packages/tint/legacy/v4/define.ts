import type { Config } from "./types.js";

/** Keys of `T` that a value must actually provide. */
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * `T extends Config` accepts `{}`: the type parameter is inferred from the
 * argument before required keys are checked. Missing required keys, and keys
 * that are not on {@link Config}, are pinned to `never`.
 */
type ExactConfig<T> = T &
  Record<Exclude<keyof T, keyof Config>, never> &
  Record<Exclude<RequiredKeys<Config>, keyof T>, never>;

/**
 * Return a v4 config unchanged, preserving literal palette and token names (§2).
 *
 * Identity only. The v4 validator is a later step; this does not check the
 * document, and it does not accept a v3-style config array (themes are a map).
 */
export function defineConfig<const T extends Config>(config: ExactConfig<T>): T {
  return config;
}
