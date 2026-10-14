/**
 * Palette, theme, and tune expansion (docs/v4-spec.md §2.2, §2.3, §6.1, §6.5).
 *
 * One template becomes one graph per theme × palette color. Theme `extends`
 * is applied root-first. A theme palette delta then overrides the base `tune`.
 * Inside one tune map, `group.*` lands before `group` and `group.token`, so
 * the specific path wins. This step does not solve colors.
 */

import type { ConfigFix, ConfigIssue } from "./errors.js";
import {
  buildTokenGraph,
  type AuthoredToken,
  type GraphDiagnostic,
  type ResolvedToken,
  type TokenGraph,
} from "./graph.js";
import { isPlainObject, joinPath, suggestName, type NormalizeIssue } from "./levels.js";
import { normalizeToken, type NormalizedToken } from "./normalize.js";
import { MODE_PAGE_LIGHTNESS, POLARITY_SPLIT } from "./ladders.js";
import type { ContrastAlgorithm, ContrastLevel, LevelNames, Mode } from "./types.js";

const TUNE_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.(?:\*|[a-zA-Z][a-zA-Z0-9_-]*))?$/;

const ALGORITHMS = ["apca", "wcag2"] as const satisfies readonly ContrastAlgorithm[];
const LEVELS = ["standard", "more", "max"] as const satisfies readonly ContrastLevel[];
const MODES = ["light", "dark"] as const satisfies readonly Mode[];

/** A palette color after the top-level palette is read. Theme deltas come later. */
export interface ResolvedPaletteColor {
  readonly name: string;
  readonly color: string;
  readonly isDefault: boolean;
}

/** One theme after `extends` is flattened. */
export interface ResolvedTheme {
  readonly name: string;
  /** Effective mode. Drives step size and `prefers-color-scheme`. */
  readonly mode: Mode;
  /** Page lightness, 0..100. `mode` alone maps to 98 (light) or 18 (dark). */
  readonly lightness: number;
  readonly selector: string;
  /** Present when the theme or an ancestor set `media`. */
  readonly media?: boolean | string;
  /** Theme override, else the inherited theme, else the global level. */
  readonly contrastLevel: ContrastLevel;
  /** The parent named in `extends`, when that parent exists. */
  readonly extends?: string;
  /**
   * Set when this theme declares both `mode` and `lightness` and they disagree.
   * Lightness wins; the engine warns.
   */
  readonly authoredMode?: Mode;
}

/** One theme × palette color, ready for the solver. */
export interface ResolvedExpansion {
  readonly theme: string;
  readonly palette: string;
  /** CSS color after theme palette deltas. */
  readonly color: string;
  readonly isDefault: boolean;
  readonly exact?: boolean | string;
  readonly contrastLevel: ContrastLevel;
  /** Authored tokens in config order. Output order (§6.3). */
  readonly tokens: readonly ResolvedToken[];
  /** Rests the engine generated for state tokens that had none (§4). */
  readonly generated: readonly ResolvedToken[];
  /** Solve order. Ties follow config order. */
  readonly order: readonly string[];
  /** Base surface id, or {@link PAGE}. */
  readonly baseSurface: string;
  readonly diagnostics: readonly GraphDiagnostic[];
}

export interface ResolvedConfig {
  readonly algorithm: ContrastAlgorithm;
  readonly contrastLevel: ContrastLevel;
  readonly themes: readonly ResolvedTheme[];
  readonly palette: readonly ResolvedPaletteColor[];
  /** Theme order, and within a theme the palette's config order. */
  readonly expansions: readonly ResolvedExpansion[];
}

export interface ResolveResult {
  readonly ok: boolean;
  readonly issues: readonly ConfigIssue[];
  readonly config: ResolvedConfig;
}

interface PaletteEntry {
  name: string;
  color: string;
  isDefault: boolean;
  exact?: boolean | string;
  tune?: Record<string, unknown>;
}

interface RawTheme {
  name: string;
  mode?: Mode;
  lightness?: number;
  selector?: string;
  media?: boolean | string;
  contrastLevel?: ContrastLevel;
  extends?: string;
  palette: Record<string, unknown>;
}

interface OverrideLayer {
  path: string;
  names: readonly string[];
  tune: Record<string, unknown>;
}

interface Slot {
  group: string;
  name: string;
  onPath: string;
  value?: NormalizedToken;
}

interface TuneLayer {
  path: string;
  tune: Record<string, unknown>;
}

/**
 * Expand a v4 config into one backdrop graph per theme and palette color.
 * Does not throw. `ok` is false when `issues` is non-empty.
 */
export function resolveConfig(input: unknown): ResolveResult {
  const issues: ConfigIssue[] = [];
  const seen = new Set<string>();
  const push = (item: ConfigIssue): void => {
    const key = `${item.path}\0${item.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(item);
  };

  if (!isPlainObject(input)) {
    push(
      issue({
        path: "",
        message: "Expected a config object.",
        expected: "a plain object",
        hint: "The v4 config is one object with palette and tokens.",
      }),
    );
    return { ok: false, issues, config: emptyConfig(defaultContrast()) };
  }

  const contrast = readContrast(input.contrast, push);
  const levels = isPlainObject(input.levels) ? (input.levels as LevelNames) : undefined;
  const palette = readPalette(input.palette, push);
  const themes = readThemes(input.themes, palette, contrast.level, push);
  const template = readTemplate(input.tokens, levels, push);
  const overrides = readOverrides(
    input.overrides,
    palette.map((color) => color.name),
    push,
  );

  const expansions: ResolvedExpansion[] = [];
  for (const theme of themes.resolved) {
    const chain = ancestorChain(theme.name, themes.raw, themes.cyclic);
    for (const color of palette) {
      const slots = cloneSlots(template);
      for (const layer of tuneLayers(color, chain)) {
        applyTune(slots, layer, levels, push);
      }
      for (const layer of overrides) {
        if (!layer.names.includes(color.name)) continue;
        applyTune(slots, { path: layer.path, tune: layer.tune }, levels, push);
      }
      const authored: AuthoredToken[] = [];
      for (const slot of slots) {
        if (slot.value === undefined) continue;
        authored.push({
          group: slot.group,
          name: slot.name,
          value: slot.value,
          onPath: slot.onPath,
        });
      }
      const graph = buildTokenGraph(authored);
      for (const found of graph.issues) push(found);
      expansions.push(expansionOf(theme, color, chain, graph));
    }
  }

  const config: ResolvedConfig = {
    algorithm: contrast.algorithm,
    contrastLevel: contrast.level,
    themes: themes.resolved,
    palette: palette.map(publishPalette),
    expansions,
  };
  return { ok: issues.length === 0, issues, config };
}

function expansionOf(
  theme: ResolvedTheme,
  color: PaletteEntry,
  chain: readonly RawTheme[],
  graph: TokenGraph,
): ResolvedExpansion {
  const resolved: ResolvedExpansion = {
    theme: theme.name,
    palette: color.name,
    color: resolvedColor(color, chain),
    isDefault: color.isDefault,
    contrastLevel: theme.contrastLevel,
    tokens: graph.tokens,
    generated: graph.generated,
    order: graph.order,
    baseSurface: graph.baseSurface,
    diagnostics: graph.diagnostics,
  };
  const exact = resolvedExact(color, chain);
  if (exact !== undefined) return { ...resolved, exact };
  return resolved;
}

function defaultContrast(): { algorithm: ContrastAlgorithm; level: ContrastLevel } {
  return { algorithm: "apca", level: "standard" };
}

function emptyConfig(contrast: {
  algorithm: ContrastAlgorithm;
  level: ContrastLevel;
}): ResolvedConfig {
  return {
    algorithm: contrast.algorithm,
    contrastLevel: contrast.level,
    themes: [],
    palette: [],
    expansions: [],
  };
}

function readContrast(
  value: unknown,
  push: (issue: ConfigIssue) => void,
): { algorithm: ContrastAlgorithm; level: ContrastLevel } {
  const contrast = defaultContrast();
  if (value === undefined) return contrast;
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "contrast",
        message: "Expected contrast options.",
        expected: '{ algorithm?: "apca" | "wcag2", level?: "standard" | "more" | "max" }',
        hint: 'algorithm defaults to "apca". level defaults to "standard".',
      }),
    );
    return contrast;
  }
  if (present(value, "algorithm")) {
    if (isAlgorithm(value.algorithm)) contrast.algorithm = value.algorithm;
    else {
      push(
        enumIssue(
          joinPath("contrast", "algorithm"),
          value.algorithm,
          ALGORITHMS,
          "Contrast algorithm",
        ),
      );
    }
  }
  if (present(value, "level")) {
    if (isLevel(value.level)) contrast.level = value.level;
    else {
      push(enumIssue("contrast.level", value.level, LEVELS, "Contrast level"));
    }
  }
  return contrast;
}

function readPalette(value: unknown, push: (issue: ConfigIssue) => void): PaletteEntry[] {
  if (value === undefined) {
    push(
      issue({
        path: "palette",
        message: "Missing palette.",
        expected: "one or more palette colors",
        hint: "palette maps a name to a CSS color, or to { color }.",
      }),
    );
    return [];
  }
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "palette",
        message: "Expected a palette.",
        expected: "an object of palette colors",
        hint: "Each entry is a CSS color string or { color }.",
      }),
    );
    return [];
  }
  const names = Object.keys(value);
  if (names.length === 0) {
    push(
      issue({
        path: "palette",
        message: "palette must contain at least one color.",
        expected: "one or more palette colors",
        hint: "The first color is the default palette unless one sets default: true.",
      }),
    );
    return [];
  }

  const entries: PaletteEntry[] = [];
  for (const name of names) {
    const path = joinPath("palette", name);
    const raw = value[name];
    if (typeof raw === "string") {
      entries.push({ name, color: raw, isDefault: false });
      continue;
    }
    if (!isPlainObject(raw) || typeof raw.color !== "string") {
      push(
        issue({
          path,
          message: "Expected a CSS color or a palette color object.",
          expected: "a string or { color }",
          hint: "Strings are shorthand for { color }.",
        }),
      );
      continue;
    }
    const entry: PaletteEntry = {
      name,
      color: raw.color,
      isDefault: raw.default === true,
    };
    if (typeof raw.exact === "boolean" || typeof raw.exact === "string") {
      entry.exact = raw.exact;
    }
    if (isPlainObject(raw.tune)) entry.tune = raw.tune;
    entries.push(entry);
  }

  const flagged = entries.find((entry) => entry.isDefault);
  if (flagged === undefined && entries[0] !== undefined) entries[0].isDefault = true;
  return entries;
}

function publishPalette(entry: PaletteEntry): ResolvedPaletteColor {
  return { name: entry.name, color: entry.color, isDefault: entry.isDefault };
}

interface ThemeRead {
  raw: ReadonlyMap<string, RawTheme>;
  resolved: ResolvedTheme[];
  cyclic: ReadonlySet<string>;
}

function readThemes(
  value: unknown,
  palette: readonly PaletteEntry[],
  globalLevel: ContrastLevel,
  push: (issue: ConfigIssue) => void,
): ThemeRead {
  if (value === undefined) {
    const light = defaultTheme(globalLevel);
    return {
      raw: new Map([[light.name, light]]),
      resolved: [publishTheme(light, globalLevel)],
      cyclic: new Set(),
    };
  }
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "themes",
        message: "Expected a themes map.",
        expected: "an object of theme names",
        hint: 'The default when themes is omitted is { light: { mode: "light" } }.',
      }),
    );
    return { raw: new Map(), resolved: [], cyclic: new Set() };
  }
  const names = Object.keys(value);
  if (names.length === 0) {
    push(
      issue({
        path: "themes",
        message: "themes must contain at least one theme.",
        expected: "one or more themes",
        hint: "Omit themes to use the default light theme.",
      }),
    );
    return { raw: new Map(), resolved: [], cyclic: new Set() };
  }

  const raw = new Map<string, RawTheme>();
  for (const name of names) {
    const path = joinPath("themes", name);
    const theme = value[name];
    if (!isPlainObject(theme)) {
      push(
        issue({
          path,
          message: "Expected theme options.",
          expected: '{ mode: "light" | "dark" }',
          hint: "mode is required unless extends names a theme that has one.",
        }),
      );
      continue;
    }
    raw.set(name, readTheme(name, theme, path, names, palette, push));
  }

  const cycles = extendsCycles(raw, push);
  const resolved: ResolvedTheme[] = [];
  for (const name of names) {
    const theme = raw.get(name);
    if (theme === undefined) continue;
    const chain = ancestorChain(name, raw, cycles);
    const merged = mergeTheme(name, chain, globalLevel);
    if (merged.mode === undefined && merged.lightness === undefined) {
      push(
        issue({
          path: joinPath(joinPath("themes", name), "lightness"),
          message: `Theme "${name}" is missing lightness.`,
          expected: "lightness 0..100, or mode light/dark",
          hint: 'Set lightness, mode ("light" is 98, "dark" is 18), or extends a theme that has one.',
        }),
      );
      continue;
    }
    resolved.push(publishTheme(merged, globalLevel));
  }
  return { raw, resolved, cyclic: cycles };
}

function defaultTheme(globalLevel: ContrastLevel): RawTheme {
  return { name: "light", mode: "light", contrastLevel: globalLevel, palette: {} };
}

function readTheme(
  name: string,
  theme: Record<string, unknown>,
  path: string,
  names: readonly string[],
  palette: readonly PaletteEntry[],
  push: (issue: ConfigIssue) => void,
): RawTheme {
  const raw: RawTheme = { name, palette: {} };

  if (present(theme, "extends")) {
    if (typeof theme.extends !== "string" || theme.extends === "") {
      push(
        issue({
          path: joinPath(path, "extends"),
          message: "Expected a theme name.",
          expected: "the name of another theme",
          hint: "extends inherits that theme's options.",
        }),
      );
    } else if (theme.extends === name) {
      push(
        issue({
          path: joinPath(path, "extends"),
          message: `Theme "${name}" cannot extend itself.`,
          expected: "a different theme",
          hint: "extends inherits another theme's options.",
        }),
      );
    } else if (!names.includes(theme.extends)) {
      const suggestion = suggestName(theme.extends, names);
      push(
        issue({
          path: joinPath(path, "extends"),
          message: `Unknown theme "${theme.extends}".`,
          expected: names.join(", ") || "a theme name",
          ...(suggestion === undefined
            ? { hint: "extends must name a theme in this config." }
            : {
                didYouMean: suggestion,
                hint: `Did you mean "${suggestion}"?`,
                fix: { path: joinPath(path, "extends"), replace: suggestion },
              }),
        }),
      );
    } else {
      raw.extends = theme.extends;
    }
  }

  if (present(theme, "mode")) {
    if (isMode(theme.mode)) raw.mode = theme.mode;
    else push(enumIssue(joinPath(path, "mode"), theme.mode, MODES, "Theme mode"));
  }
  if (present(theme, "lightness")) {
    const lightness = theme.lightness;
    if (
      typeof lightness === "number" &&
      Number.isFinite(lightness) &&
      lightness >= 0 &&
      lightness <= 100
    ) {
      raw.lightness = lightness;
    } else {
      push(
        issue({
          path: joinPath(path, "lightness"),
          message: "Expected page lightness from 0 to 100.",
          expected: "a number from 0 to 100",
          hint: 'mode: "light" is 98. mode: "dark" is 18.',
        }),
      );
    }
  }
  if (present(theme, "selector") && typeof theme.selector === "string") {
    raw.selector = theme.selector;
  }
  if (present(theme, "media")) {
    if (typeof theme.media === "boolean" || typeof theme.media === "string") {
      raw.media = theme.media;
    }
  }
  if (present(theme, "contrast") && isPlainObject(theme.contrast)) {
    if (present(theme.contrast, "level") && isLevel(theme.contrast.level)) {
      raw.contrastLevel = theme.contrast.level;
    }
  }
  if (present(theme, "palette") && isPlainObject(theme.palette)) {
    const known = palette.map((entry) => entry.name);
    const deltas: Record<string, unknown> = {};
    for (const [color, delta] of Object.entries(theme.palette)) {
      if (known.length > 0 && !known.includes(color)) {
        const suggestion = suggestName(color, known);
        push(
          issue({
            path: joinPath(joinPath(path, "palette"), color),
            message: `Theme palette "${color}" is not in palette.`,
            expected: known.join(", ") || "a palette color",
            ...(suggestion === undefined
              ? {
                  hint: "Theme palette entries override colors from the top-level palette.",
                }
              : { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }),
          }),
        );
        continue;
      }
      deltas[color] = delta;
    }
    raw.palette = deltas;
  }
  return raw;
}

function extendsCycles(
  themes: ReadonlyMap<string, RawTheme>,
  push: (issue: ConfigIssue) => void,
): Set<string> {
  const edges = new Map<string, string>();
  for (const theme of themes.values()) {
    if (theme.extends !== undefined) edges.set(theme.name, theme.extends);
  }
  const cyclic = new Set<string>();
  const color = new Map<string, "visiting" | "done">();
  const visit = (name: string, stack: string[]): void => {
    const mark = color.get(name);
    if (mark === "done") return;
    if (mark === "visiting") {
      const start = stack.indexOf(name);
      if (start === -1) return;
      const cycle = [...stack.slice(start), name];
      for (const member of cycle.slice(0, -1)) cyclic.add(member);
      push(
        issue({
          path: joinPath(joinPath("themes", name), "extends"),
          message: `Theme extends cycle: ${cycle.join(" → ")}.`,
          expected: "extends edges that do not form a cycle",
          hint: "Each theme can inherit from one earlier theme.",
        }),
      );
      return;
    }
    color.set(name, "visiting");
    const next = edges.get(name);
    if (next !== undefined) visit(next, [...stack, name]);
    color.set(name, "done");
  };
  for (const name of edges.keys()) {
    if (!color.has(name)) visit(name, []);
  }
  return cyclic;
}

/** Root first. Cyclic themes contribute only their own fields. */
function ancestorChain(
  name: string,
  themes: ReadonlyMap<string, RawTheme>,
  cyclic: ReadonlySet<string>,
): RawTheme[] {
  const chain: RawTheme[] = [];
  const guard = new Set<string>();
  let current = themes.get(name);
  while (current !== undefined) {
    chain.push(current);
    if (guard.has(current.name) || cyclic.has(current.name)) break;
    guard.add(current.name);
    if (current.extends === undefined) break;
    current = themes.get(current.extends);
  }
  return chain.reverse();
}

interface MergedTheme {
  name: string;
  mode?: Mode;
  lightness?: number;
  selector: string;
  media?: boolean | string;
  contrastLevel: ContrastLevel;
  extends?: string;
  /** Leaf declared both, and the inferred polarity disagrees with mode. */
  authoredMode?: Mode;
}

function mergeTheme(
  name: string,
  chain: readonly RawTheme[],
  globalLevel: ContrastLevel,
): MergedTheme {
  const merged: MergedTheme = { name, selector: ":root", contrastLevel: globalLevel };
  for (const theme of chain) {
    if (theme.mode !== undefined) merged.mode = theme.mode;
    if (theme.lightness !== undefined) merged.lightness = theme.lightness;
    if (theme.selector !== undefined) merged.selector = theme.selector;
    if (theme.media !== undefined) merged.media = theme.media;
    if (theme.contrastLevel !== undefined) merged.contrastLevel = theme.contrastLevel;
  }
  const leaf = chain[chain.length - 1];
  if (leaf?.extends !== undefined) merged.extends = leaf.extends;
  if (
    leaf?.mode !== undefined &&
    leaf.lightness !== undefined &&
    modeFromLightness(leaf.lightness) !== leaf.mode
  ) {
    merged.authoredMode = leaf.mode;
  }
  return merged;
}

function modeFromLightness(lightness: number): Mode {
  return lightness >= POLARITY_SPLIT ? "light" : "dark";
}

function publishTheme(
  theme: MergedTheme | RawTheme,
  globalLevel: ContrastLevel,
): ResolvedTheme {
  const lightness =
    theme.lightness ??
    (theme.mode === "dark" ? MODE_PAGE_LIGHTNESS.dark : MODE_PAGE_LIGHTNESS.light);
  const mode =
    theme.lightness !== undefined
      ? modeFromLightness(theme.lightness)
      : (theme.mode ?? "light");
  const selector =
    "selector" in theme && theme.selector !== undefined ? theme.selector : ":root";
  const contrastLevel =
    "contrastLevel" in theme && theme.contrastLevel !== undefined
      ? theme.contrastLevel
      : globalLevel;
  const resolved: ResolvedTheme = {
    name: theme.name,
    mode,
    lightness,
    selector,
    contrastLevel,
  };
  const withConflict =
    "authoredMode" in theme && theme.authoredMode !== undefined
      ? { ...resolved, authoredMode: theme.authoredMode }
      : resolved;
  if (theme.media !== undefined) {
    const withMedia: ResolvedTheme = { ...withConflict, media: theme.media };
    if (theme.extends !== undefined) return { ...withMedia, extends: theme.extends };
    return withMedia;
  }
  if (theme.extends !== undefined) return { ...withConflict, extends: theme.extends };
  return withConflict;
}

const PALETTE_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function readOverrides(
  value: unknown,
  palette: readonly string[],
  push: (issue: ConfigIssue) => void,
): OverrideLayer[] {
  if (value === undefined) return [];
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "overrides",
        message: "Expected an overrides map.",
        expected: 'palette keys, or comma-separated keys such as "warning,info"',
        hint: "Each value is a partial token tree. A token with kind replaces; options merge.",
      }),
    );
    return [];
  }
  const layers: OverrideLayer[] = [];
  for (const [key, body] of Object.entries(value)) {
    const path = joinPath("overrides", key);
    const names = key
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (names.length === 0 || names.some((name) => !PALETTE_KEY_RE.test(name))) {
      push(
        issue({
          path,
          message: `Override key "${key}" must be palette names separated by commas.`,
          expected: '"brand" or "warning,info"',
          hint: "Spaces around commas are fine.",
        }),
      );
      continue;
    }
    const unknown = names.filter((name) => !palette.includes(name));
    if (unknown.length > 0) {
      push(
        issue({
          path,
          message: `Unknown palette ${unknown.map((name) => `"${name}"`).join(", ")} in overrides.`,
          expected: palette.join(", ") || "a palette color",
          hint: "Override keys name colors from palette.",
        }),
      );
      continue;
    }
    const tune = flattenOverride(body, path, push);
    if (tune === undefined) continue;
    layers.push({ path, names, tune });
  }
  return layers;
}

function flattenOverride(
  value: unknown,
  path: string,
  push: (issue: ConfigIssue) => void,
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    push(
      issue({
        path,
        message: "Expected token groups.",
        expected: "{ action: { DEFAULT: emphasis(5) } }",
        hint: "Overrides use the same group.token shape as tokens.",
      }),
    );
    return undefined;
  }
  const tune: Record<string, unknown> = {};
  for (const [group, body] of Object.entries(value)) {
    const groupPath = joinPath(path, group);
    if (!isPlainObject(body)) {
      push(
        issue({
          path: groupPath,
          message: "Expected tokens.",
          expected: "an object of tokens",
          hint: `Name a token, as in ${group}.DEFAULT.`,
        }),
      );
      continue;
    }
    for (const [name, token] of Object.entries(body)) {
      tune[`${group}.${name}`] = token;
    }
  }
  return tune;
}

function readTemplate(
  value: unknown,
  levels: LevelNames | undefined,
  push: (issue: ConfigIssue) => void,
): Slot[] {
  if (value === undefined) {
    push(
      issue({
        path: "tokens",
        message: "Missing tokens.",
        expected: "one or more token groups",
        hint: 'tokens maps a group name to tokens such as { kind: "surface" }.',
      }),
    );
    return [];
  }
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "tokens",
        message: "Expected token groups.",
        expected: "an object of groups",
        hint: "Each group maps token names to tokens.",
      }),
    );
    return [];
  }

  const slots: Slot[] = [];
  for (const [group, body] of Object.entries(value)) {
    const groupPath = joinPath("tokens", group);
    if (!isPlainObject(body)) {
      push(
        issue({
          path: groupPath,
          message: "Expected a token group.",
          expected: "an object of tokens",
          hint: "Groups contain only tokens.",
        }),
      );
      continue;
    }
    for (const [name, token] of Object.entries(body)) {
      const path = joinPath(groupPath, name);
      const slot: Slot = { group, name, onPath: joinPath(path, "on") };
      const normalized =
        levels === undefined
          ? normalizeToken(token, { path })
          : normalizeToken(token, { path, levels });
      if (normalized.ok) slot.value = normalized.token;
      else for (const found of normalized.issues) push(fromNormalize(found));
      slots.push(slot);
    }
  }
  return slots;
}

function cloneSlots(slots: readonly Slot[]): Slot[] {
  return slots.map((slot) => {
    const copy: Slot = { group: slot.group, name: slot.name, onPath: slot.onPath };
    if (slot.value !== undefined) copy.value = cloneToken(slot.value);
    return copy;
  });
}

function cloneToken(token: NormalizedToken): NormalizedToken {
  const copy: NormalizedToken = {
    kind: token.kind,
    scale: token.scale,
    states: [...token.states],
  };
  copyOptions(copy, token);
  return copy;
}

function copyOptions(target: NormalizedToken, source: NormalizedToken): void {
  if (source.disabled === true) target.disabled = true;
  if (source.decorative === true) target.decorative = true;
  if (source.on !== undefined) target.on = source.on;
  if (source.chroma !== undefined) target.chroma = source.chroma;
  if (source.hue !== undefined) target.hue = source.hue;
  if (source.lc !== undefined) target.lc = source.lc;
  if (source.ratio !== undefined) target.ratio = source.ratio;
  if (source.nudge !== undefined) target.nudge = source.nudge;
}

/** Base tune, then each ancestor's theme tune, root first. Later layers win. */
function tuneLayers(entry: PaletteEntry, chain: readonly RawTheme[]): TuneLayer[] {
  const layers: TuneLayer[] = [];
  if (entry.tune !== undefined) {
    layers.push({
      path: joinPath(joinPath("palette", entry.name), "tune"),
      tune: entry.tune,
    });
  }
  for (const theme of chain) {
    const delta = theme.palette[entry.name];
    if (!isPlainObject(delta) || !isPlainObject(delta.tune)) continue;
    layers.push({
      path: joinPath(
        joinPath(joinPath(joinPath("themes", theme.name), "palette"), entry.name),
        "tune",
      ),
      tune: delta.tune,
    });
  }
  return layers;
}

function resolvedColor(entry: PaletteEntry, chain: readonly RawTheme[]): string {
  let color = entry.color;
  for (const theme of chain) {
    const delta = theme.palette[entry.name];
    if (typeof delta === "string") color = delta;
    else if (isPlainObject(delta) && typeof delta.color === "string") color = delta.color;
  }
  return color;
}

function resolvedExact(
  entry: PaletteEntry,
  chain: readonly RawTheme[],
): boolean | string | undefined {
  let exact = entry.exact;
  for (const theme of chain) {
    const delta = theme.palette[entry.name];
    if (!isPlainObject(delta) || !present(delta, "exact")) continue;
    if (typeof delta.exact === "boolean" || typeof delta.exact === "string") {
      exact = delta.exact;
    }
  }
  return exact;
}

function applyTune(
  slots: Slot[],
  layer: TuneLayer,
  levels: LevelNames | undefined,
  push: (issue: ConfigIssue) => void,
): void {
  const entries = Object.entries(layer.tune);
  const ordered = [
    ...entries.filter(([key]) => isWildcard(key)),
    ...entries.filter(([key]) => !isWildcard(key)),
  ];
  for (const [key, value] of ordered) {
    const path = joinPath(layer.path, key);
    const targets = tuneTargets(slots, key, path, push);
    if (targets === undefined) continue;
    for (const slot of targets) applyTuneValue(slot, value, path, levels, push);
  }
}

function tuneTargets(
  slots: readonly Slot[],
  key: string,
  path: string,
  push: (issue: ConfigIssue) => void,
): Slot[] | undefined {
  if (!TUNE_RE.test(key)) {
    push(
      issue({
        path,
        message: `Tune path "${key}" must be "group", "group.token", or "group.*".`,
        expected: '"group" | "group.token" | "group.*"',
        hint: '"action" means action.DEFAULT. "action.*" covers the whole group.',
      }),
    );
    return undefined;
  }
  const dot = key.indexOf(".");
  const group = dot === -1 ? key : key.slice(0, dot);
  const rest = dot === -1 ? undefined : key.slice(dot + 1);
  const inGroup = slots.filter((slot) => slot.group === group);
  if (inGroup.length === 0) {
    push(unknownTune(path, key, slots));
    return undefined;
  }
  if (rest === undefined) {
    const fallback = inGroup.find((slot) => slot.name === "DEFAULT");
    if (fallback === undefined) {
      push(
        issue({
          path,
          message: `Tune path "${key}" means ${key}.DEFAULT, and that token does not exist.`,
          expected: `${key}.DEFAULT, or a group.token path`,
          hint: `Add ${key}.DEFAULT, or name the token (${key}.hover).`,
        }),
      );
      return undefined;
    }
    return [fallback];
  }
  if (rest === "*") return [...inGroup];
  const one = inGroup.find((slot) => slot.name === rest);
  if (one === undefined) {
    const suggestion = suggestName(
      rest,
      inGroup.map((slot) => slot.name),
    );
    push(
      issue({
        path,
        message: `Unknown token "${rest}" in group "${group}".`,
        expected: `a token in ${group}`,
        ...(suggestion === undefined
          ? {
              hint: `Tokens in ${group}: ${inGroup.map((slot) => slot.name).join(", ")}.`,
            }
          : {
              didYouMean: `${group}.${suggestion}`,
              hint: `Did you mean "${group}.${suggestion}"?`,
              fix: { path, replace: `${group}.${suggestion}` },
            }),
      }),
    );
    return undefined;
  }
  return [one];
}

function applyTuneValue(
  slot: Slot,
  value: unknown,
  path: string,
  levels: LevelNames | undefined,
  push: (issue: ConfigIssue) => void,
): void {
  if (!isPlainObject(value)) {
    push(
      issue({
        path,
        message: "Expected a token or token options.",
        expected: "a token with kind, or options such as { chroma }",
        hint: "A token replaces the target. Options merge into it.",
      }),
    );
    return;
  }

  const replacement = present(value, "kind");
  if (!replacement && present(value, "scale")) {
    push(
      issue({
        path: joinPath(path, "scale"),
        message: "A tune merge cannot set scale.",
        expected: "a token with kind, or options without scale",
        hint: "Pass a token such as emphasis(5) to replace the target.",
      }),
    );
  }

  const raw = replacement ? value : overlay(slot, value);
  if (raw === undefined) {
    push(
      issue({
        path,
        message: `Tune cannot merge into "${slot.group}.${slot.name}" because that token did not normalize.`,
        expected: "a token with kind, to replace it",
        hint: "Fix the token, or replace it with a token that has kind.",
      }),
    );
    return;
  }

  const normalized =
    levels === undefined
      ? normalizeToken(raw, { path })
      : normalizeToken(raw, { path, levels });
  if (!normalized.ok) {
    for (const found of normalized.issues) push(fromNormalize(found));
    return;
  }
  slot.value = normalized.token;
  if (present(value, "on")) slot.onPath = joinPath(path, "on");
  else if (replacement) {
    slot.onPath = joinPath(joinPath(joinPath("tokens", slot.group), slot.name), "on");
  }
}

function overlay(
  slot: Slot,
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (slot.value === undefined) return undefined;
  const raw = normalizedToRaw(slot.value);
  for (const [key, entry] of Object.entries(value)) {
    if (key === "scale") continue;
    raw[key] = entry;
  }
  return raw;
}

function normalizedToRaw(token: NormalizedToken): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    kind: token.kind,
    scale: token.scale,
  };
  if (token.on !== undefined) raw.on = token.on;
  if (token.chroma !== undefined) raw.chroma = token.chroma;
  if (token.hue !== undefined) raw.hue = token.hue;
  if (token.lc !== undefined) raw.lc = token.lc;
  if (token.ratio !== undefined) raw.ratio = token.ratio;
  if (token.nudge !== undefined) raw.nudge = token.nudge;
  return raw;
}

function unknownTune(path: string, key: string, slots: readonly Slot[]): ConfigIssue {
  const candidates: string[] = [];
  let previous = "";
  for (const slot of slots) {
    if (slot.group !== previous) {
      candidates.push(slot.group);
      previous = slot.group;
    }
    candidates.push(`${slot.group}.${slot.name}`);
  }
  const suggestion = suggestName(key, candidates);
  return issue({
    path,
    message: `Unknown tune target "${key}".`,
    expected: "a group or token in tokens",
    ...(suggestion === undefined
      ? { hint: "Tune keys point at tokens in this config." }
      : {
          didYouMean: suggestion,
          hint: `Did you mean "${suggestion}"?`,
          fix: { path, replace: suggestion },
        }),
  });
}

function isWildcard(key: string): boolean {
  const dot = key.indexOf(".");
  return dot !== -1 && key.slice(dot + 1) === "*";
}

function fromNormalize(found: NormalizeIssue): ConfigIssue {
  return issue({
    path: found.path,
    message: found.message,
    ...(found.didYouMean === undefined ? {} : { didYouMean: found.didYouMean }),
  });
}

function present(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function isAlgorithm(value: unknown): value is ContrastAlgorithm {
  return typeof value === "string" && (ALGORITHMS as readonly string[]).includes(value);
}

function isLevel(value: unknown): value is ContrastLevel {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

function enumIssue(
  path: string,
  value: unknown,
  allowed: readonly string[],
  label: string,
): ConfigIssue {
  const suggestion = typeof value === "string" ? suggestName(value, allowed) : undefined;
  return issue({
    path,
    message: `${label} ${renderValue(value)} is not valid.`,
    expected: allowed.join(" | "),
    ...(suggestion === undefined
      ? { hint: `Expected one of ${allowed.join(", ")}.` }
      : {
          didYouMean: suggestion,
          hint: `Did you mean "${suggestion}"?`,
          fix: { path, replace: suggestion },
        }),
  });
}

function renderValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return Object.prototype.toString.call(value);
}

function issue(fields: {
  path: string;
  message: string;
  expected?: string;
  hint?: string;
  didYouMean?: string;
  fix?: ConfigFix;
}): ConfigIssue {
  const result: ConfigIssue = { path: fields.path, message: fields.message };
  if (fields.expected !== undefined) result.expected = fields.expected;
  if (fields.hint !== undefined) result.hint = fields.hint;
  if (fields.didYouMean !== undefined) result.didYouMean = fields.didYouMean;
  if (fields.fix !== undefined) result.fix = fields.fix;
  return result;
}
