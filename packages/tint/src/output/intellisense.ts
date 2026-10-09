import type { GenerationResult } from "../engine/types.js";
import type { TintUtilitiesOptions } from "./tailwind.js";

export function toTailwindIntelliSense(
  result: GenerationResult | GenerationResult[],
  options?: TintUtilitiesOptions,
): string {
  void result;
  void options;
  throw new Error("not implemented");
}
