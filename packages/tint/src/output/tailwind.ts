import type { GenerationResult } from "../engine/types.js";

export interface TailwindOptions {
  indent?: string;
  /** Drop redundant group names (`text-heading` instead of `text-text-heading`). Default true. */
  simplifyNames?: boolean;
  /** Emit `@utility` shortcut classes for utility-prefix groups. Default true. */
  generateShortcuts?: boolean;
}

export interface TintUtilitiesOptions extends TailwindOptions {
  /** Emit the alias layer and `tint-*` palette-switching utilities. */
  generateTintUtilities?: boolean;
  /** Palette the unprefixed variables default to. Default "base". */
  defaultPalette?: string;
  includeOKLCH?: boolean;
}

export function toTailwind(
  result: GenerationResult | GenerationResult[],
  options?: TailwindOptions,
): string {
  void result;
  void options;
  throw new Error("not implemented");
}
export function toCSSWithTailwind(
  result: GenerationResult | GenerationResult[],
  options?: TailwindOptions & { includeOKLCH?: boolean },
): string {
  void result;
  void options;
  throw new Error("not implemented");
}
export function toCSSWithTailwindAndTint(
  result: GenerationResult | GenerationResult[],
  options?: TintUtilitiesOptions,
): string {
  void result;
  void options;
  throw new Error("not implemented");
}
export function assertConsistentStructure(results: GenerationResult[]): void {
  void results;
  throw new Error("not implemented");
}
export function detectTailwindConflicts(
  result: GenerationResult,
  simplifyNames: boolean,
): void {
  void result;
  void simplifyNames;
  throw new Error("not implemented");
}
