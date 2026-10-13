/**
 * v4 palette generation (docs/v4-spec.md §4, §5, §6.2).
 *
 * One {@link GenerationResultV4} per theme. Inside a theme, each palette
 * color is solved in backdrop order. Contrast targets use the polarity that
 * maximizes the minimum contrast across the backdrop set, then solve against
 * the worst member. Auto-nudge (§6.4) and `exact` (§6.5) run after that
 * solve, then the §6.6 lints.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { rgbToOKLCH } from "../color/convert.js";
import { oklchToRGBGamut, toGamut } from "../color/gamut.js";
import { parseColor, rgbToHex } from "../color/parse.js";
import type { Metric, Polarity } from "../contrast/types.js";
import {
  apcaMetric,
  preferredPolarity,
  solveAgainstSet,
  wcag2Metric,
  type SetSolveOptions,
} from "../contrast/solve.js";
import { maxChromaForLs } from "../engine/generate.js";
import { kindLints, modeLightnessLint, pageLightnessLint } from "./a11y.js";
import {
  colorOutOfGamutLint,
  duplicateTokenLints,
  expertValueLints,
  hueIdentityLints,
  type EngineDiagnosticV4,
} from "./diagnostics.js";
import { ConfigError } from "./errors.js";
import { PAGE, type ResolvedToken } from "./graph.js";
import {
  lowerToken,
  muteDisabled,
  realizeLightness,
  surfaceStepSize,
  tintStepSize,
  type SolverIntent,
} from "./lower.js";
import { applyNudgeAndExact } from "./nudge.js";
import { resolveConfig, type ResolvedExpansion, type ResolvedTheme } from "./resolve.js";
import type { CanonicalState } from "./states.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  Kind,
  LevelOrdinal,
  Mode,
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
  /** Authored scale. Decimals stay as written. */
  readonly scale: number;
  /** Rounded scale, clamped to 1–5, for output metadata that still says level. */
  readonly ordinal: LevelOrdinal;
  readonly states: readonly CanonicalState[];
  /** True when the token was built with `disabled.<kind>(n)`. The scale is unchanged. */
  readonly disabled?: boolean;
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

export type { EngineDiagnosticV4 } from "./diagnostics.js";

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
  const built: {
    theme: ResolvedTheme;
    palettes: PaletteResultV4[];
    diagnostics: EngineDiagnosticV4[];
  }[] = [];

  for (const theme of resolved.config.themes) {
    const palettes: PaletteResultV4[] = [];
    const diagnostics: EngineDiagnosticV4[] = [];
    const expertSeen = new Set<string>();
    for (const expansion of resolved.config.expansions) {
      if (expansion.theme !== theme.name) continue;
      const solved = solvePalette(expansion, theme, algorithm, metric, diagnostics);
      const finished = applyNudgeAndExact({
        expansion,
        palette: solved,
        theme: theme.name,
        algorithm,
        metric,
        tintStep: tintStepSize(theme.mode, undefined),
        diagnostics,
      });
      palettes.push(finished);
      const gamut = colorOutOfGamutLint(
        theme.name,
        expansion.palette,
        expansion.color,
        finished.seed.hex,
      );
      if (gamut !== undefined) diagnostics.push(gamut);
      diagnostics.push(
        ...expertValueLints(
          theme.name,
          expansion.palette,
          expansion.tokens.map((token) => ({
            id: token.id,
            ...(token.value.lc !== undefined ? { lc: token.value.lc } : {}),
            ...(token.value.ratio !== undefined ? { ratio: token.value.ratio } : {}),
          })),
          expertSeen,
        ),
        ...hueIdentityLints(theme.name, finished),
      );
      diagnostics.push(...kindLints(theme.name, algorithm, finished));
    }
    const paletteName = palettes[0]?.name ?? "*";
    const page = pageLightnessLint({
      theme: theme.name,
      lightness: theme.lightness,
      algorithm,
      palette: paletteName,
    });
    if (page !== undefined) diagnostics.push(page);
    if (theme.authoredMode !== undefined) {
      diagnostics.push(
        modeLightnessLint({
          theme: theme.name,
          lightness: theme.lightness,
          mode: theme.mode,
          authoredMode: theme.authoredMode,
          palette: paletteName,
        }),
      );
    }
    built.push({ theme, palettes, diagnostics });
  }

  const duplicates = duplicateTokenLints(
    built.map((item) => ({ name: item.theme.name, palettes: item.palettes })),
  );
  const results: GenerationResultV4[] = [];
  for (const item of built) {
    for (const lint of duplicates) {
      if (lint.theme === item.theme.name) item.diagnostics.push(lint);
    }
    results.push(themeResult(item.theme, algorithm, item.palettes, item.diagnostics));
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
  diagnostics: EngineDiagnosticV4[],
): PaletteResultV4 {
  const seed = publish(rgbToOKLCH(parseColor(expansion.color)));
  const step = surfaceStepSize(theme.mode, undefined);
  const tint = tintStepSize(theme.mode, undefined);
  const page = publish({
    l: clamp01(theme.lightness / 100),
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
    mode: theme.mode,
    seed: seed.oklch,
    surfaceStep: step,
    tintStep: tint,
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
    let color = publish({ l: lightness, c: intent.seed.c, h: intent.seed.h });
    color = maybeMute(token, color, background);
    const across = minContrast(metric, color.rgb, rgbs);
    const worst = backs[across.index];
    return finish(token, intent.mode, color, across.min, {
      ...(worst !== undefined ? { worst } : {}),
      ...sideOf(color.oklch.l, host.oklch.l, intent.direction),
    });
  }

  const target = intent.mode === "max" ? Number.POSITIVE_INFINITY : intent.target;
  const options: SetSolveOptions = { metric };
  // Stay on one side of the backdrop for the whole scale. A higher number
  // moves further that way; it does not flip.
  const primary = rgbs[0];
  if (intent.direction !== undefined) options.polarity = intent.direction;
  else if (primary !== undefined) options.polarity = preferredPolarity(primary);
  const solved = solveAgainstSet(intent.seed, rgbs, target, options);
  let color = publish(solved.color);
  color = maybeMute(token, color, background);
  const across = minContrast(metric, color.rgb, rgbs);
  const worst = backs[across.index];
  const reached = intent.mode === "max" ? true : across.min + 1e-6 >= intent.target;
  return finish(token, intent.mode, color, across.min, {
    target: intent.mode === "max" ? across.min : intent.target,
    polarity: solved.polarity,
    reached,
    ...(worst !== undefined ? { worst } : {}),
  });
}

function maybeMute(
  token: ResolvedToken,
  color: GeneratedColorV4,
  background: readonly GeneratedColorV4[],
): GeneratedColorV4 {
  if (token.value.disabled !== true) return color;
  const backdropL = background[0]?.oklch.l ?? color.oklch.l;
  return publish(muteDisabled(color.oklch, backdropL));
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
    scale: token.value.scale,
    ordinal: displayOrdinal(token.value.scale),
    states: token.value.states,
    ...(token.value.disabled === true ? { disabled: true } : {}),
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

function displayOrdinal(scale: number): LevelOrdinal {
  const rounded = Math.round(scale);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  if (rounded === 2 || rounded === 3 || rounded === 4) return rounded;
  return 3;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function publish(color: OKLCH): GeneratedColorV4 {
  const mapped = toGamut(color);
  const rgb = oklchToRGBGamut(mapped);
  return { hex: rgbToHex(rgb), rgb, oklch: mapped };
}
