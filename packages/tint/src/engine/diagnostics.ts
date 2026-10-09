import type { TokenRole } from "../config/types.js";

export type DiagnosticCode =
  | "contrast-unreachable"
  | "contrast-below-minimum"
  | "role-contrast-low"
  | "seed-out-of-gamut"
  | "palette-name-conflict"
  | "reference-midtone";

export interface Diagnostic {
  severity: "warning";
  code: DiagnosticCode;
  message: string;
  /** `<palette>.<group>.<variant>` or `<palette>`. */
  path: string;
  hint?: string;
  data?: Record<string, unknown>;
}

/** Recommended minimum Lc per role for non-decorative lc variants with a reference. */
export const ROLE_MIN_LC: Partial<Record<TokenRole, number>> = {
  text: 45,
  icon: 30,
  action: 30,
  status: 30,
  border: 15,
};

/** Minimum Lc APCA considers meaningful for foreground elements. */
export const APCA_MINIMUM_LC = 8;
