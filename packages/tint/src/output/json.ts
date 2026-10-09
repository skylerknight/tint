import type { GenerationResult } from "../engine/types.js";

export interface JSONOptions {
  includeSchema?: boolean;
  useOKLCH?: boolean;
  indent?: number;
  metadata?: boolean;
}

export function toDTCG(
  result: GenerationResult,
  options?: JSONOptions,
): Record<string, unknown> {
  void result;
  void options;
  throw new Error("not implemented");
}
export function toJSON(result: GenerationResult, options?: JSONOptions): string {
  void result;
  void options;
  throw new Error("not implemented");
}
export function toFlatMap(result: GenerationResult): Record<string, string> {
  void result;
  throw new Error("not implemented");
}
