/**
 * Internal helpers shared by `validate.ts` and `resolve.ts`. Not part of the public API.
 */
import { LC_SHORTCUTS, type TokenGroup, type Variant } from "./types.js";

/** Sentinel for `pure` (mirrors `PURE` in resolve.ts; kept here to avoid a cycle). */
export const PURE_SENTINEL = -1;

/** Color, group and variant names become CSS identifiers. */
export const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/** `$on` is `"group"` or `"group.variant"`. */
export const ON_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)?$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isVariantKey(key: string): boolean {
  return !key.startsWith("$");
}

/** Non-`$` entries of a group, in insertion order. */
export function variantEntries(group: TokenGroup): Array<[string, Variant]> {
  const entries: Array<[string, Variant]> = [];
  for (const [key, value] of Object.entries(group)) {
    if (isVariantKey(key)) entries.push([key, value as Variant]);
  }
  return entries;
}

export function variantKind(variant: Variant): "lc" | "ls" {
  return "lc" in variant ? "lc" : "ls";
}

export function resolveLc(lc: number | string): number {
  if (typeof lc === "number") return lc;
  if (lc === "pure") return PURE_SENTINEL;
  return LC_SHORTCUTS[lc as keyof typeof LC_SHORTCUTS];
}

export function resolveLs(ls: number | string): number {
  return typeof ls === "number" ? ls : PURE_SENTINEL;
}

/** The variant's numeric value with shortcuts resolved; `PURE_SENTINEL` for `pure`. */
export function variantValue(variant: Variant): number {
  return "lc" in variant ? resolveLc(variant.lc) : resolveLs(variant.ls);
}

/**
 * Reference variant of a group: explicit `$reference`, else the highest non-pure
 * value (first wins on ties), else the first variant.
 */
export function pickReferenceVariant(entries: ReadonlyArray<[string, Variant]>): string {
  const explicit = entries.find(([, variant]) => variant.$reference === true);
  if (explicit) return explicit[0];

  let best: { name: string; value: number } | null = null;
  for (const [name, variant] of entries) {
    const value = variantValue(variant);
    if (value === PURE_SENTINEL) continue;
    if (best === null || value > best.value) best = { name, value };
  }
  if (best) return best.name;

  return entries[0]?.[0] ?? "";
}
