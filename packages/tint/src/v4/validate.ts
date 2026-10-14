/**
 * Whole-config v4 validator (docs/v4-spec.md §2, §6.2, §6.6, §7.1, §10).
 *
 * One pass collects every issue. Level names and state words come from
 * `compileLevels`, `resolveLevel`, and `parseState` — this file does not
 * reimplement those rules. It adds config shape, `on` targets, expert-value
 * gates, ranges, name rules, Tailwind `name-conflict`, and v3 keys.
 *
 * Nothing here throws. `assertConfig` is the wrapper that does.
 */

import { TAILWIND_UTILITY_PREFIXES } from "../output/names.js";
import { ConfigError, type ConfigFix, type ConfigIssue } from "./errors.js";
import {
  KINDS,
  compileLevels,
  isKind,
  isPlainObject,
  joinPath,
  suggestName,
  type NormalizeIssue,
} from "./levels.js";
import { normalizeToken } from "./normalize.js";
import {
  ATOMIC_STATES,
  STATE_APPLIES_TO,
  parseState,
  type CanonicalState,
} from "./states.js";
import type { Config, ContrastAlgorithm, Kind, LevelNames } from "./types.js";

const CONFIG_KEYS: readonly string[] = [
  "$schema",
  "contrast",
  "palette",
  "themes",
  "preset",
  "tokens",
  "overrides",
  "output",
];
const CONTRAST_KEYS: readonly string[] = ["algorithm", "level"];
const THEME_KEYS: readonly string[] = [
  "mode",
  "lightness",
  "selector",
  "media",
  "contrast",
  "palette",
  "extends",
];
const PALETTE_COLOR_KEYS: readonly string[] = ["color", "default", "exact", "tune"];
const OUTPUT_KEYS: readonly string[] = ["path", "formats", "format", "prefix"];
const THEME_CONTRAST_KEYS: readonly string[] = ["level"];
const SURFACE_STEP_KEYS: readonly string[] = ["light", "dark"];
const STATE_COUNT_KEYS: readonly string[] = [
  "hover",
  "pressed",
  "active",
  "focus",
  "selected",
  "checked",
  "disabled",
];

const ALGORITHMS: readonly string[] = ["apca", "wcag2"];
const CONTRAST_LEVELS: readonly string[] = ["standard", "more", "max"];
const PRESETS: readonly string[] = ["shadcn", "material", "primer", "radix", "polaris"];
const OUTPUT_FORMATS: readonly string[] = ["css", "tailwind", "dtcg", "flat"];
const COLOR_FORMATS: readonly string[] = ["oklch", "hex", "rgb"];
const MODES: readonly string[] = ["light", "dark"];

const TOKEN_FIELDS: readonly string[] = [
  "kind",
  "scale",
  "disabled",
  "decorative",
  "on",
  "chroma",
  "hue",
  "lc",
  "ratio",
  "nudge",
];

/** Group and token names (§2.4). Palette and theme names use it too. */
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
/** `on`: one group, or one group.token (§6.2). */
const ON_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)?$/;
/** `tune` keys: `group`, `group.token`, or `group.*` (§2.2). */
const TUNE_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.(?:\*|[a-zA-Z][a-zA-Z0-9_-]*))?$/;
/**
 * CSS identifier without escapes. Same pattern as palette names in the
 * JSON Schema (`scripts/build-schema.ts`). `output.prefix` is one of these.
 */
const CSS_IDENT_RE =
  /^-?(?:[A-Za-z_]|[^\u0000-\u007F])(?:[A-Za-z0-9_-]|[^\u0000-\u007F])*$/;

/** Chroma multiplier (§2.4). Surfaces being capped further is an engine concern. */
const CHROMA_MIN = 0;
const CHROMA_MAX = 2;
/**
 * `step` has no numeric bound in §2.4. −12..12 covers the §5 elevation ladder
 * (−2..+2) and expert step counts from the v3 `ls` migration.
 */
const STEP_MIN = -12;
const STEP_MAX = 12;
/** APCA |Lc| ceiling. The spec does not publish this bound. */
const LC_MIN = 0;
const LC_MAX = 108;
/** WCAG 2 ratio. The spec does not publish this bound. */
const RATIO_MIN = 1;
const RATIO_MAX = 21;

/**
 * Token names that would emit a Tailwind utility the framework already owns.
 * The group must be a key of {@link TAILWIND_UTILITY_PREFIXES}. The shortcut
 * is `<prefix>-<token>` (§6.6 `name-conflict`, e.g. `text-lg`, `border-x`).
 */
const COLOR_WORDS = ["inherit", "current", "transparent", "black", "white"] as const;
const TAILWIND_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  text: [
    "xs",
    "sm",
    "base",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl",
    "left",
    "center",
    "right",
    "justify",
    "start",
    "end",
    "wrap",
    "nowrap",
    "balance",
    "pretty",
    "ellipsis",
    "clip",
    ...COLOR_WORDS,
  ],
  bg: [
    "fixed",
    "local",
    "scroll",
    "auto",
    "cover",
    "contain",
    "none",
    "bottom",
    "center",
    "left",
    "right",
    "top",
    "repeat",
    "no-repeat",
    "repeat-x",
    "repeat-y",
    ...COLOR_WORDS,
  ],
  border: [
    "x",
    "y",
    "s",
    "e",
    "t",
    "r",
    "b",
    "l",
    "solid",
    "dashed",
    "dotted",
    "double",
    "hidden",
    "none",
    "collapse",
    "separate",
    ...COLOR_WORDS,
  ],
  outline: ["none", "dashed", "dotted", "double", "hidden", "solid", ...COLOR_WORDS],
  ring: ["inset", ...COLOR_WORDS],
  shadow: ["sm", "md", "lg", "xl", "2xl", "inner", "none", ...COLOR_WORDS],
  accent: [...COLOR_WORDS],
  caret: [...COLOR_WORDS],
  fill: ["none", ...COLOR_WORDS],
  stroke: ["none", ...COLOR_WORDS],
  decoration: [
    "solid",
    "dashed",
    "dotted",
    "double",
    "wavy",
    "slice",
    "clone",
    ...COLOR_WORDS,
  ],
  divide: [
    "x",
    "y",
    "solid",
    "dashed",
    "dotted",
    "double",
    "none",
    "reverse",
    ...COLOR_WORDS,
  ],
  placeholder: [...COLOR_WORDS],
};

/** v3 keys → what v4 says instead (§10). */
const V3_MIGRATIONS: Readonly<Record<string, { expected: string; detail: string }>> = {
  colors: {
    expected: "palette",
    detail: "`colors` became `palette`. The first palette color is the default.",
  },
  lc: {
    expected: 'a level, or a numeric lc under contrast.algorithm "apca"',
    detail:
      'A v3 `lc` shortcut (`"heading"`, `"body"`, …) became a level such as `text("strong")`. A raw number is the expert hatch and only works under algorithm "apca".',
  },
  ls: {
    expected: "an elevation level, or step",
    detail: "`ls` became an elevation level, or `surface({ step })` (expert).",
  },
  $on: {
    expected: "on",
    detail:
      '`$on` became `on` on the token. Omit it when the backdrop is the base surface. `$on: "action"` becomes `{ on: "action" }`.',
  },
  $invert: {
    expected: "direction",
    detail: '`$invert` became `{ direction: "lighter" }` or `{ direction: "darker" }`.',
  },
  $chroma: {
    expected: "chroma",
    detail: "`$chroma` became `chroma`.",
  },
  $scale: {
    expected: "states",
    detail: "`$scale` became the `states` step config, or `surface({ step })`.",
  },
  $decorative: {
    expected: "a decorative kind, level, or state",
    detail:
      '`$decorative` is implied by border levels 1–2, state "disabled", emphasis levels 1–2, and surfaces.',
  },
  $reference: {
    expected: "nothing",
    detail: "`$reference` was removed. The solver uses the worst-case backdrop set.",
  },
  $role: {
    expected: "kind",
    detail: "`$role` became the token `kind`.",
  },
  overrides: {
    expected: "palette.<color>.tune",
    detail: "`overrides` became `tune` on a palette color.",
  },
  prefersColorScheme: {
    expected: "themes.<name>.media",
    detail: "`prefersColorScheme` became `themes.<name>.media`.",
  },
  prefersContrast: {
    expected: "themes.<name>.contrast.level",
    detail: '`prefersContrast: "more"` became `themes.<name>.contrast.level: "more"`.',
  },
  mode: {
    expected: "themes.<name>.mode",
    detail: "`mode` moved onto each theme.",
  },
  selector: {
    expected: "themes.<name>.selector",
    detail: "`selector` moved onto each theme.",
  },
  name: {
    expected: "a theme name",
    detail: "The v3 theme `name` became a key in the `themes` map.",
  },
  scale: {
    expected: "states",
    detail: "`scale` became the `states` step config.",
  },
  offset: {
    expected: "a theme page offset",
    detail: "`offset` is the theme page offset. It is not a v4 config key yet.",
  },
};

const MIGRATION_HINT = "See the v3 → v4 migration table (docs/v4-spec.md §10).";

export type ValidationResult =
  { ok: true; config: Config } | { ok: false; issues: ConfigIssue[] };

interface IndexedToken {
  group: string;
  token: string;
  kind?: Kind;
  hasState: boolean;
}

interface TokenIndex {
  tokens: IndexedToken[];
  byGroup: Map<string, IndexedToken[]>;
}

interface Node {
  id: string;
  onPath: string;
  target?: string;
}

interface Ctx {
  push: (issue: ConfigIssue) => void;
  index: TokenIndex;
  nodes: Map<string, Node>;
  levels: LevelNames | undefined;
  algorithm: ContrastAlgorithm;
  algorithmExplicit: boolean;
}

/**
 * Validate a v4 config. Collects every issue. Does not throw.
 * On success, `config` is the same object that was passed in.
 */
export function validateConfig(input: unknown): ValidationResult {
  if (Array.isArray(input)) return { ok: false, issues: [v3ArrayIssue()] };
  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [
        issue({
          path: "",
          message: "Expected a config object.",
          expected: "a plain object",
          hint: "The v4 config is one object with palette and tokens.",
        }),
      ],
    };
  }

  const issues: ConfigIssue[] = [];
  const seen = new Set<string>();
  const push = (item: ConfigIssue): void => {
    const key = `${item.code ?? ""}\0${item.path}\0${item.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(item);
  };

  checkTopLevel(input, push);
  const contrast = checkContrast(input.contrast, push);
  const index = buildIndex(input.tokens);
  const nodes = buildNodes(index);
  const levels = isPlainObject(input.levels) ? (input.levels as LevelNames) : undefined;
  const ctx: Ctx = {
    push,
    index,
    nodes,
    levels,
    algorithm: contrast.algorithm,
    algorithmExplicit: contrast.explicit,
  };

  const palette = checkPalette(input.palette, ctx);
  checkThemes(input.themes, palette, ctx);
  checkLevelsConfig(input.levels, push);
  checkStatesConfig(input.states, push);
  checkPreset(input.preset, push);
  checkOutput(input.output, push);
  checkTokens(input.tokens, ctx);
  checkCycles(nodes, push);

  if (issues.length === 0) return { ok: true, config: input as unknown as Config };
  return { ok: false, issues };
}

/** Validate and throw {@link ConfigError} when anything is wrong. */
export function assertConfig(input: unknown): Config {
  const result = validateConfig(input);
  if (!result.ok) throw new ConfigError(result.issues);
  return result.config;
}

function checkTopLevel(input: Record<string, unknown>, push: Ctx["push"]): void {
  for (const key of Object.keys(input)) {
    if (CONFIG_KEYS.includes(key)) continue;
    push(unknownKey(key, key, CONFIG_KEYS));
  }
  if (Object.prototype.hasOwnProperty.call(input, "$schema")) {
    const schema = input["$schema"];
    if (typeof schema !== "string" || schema.trim() === "") {
      push(
        issue({
          path: "$schema",
          message: "$schema must be a non-empty string.",
          expected: "a schema URL",
          hint: "Use https://unpkg.com/@skylerknight/tint/schema/v4.json.",
        }),
      );
    }
  }
  if (!Object.prototype.hasOwnProperty.call(input, "palette")) {
    push(
      issue({
        path: "palette",
        message: "Missing palette.",
        expected: "one or more palette colors",
        hint: "palette maps a name to a CSS color, or to { color }.",
      }),
    );
  }
  if (!Object.prototype.hasOwnProperty.call(input, "tokens")) {
    push(
      issue({
        path: "tokens",
        message: "Missing tokens.",
        expected: "one or more token groups",
        hint: 'tokens maps a group name to tokens such as { kind: "surface" }.',
      }),
    );
  }
}

function checkContrast(
  value: unknown,
  push: Ctx["push"],
): { algorithm: ContrastAlgorithm; explicit: boolean } {
  if (value === undefined) return { algorithm: "apca", explicit: false };
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "contrast",
        message: "Expected contrast options.",
        expected: '{ algorithm?: "apca" | "wcag2", level?: "standard" | "more" | "max" }',
        hint: 'algorithm defaults to "apca". level defaults to "standard".',
      }),
    );
    return { algorithm: "apca", explicit: false };
  }

  for (const key of Object.keys(value)) {
    if (!CONTRAST_KEYS.includes(key))
      push(unknownKey(joinPath("contrast", key), key, CONTRAST_KEYS));
  }

  let algorithm: ContrastAlgorithm = "apca";
  let explicit = false;
  if (present(value, "algorithm")) {
    if (value.algorithm === "apca" || value.algorithm === "wcag2") {
      algorithm = value.algorithm;
      explicit = true;
    } else {
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
  if (
    present(value, "level") &&
    (typeof value.level !== "string" || !CONTRAST_LEVELS.includes(value.level))
  ) {
    push(enumIssue("contrast.level", value.level, CONTRAST_LEVELS, "Contrast level"));
  }
  return { algorithm, explicit };
}

interface PaletteInfo {
  names: string[];
  ok: boolean;
}

function checkPalette(value: unknown, ctx: Ctx): PaletteInfo {
  if (value === undefined) return { names: [], ok: false };
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path: "palette",
        message: "Expected a palette.",
        expected: "an object of palette colors",
        hint: "Each entry is a CSS color string or { color }.",
      }),
    );
    return { names: [], ok: false };
  }

  const names = Object.keys(value);
  if (names.length === 0) {
    ctx.push(
      issue({
        path: "palette",
        message: "palette must contain at least one color.",
        expected: "one or more palette colors",
        hint: "The first color is the default palette unless one sets default: true.",
      }),
    );
    return { names: [], ok: false };
  }

  let defaults = 0;
  for (const name of names) {
    const path = joinPath("palette", name);
    if (!NAME_RE.test(name)) ctx.push(badName(path, name, "Palette color"));
    const entry = value[name];
    if (typeof entry === "string") {
      checkColorString(entry, path, ctx.push);
      continue;
    }
    if (!isPlainObject(entry)) {
      ctx.push(
        issue({
          path,
          message: "Expected a CSS color or a palette color object.",
          expected: "a string or { color }",
          hint: "Strings are shorthand for { color }.",
        }),
      );
      continue;
    }
    if (entry.default === true) {
      defaults += 1;
      if (defaults > 1) {
        ctx.push(
          issue({
            path: joinPath(path, "default"),
            message: "Only one palette color can be the default.",
            expected: "a single default: true",
            hint: "Otherwise the first palette color is the unprefixed palette.",
          }),
        );
      }
    }
    checkPaletteColor(entry, path, true, ctx);
  }
  return { names, ok: true };
}

function checkPaletteColor(
  entry: Record<string, unknown>,
  path: string,
  requireColor: boolean,
  ctx: Ctx,
): void {
  for (const key of Object.keys(entry)) {
    if (PALETTE_COLOR_KEYS.includes(key)) continue;
    if (key === "value") {
      ctx.push(
        issue({
          path: joinPath(path, key),
          message: 'Palette colors use "color", not "value".',
          expected: "color",
          didYouMean: "color",
          hint: "v3 { value } became { color }.",
        }),
      );
      continue;
    }
    ctx.push(unknownKey(joinPath(path, key), key, PALETTE_COLOR_KEYS));
  }

  if (requireColor && !present(entry, "color")) {
    ctx.push(
      issue({
        path: joinPath(path, "color"),
        message: "Palette color is missing color.",
        expected: "a CSS color string",
        hint: "color supplies hue and chroma. Lightness is solved.",
      }),
    );
  } else if (present(entry, "color")) {
    if (typeof entry.color !== "string") {
      ctx.push(
        issue({
          path: joinPath(path, "color"),
          message: "Expected a CSS color string.",
          expected: "a string",
          hint: "Any CSS color. The engine reports gamut mapping later.",
        }),
      );
    } else {
      checkColorString(entry.color, joinPath(path, "color"), ctx.push);
    }
  }

  if (present(entry, "default") && typeof entry.default !== "boolean") {
    ctx.push(
      issue({
        path: joinPath(path, "default"),
        message: "Expected a boolean.",
        expected: "true or false",
        hint: "true makes this the unprefixed palette.",
      }),
    );
  }

  if (present(entry, "exact")) checkExact(entry.exact, joinPath(path, "exact"), ctx);

  if (present(entry, "tune")) {
    checkTune(entry.tune, joinPath(path, "tune"), ctx);
  }
}

function checkExact(value: unknown, path: string, ctx: Ctx): void {
  if (typeof value === "boolean") {
    if (value === true && !hasEmphasisRest(ctx.index)) {
      ctx.push(
        issue({
          path,
          message:
            "exact: true snaps the first emphasis rest token, and this config has none.",
          expected: "an emphasis token with no state, or a group.token path",
          hint: "Add an emphasis() token, or set exact to a group.token path.",
        }),
      );
    }
    return;
  }
  if (typeof value !== "string") {
    ctx.push(
      issue({
        path,
        message: "Expected true or a group.token path.",
        expected: 'true | "group.token"',
        hint: "true snaps the first emphasis rest token.",
      }),
    );
    return;
  }
  if (!ON_RE.test(value) || !value.includes(".")) {
    const group = NAME_RE.test(value) ? value : undefined;
    const fallback = group !== undefined ? `${group}.DEFAULT` : undefined;
    const hasDefault =
      group !== undefined && groupDefault(ctx.index, group) !== undefined;
    ctx.push(
      issue({
        path,
        message: `exact ${JSON.stringify(value)} must be a group.token path.`,
        expected: '"group.token"',
        ...(hasDefault && fallback !== undefined
          ? {
              didYouMean: fallback,
              hint: `exact snaps one token. Use "${fallback}".`,
              fix: { path, replace: fallback },
            }
          : { hint: 'Use a path such as "action.DEFAULT".' }),
      }),
    );
    return;
  }
  const resolved = resolveBackdrop(value, ctx.index);
  if (resolved.ok) return;
  ctx.push(backdropIssue(path, value, resolved, ctx.index, "exact"));
}

function checkTune(value: unknown, path: string, ctx: Ctx): void {
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path,
        message: "Expected tune overrides.",
        expected: 'an object of "group", "group.token", or "group.*"',
        hint: '"action" means action.DEFAULT. A token replaces; options merge.',
      }),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const keyPath = joinPath(path, key);
    checkTuneKey(key, keyPath, ctx);
    checkTuneValue(entry, keyPath, key, ctx);
  }
}

function checkTuneKey(key: string, path: string, ctx: Ctx): void {
  if (!TUNE_RE.test(key)) {
    ctx.push(
      issue({
        path,
        message: `Tune path "${key}" must be "group", "group.token", or "group.*".`,
        expected: '"group" | "group.token" | "group.*"',
        hint: '"action" means action.DEFAULT. "action.*" covers the whole group.',
      }),
    );
    return;
  }
  const dot = key.indexOf(".");
  const group = dot === -1 ? key : key.slice(0, dot);
  const rest = dot === -1 ? undefined : key.slice(dot + 1);
  const entries = ctx.index.byGroup.get(group);
  if (entries === undefined) {
    const suggestion = suggestName(key, targetCandidates(ctx.index));
    ctx.push(
      issue({
        path,
        message: `Unknown tune target "${key}".`,
        expected: "a group or token in tokens",
        ...(suggestion !== undefined
          ? {
              didYouMean: suggestion,
              hint: `Did you mean "${suggestion}"?`,
              fix: { path, replace: suggestion },
            }
          : { hint: "Tune keys point at tokens in this config." }),
      }),
    );
    return;
  }
  if (rest === undefined && groupDefault(ctx.index, group) === undefined) {
    ctx.push(
      issue({
        path,
        message: `Tune path "${key}" means ${key}.DEFAULT, and that token does not exist.`,
        expected: `${key}.DEFAULT, or a group.token path`,
        hint: `Add ${key}.DEFAULT, or name the token (${key}.hover).`,
      }),
    );
    return;
  }
  if (
    rest !== undefined &&
    rest !== "*" &&
    !entries.some((entry) => entry.token === rest)
  ) {
    const suggestion = suggestName(
      rest,
      entries.map((entry) => entry.token),
    );
    ctx.push(
      issue({
        path,
        message: `Unknown token "${rest}" in group "${group}".`,
        expected: `a token in ${group}`,
        ...(suggestion !== undefined
          ? {
              didYouMean: `${group}.${suggestion}`,
              hint: `Did you mean "${group}.${suggestion}"?`,
              fix: { path, replace: `${group}.${suggestion}` },
            }
          : {
              hint: `Tokens in ${group}: ${entries.map((entry) => entry.token).join(", ")}.`,
            }),
      }),
    );
  }
}

function checkTuneValue(value: unknown, path: string, key: string, ctx: Ctx): void {
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path,
        message: "Expected a token or token options.",
        expected: "a token with kind, or options such as { chroma }",
        hint: "A token replaces the target. Options merge into it.",
      }),
    );
    return;
  }
  const selfId = tuneSelfId(key, ctx.index);
  if (Object.prototype.hasOwnProperty.call(value, "kind")) {
    checkTokenBody(value, path, ctx, selfId);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(value, "level")) {
    ctx.push(
      issue({
        path: joinPath(path, "level"),
        message: "A tune merge cannot set level.",
        expected: "a token with kind, or options without level",
        hint: 'Pass a token such as emphasis("bold") to replace the target.',
      }),
    );
  }
  const kinds = tuneKinds(key, ctx.index);
  const probe = kinds[0] ?? "emphasis";
  const synthetic: Record<string, unknown> = { kind: probe };
  for (const [option, optionValue] of Object.entries(value)) {
    if (option === "level") continue;
    synthetic[option] = optionValue;
  }
  checkTokenBody(synthetic, path, ctx, selfId);
  if (typeof value.state !== "string") return;
  for (const kind of kinds.slice(1)) {
    const parsed = parseState(value.state, kind, joinPath(path, "state"));
    if (parsed.ok) continue;
    for (const found of parsed.issues) ctx.push(enrich(found, path, kind));
  }
}

function checkThemes(value: unknown, palette: PaletteInfo, ctx: Ctx): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path: "themes",
        message: "Expected a themes map.",
        expected: "an object of theme names",
        hint: 'The default when themes is omitted is { light: { mode: "light" } }.',
      }),
    );
    return;
  }
  const names = Object.keys(value);
  if (names.length === 0) {
    ctx.push(
      issue({
        path: "themes",
        message: "themes must contain at least one theme.",
        expected: "one or more themes",
        hint: "Omit themes to use the default light theme.",
      }),
    );
    return;
  }

  const extendsEdges = new Map<string, string>();
  for (const name of names) {
    const path = joinPath("themes", name);
    if (!NAME_RE.test(name)) ctx.push(badName(path, name, "Theme name"));
    const theme = value[name];
    if (!isPlainObject(theme)) {
      ctx.push(
        issue({
          path,
          message: "Expected theme options.",
          expected: '{ mode: "light" | "dark" }',
          hint: "mode is required unless extends names a theme that has one.",
        }),
      );
      continue;
    }
    checkTheme(name, theme, path, names, palette, extendsEdges, ctx);
  }
  checkExtendsCycles(extendsEdges, ctx.push);
}

function checkTheme(
  name: string,
  theme: Record<string, unknown>,
  path: string,
  names: readonly string[],
  palette: PaletteInfo,
  extendsEdges: Map<string, string>,
  ctx: Ctx,
): void {
  for (const key of Object.keys(theme)) {
    if (THEME_KEYS.includes(key)) continue;
    ctx.push(unknownKey(joinPath(path, key), key, THEME_KEYS));
  }

  const hasExtends = present(theme, "extends");
  if (hasExtends) {
    if (typeof theme.extends !== "string" || theme.extends === "") {
      ctx.push(
        issue({
          path: joinPath(path, "extends"),
          message: "Expected a theme name.",
          expected: "the name of another theme",
          hint: "extends inherits that theme's options.",
        }),
      );
    } else if (theme.extends === name) {
      ctx.push(
        issue({
          path: joinPath(path, "extends"),
          message: `Theme "${name}" cannot extend itself.`,
          expected: "a different theme",
          hint: "extends inherits another theme's options.",
        }),
      );
    } else if (!names.includes(theme.extends)) {
      const suggestion = suggestName(theme.extends, names);
      ctx.push(
        issue({
          path: joinPath(path, "extends"),
          message: `Unknown theme "${theme.extends}".`,
          expected: names.join(", "),
          ...(suggestion !== undefined
            ? {
                didYouMean: suggestion,
                hint: `Did you mean "${suggestion}"?`,
                fix: { path: joinPath(path, "extends"), replace: suggestion },
              }
            : { hint: "extends must name a theme in this config." }),
        }),
      );
    } else {
      extendsEdges.set(name, theme.extends);
    }
  }

  if (!hasExtends && !present(theme, "mode") && !present(theme, "lightness")) {
    ctx.push(
      issue({
        path: joinPath(path, "lightness"),
        message: `Theme "${name}" is missing lightness.`,
        expected: "lightness 0..100, or mode light/dark",
        hint: 'Set lightness, mode ("light" is 97, "dark" is 18), or extends a theme that has one.',
      }),
    );
  } else if (
    present(theme, "mode") &&
    (typeof theme.mode !== "string" || !MODES.includes(theme.mode))
  ) {
    ctx.push(enumIssue(joinPath(path, "mode"), theme.mode, MODES, "Theme mode"));
  }

  if (present(theme, "lightness")) {
    const lightness = theme.lightness;
    if (
      typeof lightness !== "number" ||
      !Number.isFinite(lightness) ||
      lightness < 0 ||
      lightness > 100
    ) {
      ctx.push(
        issue({
          path: joinPath(path, "lightness"),
          message: "Expected page lightness from 0 to 100.",
          expected: "a number from 0 to 100",
          hint: 'mode: "light" is 97. mode: "dark" is 18.',
        }),
      );
    }
  }

  if (present(theme, "selector") && typeof theme.selector !== "string") {
    ctx.push(
      issue({
        path: joinPath(path, "selector"),
        message: "Expected a CSS selector.",
        expected: "a string",
        hint: 'The default selector is ":root".',
      }),
    );
  }
  if (
    present(theme, "media") &&
    typeof theme.media !== "boolean" &&
    typeof theme.media !== "string"
  ) {
    ctx.push(
      issue({
        path: joinPath(path, "media"),
        message: "Expected true or a media query.",
        expected: "true | string",
        hint: "true means prefers-color-scheme matching mode. A string is a custom query.",
      }),
    );
  }
  if (present(theme, "contrast"))
    checkThemeContrast(theme.contrast, joinPath(path, "contrast"), ctx.push);
  if (present(theme, "palette")) {
    checkThemePalette(theme.palette, joinPath(path, "palette"), palette, ctx);
  }
}

function checkThemeContrast(value: unknown, path: string, push: Ctx["push"]): void {
  if (!isPlainObject(value)) {
    push(
      issue({
        path,
        message: "Expected a contrast level override.",
        expected: '{ level?: "standard" | "more" | "max" }',
        hint: "A theme can shift the level. The algorithm stays global.",
      }),
    );
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === "algorithm") {
      push(
        issue({
          path: joinPath(path, key),
          message: "A theme cannot override contrast.algorithm.",
          expected: "level",
          hint: 'Algorithm is global. Set contrast.level to "standard", "more", or "max".',
        }),
      );
      continue;
    }
    if (!THEME_CONTRAST_KEYS.includes(key)) {
      push(unknownKey(joinPath(path, key), key, THEME_CONTRAST_KEYS));
    }
  }
  if (
    present(value, "level") &&
    (typeof value.level !== "string" || !CONTRAST_LEVELS.includes(value.level))
  ) {
    push(
      enumIssue(joinPath(path, "level"), value.level, CONTRAST_LEVELS, "Contrast level"),
    );
  }
}

function checkThemePalette(
  value: unknown,
  path: string,
  palette: PaletteInfo,
  ctx: Ctx,
): void {
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path,
        message: "Expected per-theme palette deltas.",
        expected: "an object of palette color names",
        hint: "A string replaces color. An object merges palette color fields.",
      }),
    );
    return;
  }
  for (const [name, entry] of Object.entries(value)) {
    const entryPath = joinPath(path, name);
    if (palette.ok && !palette.names.includes(name)) {
      const suggestion = suggestName(name, palette.names);
      ctx.push(
        issue({
          path: entryPath,
          message: `Theme palette "${name}" is not in palette.`,
          expected: palette.names.join(", ") || "a palette color",
          ...(suggestion !== undefined
            ? { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }
            : {
                hint: "Theme palette entries override colors from the top-level palette.",
              }),
        }),
      );
    }
    if (typeof entry === "string") {
      checkColorString(entry, entryPath, ctx.push);
      continue;
    }
    if (!isPlainObject(entry)) {
      ctx.push(
        issue({
          path: entryPath,
          message: "Expected a CSS color or a palette color delta.",
          expected: "a string or a partial palette color",
          hint: "A string replaces color.",
        }),
      );
      continue;
    }
    checkPaletteColor(entry, entryPath, false, ctx);
  }
}

function checkExtendsCycles(edges: Map<string, string>, push: Ctx["push"]): void {
  const color = new Map<string, "visiting" | "done">();
  const visit = (name: string, stack: string[]): void => {
    const mark = color.get(name);
    if (mark === "done") return;
    if (mark === "visiting") {
      const start = stack.indexOf(name);
      if (start === -1) return;
      const cycle = [...stack.slice(start), name];
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
}

function checkLevelsConfig(value: unknown, push: Ctx["push"]): void {
  if (value === undefined) return;
  const compiled = compileLevels(value as LevelNames);
  if (compiled.ok) return;
  for (const found of compiled.issues) push(passThrough(found));
}

function checkStatesConfig(value: unknown, push: Ctx["push"]): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "states",
        message: "Expected per-kind state steps.",
        expected: "an object keyed by kind",
        hint: "Example: { emphasis: { hover: 1, pressed: 3 }, surface: { step: { light: 0.02 } } }.",
      }),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const path = joinPath("states", key);
    if (!isKind(key)) {
      const suggestion = suggestName(key, KINDS);
      push(
        issue({
          path,
          message: `Unknown kind "${key}".`,
          expected: KINDS.join(", "),
          ...(suggestion !== undefined
            ? { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }
            : { hint: `Valid kinds: ${KINDS.join(", ")}.` }),
        }),
      );
      continue;
    }
    checkKindStates(key, entry, path, push);
  }
}

function checkKindStates(
  kind: Kind,
  value: unknown,
  path: string,
  push: Ctx["push"],
): void {
  if (!isPlainObject(value)) {
    push(
      issue({
        path,
        message: `Expected state steps for ${kind}.`,
        expected: "step counts, and step: { light, dark } on surface or emphasis",
        hint: "Counts are how many steps a state moves. surface.step and emphasis.step are the size of one step.",
      }),
    );
    return;
  }
  const stepped = kind === "surface" || kind === "emphasis";
  const allowed = stepped ? [...STATE_COUNT_KEYS, "step"] : STATE_COUNT_KEYS;
  for (const [key, entry] of Object.entries(value)) {
    const keyPath = joinPath(path, key);
    if (key === "step" && !stepped) {
      push(
        issue({
          path: keyPath,
          message:
            "step is the OKLCH size of one step. It belongs under states.surface or states.emphasis.",
          expected: "a step count, or states.surface.step / states.emphasis.step",
          hint: "Text and border entries are counts such as hover: 1.",
        }),
      );
      continue;
    }
    if (!allowed.includes(key)) {
      const suggestion = suggestName(key, allowed);
      push(
        issue({
          path: keyPath,
          message: `Unknown state step "${key}".`,
          expected: allowed.join(", "),
          ...(suggestion !== undefined
            ? { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }
            : { hint: `Valid keys: ${allowed.join(", ")}.` }),
        }),
      );
      continue;
    }
    if (key === "checked" && !stateApplies("checked", kind)) {
      push(
        issue({
          path: keyPath,
          message: `State "checked" does not apply to ${kind}.`,
          expected: STATE_APPLIES_TO.checked.join(", "),
          hint: `"checked" applies to ${STATE_APPLIES_TO.checked.join(" and ")}.`,
        }),
      );
      continue;
    }
    if (key === "step") {
      checkModeStep(entry, keyPath, kind === "emphasis" ? "emphasis" : "surface", push);
      continue;
    }
    checkStepCount(entry, keyPath, push);
  }
}

function checkStepCount(value: unknown, path: string, push: Ctx["push"]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    push(
      issue({
        path,
        message: "Expected a finite number.",
        expected: "a step count of 0 or greater",
        hint: "The count is how many steps this state moves from the rest token.",
      }),
    );
    return;
  }
  if (value < 0) {
    push(
      issue({
        path,
        message: `Step count ${value} must be 0 or greater.`,
        expected: "a number >= 0",
        hint: "Counts move away from the rest token. They are not negative.",
      }),
    );
  }
}

const MODE_STEP_DEFAULTS = {
  surface: "0.02 (light) and 0.03 (dark)",
  emphasis: "0.025 (light) and 0.0375 (dark)",
} as const;

function checkModeStep(
  value: unknown,
  path: string,
  kind: "surface" | "emphasis",
  push: Ctx["push"],
): void {
  const defaults = `The published defaults are ${MODE_STEP_DEFAULTS[kind]}.`;
  const label = kind === "surface" ? "surface.step" : "emphasis.step";
  if (typeof value === "number") {
    push(
      issue({
        path,
        message: `${label} is the size of one step, not a count.`,
        expected: "{ light?: number, dark?: number }",
        hint: `Put hover: 1 beside step for a count. ${defaults}`,
      }),
    );
    return;
  }
  if (!isPlainObject(value)) {
    push(
      issue({
        path,
        message: `Expected a ${kind} step size.`,
        expected: "{ light?: number, dark?: number }",
        hint: "Values are OKLCH lightness for one step.",
      }),
    );
    return;
  }
  for (const key of Object.keys(value)) {
    if (!SURFACE_STEP_KEYS.includes(key)) {
      push(unknownKey(joinPath(path, key), key, SURFACE_STEP_KEYS));
    }
  }
  for (const side of SURFACE_STEP_KEYS) {
    if (!present(value, side)) continue;
    const amount = value[side];
    const sidePath = joinPath(path, side);
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      push(
        issue({
          path: sidePath,
          message: "Expected a finite number.",
          expected: "an OKLCH lightness greater than 0 and at most 1",
          hint: defaults,
        }),
      );
      continue;
    }
    if (amount <= 0 || amount > 1) {
      const name = kind === "surface" ? "Surface" : "Emphasis";
      push(
        issue({
          path: sidePath,
          message: `${name} step ${side} ${amount} must be greater than 0 and at most 1.`,
          expected: "a number in (0, 1]",
          hint: defaults,
        }),
      );
    }
  }
}

function checkPreset(value: unknown, push: Ctx["push"]): void {
  if (value === undefined) return;
  if (typeof value === "string" && PRESETS.includes(value)) return;
  push(enumIssue("preset", value, PRESETS, "Preset"));
}

function checkOutput(value: unknown, push: Ctx["push"]): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    push(
      issue({
        path: "output",
        message: "Expected output options.",
        expected: "{ path?, formats?, format?, prefix? }",
        hint: "formats are css, tailwind, dtcg, or flat. format is oklch, hex, or rgb. prefix is a CSS identifier.",
      }),
    );
    return;
  }
  for (const key of Object.keys(value)) {
    if (!OUTPUT_KEYS.includes(key))
      push(unknownKey(joinPath("output", key), key, OUTPUT_KEYS));
  }
  if (present(value, "path") && typeof value.path !== "string") {
    push(
      issue({
        path: "output.path",
        message: "Expected an output directory.",
        expected: "a string",
        hint: "path is the directory tint build writes.",
      }),
    );
  }
  if (
    present(value, "format") &&
    (typeof value.format !== "string" || !COLOR_FORMATS.includes(value.format))
  ) {
    push(enumIssue("output.format", value.format, COLOR_FORMATS, "Color format"));
  }
  if (present(value, "prefix")) checkPrefix(value.prefix, push);
  if (!present(value, "formats")) return;
  if (!Array.isArray(value.formats)) {
    push(
      issue({
        path: "output.formats",
        message: "Expected a list of output formats.",
        expected: OUTPUT_FORMATS.join(", "),
        hint: 'v3 "json" split into "dtcg" and "flat".',
      }),
    );
    return;
  }
  for (let index = 0; index < value.formats.length; index += 1) {
    checkOutputFormat(value.formats[index], `output.formats.${index}`, push);
  }
}

function checkPrefix(value: unknown, push: Ctx["push"]): void {
  if (typeof value === "string" && CSS_IDENT_RE.test(value)) return;
  const shown = typeof value === "string" ? `"${value}"` : "";
  push(
    issue({
      path: "output.prefix",
      message:
        shown === ""
          ? "output.prefix must be a CSS identifier."
          : `output.prefix ${shown} must be a CSS identifier.`,
      expected: "a CSS identifier, with no escapes",
      hint: 'Example: "tint". Omit prefix for no prefix. It is prepended to every CSS variable.',
    }),
  );
}

function checkOutputFormat(value: unknown, path: string, push: Ctx["push"]): void {
  if (value === "json") {
    push(
      issue({
        path,
        code: "v3-config",
        message: '"json" is a v3 output format.',
        expected: "dtcg | flat",
        hint: `${MIGRATION_HINT} v3 "json" split into "dtcg" and "flat".`,
      }),
    );
    return;
  }
  if (typeof value === "string" && OUTPUT_FORMATS.includes(value)) return;
  push(enumIssue(path, value, OUTPUT_FORMATS, "Output format"));
}

function checkTokens(value: unknown, ctx: Ctx): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    ctx.push(
      issue({
        path: "tokens",
        message: "Expected token groups.",
        expected: "an object of groups",
        hint: "Each group is an object of tokens. There are no group-level settings.",
      }),
    );
    return;
  }
  const groups = Object.keys(value);
  if (groups.length === 0) {
    ctx.push(
      issue({
        path: "tokens",
        message: "tokens must contain at least one group.",
        expected: "one or more groups",
        hint: 'A group holds tokens such as DEFAULT: { kind: "surface" }.',
      }),
    );
    return;
  }

  for (const group of groups) {
    const groupPath = joinPath("tokens", group);
    if (!NAME_RE.test(group)) ctx.push(badName(groupPath, group, "Group name"));
    const body = value[group];
    if (!isPlainObject(body)) {
      ctx.push(
        issue({
          path: groupPath,
          message: "Expected a group of tokens.",
          expected: "an object of tokens",
          hint: "Groups contain only tokens.",
        }),
      );
      continue;
    }
    const tokenNames = Object.keys(body).filter((name) => !name.startsWith("$"));
    if (tokenNames.length === 0) {
      ctx.push(
        issue({
          path: groupPath,
          message: `Group "${group}" has no tokens.`,
          expected: "one or more tokens",
          hint: "Groups contain only tokens. There are no group-level settings.",
        }),
      );
    }
    for (const tokenName of Object.keys(body)) {
      const tokenPath = joinPath(groupPath, tokenName);
      if (tokenName.startsWith("$")) {
        ctx.push(dollarIssue(tokenPath, tokenName));
        continue;
      }
      if (!NAME_RE.test(tokenName)) ctx.push(badName(tokenPath, tokenName, "Token name"));
      const utility = tailwindUtility(group, tokenName);
      if (utility !== undefined) ctx.push(nameConflict(group, tokenName, utility));
      const token = body[tokenName];
      if (!isPlainObject(token)) {
        ctx.push(
          issue({
            path: tokenPath,
            message: "Expected a token object.",
            expected: '{ kind: "surface" | "text" | "border" | "emphasis" }',
            hint: "Kind functions return this object. JSON configs write it directly.",
          }),
        );
        continue;
      }
      if (looksLikeV3Variant(token)) {
        reportV3Variant(token, tokenPath, ctx.push);
        continue;
      }
      checkTokenBody(token, tokenPath, ctx, tokenId(group, tokenName));
    }
  }
}

function checkTokenBody(
  token: Record<string, unknown>,
  path: string,
  ctx: Ctx,
  selfId: string | undefined,
): void {
  if (typeof token.lc === "string") ctx.push(v3Issue(joinPath(path, "lc"), "lc"));

  let source = token;
  if (Array.isArray(token.on)) {
    ctx.push(arrayOnIssue(joinPath(path, "on")));
    source = { ...token };
    delete source.on;
  }

  const normalized =
    ctx.levels === undefined
      ? normalizeToken(source, { path })
      : normalizeToken(source, { path, levels: ctx.levels });
  if (!normalized.ok) {
    const kind = isKind(token.kind)
      ? token.kind
      : isKind(source.kind)
        ? source.kind
        : undefined;
    for (const found of normalized.issues) absorb(found, path, kind, token, ctx.push);
  }

  checkRanges(token, path, ctx);
  checkExpert(token, path, ctx);
  if (typeof token.on === "string") checkOnTarget(token.on, path, selfId, ctx);
}

function absorb(
  found: NormalizeIssue,
  tokenPath: string,
  kind: Kind | undefined,
  raw: Record<string, unknown>,
  push: Ctx["push"],
): void {
  if (found.path === "levels" || found.path.startsWith("levels.")) return;
  const key = segment(found.path);
  if (found.message.startsWith("Unknown token option ") && isTokenV3Key(key)) {
    push(v3Issue(found.path, key));
    return;
  }
  if (found.message.startsWith("Unknown token option ")) {
    const suggestion = suggestName(key, TOKEN_FIELDS);
    push(
      issue({
        path: found.path,
        message: found.message,
        expected: TOKEN_FIELDS.join(", "),
        ...(suggestion !== undefined
          ? { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }
          : {
              hint: "Valid token fields are kind, scale, disabled, decorative, on, chroma, hue, lc, ratio, and nudge. disabled is set by disabled.<kind>(n). decorative is set by decorative.text/border/emphasis(n).",
            }),
      }),
    );
    return;
  }
  if (
    key === "lc" &&
    found.message === "Expected a finite number." &&
    typeof raw.lc === "string"
  ) {
    return;
  }
  push(enrich(found, tokenPath, kind));
}

function checkRanges(token: Record<string, unknown>, path: string, ctx: Ctx): void {
  if (typeof token.chroma === "number" && Number.isFinite(token.chroma)) {
    if (token.chroma < CHROMA_MIN || token.chroma > CHROMA_MAX) {
      ctx.push(
        rangeIssue(
          joinPath(path, "chroma"),
          "chroma",
          token.chroma,
          CHROMA_MIN,
          CHROMA_MAX,
          "chroma multiplies the palette color's chroma and runs from 0 to 2 (§2.4).",
        ),
      );
    }
  }
  if (typeof token.step === "number" && Number.isFinite(token.step)) {
    if (token.step < STEP_MIN || token.step > STEP_MAX) {
      ctx.push(
        rangeIssue(
          joinPath(path, "step"),
          "step",
          token.step,
          STEP_MIN,
          STEP_MAX,
          "step is a raw lightness step or a step offset. The spec publishes no bound; -12..12 covers the §5 ladder and expert counts.",
        ),
      );
    }
  }
}

function checkExpert(token: Record<string, unknown>, path: string, ctx: Ctx): void {
  if (present(token, "lc") && typeof token.lc !== "string") {
    if (ctx.algorithm !== "apca") {
      ctx.push(
        issue({
          path: joinPath(path, "lc"),
          message: 'lc is only valid when contrast.algorithm is "apca".',
          expected: 'a number, with contrast.algorithm "apca"',
          hint: 'This config uses "wcag2". Use ratio for a WCAG 2 target, or switch the algorithm to "apca".',
        }),
      );
    } else if (
      typeof token.lc === "number" &&
      Number.isFinite(token.lc) &&
      (token.lc < LC_MIN || token.lc > LC_MAX)
    ) {
      ctx.push(
        rangeIssue(
          joinPath(path, "lc"),
          "lc",
          token.lc,
          LC_MIN,
          LC_MAX,
          "APCA |Lc| targets run from 0 to 108.",
        ),
      );
    }
  }
  if (present(token, "ratio")) {
    if (ctx.algorithm !== "wcag2") {
      ctx.push(
        issue({
          path: joinPath(path, "ratio"),
          message: 'ratio is only valid when contrast.algorithm is "wcag2".',
          expected: 'a number, with contrast.algorithm "wcag2"',
          hint: ctx.algorithmExplicit
            ? `This config uses "${ctx.algorithm}". Use lc for an APCA target, or set contrast.algorithm to "wcag2".`
            : 'contrast.algorithm defaults to "apca". Use lc, or set the algorithm to "wcag2".',
        }),
      );
    } else if (
      typeof token.ratio === "number" &&
      Number.isFinite(token.ratio) &&
      (token.ratio < RATIO_MIN || token.ratio > RATIO_MAX)
    ) {
      ctx.push(
        rangeIssue(
          joinPath(path, "ratio"),
          "ratio",
          token.ratio,
          RATIO_MIN,
          RATIO_MAX,
          "WCAG 2 ratios run from 1 to 21.",
        ),
      );
    }
  }
}

function checkOnTarget(
  raw: string,
  tokenPath: string,
  selfId: string | undefined,
  ctx: Ctx,
): void {
  const path = joinPath(tokenPath, "on");
  const resolved = resolveBackdrop(raw, ctx.index);
  if (!resolved.ok) {
    ctx.push(backdropIssue(path, raw, resolved, ctx.index, "on"));
    return;
  }
  if (selfId !== undefined && resolved.id === selfId) {
    ctx.push(
      issue({
        path,
        message: `Token "${selfId}" cannot use itself as a backdrop.`,
        expected: "a different group or group.token",
        hint: "Point on at the backdrop this token sits on, not at the token itself.",
      }),
    );
    return;
  }
  // Tune overrides are checked for existence, but the backdrop graph is the
  // tokens as written. A cycle that appears only after `tune` is not reported.
  if (selfId === undefined || !tokenPath.startsWith("tokens.")) return;
  const node = ctx.nodes.get(selfId);
  if (node !== undefined) node.target = resolved.id;
}

type Backdrop =
  | { ok: true; id: string }
  | { ok: false; reason: "format" }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "no-default"; group: string };

function resolveBackdrop(raw: string, index: TokenIndex): Backdrop {
  if (!ON_RE.test(raw)) return { ok: false, reason: "format" };
  const dot = raw.indexOf(".");
  if (dot === -1) {
    if (!index.byGroup.has(raw)) return { ok: false, reason: "unknown" };
    if (groupDefault(index, raw) === undefined)
      return { ok: false, reason: "no-default", group: raw };
    return { ok: true, id: tokenId(raw, "DEFAULT") };
  }
  const group = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  const entries = index.byGroup.get(group);
  if (entries === undefined || !entries.some((entry) => entry.token === token)) {
    return { ok: false, reason: "unknown" };
  }
  return { ok: true, id: tokenId(group, token) };
}

function backdropIssue(
  path: string,
  raw: string,
  resolved: Exclude<Backdrop, { ok: true }>,
  index: TokenIndex,
  what: "on" | "exact",
): ConfigIssue {
  if (resolved.reason === "no-default") {
    return issue({
      path,
      message: `${what} "${raw}" needs ${resolved.group}.DEFAULT, and that token does not exist.`,
      expected: `${resolved.group}.DEFAULT, or a group.token path`,
      hint: `Add a DEFAULT token in "${resolved.group}", or point at a specific token.`,
    });
  }
  if (resolved.reason === "format") {
    const suggestion = suggestName(raw, targetCandidates(index));
    return issue({
      path,
      message: `${what} ${JSON.stringify(raw)} must be a group or a group.token path.`,
      expected: '"group" or "group.token"',
      ...(suggestion !== undefined
        ? {
            didYouMean: suggestion,
            hint: `Did you mean "${suggestion}"?`,
            fix: { path, replace: suggestion },
          }
        : { hint: "One backdrop string. A list is not allowed." }),
    });
  }
  const suggestion = suggestTarget(raw, index);
  return issue({
    path,
    message: `Unknown backdrop "${raw}".`,
    expected: 'a group or "group.token" in tokens',
    ...(suggestion !== undefined
      ? {
          didYouMean: suggestion,
          hint: `Did you mean "${suggestion}"?`,
          fix: { path, replace: suggestion },
        }
      : {
          hint: "Backdrop targets are group names or group.token paths in this config.",
        }),
  });
}

function checkCycles(nodes: Map<string, Node>, push: Ctx["push"]): void {
  const color = new Map<string, "visiting" | "done">();
  const visit = (id: string, stack: string[]): void => {
    const mark = color.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      const start = stack.indexOf(id);
      if (start === -1) return;
      const cycle = [...stack.slice(start), id];
      const origin = nodes.get(id);
      push(
        issue({
          path: origin?.onPath ?? id,
          message: `Backdrop cycle: ${cycle.join(" → ")}.`,
          expected: "on edges that do not form a cycle",
          hint: "Point each on at a backdrop that does not come back to this token.",
        }),
      );
      return;
    }
    color.set(id, "visiting");
    const target = nodes.get(id)?.target;
    if (target !== undefined && nodes.has(target)) visit(target, [...stack, id]);
    color.set(id, "done");
  };
  for (const id of nodes.keys()) {
    if (!color.has(id)) visit(id, []);
  }
}

function enrich(
  found: NormalizeIssue,
  tokenPath: string,
  kind: Kind | undefined,
): ConfigIssue {
  const levelPath = joinPath(tokenPath, "level");
  if (found.path === levelPath) return enrichLevel(found, tokenPath, kind);
  if (found.didYouMean !== undefined && found.path === joinPath(tokenPath, "kind")) {
    return issue({
      path: found.path,
      message: found.message,
      didYouMean: found.didYouMean,
      expected: KINDS.join(" | "),
      fix: { path: found.path, replace: found.didYouMean },
    });
  }
  if (found.didYouMean !== undefined && found.path === joinPath(tokenPath, "state")) {
    return issue({
      path: found.path,
      message: found.message,
      didYouMean: found.didYouMean,
      fix: { path: found.path, replace: found.didYouMean },
    });
  }
  return passThrough(found);
}

function enrichLevel(
  found: NormalizeIssue,
  tokenPath: string,
  kind: Kind | undefined,
): ConfigIssue {
  const stateConfused = found.message.includes("That's a state");
  const suggestion = found.didYouMean;
  const sentence = withPeriod(firstSentence(found.message));
  const expected = levelExpected(
    found.message,
    stateConfused &&
      kind !== undefined &&
      suggestion !== undefined &&
      stateApplies(suggestion, kind),
  );

  if (
    stateConfused &&
    suggestion !== undefined &&
    kind !== undefined &&
    stateApplies(suggestion, kind)
  ) {
    return issue({
      path: tokenPath,
      message: lowerFirst(sentence),
      ...(expected !== undefined ? { expected } : {}),
      hint: `Did you mean "${suggestion}"? That's a state: ${kind}({ state: '${suggestion}' })`,
      didYouMean: suggestion,
      fix: { path: tokenPath, replace: { kind, state: suggestion } },
    });
  }

  if (stateConfused && suggestion !== undefined && kind !== undefined) {
    return issue({
      path: found.path,
      message: sentence,
      didYouMean: suggestion,
      ...(expected !== undefined ? { expected } : {}),
      hint: `"${suggestion}" is a state, and it does not apply to ${kind}.`,
    });
  }

  if (suggestion !== undefined) {
    return issue({
      path: found.path,
      message: sentence,
      didYouMean: suggestion,
      ...(expected !== undefined ? { expected } : {}),
      hint: `Did you mean "${suggestion}"?`,
      fix: { path: found.path, replace: suggestion },
    });
  }

  return issue({
    path: found.path,
    message: sentence,
    ...(expected !== undefined ? { expected } : {}),
    hint: "Use a level name for this kind, or an ordinal 1–5.",
  });
}

function passThrough(found: NormalizeIssue): ConfigIssue {
  return issue({
    path: found.path,
    message: found.message,
    ...(found.didYouMean !== undefined ? { didYouMean: found.didYouMean } : {}),
  });
}

function buildIndex(tokens: unknown): TokenIndex {
  const index: TokenIndex = { tokens: [], byGroup: new Map() };
  if (!isPlainObject(tokens)) return index;
  for (const [group, value] of Object.entries(tokens)) {
    if (!isPlainObject(value)) continue;
    const entries: IndexedToken[] = [];
    for (const [token, body] of Object.entries(value)) {
      if (token.startsWith("$")) continue;
      const entry: IndexedToken = { group, token, hasState: false };
      if (isPlainObject(body) && isKind(body.kind)) entry.kind = body.kind;
      if (isPlainObject(body) && present(body, "state")) entry.hasState = true;
      entries.push(entry);
      index.tokens.push(entry);
    }
    index.byGroup.set(group, entries);
  }
  return index;
}

function buildNodes(index: TokenIndex): Map<string, Node> {
  const nodes = new Map<string, Node>();
  for (const entry of index.tokens) {
    const id = tokenId(entry.group, entry.token);
    nodes.set(id, {
      id,
      onPath: joinPath(joinPath(joinPath("tokens", entry.group), entry.token), "on"),
    });
  }
  return nodes;
}

function hasEmphasisRest(index: TokenIndex): boolean {
  return index.tokens.some((entry) => entry.kind === "emphasis" && !entry.hasState);
}

function groupDefault(index: TokenIndex, group: string): IndexedToken | undefined {
  return index.byGroup.get(group)?.find((entry) => entry.token === "DEFAULT");
}

function tuneSelfId(key: string, index: TokenIndex): string | undefined {
  if (!TUNE_RE.test(key)) return undefined;
  const dot = key.indexOf(".");
  if (dot === -1) {
    return groupDefault(index, key) === undefined ? undefined : tokenId(key, "DEFAULT");
  }
  const group = key.slice(0, dot);
  const rest = key.slice(dot + 1);
  if (rest === "*") return undefined;
  return tokenId(group, rest);
}

function tuneKinds(key: string, index: TokenIndex): Kind[] {
  if (!TUNE_RE.test(key)) return [];
  const dot = key.indexOf(".");
  const group = dot === -1 ? key : key.slice(0, dot);
  const rest = dot === -1 ? "DEFAULT" : key.slice(dot + 1);
  const entries = index.byGroup.get(group);
  if (entries === undefined) return [];
  const relevant =
    rest === "*" ? entries : entries.filter((entry) => entry.token === rest);
  const kinds: Kind[] = [];
  for (const entry of relevant) {
    if (entry.kind !== undefined && !kinds.includes(entry.kind)) kinds.push(entry.kind);
  }
  return kinds;
}

function suggestTarget(raw: string, index: TokenIndex): string | undefined {
  const dot = raw.indexOf(".");
  if (dot === -1) return suggestName(raw, [...index.byGroup.keys()]);
  const group = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  const entries = index.byGroup.get(group);
  if (entries !== undefined) {
    const suggested = suggestName(
      token,
      entries.map((entry) => entry.token),
    );
    if (suggested !== undefined) return `${group}.${suggested}`;
    return undefined;
  }
  return suggestName(raw, targetCandidates(index));
}

function targetCandidates(index: TokenIndex): string[] {
  const candidates: string[] = [];
  for (const [group, entries] of index.byGroup) {
    candidates.push(group);
    for (const entry of entries) candidates.push(tokenId(group, entry.token));
  }
  return candidates;
}

function looksLikeV3Variant(value: Record<string, unknown>): boolean {
  if (Object.prototype.hasOwnProperty.call(value, "kind")) return false;
  return Object.keys(value).some(
    (key) => key === "lc" || key === "ls" || key.startsWith("$"),
  );
}

function reportV3Variant(
  value: Record<string, unknown>,
  path: string,
  push: Ctx["push"],
): void {
  for (const key of Object.keys(value)) {
    const keyPath = joinPath(path, key);
    if (key === "lc" || key === "ls" || key.startsWith("$") || isTokenV3Key(key)) {
      push(dollarIssue(keyPath, key));
      continue;
    }
  }
}

function isTokenV3Key(key: string): boolean {
  return key === "ls" || key.startsWith("$");
}

function tailwindUtility(group: string, token: string): string | undefined {
  const prefix = group.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TAILWIND_UTILITY_PREFIXES, prefix))
    return undefined;
  const words = TAILWIND_KEYWORDS[prefix];
  if (words === undefined) return undefined;
  const hit = words.find((word) => word === token.toLowerCase());
  return hit === undefined ? undefined : `${prefix}-${hit}`;
}

function stateApplies(state: string, kind: Kind): boolean {
  if (!(ATOMIC_STATES as readonly string[]).includes(state)) return false;
  return (STATE_APPLIES_TO[state as CanonicalState] as readonly Kind[]).includes(kind);
}

function tokenId(group: string, token: string): string {
  return `${group}.${token}`;
}

function segment(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? path : path.slice(dot + 1);
}

function present(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function firstSentence(message: string): string {
  return message.split(". ")[0] ?? message;
}

function withPeriod(sentence: string): string {
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function lowerFirst(value: string): string {
  if (value === "") return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function levelExpected(
  message: string,
  dropTrailingDefault: boolean,
): string | undefined {
  const match = /Valid levels: .+$/.exec(message);
  if (match === null) return undefined;
  let text = match[0];
  if (text.endsWith(".")) text = text.slice(0, -1);
  if (dropTrailingDefault) text = text.replace(/, default(?= \(or )/, "");
  return text;
}

function checkColorString(value: string, path: string, push: Ctx["push"]): void {
  if (value.trim() !== "") return;
  push(
    issue({
      path,
      message: "Expected a CSS color.",
      expected: "a non-empty color string",
      hint: "Any CSS color. Gamut mapping is reported by the engine, not here.",
    }),
  );
}

function badName(path: string, name: string, what: string): ConfigIssue {
  return issue({
    path,
    message: `${what} "${name}" must match /^[a-zA-Z][a-zA-Z0-9_-]*$/.`,
    expected: 'a letter, then letters, digits, "_" or "-"',
    hint: "Names become CSS identifiers. DEFAULT is allowed.",
  });
}

function nameConflict(group: string, token: string, utility: string): ConfigIssue {
  return issue({
    path: joinPath(joinPath("tokens", group), token),
    code: "name-conflict",
    message: `Token "${token}" in group "${group}" collides with the Tailwind utility "${utility}".`,
    expected: "a token name that is not a Tailwind keyword for this prefix",
    hint: `Rename "${token}" so the shortcut does not replace Tailwind's ${utility}.`,
  });
}

function arrayOnIssue(path: string): ConfigIssue {
  return issue({
    path,
    message: '`on` must be a single string ("group" or "group.token"), not an array.',
    expected: 'a string: "group" or "group.token"',
    hint: "Point at the hardest backdrop. The hardest target dominates the result, so a list only adds solve cost.",
  });
}

function rangeIssue(
  path: string,
  key: string,
  value: number,
  min: number,
  max: number,
  hint: string,
): ConfigIssue {
  return issue({
    path,
    message: `${key} ${value} is outside ${min}..${max}.`,
    expected: `a number from ${min} to ${max}`,
    hint,
  });
}

function enumIssue(
  path: string,
  value: unknown,
  allowed: readonly string[],
  label: string,
): ConfigIssue {
  const rendered = renderValue(value);
  const suggestion = typeof value === "string" ? suggestName(value, allowed) : undefined;
  return issue({
    path,
    message: `${label} ${rendered} is not valid.`,
    expected: allowed.join(" | "),
    ...(suggestion !== undefined
      ? {
          didYouMean: suggestion,
          hint: `Did you mean "${suggestion}"?`,
          fix: { path, replace: suggestion },
        }
      : { hint: `Expected one of ${allowed.join(", ")}.` }),
  });
}

function unknownKey(path: string, key: string, allowed: readonly string[]): ConfigIssue {
  if (Object.prototype.hasOwnProperty.call(V3_MIGRATIONS, key)) return v3Issue(path, key);
  const suggestion = suggestName(key, allowed);
  return issue({
    path,
    message: `Unknown key "${key}".`,
    expected: allowed.join(", "),
    ...(suggestion !== undefined
      ? { didYouMean: suggestion, hint: `Did you mean "${suggestion}"?` }
      : { hint: `Valid keys: ${allowed.join(", ")}.` }),
  });
}

function v3Issue(path: string, key: string): ConfigIssue {
  const migration = V3_MIGRATIONS[key];
  return issue({
    path,
    code: "v3-config",
    message: `"${key}" is a v3 config key.`,
    expected: migration?.expected ?? "a v4 config",
    hint: `${MIGRATION_HINT} ${migration?.detail ?? "Settings from v3 moved; see the table."}`,
  });
}

function dollarIssue(path: string, key: string): ConfigIssue {
  if (
    Object.prototype.hasOwnProperty.call(V3_MIGRATIONS, key) ||
    key === "lc" ||
    key === "ls"
  ) {
    return v3Issue(path, key);
  }
  return issue({
    path,
    code: "v3-config",
    message: `"${key}" is not a v4 key.`,
    expected: "a token option",
    hint: `${MIGRATION_HINT} Settings that started with $ moved onto the token.`,
  });
}

function v3ArrayIssue(): ConfigIssue {
  return issue({
    path: "",
    code: "v3-config",
    message: "A v3 config array is a list of themes.",
    expected: "one config object with a themes map",
    hint: `${MIGRATION_HINT} Themes share palette and tokens; put each theme under themes.`,
  });
}

function renderValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "symbol") return value.toString();
  return Object.prototype.toString.call(value);
}

function issue(fields: {
  path: string;
  message: string;
  expected?: string;
  hint?: string;
  didYouMean?: string;
  fix?: ConfigFix;
  code?: ConfigIssue["code"];
}): ConfigIssue {
  const result: ConfigIssue = { path: fields.path, message: fields.message };
  if (fields.expected !== undefined) result.expected = fields.expected;
  if (fields.hint !== undefined) result.hint = fields.hint;
  if (fields.didYouMean !== undefined) result.didYouMean = fields.didYouMean;
  if (fields.fix !== undefined) result.fix = fields.fix;
  if (fields.code !== undefined) result.code = fields.code;
  return result;
}
