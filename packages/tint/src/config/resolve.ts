import {
  pickReferenceVariant,
  resolveLc,
  resolveLs,
  variantEntries,
  variantKind,
  variantValue,
} from "./internal.js";
import type {
  Colors,
  Config,
  Mode,
  OutputFormat,
  OverrideValue,
  Overrides,
  TokenGroup,
  TokenRole,
  Tokens,
} from "./types.js";

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

const DEFAULT_SCALE = 0.02;
const DEFAULT_OFFSET: Record<Mode, number> = { light: 0.015, dark: 0.15 };
const DEFAULT_OUTPUT_PATH = "./tint";
const DEFAULT_FORMATS: OutputFormat[] = ["css"];

export function parseOn(on: string): { group: string; variant?: string } {
  const [group = "", variant] = on.split(".");
  return variant === undefined ? { group } : { group, variant };
}

export function resolveConfig(config: Config): ResolvedConfig {
  const groups = resolveGroups(config);
  return {
    name: config.name,
    mode: config.mode,
    selector: config.selector ?? ":root",
    ...(config.prefersColorScheme !== undefined && {
      prefersColorScheme: config.prefersColorScheme,
    }),
    ...(config.prefersContrast !== undefined && {
      prefersContrast: config.prefersContrast,
    }),
    scale: config.scale ?? DEFAULT_SCALE,
    offset: config.offset ?? DEFAULT_OFFSET[config.mode],
    colors: resolveColors(config.colors),
    groups,
    order: topologicalOrder(groups),
    overrides: resolveOverrides(config.overrides ?? {}, config.tokens),
    output: {
      path: config.output?.path ?? DEFAULT_OUTPUT_PATH,
      formats: [...(config.output?.formats ?? DEFAULT_FORMATS)],
    },
  };
}

// ─── colors ───────────────────────────────────────────────────────────────────

function resolveColors(colors: Colors): ResolvedConfig["colors"] {
  const entries = Object.entries(colors).map(([name, value]) => ({
    name,
    input: typeof value === "string" ? value : value.value,
  }));
  const base = entries.filter((c) => c.name === "base");
  const rest = entries.filter((c) => c.name !== "base");
  return [...base, ...rest];
}

// ─── groups ───────────────────────────────────────────────────────────────────

function resolveGroups(config: Config): Record<string, ResolvedGroup> {
  const references = referenceVariants(config.tokens);
  const groups: Record<string, ResolvedGroup> = {};
  for (const [groupName, group] of Object.entries(config.tokens)) {
    const referenceVariant = references[groupName] ?? "";
    const variants: Record<string, ResolvedVariant> = {};
    for (const [name, variant] of variantEntries(group)) {
      const on = variant.$on ?? group.$on;
      variants[name] = {
        group: groupName,
        name,
        kind: variantKind(variant),
        value: variantValue(variant),
        reference: name === referenceVariant,
        on: on === undefined ? null : resolveOn(on, references),
        decorative: group.$decorative === true || variant.$decorative === true,
        invert:
          group.$invert === true || ("$invert" in variant && variant.$invert === true),
        scale: resolveScale(variant, group, config),
        chroma: variant.$chroma ?? group.$chroma ?? 1,
        role: group.$role ?? null,
      };
    }
    groups[groupName] = {
      name: groupName,
      role: group.$role ?? null,
      referenceVariant,
      variants,
    };
  }
  return groups;
}

function referenceVariants(tokens: Tokens): Record<string, string> {
  const references: Record<string, string> = {};
  for (const [name, group] of Object.entries(tokens)) {
    references[name] = pickReferenceVariant(variantEntries(group));
  }
  return references;
}

function resolveOn(
  on: string,
  references: Record<string, string>,
): { group: string; variant: string } {
  const { group, variant } = parseOn(on);
  return { group, variant: variant ?? references[group] ?? "" };
}

/** variant.$scale → group.$scale → $scale of the group's `$on` group → config → 0.02 */
function resolveScale(
  variant: { $scale?: number } | { lc: unknown },
  group: TokenGroup,
  config: Config,
): number {
  if ("$scale" in variant && variant.$scale !== undefined) return variant.$scale;
  if (group.$scale !== undefined) return group.$scale;
  const onGroup =
    group.$on === undefined ? undefined : config.tokens[parseOn(group.$on).group];
  if (onGroup?.$scale !== undefined) return onGroup.$scale;
  return config.scale ?? DEFAULT_SCALE;
}

// ─── order ────────────────────────────────────────────────────────────────────

/**
 * Kahn's algorithm over `on` edges. Among the nodes available at each step the one
 * earliest in config insertion order is emitted, so the result is deterministic.
 */
function topologicalOrder(
  groups: Record<string, ResolvedGroup>,
): ResolvedConfig["order"] {
  const nodes: ResolvedVariant[] = [];
  for (const group of Object.values(groups)) nodes.push(...Object.values(group.variants));

  const indexOf = new Map<string, number>();
  nodes.forEach((node, index) => indexOf.set(nodeId(node.group, node.name), index));

  const indegree = nodes.map(() => 0);
  const dependents = nodes.map<number[]>(() => []);
  nodes.forEach((node, index) => {
    if (node.on === null) return;
    const target = indexOf.get(nodeId(node.on.group, node.on.variant));
    if (target === undefined || target === index) return;
    indegree[index] = (indegree[index] ?? 0) + 1;
    dependents[target]?.push(index);
  });

  const order: ResolvedConfig["order"] = [];
  const available = new Set<number>();
  indegree.forEach((degree, index) => {
    if (degree === 0) available.add(index);
  });
  while (available.size > 0) {
    const next = Math.min(...available);
    available.delete(next);
    const node = nodes[next];
    if (node === undefined) break;
    order.push({ group: node.group, variant: node.name });
    for (const dependent of dependents[next] ?? []) {
      const degree = (indegree[dependent] ?? 0) - 1;
      indegree[dependent] = degree;
      if (degree === 0) available.add(dependent);
    }
  }
  return order;
}

function nodeId(group: string, variant: string): string {
  return `${group}.${variant}`;
}

// ─── overrides ────────────────────────────────────────────────────────────────

function resolveOverrides(
  overrides: Overrides,
  tokens: Tokens,
): ResolvedConfig["overrides"] {
  const resolved: ResolvedConfig["overrides"] = {};
  for (const [colorKey, groups] of Object.entries(overrides)) {
    for (const color of colorKey.split(",").map((c) => c.trim())) {
      const perColor = Object.hasOwn(resolved, color)
        ? resolved[color]!
        : (resolved[color] = {});
      for (const [groupName, variants] of Object.entries(groups)) {
        for (const [variantName, override] of Object.entries(variants)) {
          const key = nodeId(groupName, variantName);
          const kind = variantKindOf(tokens, groupName, variantName);
          perColor[key] = { ...perColor[key], ...resolveOverride(override, kind) };
        }
      }
    }
  }
  return resolved;
}

function variantKindOf(
  tokens: Tokens,
  group: string,
  variant: string,
): "lc" | "ls" | null {
  const value = tokens[group]?.[variant];
  if (typeof value !== "object" || value === null) return null;
  return variantKind(value);
}

function resolveOverride(
  override: OverrideValue,
  kind: "lc" | "ls" | null,
): ResolvedOverride {
  const resolved: ResolvedOverride = {};
  const value = overrideValue(override, kind);
  if (value !== undefined) resolved.value = value;
  if (override.$scale !== undefined) resolved.scale = override.$scale;
  if (override.$decorative !== undefined) resolved.decorative = override.$decorative;
  if (override.$invert !== undefined) resolved.invert = override.$invert;
  if (override.$chroma !== undefined) resolved.chroma = override.$chroma;
  return resolved;
}

function overrideValue(
  override: OverrideValue,
  kind: "lc" | "ls" | null,
): number | undefined {
  if (kind !== "ls" && override.lc !== undefined) return resolveLc(override.lc);
  if (kind !== "lc" && override.ls !== undefined) return resolveLs(override.ls);
  return undefined;
}
