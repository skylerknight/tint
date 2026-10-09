import type { Config } from "../config/types.js";
import type { GenerationResult } from "./types.js";

export function generate(config: Config | unknown): GenerationResult;
export function generate(configs: readonly (Config | unknown)[]): GenerationResult[];
export function generate(
  input: Config | unknown | readonly (Config | unknown)[],
): GenerationResult | GenerationResult[] {
  void input;
  throw new Error("not implemented");
}
