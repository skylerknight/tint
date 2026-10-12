/**
 * Generate the v4 config JSON Schema (draft 2020-12).
 *
 * Enums are read from `src/v4` (kinds, level names, `CANONICAL_STATES`,
 * contrast algorithms and shifts, output formats) so the published schema
 * cannot drift from those sources. Run: `pnpm --filter @skylerknight/tint schema`.
 *
 * Spec: docs/v4-spec.md §2–§4, §7, §8. The document id is the file
 * published with the package on unpkg.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import {
  GLOBAL_CONTRAST_SHIFT,
  MAX_ORDINAL,
  MIN_ORDINAL,
  TOKEN_CONTRAST_SHIFT,
} from "../src/v4/constants.js";
import { DEFAULT_LEVEL_NAMES, KINDS } from "../src/v4/levels.js";
import { HUE_SHIFT_PATTERN } from "../src/v4/normalize.js";
import {
  ATOMIC_STATES,
  CANONICAL_STATES,
  STATE_ALIASES,
  canonicalStatesFor,
} from "../src/v4/states.js";
import { CONTRAST_ALGORITHMS } from "../src/v4/targets.js";
import {
  COLOR_FORMATS,
  DIRECTIONS,
  MODES,
  OUTPUT_FORMATS,
  PRESETS,
} from "../src/v4/types.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  ContrastNudge,
  Kind,
} from "../src/v4/types.js";

/**
 * Group and token names (§2.4). Not exported from `src/v4`; the spec writes
 * this expression once. Palette names are CSS identifiers, not this pattern.
 */
const NAME = "[a-zA-Z][a-zA-Z0-9_-]*";
const NAME_PATTERN = `^${NAME}$`;
/** `on`: `group` or `group.token` (§6.2). */
const ON_PATTERN = `^${NAME}(?:\\.${NAME})?$`;
/** `exact` string form: `group.token` (§2.2). */
const EXACT_PATTERN = `^${NAME}\\.${NAME}$`;
/** `tune` keys: `group`, `group.token`, or `group.*` (§2.2). */
const TUNE_PATTERN = `^${NAME}(?:\\.(?:\\*|${NAME}))?$`;
/**
 * CSS `<ident>` without escapes. Palette color names must be CSS identifiers
 * (§2.2); the spec does not give a regular expression.
 */
const CSS_IDENT =
  "^-?(?:[A-Za-z_]|[^\\u0000-\\u007F])(?:[A-Za-z0-9_-]|[^\\u0000-\\u007F])*$";

const SCHEMA_URL = "https://unpkg.com/@skylerknight/tint/schema/v4.json";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

// Values and types live in different modules. A new member on only one side
// fails `tsc` rather than shipping a schema that has drifted.
const _kinds: AssertEqual<(typeof KINDS)[number], Kind> = true;
const _algorithms: AssertEqual<(typeof CONTRAST_ALGORITHMS)[number], ContrastAlgorithm> =
  true;
const _levels: AssertEqual<keyof typeof GLOBAL_CONTRAST_SHIFT, ContrastLevel> = true;
const _nudges: AssertEqual<keyof typeof TOKEN_CONTRAST_SHIFT, ContrastNudge> = true;
void _kinds;
void _algorithms;
void _levels;
void _nudges;

interface Schema {
  $schema?: string;
  $id?: string;
  $comment?: string;
  $ref?: string;
  $defs?: Record<string, Schema>;
  title?: string;
  description?: string;
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  const?: string;
  enum?: readonly (string | number)[];
  properties?: Record<string, Schema>;
  patternProperties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: Schema;
  minProperties?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  pattern?: string;
  anyOf?: readonly Schema[];
  allOf?: readonly Schema[];
  if?: Schema;
  then?: Schema;
  not?: Schema;
}

function enumKeys<T extends Record<string, number>>(record: T): (keyof T & string)[] {
  return Object.keys(record) as (keyof T & string)[];
}

const CONTRAST_LEVELS = enumKeys(GLOBAL_CONTRAST_SHIFT);
const CONTRAST_NUDGES = enumKeys(TOKEN_CONTRAST_SHIFT);

function ordinalStrings(): string[] {
  const out: string[] = [];
  for (let n = MIN_ORDINAL; n <= MAX_ORDINAL; n += 1) out.push(String(n));
  return out;
}

/** Alias keys: not empty, not `$…`, not the ordinal strings `"1"`–`"5"`. */
function levelAliasPattern(): string {
  return `^(?!\\$)(?!(?:${ordinalStrings().join("|")})$).+$`;
}

/**
 * Input spellings for `state`. `CANONICAL_STATES` is the normalized list;
 * `STATE_ALIASES` (`active` → `pressed`) is expanded in place so
 * `selected-active` is accepted and `active-selected` is not.
 */
function expandAliases(states: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (state: string): void => {
    if (seen.has(state)) return;
    seen.add(state);
    out.push(state);
  };
  const aliases = Object.entries(STATE_ALIASES);
  for (const state of states) push(state);
  for (const state of states) {
    const parts = state.split("-");
    for (const [alias, canonical] of aliases) {
      if (!parts.includes(canonical)) continue;
      push(parts.map((part) => (part === canonical ? alias : part)).join("-"));
    }
  }
  return out;
}

function builtinLevels(): string {
  return KINDS.map((kind) => {
    const names = Object.entries(DEFAULT_LEVEL_NAMES[kind])
      .map(([name, ordinal]) => `${name} (${ordinal})`)
      .join(", ");
    return `${kind}: ${names}`;
  }).join("; ");
}

function levelSchema(): Schema {
  return {
    description:
      'Ordinal 1–5, the strings "1"–"5", or a level name (§2.4, §2.5, §3). ' +
      "Custom aliases from `levels` are accepted, including names kept after `$replace`, " +
      "so this is not a closed per-kind enum. Built-in names: " +
      builtinLevels() +
      ".",
    anyOf: [
      { type: "integer", minimum: MIN_ORDINAL, maximum: MAX_ORDINAL },
      { type: "string", enum: ordinalStrings() },
      { type: "string", minLength: 1, not: { pattern: "^[0-9]+$" } },
    ],
  };
}

function hueSchema(): Schema {
  return {
    description: "Absolute hue in degrees, or a + / - shift (§2.4).",
    anyOf: [{ type: "number" }, { type: "string", pattern: HUE_SHIFT_PATTERN.source }],
  };
}

function chromaSchema(): Schema {
  return {
    description:
      "Multiplier on the palette color's chroma, 0..2 inclusive (default 1; surfaces capped) (§2.4).",
    type: "number",
    minimum: 0,
    maximum: 2,
  };
}

function stateDescription(): string {
  return (
    "Interaction layered on the rest token (§4). " +
    "Enumerated from CANONICAL_STATES. `active` is an alias of `pressed` " +
    "and is accepted in the same position (`selected-active`, not `active-selected`)."
  );
}

function optionProperties(): Record<string, Schema> {
  return {
    on: {
      description: 'Single backdrop: "group" or "group.token" (§2.4, §6.2).',
      type: "string",
      pattern: ON_PATTERN,
    },
    contrast: {
      description: "Relative level nudge for this token only (§2.4, §5).",
      enum: CONTRAST_NUDGES,
    },
    direction: {
      description: "Force lighter or darker against the backdrop (§2.4).",
      enum: DIRECTIONS,
    },
    chroma: chromaSchema(),
    hue: hueSchema(),
    lc: {
      description:
        "Raw APCA target. Expert escape hatch; only with algorithm apca (§2.4).",
      type: "number",
    },
    ratio: {
      description:
        "Raw WCAG ratio. Expert escape hatch; only with algorithm wcag2 (§2.4).",
      type: "number",
    },
    step: {
      description: "Raw lightness steps (surface) or a step offset (other kinds) (§2.4).",
      type: "number",
    },
    nudge: {
      description: "`false` disables auto-nudge for this token (§2.4, §6.4).",
      type: "boolean",
    },
  };
}

function stateForKind(kind: Kind): Schema {
  return {
    if: {
      properties: { kind: { const: kind } },
      required: ["kind"],
    },
    then: {
      properties: {
        state: { enum: expandAliases(canonicalStatesFor(kind)) },
      },
    },
  };
}

function tokenSchema(): Schema {
  return {
    title: "Token",
    description:
      "A token's kind, plus an optional level and options (§2.4). " +
      "Names are kept as written.",
    type: "object",
    properties: {
      kind: {
        description: "What the token is (§2.4, §3).",
        enum: KINDS,
      },
      level: levelSchema(),
      state: {
        description:
          stateDescription() +
          " Which strings apply depends on `kind` (`checked` is emphasis and border only).",
      },
      ...optionProperties(),
    },
    required: ["kind"],
    additionalProperties: false,
    allOf: KINDS.map((kind) => stateForKind(kind)),
  };
}

function tokenOptionsSchema(): Schema {
  return {
    title: "TokenOptions",
    description:
      "Options merged onto a token by palette `tune` (§2.2). " +
      "A replacement token is a Token and includes `kind`. " +
      "The merged token's kind is not known here, so every input state spelling is allowed.",
    type: "object",
    properties: {
      state: {
        description: stateDescription(),
        enum: expandAliases(CANONICAL_STATES),
      },
      ...optionProperties(),
    },
    additionalProperties: false,
  };
}

function exactSchema(): Schema {
  return {
    description:
      "`true` snaps the first emphasis rest token to `color` when it passes. " +
      'A "group.token" path snaps that token (§2.2, §6.5).',
    anyOf: [{ type: "boolean" }, { type: "string", pattern: EXACT_PATTERN }],
  };
}

function tuneSchema(): Schema {
  return {
    description:
      "Per-palette-color overrides keyed by token path (§2.2). " +
      "A Token replaces the token. TokenOptions merge.",
    type: "object",
    patternProperties: {
      [TUNE_PATTERN]: {
        anyOf: [{ $ref: "#/$defs/token" }, { $ref: "#/$defs/tokenOptions" }],
      },
    },
    additionalProperties: false,
  };
}

function paletteColorProperties(): Record<string, Schema> {
  return {
    color: {
      description: "Any CSS color. Supplies hue and chroma; lightness is solved (§2.2).",
      type: "string",
      minLength: 1,
    },
    default: {
      description:
        "Make this the unprefixed palette. Otherwise the first palette color is.",
      type: "boolean",
    },
    exact: exactSchema(),
    tune: tuneSchema(),
  };
}

function stateCountProperties(): Record<string, Schema> {
  const properties: Record<string, Schema> = {};
  for (const state of ATOMIC_STATES) {
    properties[state] = {
      description: `How many steps \`${state}\` moves from the rest token (§4).`,
      type: "number",
    };
  }
  for (const alias of Object.keys(STATE_ALIASES)) {
    const canonical = STATE_ALIASES[alias as keyof typeof STATE_ALIASES];
    properties[alias] = {
      description: `Step count for the \`${alias}\` alias of \`${canonical}\` (§4).`,
      type: "number",
    };
  }
  return properties;
}

function themeSchema(): Schema {
  const mode: Schema = { enum: MODES };
  const extendsTheme: Schema = {
    description: "Inherit another theme's options.",
    type: "string",
    minLength: 1,
  };
  return {
    title: "ThemeOptions",
    description:
      "Theme options (§2.3). `mode` may be omitted when `extends` names another theme.",
    type: "object",
    properties: {
      mode,
      selector: {
        description: "Default `:root`.",
        type: "string",
      },
      media: {
        description:
          "`true` means `prefers-color-scheme` matching `mode`. A string is a custom media query.",
        anyOf: [{ type: "boolean" }, { type: "string" }],
      },
      contrast: { $ref: "#/$defs/themeContrast" },
      palette: {
        description: "Per-theme palette deltas. A string replaces `color` (§2.3).",
        type: "object",
        patternProperties: {
          [CSS_IDENT]: {
            anyOf: [
              { type: "string", minLength: 1 },
              { $ref: "#/$defs/paletteColorDelta" },
            ],
          },
        },
        additionalProperties: false,
      },
      extends: extendsTheme,
    },
    additionalProperties: false,
    // Each branch repeats the property so Ajv's strictRequired check can see it.
    anyOf: [
      { required: ["mode"], properties: { mode } },
      { required: ["extends"], properties: { extends: extendsTheme } },
    ],
  };
}

function contrastSchema(): Schema {
  return {
    title: "ContrastOptions",
    description: "Which contrast table to use, and how far to shift it (§2.1, §5).",
    type: "object",
    properties: {
      algorithm: {
        description: "Default `apca`.",
        enum: CONTRAST_ALGORITHMS,
      },
      level: {
        description:
          "Default `standard` (shift 0). `more` / `max` shift by +1 / +2, capped at 5.",
        enum: CONTRAST_LEVELS,
      },
    },
    additionalProperties: false,
  };
}

function themeContrastSchema(): Schema {
  return {
    title: "ThemeContrastOptions",
    description: "A theme may override the contrast level, not the algorithm (§2.3).",
    type: "object",
    properties: {
      level: { enum: CONTRAST_LEVELS },
    },
    additionalProperties: false,
  };
}

export function buildSchema(): Schema {
  const levelNames: Record<string, Schema> = {};
  const stateSteps: Record<string, Schema> = {};
  for (const kind of KINDS) {
    levelNames[kind] = { $ref: "#/$defs/kindLevelNames" };
    stateSteps[kind] = {
      $ref: kind === "surface" ? "#/$defs/surfaceStateSteps" : "#/$defs/stateStepCounts",
    };
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCHEMA_URL,
    $comment:
      "Generated from packages/tint/src/v4 by scripts/build-schema.ts. Do not edit by hand.",
    title: "tint v4 config",
    description:
      "JSON form of a tint v4 config (docs/v4-spec.md §2). " +
      "Kind functions return this data. `$schema` may be set on a JSON config (§7, §8).",
    type: "object",
    properties: {
      $schema: {
        description: `Optional document pointer. Canonical URL: ${SCHEMA_URL}.`,
        type: "string",
        minLength: 1,
      },
      contrast: { $ref: "#/$defs/contrast" },
      palette: {
        description:
          "Named palette colors (§2.2). At least one. " +
          "Names are CSS identifiers (escapes are not accepted). " +
          "The first entry is the default palette unless `default` is set.",
        type: "object",
        minProperties: 1,
        patternProperties: {
          [CSS_IDENT]: {
            description: "A CSS color, or a palette color object (§2.2).",
            anyOf: [{ type: "string", minLength: 1 }, { $ref: "#/$defs/paletteColor" }],
          },
        },
        additionalProperties: false,
      },
      themes: {
        description:
          'Theme map (§2.3). Default when omitted: `{ light: { mode: "light" } }`. ' +
          "`mode` is required unless `extends` is set.",
        type: "object",
        patternProperties: {
          "^.+$": { $ref: "#/$defs/theme" },
        },
        additionalProperties: false,
      },
      levels: {
        description:
          "Rename or add level aliases per kind (§2.5). Built-in names stay unless `$replace`.",
        type: "object",
        properties: levelNames,
        additionalProperties: false,
      },
      states: {
        description: "Per-kind state step overrides (§2, §4).",
        type: "object",
        properties: stateSteps,
        additionalProperties: false,
      },
      preset: {
        description: "Built-in vocabulary (§2, §9).",
        enum: PRESETS,
      },
      tokens: {
        description:
          "Groups of tokens (§2.4). Groups contain only tokens. " +
          `Group and token names match ${NAME_PATTERN}.`,
        type: "object",
        patternProperties: {
          [NAME_PATTERN]: {
            type: "object",
            patternProperties: {
              [NAME_PATTERN]: { $ref: "#/$defs/token" },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      output: { $ref: "#/$defs/output" },
    },
    required: ["palette", "tokens"],
    additionalProperties: false,
    $defs: {
      contrast: contrastSchema(),
      themeContrast: themeContrastSchema(),
      paletteColor: {
        title: "PaletteColor",
        type: "object",
        properties: paletteColorProperties(),
        required: ["color"],
        additionalProperties: false,
      },
      paletteColorDelta: {
        title: "PaletteColorDelta",
        description: "Per-theme palette delta. Every field is optional (§2.3).",
        type: "object",
        properties: paletteColorProperties(),
        additionalProperties: false,
      },
      token: tokenSchema(),
      tokenOptions: tokenOptionsSchema(),
      kindLevelNames: {
        title: "KindLevelNames",
        description:
          "Aliases for one kind (§2.5). Values are ordinals 1–5. " +
          "`$replace: true` drops the built-in names, including `default`.",
        type: "object",
        properties: {
          $replace: { type: "boolean" },
        },
        patternProperties: {
          [levelAliasPattern()]: {
            type: "integer",
            minimum: MIN_ORDINAL,
            maximum: MAX_ORDINAL,
          },
        },
        additionalProperties: false,
      },
      stateStepCounts: {
        title: "StateStepCounts",
        description: "Per-state step counts (§4). `active` is an alias of `pressed`.",
        type: "object",
        properties: stateCountProperties(),
        additionalProperties: false,
      },
      surfaceStateSteps: {
        title: "SurfaceStateSteps",
        description:
          "Surface step counts, plus the OKLCH lightness size of one step (§4).",
        type: "object",
        properties: {
          ...stateCountProperties(),
          step: {
            type: "object",
            properties: {
              light: { type: "number" },
              dark: { type: "number" },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      theme: themeSchema(),
      output: {
        title: "OutputOptions",
        type: "object",
        properties: {
          path: {
            description: "Output directory for `tint build`.",
            type: "string",
          },
          formats: {
            description: "File formats (§2, §7).",
            type: "array",
            items: { enum: OUTPUT_FORMATS },
          },
          format: {
            description:
              "Emitted color notation. Default `oklch`. Internal math stays OKLCH (§7).",
            enum: COLOR_FORMATS,
          },
        },
        additionalProperties: false,
      },
    },
  };
}

/**
 * Canonical file contents. Key order follows the generator. Prettier's JSON
 * layout is applied so `prettier --check` and this text stay the same.
 */
export async function schemaText(): Promise<string> {
  const raw = `${JSON.stringify(buildSchema(), null, 2)}\n`;
  const config = await prettier.resolveConfig(schemaPath);
  return prettier.format(raw, {
    ...config,
    filepath: schemaPath,
    parser: "json",
  });
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const schemaPath = join(scriptDir, "../schema/v4.json");

if (basename(process.argv[1] ?? "") === "build-schema.ts") {
  mkdirSync(dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, await schemaText(), "utf8");
}
