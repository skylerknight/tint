import type { RGB, OKLCH } from "../color/types.js";
import type { Mode } from "../config/types.js";
import type { Diagnostic } from "./diagnostics.js";

export interface GeneratedColor {
  hex: string;
  rgb: RGB;
  oklch: OKLCH;
}

export interface GeneratedVariantBase extends GeneratedColor {
  /** Present (true) only on the group's reference variant. */
  reference?: true;
  /** `"group.variant"` this token contrasts against, when it has one. */
  on?: string;
  /** Present (true) when the token is exempt from contrast diagnostics. */
  decorative?: true;
}

export interface GeneratedLcVariant extends GeneratedVariantBase {
  kind: "lc";
  /** Achieved |Lc|. */
  lc: number;
  /** Requested Lc (resolved through shortcuts; -1 for `pure`). */
  target: number;
}

export interface GeneratedLsVariant extends GeneratedVariantBase {
  kind: "ls";
  /** Steps from the reference; -1 for `pure`. */
  ls: number;
}

export type GeneratedVariant = GeneratedLcVariant | GeneratedLsVariant;

export interface GeneratedPalette {
  name: string;
  seed: GeneratedColor;
  /** group -> variant -> token, in config order. */
  tokens: Record<string, Record<string, GeneratedVariant>>;
}

export interface GenerationResult {
  name: string;
  mode: Mode;
  selector: string;
  prefersColorScheme?: "light" | "dark";
  prefersContrast?: "more" | "less" | "custom";
  palettes: GeneratedPalette[];
  diagnostics: Diagnostic[];
  /** `diagnostics.map((d) => d.message)` for convenience. */
  warnings: string[];
}
