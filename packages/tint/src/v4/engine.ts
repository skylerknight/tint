/**
 * v4 palette generation (docs/v4-spec.md §4, §5, §6.2).
 *
 * One {@link GenerationResultV4} per theme. Inside a theme, each palette
 * color is solved in backdrop order. Contrast targets are solved against the
 * backdrop host (one color). Worst-case sets are a follow-up. Auto-nudge
 * (§6.4) and `exact` (§6.5) are later steps.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { rgbToOKLCH } from "../color/convert.js";
import { oklchToRGBGamut, toGamut } from "../color/gamut.js";
import { parseColor, rgbToHex } from "../color/parse.js";
import type { Metric, Polarity } from "../contrast/types.js";
import { apcaMetric, solveContrast, wcag2Metric } from "../contrast/solve.js";
import { maxChromaForLs } from "../engine/generate.js";
import { ConfigError } from "./errors.js";
import { PAGE, type ResolvedToken } from "./graph.js";
import {
  lowerToken,
  pageLightness,
  realizeLightness,
  surfaceStepSize,
  type SolverIntent,
} from "./lower.js";
import { resolveConfig, type ResolvedExpansion, type ResolvedTheme } from "./resolve.js";
import type { CanonicalState } from "./states.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  Kind,
  LevelOrdinal,
  Mode,
  StateSteps,
} from "./types.js";
import { assertConfig } from "./validate.js";

export interface GeneratedColorV4 {
  readonly hex: string;
  readonly rgb: RGB;
  readonly oklch: OKLCH;
}

export interface SolvedTokenV4 {
  readonly id: string;
  readonly group: string;
  readonly name: string;
  readonly generated: boolean;
  readonly kind: Kind;
  readonly ordinal: LevelOrdinal;
  readonly states: readonly CanonicalState[];
  /** Backdrop ids in graph order. {@link PAGE} is the theme page. */
  readonly backdrop: readonly string[];
  readonly color: GeneratedColorV4;
  readonly mode: SolverIntent["mode"];
  /** Metric target for `contrast`. For `max`, the worst-case extreme. */
  readonly target?: number;
  /** Minimum metric value across the backdrop set. */
  readonly achieved: number;
  readonly polarity?: Polarity;
  /** Backdrop id with the lowest achieved measure. */
  readonly worst?: string;
  readonly reached?: boolean;
}

export interface PaletteResultV4 {
  readonly name: string;
  readonly isDefault: boolean;
  readonly seed: GeneratedColorV4;
  readonly page: GeneratedColorV4;
  /** Authored tokens in config order, then generated rests. */
  readonly tokens: readonly SolvedTokenV4[];
}

export interface EngineDiagnosticV4 {
  readonly severity: "warning";
  readonly code: "contrast-unreachable";
  readonly path: string;
  readonly message: string;
  readonly hint: string;
  readonly theme: string;
  readonly palette: string;
  readonly data: {
    readonly target: number;
    readonly achieved: number;
    readonly polarity: Polarity;
    readonly worst: string;
  };
}

export interface GenerationResultV4 {
  readonly name: string;
  readonly mode: Mode;
  readonly selector: string;
  readonly media?: boolean | string;
  readonly algorithm: ContrastAlgorithm;
  readonly contrastLevel: ContrastLevel;
  readonly palettes: readonly PaletteResultV4[];
  readonly diagnostics: readonly EngineDiagnosticV4[];
}

/**
 * Generate one result per theme.
 *
 * Throws {@link ConfigError} when validation or backdrop resolution fails.
 * Identical configs produce byte-identical JSON.
 */
export function generateV4(input: unknown): GenerationResultV4[] {
  const config = assertConfig(input);
  const resolved = resolveConfig(config);
  if (!resolved.ok) throw new ConfigError(resolved.issues);

  const algorithm = resolved.config.algorithm;
  const metric = algorithm === "wcag2" ? wcag2Metric : apcaMetric;
  const results: GenerationResultV4[] = [];

  for (const theme of resolved.config.themes) {
    const palettes: PaletteResultV4[] = [];
    const diagnostics: EngineDiagnosticV4[] = [];
    for (const expansion of resolved.config.expansions) {
      if (expansion.theme !== theme.name) continue;
      palettes.push(
        solvePalette(expansion, theme, algorithm, metric, config.states, diagnostics),
      );
    }
    results.push(themeResult(theme, algorithm, palettes, diagnostics));
  }
  return results;
}

function themeResult(
  theme: ResolvedTheme,
  algorithm: ContrastAlgorithm,
  palettes: readonly PaletteResultV4[],
  diagnostics: readonly EngineDiagnosticV4[],
): GenerationResultV4 {
  const result: GenerationResultV4 = {
    name: theme.name,
    mode: theme.mode,
    selector: theme.selector,
    algorithm,
    contrastLevel: theme.contrastLevel,
    palettes,
    diagnostics,
  };
  if (theme.media !== undefined) return { ...result, media: theme.media };
  return result;
}

function solvePalette(
  expansion: ResolvedExpansion,
  theme: ResolvedTheme,
  algorithm: ContrastAlgorithm,
  metric: Metric,
  states: StateSteps | undefined,
  diagnostics: EngineDiagnosticV4[],
): PaletteResultV4 {
  const seed = publish(rgbToOKLCH(parseColor(expansion.color)));
  const step = surfaceStepSize(theme.mode, states);
  const page = publish({
    l: pageLightness(theme.mode, step),
    c: Math.min(seed.oklch.c, maxChromaForLs(0)),
    h: seed.oklch.h,
  });

  const colors = new Map<string, GeneratedColorV4>([[PAGE, page]]);
  const solved = new Map<string, SolvedTokenV4>();
  const nodes = [...expansion.tokens, ...expansion.generated];
  const byId = new Map(nodes.map((token) => [token.id, token]));
  const ctx = {
    algorithm,
    contrastLevel: expansion.contrastLevel,
    seed: seed.oklch,
    surfaceStep: step,
    ...(states !== undefined ? { states } : {}),
  };

  for (const id of expansion.order) {
    const token = byId.get(id);
    if (token === undefined) continue;
    const intent = lowerToken(token.value, ctx, !token.generated);
    const row = realize(token, intent, colors, metric);
    colors.set(token.id, row.color);
    solved.set(token.id, row);
    if (intent.mode === "contrast" && intent.report && row.reached === false) {
      diagnostics.push(
        unreachable(theme.name, expansion.palette, algorithm, row, intent.direction),
      );
    }
  }

  const tokens: SolvedTokenV4[] = [];
  for (const token of nodes) {
    const row = solved.get(token.id);
    if (row !== undefined) tokens.push(row);
  }

  return {
    name: expansion.palette,
    isDefault: expansion.isDefault,
    seed,
    page,
    tokens,
  };
}

function realize(
  token: ResolvedToken,
  intent: SolverIntent,
  colors: ReadonlyMap<string, GeneratedColorV4>,
  metric: Metric,
): SolvedTokenV4 {
  const backs = token.backdrop.length === 0 ? [PAGE] : token.backdrop;
  const background = backs.map((id) => colorAt(colors, id));
  const rgbs = background.map((color) => color.rgb);

  if (intent.mode === "lightness") {
    const host = colorAt(colors, hostId(token));
    const lightness = realizeLightness(intent, host.oklch.l, host.oklch.l, host.rgb);
    const color = publish({ l: lightness, c: intent.seed.c, h: intent.seed.h });
    const across = minContrast(metric, color.rgb, rgbs);
    const worst = backs[across.index];
    return finish(token, intent.mode, color, across.min, {
      ...(worst !== undefined ? { worst } : {}),
      ...sideOf(color.oklch.l, host.oklch.l, intent.direction),
    });
  }

  // One backdrop: the `on` host, or the only member when `on` is omitted.
  const hostKey = hostId(token);
  const host = colorAt(colors, hostKey);
  const target = intent.mode === "max" ? Number.POSITIVE_INFINITY : intent.target;
  const solved = solveOne(intent.seed, host.rgb, target, metric, intent.direction);
  const color = publish(solved.color);
  const achieved = metric.measure(color.rgb, host.rgb);
  const reached = intent.mode === "max" ? true : achieved + 1e-6 >= intent.target;
  return finish(token, intent.mode, color, achieved, {
    target: intent.mode === "max" ? achieved : intent.target,
    polarity: solved.polarity,
    reached,
    worst: hostKey,
  });
}

/**
 * Solve against one backdrop. Polarity maximizes contrast at the extreme.
 * A locked `direction` does not fall back to the other side (§6.2).
 */
function solveOne(
  seed: OKLCH,
  background: RGB,
  target: number,
  metric: Metric,
  direction: Polarity | undefined,
): { color: OKLCH; polarity: Polarity } {
  const polarity = direction ?? polarityFor(seed, background, metric);
  let solved = solveContrast(seed, background, target, { polarity, metric });
  if (!solved.reached && direction === undefined) {
    const opposite: Polarity = polarity === "darker" ? "lighter" : "darker";
    const alternative = solveContrast(seed, background, target, {
      polarity: opposite,
      metric,
    });
    if (alternative.reached || alternative.lc > solved.lc) {
      return { color: alternative.color, polarity: opposite };
    }
  }
  return { color: solved.color, polarity };
}

function polarityFor(seed: OKLCH, background: RGB, metric: Metric): Polarity {
  const darker = solveContrast(seed, background, Number.POSITIVE_INFINITY, {
    polarity: "darker",
    metric,
  }).lc;
  const lighter = solveContrast(seed, background, Number.POSITIVE_INFINITY, {
    polarity: "lighter",
    metric,
  }).lc;
  return darker >= lighter ? "darker" : "lighter";
}

function finish(
  token: ResolvedToken,
  mode: SolverIntent["mode"],
  color: GeneratedColorV4,
  achieved: number,
  extra: {
    target?: number;
    polarity?: Polarity;
    worst?: string;
    reached?: boolean;
  },
): SolvedTokenV4 {
  return {
    id: token.id,
    group: token.group,
    name: token.name,
    generated: token.generated,
    kind: token.value.kind,
    ordinal: token.value.ordinal,
    states: token.value.states,
    backdrop: token.backdrop,
    color,
    mode,
    achieved,
    ...(extra.target !== undefined ? { target: extra.target } : {}),
    ...(extra.polarity !== undefined ? { polarity: extra.polarity } : {}),
    ...(extra.worst !== undefined ? { worst: extra.worst } : {}),
    ...(extra.reached !== undefined ? { reached: extra.reached } : {}),
  };
}

function sideOf(
  lightness: number,
  backdropL: number,
  direction: Polarity | undefined,
): { polarity?: Polarity } {
  if (direction !== undefined) return { polarity: direction };
  if (lightness > backdropL + 1e-6) return { polarity: "lighter" };
  if (lightness < backdropL - 1e-6) return { polarity: "darker" };
  return {};
}

function hostId(token: ResolvedToken): string {
  const on = token.value.on;
  if (on === undefined) {
    return token.value.kind === "surface" ? PAGE : (token.backdrop[0] ?? PAGE);
  }
  return on.includes(".") ? on : `${on}.DEFAULT`;
}

function unreachable(
  theme: string,
  palette: string,
  algorithm: ContrastAlgorithm,
  token: SolvedTokenV4,
  direction: Polarity | undefined,
): EngineDiagnosticV4 {
  const unit = algorithm === "apca" ? "Lc" : "ratio";
  const target = token.target ?? 0;
  const achieved = token.achieved;
  const shown = achieved.toFixed(1);
  const worst = token.worst ?? PAGE;
  const polarity = token.polarity ?? direction ?? "darker";
  const hint =
    direction !== undefined
      ? `direction "${direction}" keeps the ${polarity} side, which reaches at most ${unit} ${shown} against "${worst}".`
      : `The best contrast against "${worst}" is ${unit} ${shown} on the ${polarity} side.`;
  return {
    severity: "warning",
    code: "contrast-unreachable",
    path: `${palette}.${token.id}`,
    theme,
    palette,
    message: `${palette}.${token.id} requests ${unit} ${target} but only ${unit} ${shown} is achievable against ${worst}.`,
    hint,
    data: { target, achieved, polarity, worst },
  };
}

function minContrast(
  metric: Metric,
  foreground: RGB,
  backgrounds: readonly RGB[],
): { min: number; index: number } {
  let min = Number.POSITIVE_INFINITY;
  let index = 0;
  for (let i = 0; i < backgrounds.length; i++) {
    const background = backgrounds[i];
    if (background === undefined) continue;
    const value = metric.measure(foreground, background);
    if (value < min) {
      min = value;
      index = i;
    }
  }
  return { min, index };
}

function colorAt(
  colors: ReadonlyMap<string, GeneratedColorV4>,
  id: string,
): GeneratedColorV4 {
  const color = colors.get(id);
  if (color === undefined) {
    throw new Error(`Internal error: "${id}" was not solved before its dependent.`);
  }
  return color;
}

function publish(color: OKLCH): GeneratedColorV4 {
  const mapped = toGamut(color);
  const rgb = oklchToRGBGamut(mapped);
  return { hex: rgbToHex(rgb), rgb, oklch: mapped };
}
