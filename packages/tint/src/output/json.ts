import type {
  GenerationResult,
  GeneratedPalette,
  GeneratedVariant,
} from "../engine/types.js";
import { formatOKLCH } from "../color/oklch.js";
import { variantSegment } from "./names.js";

export interface JSONOptions {
  /** Add the DTCG `$schema` reference (default true). */
  includeSchema?: boolean;
  /** Emit `oklch(…)` values instead of hex (default false). */
  useOKLCH?: boolean;
  /** `JSON.stringify` indentation for `toJSON` (default 2). */
  indent?: number;
  /** Attach `$extensions["dev.tint"]` metadata to each token (default true). */
  metadata?: boolean;
}

export const DTCG_SCHEMA = "https://design-tokens.org/schema.json";

export interface TintTokenExtension {
  kind: "lc" | "ls";
  lc?: number;
  ls?: number;
  target?: number;
  on?: string;
  reference?: true;
  decorative?: true;
}

export interface DTCGToken {
  $type: "color";
  $value: string;
  $extensions?: { "dev.tint": TintTokenExtension };
}

function tokenExtension(token: GeneratedVariant): TintTokenExtension {
  const ext: TintTokenExtension =
    token.kind === "lc"
      ? { kind: "lc", lc: token.lc, target: token.target }
      : { kind: "ls", ls: token.ls };
  if (token.on !== undefined) ext.on = token.on;
  if (token.reference) ext.reference = true;
  if (token.decorative) ext.decorative = true;
  return ext;
}

function tokenToDTCG(
  token: GeneratedVariant,
  useOKLCH: boolean,
  metadata: boolean,
): DTCGToken {
  const value = useOKLCH ? formatOKLCH(token.oklch) : token.hex;
  const out: DTCGToken = { $type: "color", $value: value };
  if (metadata) out.$extensions = { "dev.tint": tokenExtension(token) };
  return out;
}

function paletteToDTCG(
  palette: GeneratedPalette,
  useOKLCH: boolean,
  metadata: boolean,
): Record<string, Record<string, DTCGToken>> {
  const groups: Record<string, Record<string, DTCGToken>> = {};
  for (const [group, variants] of Object.entries(palette.tokens)) {
    const out: Record<string, DTCGToken> = {};
    for (const [variant, token] of Object.entries(variants)) {
      out[variant] = tokenToDTCG(token, useOKLCH, metadata);
    }
    groups[group] = out;
  }
  return groups;
}

/**
 * Convert a result to a DTCG (Design Tokens Community Group) object.
 *
 * Shape: `{ $schema?, [palette]: { [group]: { [variant]: { $type, $value, $extensions? } } } }`.
 * Variant keys keep their config names (`DEFAULT` stays `DEFAULT`).
 */
export function toDTCG(
  result: GenerationResult,
  options?: JSONOptions,
): Record<string, unknown> {
  const includeSchema = options?.includeSchema ?? true;
  const useOKLCH = options?.useOKLCH ?? false;
  const metadata = options?.metadata ?? true;

  const out: Record<string, unknown> = {};
  if (includeSchema) out.$schema = DTCG_SCHEMA;
  for (const palette of result.palettes) {
    out[palette.name] = paletteToDTCG(palette, useOKLCH, metadata);
  }
  return out;
}

/** `toDTCG` serialized with `JSON.stringify` (indent defaults to 2). */
export function toJSON(result: GenerationResult, options?: JSONOptions): string {
  return JSON.stringify(toDTCG(result, options), null, options?.indent ?? 2);
}

/**
 * Flat `"palette.group.variant" -> hex` map. The `DEFAULT` segment is
 * dropped, so `base.surface.DEFAULT` becomes `base.surface`.
 */
export function toFlatMap(result: GenerationResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const palette of result.palettes) {
    for (const [group, variants] of Object.entries(palette.tokens)) {
      for (const [variant, token] of Object.entries(variants)) {
        const key = [palette.name, group, variantSegment(variant)]
          .filter(Boolean)
          .join(".");
        out[key] = token.hex;
      }
    }
  }
  return out;
}
