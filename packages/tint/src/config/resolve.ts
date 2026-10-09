import type { Config, Mode, OutputFormat, TokenRole } from "./types.js";

/** Sentinel value for `pure` (pure white in light mode, pure black in dark mode). */
export const PURE = -1;

export interface ResolvedVariant {
  group: string;
  name: string;
  kind: "lc" | "ls";
  /** Lc or ls value; `PURE` for the `pure` sentinel. */
  value: number;
  reference: boolean;
  /** Fully resolved contrast target, or null for foundation variants. */
  on: { group: string; variant: string } | null;
  decorative: boolean;
  invert: boolean;
  /** Effective step size for ls variants. */
  scale: number;
  /** Effective chroma multiplier. */
  chroma: number;
  role: TokenRole | null;
}

export interface ResolvedGroup {
  name: string;
  role: TokenRole | null;
  referenceVariant: string;
  variants: Record<string, ResolvedVariant>;
}

export interface ResolvedOverride {
  value?: number;
  scale?: number;
  decorative?: boolean;
  invert?: boolean;
  chroma?: number;
}

export interface ResolvedConfig {
  name: string;
  mode: Mode;
  selector: string;
  prefersColorScheme?: "light" | "dark";
  prefersContrast?: "more" | "less" | "custom";
  scale: number;
  offset: number;
  /** `base` first when present, then config insertion order. */
  colors: Array<{ name: string; input: string }>;
  groups: Record<string, ResolvedGroup>;
  /** Topological order: every `on` target precedes its dependents. */
  order: Array<{ group: string; variant: string }>;
  /** color -> "group.variant" -> override */
  overrides: Record<string, Record<string, ResolvedOverride>>;
  output: { path: string; formats: OutputFormat[] };
}

export function parseOn(on: string): { group: string; variant?: string } {
  const [group = "", variant] = on.split(".");
  return variant === undefined ? { group } : { group, variant };
}

export function resolveConfig(config: Config): ResolvedConfig {
  void config;
  throw new Error("not implemented");
}
