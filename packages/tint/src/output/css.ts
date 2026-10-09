import type { GenerationResult } from "../engine/types.js";

export interface CSSOptions {
  selector?: string;
  format?: "hex" | "oklch";
  includeOKLCH?: boolean;
  indent?: string;
  comments?: boolean;
}

export function toCSS(
  result: GenerationResult | GenerationResult[],
  options?: CSSOptions,
): string {
  void result;
  void options;
  throw new Error("not implemented");
}
