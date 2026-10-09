import { tryParseColor } from "../color/parse.js";
import {
  isPlainObject,
  isVariantKey,
  NAME_RE,
  ON_RE,
  pickReferenceVariant,
} from "./internal.js";
import { LC_SHORTCUTS, OUTPUT_FORMATS, TOKEN_ROLES, type Config } from "./types.js";
import type { Variant } from "./types.js";

export interface Issue {
  /** Dotted location, e.g. `tokens.text.heading.$on`. */
  path: string;
  message: string;
  hint?: string;
}

export class ConfigError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[], prefix = "Invalid tint config") {
    const lines = issues.map(
      (i) =>
        `  - ${i.path ? `${i.path}: ` : ""}${i.message}${i.hint ? ` (${i.hint})` : ""}`,
    );
    super(`${prefix}:\n${lines.join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export type ValidationResult =
  { ok: true; config: Config } | { ok: false; issues: Issue[] };

export function validateConfig(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  if (!isPlainObject(input)) {
    issues.push(issue("", "Config must be a plain object"));
    return { ok: false, issues };
  }

  checkTopLevel(input, issues);
  const colors = checkColors(input.colors, issues);
  const tokens = checkTokens(input.tokens, issues);
  checkOnTargets(tokens, issues);
  checkCycles(tokens, issues);
  checkOverrides(input.overrides, colors, tokens, issues);
  checkOutput(input.output, issues);

  return issues.length === 0
    ? { ok: true, config: input as unknown as Config }
    : { ok: false, issues };
}

export function assertConfig(input: unknown): Config {
  const result = validateConfig(input);
  if (!result.ok) throw new ConfigError(result.issues);
  return result.config;
}

// ─── constants ────────────────────────────────────────────────────────────────

const CONFIG_KEYS = [
  "name",
  "mode",
  "selector",
  "prefersColorScheme",
  "prefersContrast",
  "scale",
  "offset",
  "colors",
  "tokens",
  "overrides",
  "output",
];
const GROUP_KEYS = ["$on", "$role", "$decorative", "$invert", "$scale", "$chroma"];
const LC_VARIANT_KEYS = ["lc", "$reference", "$on", "$decorative", "$invert", "$chroma"];
const LS_VARIANT_KEYS = ["ls", "$reference", "$on", "$decorative", "$scale", "$chroma"];
const OVERRIDE_KEYS = ["lc", "ls", "$scale", "$decorative", "$invert", "$chroma"];
const OUTPUT_KEYS = ["path", "formats"];
const MODES = ["light", "dark"];
const CONTRASTS = ["more", "less", "custom"];
const LC_SHORTCUT_NAMES = [...Object.keys(LC_SHORTCUTS), "pure"];

const NAME_HINT =
  'names must start with a letter and contain only letters, digits, "_" and "-"';
const SCALE_RANGE = [0.001, 0.1] as const;
const CHROMA_RANGE = [0, 2] as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

function issue(path: string, message: string, hint?: string): Issue {
  return hint === undefined ? { path, message } : { path, message, hint };
}

function join(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

function quoteList(values: readonly string[]): string {
  return values.map((v) => `"${v}"`).join(", ");
}

function checkUnknownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  base: string,
  issues: Issue[],
  what: string,
  only: (key: string) => boolean = () => true,
): void {
  for (const key of Object.keys(object)) {
    if (only(key) && !allowed.includes(key)) {
      issues.push(
        issue(
          join(base, key),
          `Unknown key "${key}"`,
          `valid ${what} are: ${allowed.join(", ")}`,
        ),
      );
    }
  }
}

function checkString(value: unknown, path: string, issues: Issue[]): value is string {
  if (typeof value === "string") return true;
  issues.push(issue(path, "Expected a string"));
  return false;
}

function checkBoolean(value: unknown, path: string, issues: Issue[]): value is boolean {
  if (typeof value === "boolean") return true;
  issues.push(issue(path, "Expected a boolean"));
  return false;
}

function checkEnum(
  value: unknown,
  values: readonly string[],
  path: string,
  issues: Issue[],
): boolean {
  if (typeof value === "string" && values.includes(value)) return true;
  issues.push(issue(path, `Expected one of ${quoteList(values)}`));
  return false;
}

function checkRange(
  value: unknown,
  [min, max]: readonly [number, number],
  path: string,
  issues: Issue[],
): boolean {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  ) {
    return true;
  }
  issues.push(issue(path, `Expected a number between ${min} and ${max}`));
  return false;
}

function checkName(name: string, path: string, issues: Issue[]): boolean {
  if (NAME_RE.test(name)) return true;
  issues.push(issue(path, `Invalid name "${name}"`, NAME_HINT));
  return false;
}

function checkLc(value: unknown, path: string, issues: Issue[]): boolean {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 108) {
    return true;
  }
  if (typeof value === "string" && LC_SHORTCUT_NAMES.includes(value)) return true;
  issues.push(
    issue(
      path,
      "Expected a number between 0 and 108 or a shortcut",
      `shortcuts are: ${LC_SHORTCUT_NAMES.join(", ")}`,
    ),
  );
  return false;
}

function checkLs(value: unknown, path: string, issues: Issue[]): boolean {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return true;
  if (value === "pure") return true;
  issues.push(issue(path, 'Expected a number >= 0 or "pure"'));
  return false;
}

function checkOnFormat(value: unknown, path: string, issues: Issue[]): value is string {
  if (typeof value === "string" && ON_RE.test(value)) return true;
  issues.push(issue(path, 'Expected "group" or "group.variant"'));
  return false;
}

// ─── top level ────────────────────────────────────────────────────────────────

function checkTopLevel(config: Record<string, unknown>, issues: Issue[]): void {
  checkUnknownKeys(config, CONFIG_KEYS, "", issues, "config keys");

  if (typeof config.name !== "string" || config.name.length === 0) {
    issues.push(issue("name", "Expected a non-empty string"));
  }
  checkEnum(config.mode, MODES, "mode", issues);
  if (config.selector !== undefined) checkString(config.selector, "selector", issues);
  if (config.prefersColorScheme !== undefined) {
    checkEnum(config.prefersColorScheme, MODES, "prefersColorScheme", issues);
  }
  if (config.prefersContrast !== undefined) {
    checkEnum(config.prefersContrast, CONTRASTS, "prefersContrast", issues);
  }
  if (config.scale !== undefined) checkRange(config.scale, SCALE_RANGE, "scale", issues);
  if (config.offset !== undefined) checkRange(config.offset, [0, 0.5], "offset", issues);
}

// ─── colors ───────────────────────────────────────────────────────────────────

/** Returns the set of declared color names (valid or not) for override checks. */
function checkColors(colors: unknown, issues: Issue[]): Set<string> {
  const names = new Set<string>();
  if (!isPlainObject(colors) || Object.keys(colors).length === 0) {
    issues.push(issue("colors", "Expected an object with at least one color"));
    return names;
  }
  for (const [name, value] of Object.entries(colors)) {
    const path = join("colors", name);
    names.add(name);
    checkName(name, path, issues);
    const input = colorInput(value, path, issues);
    if (input !== null && tryParseColor(input) === null) {
      issues.push(
        issue(
          path,
          `Invalid color "${input}"`,
          "use hex (#rgb, #rrggbb), rgb(), hsl() or oklch()",
        ),
      );
    }
  }
  return names;
}

function colorInput(value: unknown, path: string, issues: Issue[]): string | null {
  if (typeof value === "string") return value;
  if (isPlainObject(value)) {
    checkUnknownKeys(value, ["value"], path, issues, "color keys");
    return checkString(value.value, join(path, "value"), issues) ? value.value : null;
  }
  issues.push(issue(path, "Expected a color string or { value: string }"));
  return null;
}

// ─── tokens ───────────────────────────────────────────────────────────────────

interface VariantShape {
  kind: "lc" | "ls";
  /** Effective `$on` (variant-level, else group-level). */
  on: string | undefined;
  /** Where the effective `$on` was declared. */
  onPath: string;
}

interface GroupShape {
  /** Group-level `$on` when it is a well-formed string. */
  on: string | undefined;
  /** Every non-`$` key, including structurally invalid variants. */
  variantNames: string[];
  /** Structurally valid variants only. */
  variants: Map<string, VariantShape>;
  /** Reference variant among the valid ones, or null if there are none. */
  reference: string | null;
}

/** group name -> shape (null when the group itself is not an object). */
type TokenShapes = Map<string, GroupShape | null>;

function checkTokens(tokens: unknown, issues: Issue[]): TokenShapes {
  const shapes: TokenShapes = new Map();
  if (!isPlainObject(tokens) || Object.keys(tokens).length === 0) {
    issues.push(issue("tokens", "Expected an object with at least one token group"));
    return shapes;
  }
  for (const [name, group] of Object.entries(tokens)) {
    const path = join("tokens", name);
    checkName(name, path, issues);
    shapes.set(name, checkGroup(group, path, issues));
  }
  return shapes;
}

function checkGroup(group: unknown, path: string, issues: Issue[]): GroupShape | null {
  if (!isPlainObject(group)) {
    issues.push(issue(path, "Expected a token group object"));
    return null;
  }
  checkGroupKeys(group, path, issues);

  const variantNames = Object.keys(group).filter(isVariantKey);
  if (variantNames.length === 0) {
    issues.push(issue(path, "Token group must have at least one variant"));
  }

  const groupOn = typeof group.$on === "string" ? group.$on : undefined;
  const valid: Array<[string, Variant]> = [];
  const variants = new Map<string, VariantShape>();
  const references: string[] = [];

  for (const name of variantNames) {
    const variantPath = join(path, name);
    checkName(name, variantPath, issues);
    const variant = checkVariant(group[name], variantPath, groupOn, issues);
    if (variant === null) continue;
    valid.push([name, variant.value]);
    variants.set(name, variant.shape);
    if (variant.value.$reference === true) references.push(name);
  }

  if (references.length > 1) {
    issues.push(
      issue(
        path,
        `Only one variant per group may have $reference: true (found ${quoteList(references)})`,
      ),
    );
  }
  if (group.$invert === true && groupOn === undefined && !someVariantHasOn(group)) {
    issues.push(
      issue(
        join(path, "$invert"),
        "$invert requires $on",
        "set $on on the group or on one of its variants",
      ),
    );
  }

  return {
    on: groupOn !== undefined && ON_RE.test(groupOn) ? groupOn : undefined,
    variantNames,
    variants,
    reference: valid.length > 0 ? pickReferenceVariant(valid) : null,
  };
}

function checkGroupKeys(group: Record<string, unknown>, path: string, issues: Issue[]) {
  for (const key of Object.keys(group)) {
    if (isVariantKey(key) || GROUP_KEYS.includes(key)) continue;
    const hint =
      key === "$reference"
        ? "$reference marks a variant, not a group — mark the variant instead"
        : `valid group keys are: ${GROUP_KEYS.join(", ")}`;
    issues.push(issue(join(path, key), `Unknown key "${key}"`, hint));
  }
  if (group.$on !== undefined) checkOnFormat(group.$on, join(path, "$on"), issues);
  if (group.$role !== undefined)
    checkEnum(group.$role, TOKEN_ROLES, join(path, "$role"), issues);
  if (group.$decorative !== undefined) {
    checkBoolean(group.$decorative, join(path, "$decorative"), issues);
  }
  if (group.$invert !== undefined)
    checkBoolean(group.$invert, join(path, "$invert"), issues);
  if (group.$scale !== undefined) {
    checkRange(group.$scale, SCALE_RANGE, join(path, "$scale"), issues);
  }
  if (group.$chroma !== undefined) {
    checkRange(group.$chroma, CHROMA_RANGE, join(path, "$chroma"), issues);
  }
}

function someVariantHasOn(group: Record<string, unknown>): boolean {
  return Object.entries(group).some(
    ([key, value]) =>
      isVariantKey(key) && isPlainObject(value) && value.$on !== undefined,
  );
}

function checkVariant(
  variant: unknown,
  path: string,
  groupOn: string | undefined,
  issues: Issue[],
): { value: Variant; shape: VariantShape } | null {
  if (!isPlainObject(variant)) {
    issues.push(issue(path, "Expected a variant object"));
    return null;
  }
  const hasLc = "lc" in variant;
  const hasLs = "ls" in variant;
  if (hasLc && hasLs) {
    issues.push(issue(path, 'Variant cannot have both "lc" and "ls"'));
    return null;
  }
  if (!hasLc && !hasLs) {
    issues.push(issue(path, 'Variant must have "lc" or "ls"'));
    return null;
  }

  const kind = hasLc ? "lc" : "ls";
  const before = issues.length;
  checkVariantKeys(variant, kind, path, issues);
  if (issues.length !== before) return null;

  const on = typeof variant.$on === "string" ? variant.$on : groupOn;
  if (variant.$invert === true && on === undefined) {
    issues.push(
      issue(
        join(path, "$invert"),
        "$invert requires $on",
        "set $on on the variant or on its group",
      ),
    );
  }
  return {
    value: variant as unknown as Variant,
    shape: {
      kind,
      on,
      onPath: variant.$on !== undefined ? join(path, "$on") : groupOnPath(path),
    },
  };
}

/** `tokens.group.variant` -> `tokens.group.$on`. */
function groupOnPath(variantPath: string): string {
  return `${variantPath.slice(0, variantPath.lastIndexOf("."))}.$on`;
}

function checkVariantKeys(
  variant: Record<string, unknown>,
  kind: "lc" | "ls",
  path: string,
  issues: Issue[],
): void {
  const allowed = kind === "lc" ? LC_VARIANT_KEYS : LS_VARIANT_KEYS;
  checkUnknownKeys(variant, allowed, path, issues, `${kind} variant keys`);

  if (kind === "lc") checkLc(variant.lc, join(path, "lc"), issues);
  else checkLs(variant.ls, join(path, "ls"), issues);

  if (variant.$reference !== undefined) {
    checkBoolean(variant.$reference, join(path, "$reference"), issues);
  }
  if (variant.$on !== undefined) checkOnFormat(variant.$on, join(path, "$on"), issues);
  if (variant.$decorative !== undefined) {
    checkBoolean(variant.$decorative, join(path, "$decorative"), issues);
  }
  if (variant.$invert !== undefined && kind === "lc") {
    checkBoolean(variant.$invert, join(path, "$invert"), issues);
  }
  if (variant.$scale !== undefined && kind === "ls") {
    checkRange(variant.$scale, SCALE_RANGE, join(path, "$scale"), issues);
  }
  if (variant.$chroma !== undefined) {
    checkRange(variant.$chroma, CHROMA_RANGE, join(path, "$chroma"), issues);
  }
}

// ─── $on graph ────────────────────────────────────────────────────────────────

function splitOn(on: string): { group: string; variant: string | undefined } {
  const [group = "", variant] = on.split(".");
  return { group, variant };
}

/**
 * Resolve an `$on` string to a node id (`group.variant`) or null when the target is
 * unknown or structurally invalid. Reports unknown targets at `path` when given.
 */
function resolveTarget(
  on: string,
  shapes: TokenShapes,
  path: string | null,
  issues: Issue[],
): string | null {
  const { group, variant } = splitOn(on);
  if (!shapes.has(group)) {
    if (path) issues.push(issue(path, `Unknown group "${group}"`));
    return null;
  }
  const shape = shapes.get(group) ?? null;
  if (shape === null) return null;
  if (variant === undefined) {
    return shape.reference === null ? null : `${group}.${shape.reference}`;
  }
  if (!shape.variantNames.includes(variant)) {
    if (path)
      issues.push(issue(path, `Unknown variant "${variant}" in group "${group}"`));
    return null;
  }
  return shape.variants.has(variant) ? `${group}.${variant}` : null;
}

/** Existence of `$on` targets (once per declaration) and self-references (per variant). */
function checkOnTargets(shapes: TokenShapes, issues: Issue[]): void {
  for (const [groupName, shape] of shapes) {
    if (shape === null) continue;
    if (shape.on !== undefined) {
      resolveTarget(shape.on, shapes, `tokens.${groupName}.$on`, issues);
    }
    for (const [variantName, variant] of shape.variants) {
      if (variant.on === undefined) continue;
      const node = `${groupName}.${variantName}`;
      const declaredHere = variant.onPath === `tokens.${node}.$on`;
      const target = resolveTarget(
        variant.on,
        shapes,
        declaredHere ? variant.onPath : null,
        issues,
      );
      if (target === node) {
        issues.push(
          issue(variant.onPath, `$on may not point to the variant itself (${node})`),
        );
      }
    }
  }
}

/** DFS over effective `$on` edges; each cycle is reported once. */
function checkCycles(shapes: TokenShapes, issues: Issue[]): void {
  const edges = new Map<string, string>();
  const onPaths = new Map<string, string>();
  for (const [groupName, shape] of shapes) {
    if (shape === null) continue;
    for (const [variantName, variant] of shape.variants) {
      const node = `${groupName}.${variantName}`;
      if (variant.on === undefined) continue;
      const target = resolveTarget(variant.on, shapes, null, issues);
      if (target === null || target === node) continue;
      edges.set(node, target);
      onPaths.set(node, variant.onPath);
    }
  }

  const done = new Set<string>();
  for (const start of edges.keys()) {
    if (done.has(start)) continue;
    const path: string[] = [];
    let node: string | undefined = start;
    while (node !== undefined && !done.has(node)) {
      const index = path.indexOf(node);
      if (index !== -1) {
        const cycle = [...path.slice(index), node];
        issues.push(
          issue(
            onPaths.get(node) ?? "tokens",
            `Circular $on reference: ${cycle.join(" -> ")}`,
            "remove one of the $on links in the cycle",
          ),
        );
        break;
      }
      path.push(node);
      node = edges.get(node);
    }
    for (const visited of path) done.add(visited);
  }
}

// ─── overrides ────────────────────────────────────────────────────────────────

function checkOverrides(
  overrides: unknown,
  colors: Set<string>,
  shapes: TokenShapes,
  issues: Issue[],
): void {
  if (overrides === undefined) return;
  if (!isPlainObject(overrides)) {
    issues.push(issue("overrides", "Expected an object keyed by color name"));
    return;
  }
  for (const [colorKey, groups] of Object.entries(overrides)) {
    const path = join("overrides", colorKey);
    for (const color of colorKey.split(",").map((c) => c.trim())) {
      if (!colors.has(color)) issues.push(issue(path, `Unknown color "${color}"`));
    }
    if (!isPlainObject(groups)) {
      issues.push(issue(path, "Expected an object keyed by group name"));
      continue;
    }
    for (const [groupName, variants] of Object.entries(groups)) {
      checkOverrideGroup(groupName, variants, join(path, groupName), shapes, issues);
    }
  }
}

function checkOverrideGroup(
  groupName: string,
  variants: unknown,
  path: string,
  shapes: TokenShapes,
  issues: Issue[],
): void {
  if (!shapes.has(groupName)) {
    issues.push(issue(path, `Unknown group "${groupName}"`));
    return;
  }
  if (!isPlainObject(variants)) {
    issues.push(issue(path, "Expected an object keyed by variant name"));
    return;
  }
  const shape = shapes.get(groupName) ?? null;
  for (const [variantName, override] of Object.entries(variants)) {
    const variantPath = join(path, variantName);
    if (shape !== null && !shape.variantNames.includes(variantName)) {
      issues.push(
        issue(variantPath, `Unknown variant "${variantName}" in group "${groupName}"`),
      );
      continue;
    }
    checkOverrideValue(override, variantPath, shape?.variants.get(variantName), issues);
  }
}

function checkOverrideValue(
  override: unknown,
  path: string,
  target: VariantShape | undefined,
  issues: Issue[],
): void {
  if (!isPlainObject(override)) {
    issues.push(issue(path, "Expected an override object"));
    return;
  }
  checkUnknownKeys(override, OVERRIDE_KEYS, path, issues, "override keys");
  if (Object.keys(override).length === 0) {
    issues.push(
      issue(path, `Override must set at least one of ${OVERRIDE_KEYS.join(", ")}`),
    );
  }

  if (override.lc !== undefined) {
    if (target?.kind === "ls") {
      issues.push(
        issue(join(path, "lc"), 'Cannot override "lc" on an ls variant', 'use "ls"'),
      );
    } else {
      checkLc(override.lc, join(path, "lc"), issues);
    }
  }
  if (override.ls !== undefined) {
    if (target?.kind === "lc") {
      issues.push(
        issue(join(path, "ls"), 'Cannot override "ls" on an lc variant', 'use "lc"'),
      );
    } else {
      checkLs(override.ls, join(path, "ls"), issues);
    }
  }
  if (override.$scale !== undefined) {
    checkRange(override.$scale, SCALE_RANGE, join(path, "$scale"), issues);
  }
  if (override.$decorative !== undefined) {
    checkBoolean(override.$decorative, join(path, "$decorative"), issues);
  }
  if (override.$invert !== undefined) {
    if (checkBoolean(override.$invert, join(path, "$invert"), issues)) {
      if (override.$invert && target !== undefined && target.on === undefined) {
        issues.push(
          issue(
            join(path, "$invert"),
            "$invert requires the variant to have an effective $on",
            "set $on on the variant or its group",
          ),
        );
      }
    }
  }
  if (override.$chroma !== undefined) {
    checkRange(override.$chroma, CHROMA_RANGE, join(path, "$chroma"), issues);
  }
}

// ─── output ───────────────────────────────────────────────────────────────────

function checkOutput(output: unknown, issues: Issue[]): void {
  if (output === undefined) return;
  if (!isPlainObject(output)) {
    issues.push(issue("output", "Expected an object"));
    return;
  }
  checkUnknownKeys(output, OUTPUT_KEYS, "output", issues, "output keys");
  if (output.path !== undefined) checkString(output.path, "output.path", issues);
  if (output.formats === undefined) return;
  if (!Array.isArray(output.formats)) {
    issues.push(issue("output.formats", "Expected an array of output formats"));
    return;
  }
  output.formats.forEach((format: unknown, index) => {
    checkEnum(format, OUTPUT_FORMATS, `output.formats.${index}`, issues);
  });
}
