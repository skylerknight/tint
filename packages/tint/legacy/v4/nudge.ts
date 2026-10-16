/**
 * Auto-nudge and `exact` (docs/v4-spec.md §6.4, §6.5).
 *
 * Runs after the topological solve. `exact` snaps first, and only when every
 * pair already passes. Nudge then walks an emphasis family away from its
 * backdrop, one fine lightness step at a time, until the labels on it pass
 * or the +{@link NUDGE_MAX_LEVELS} ceiling is reached.
 */

import type { OKLCH, RGB } from "../color/types.js";
import { oklchToRGBGamut, toGamut } from "../color/gamut.js";
import { rgbToHex } from "../color/parse.js";
import { setLightness } from "../color/oklch.js";
import type { Metric, Polarity } from "../contrast/types.js";
import { preferredPolarity, solveAgainstSet } from "../contrast/solve.js";
import { NUDGE_MAX_LEVELS } from "./constants.js";
import {
  emphasisNudged,
  exactRejected,
  labelUnreachable,
  type EngineDiagnosticV4,
} from "./diagnostics.js";
import type { GeneratedColorV4, PaletteResultV4, SolvedTokenV4 } from "./engine.js";
import { PAGE, type ResolvedToken } from "./graph.js";
import {
  APCA_STATE_DELTA,
  DISABLED_CHROMA,
  DISABLED_TARGET,
  SELECTED_CHROMA,
  stateStepCount,
  WCAG_STATE_RATIO,
} from "./lower.js";
import type { NormalizedToken } from "./normalize.js";
import type { ResolvedExpansion } from "./resolve.js";
import { contrastTarget, shiftOrdinal } from "./targets.js";
import type { ContrastAlgorithm, LevelOrdinal, StateSteps } from "./types.js";

/**
 * One fine step (§6.4). The spec does not give the size. 0.005 OKLCH L is
 * small enough that the search stops on the first passing lightness instead
 * of jumping a whole level.
 */
const NUDGE_STEP = 0.005;
const MAX_STEPS = Math.ceil(1 / NUDGE_STEP);

export interface PostSolveInput {
  expansion: ResolvedExpansion;
  palette: PaletteResultV4;
  theme: string;
  algorithm: ContrastAlgorithm;
  metric: Metric;
  states?: StateSteps;
  /** Resolved emphasis tint step for this theme's mode (§4). */
  tintStep: number;
  diagnostics: EngineDiagnosticV4[];
}

/** Snap `exact`, then nudge emphasis fills so their labels pass. */
export function applyNudgeAndExact(input: PostSolveInput): PaletteResultV4 {
  const sources = new Map<string, ResolvedToken>();
  for (const token of input.expansion.tokens) sources.set(token.id, token);
  for (const token of input.expansion.generated) sources.set(token.id, token);

  const tokens = input.palette.tokens.map((token) => token);
  const colors = new Map<string, GeneratedColorV4>([[PAGE, input.palette.page]]);
  for (const token of tokens) colors.set(token.id, token.color);

  applyExact(input, tokens, colors, sources);
  applyNudge(input, tokens, colors, sources);
  dropLabelContrastWarnings(input, tokens);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== undefined) tokens[i] = refresh(token, colors, input.metric);
  }

  return { ...input.palette, tokens };
}

function applyExact(
  input: PostSolveInput,
  tokens: SolvedTokenV4[],
  colors: Map<string, GeneratedColorV4>,
  sources: Map<string, ResolvedToken>,
): void {
  const exact = input.expansion.exact;
  if (exact === undefined) return;
  const target = resolveExactTarget(input.expansion, exact);
  if (target === undefined || target.value.kind !== "emphasis") {
    const name = target?.id ?? (typeof exact === "string" ? exact : "emphasis");
    input.diagnostics.push(
      exactRejected({
        theme: input.theme,
        palette: input.palette.name,
        token: name,
        color: input.palette.seed.hex,
        pair: [name, target === undefined ? "emphasis" : target.value.kind],
        unit: unitOf(input.algorithm),
      }),
    );
    return;
  }

  const solved = tokens.find((token) => token.id === target.id);
  if (solved === undefined) return;

  const candidates = new Map<string, GeneratedColorV4>(colors);
  candidates.set(solved.id, input.palette.seed);
  for (const token of tokens) {
    if (!extendsToken(token, solved)) continue;
    const derived = rederiveState(token, input.palette.seed, candidates, input);
    candidates.set(token.id, derived);
  }

  const failure = firstFailure(solved, tokens, candidates, sources, input.metric);
  if (failure !== undefined) {
    input.diagnostics.push(
      exactRejected({
        theme: input.theme,
        palette: input.palette.name,
        token: solved.id,
        color: input.palette.seed.hex,
        pair: failure.pair,
        unit: unitOf(input.algorithm),
        target: failure.target,
        achieved: failure.achieved,
      }),
    );
    return;
  }

  for (const [id, color] of candidates) colors.set(id, color);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const color = token === undefined ? undefined : colors.get(token.id);
    if (token !== undefined && color !== undefined) tokens[i] = { ...token, color };
  }
}

function applyNudge(
  input: PostSolveInput,
  tokens: SolvedTokenV4[],
  colors: Map<string, GeneratedColorV4>,
  sources: Map<string, ResolvedToken>,
): void {
  for (const family of emphasisFamilies(tokens)) {
    const failing = family.labels.filter((label) => misses(label, colors, input.metric));
    if (failing.length === 0) continue;
    const disabled = family.members.some(
      (member) => sources.get(member.id)?.value.nudge === false,
    );
    if (disabled) {
      reportUnreachable(input, family, failing, colors, true);
      continue;
    }

    const sign = awaySign(family.rest, colors);
    const budget = nudgeBudget(family.rest, sources.get(family.rest.id)?.value, input);
    const baseline = new Map(family.members.map((member) => [member.id, member.color]));
    let bestDelta = 0;
    let bestColors: Map<string, GeneratedColorV4> | undefined;
    let bestScore = worstShortfall(failing, colors, input.metric);
    let passed = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
      const delta = step * NUDGE_STEP;
      if (budget.lightness !== undefined && delta > budget.lightness + 1e-9) break;
      const preview = shiftFamily(family.members, baseline, sign, delta);
      if (preview === undefined) break;
      const next = overlay(colors, preview);
      if (budget.contrast !== undefined) {
        const rest = preview.get(family.rest.id) ?? family.rest.color;
        const ach = against(input.metric, rest.rgb, family.rest, next).min;
        if (ach > budget.contrast + 1e-6) break;
      }
      if (!familyHoldsTarget(family.members, next, input.metric)) break;
      const score = worstShortfall(failing, next, input.metric);
      if (bestColors === undefined || score > bestScore) {
        bestScore = score;
        bestDelta = delta;
        bestColors = next;
      }
      if (score >= -1e-6) {
        passed = true;
        break;
      }
    }

    if (bestColors !== undefined && bestDelta > 0) {
      for (const [id, color] of bestColors) colors.set(id, color);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const color = token === undefined ? undefined : colors.get(token.id);
        if (token !== undefined && color !== undefined) tokens[i] = { ...token, color };
      }
    }

    const applied = bestColors ?? colors;
    if (passed) {
      const restColor = applied.get(family.rest.id) ?? family.rest.color;
      const origin = baseline.get(family.rest.id) ?? family.rest.color;
      input.diagnostics.push(
        emphasisNudged({
          theme: input.theme,
          palette: input.palette.name,
          id: family.rest.id,
          delta: Math.abs(restColor.oklch.l - origin.oklch.l),
          from: origin.hex,
          to: restColor.hex,
          labels: failing.map((label) => label.id),
        }),
      );
      continue;
    }
    const still = failing.filter((label) => misses(label, applied, input.metric));
    reportUnreachable(input, family, still, applied, false);
  }
}

function reportUnreachable(
  input: PostSolveInput,
  family: Family,
  labels: readonly SolvedTokenV4[],
  colors: Map<string, GeneratedColorV4>,
  nudgeDisabled: boolean,
): void {
  for (const label of labels) {
    if (label.target === undefined) continue;
    const across = against(input.metric, labelColor(label, colors).rgb, label, colors);
    const background = backdropIds(label)[across.index] ?? family.rest.id;
    input.diagnostics.push(
      labelUnreachable({
        theme: input.theme,
        palette: input.palette.name,
        label: label.id,
        emphasis: family.rest.id,
        target: label.target,
        achieved: across.min,
        unit: unitOf(input.algorithm),
        nudgeDisabled,
        pair: [label.id, background],
      }),
    );
  }
}

function dropLabelContrastWarnings(
  input: PostSolveInput,
  tokens: readonly SolvedTokenV4[],
): void {
  const owned = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "text" || token.states.includes("disabled")) continue;
    const onEmphasis = token.backdrop.some((id) => {
      const backdrop = tokens.find((entry) => entry.id === id);
      return backdrop?.kind === "emphasis";
    });
    if (onEmphasis) owned.add(`${input.palette.name}.${token.id}`);
  }
  for (let i = input.diagnostics.length - 1; i >= 0; i--) {
    const item = input.diagnostics[i];
    if (item?.code === "contrast-unreachable" && owned.has(item.path)) {
      input.diagnostics.splice(i, 1);
    }
  }
}

interface Family {
  rest: SolvedTokenV4;
  members: SolvedTokenV4[];
  labels: SolvedTokenV4[];
}

function emphasisFamilies(tokens: readonly SolvedTokenV4[]): Family[] {
  const groups = new Map<string, SolvedTokenV4[]>();
  for (const token of tokens) {
    if (token.kind !== "emphasis" || token.states.includes("disabled")) continue;
    const key = `${token.group}\0${token.ordinal}`;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [token]);
    else list.push(token);
  }
  const texts = tokens.filter(
    (token) => token.kind === "text" && !token.states.includes("disabled"),
  );
  const families: Family[] = [];
  for (const members of groups.values()) {
    const rest = members.find((member) => member.states.length === 0) ?? members[0];
    if (rest === undefined) continue;
    const ids = new Set(members.map((member) => member.id));
    const labels = texts.filter((token) => token.backdrop.some((id) => ids.has(id)));
    if (labels.length === 0) continue;
    families.push({ rest, members, labels });
  }
  return families;
}

function nudgeBudget(
  rest: SolvedTokenV4,
  value: NormalizedToken | undefined,
  input: PostSolveInput,
): { contrast?: number; lightness?: number } {
  const looked = shiftOrdinal(rest.ordinal, {
    contrastLevel: input.expansion.contrastLevel,
    ...(value?.contrast !== undefined ? { contrast: value.contrast } : {}),
  });
  const cell = contrastTarget(
    input.algorithm,
    "emphasis",
    asOrdinal(looked + NUDGE_MAX_LEVELS),
  );
  if (cell.type === "contrast") return { contrast: cell.value };
  if (cell.type === "max") return {};
  return { lightness: NUDGE_MAX_LEVELS * input.tintStep };
}

function shiftFamily(
  members: readonly SolvedTokenV4[],
  baseline: ReadonlyMap<string, GeneratedColorV4>,
  sign: 1 | -1,
  delta: number,
): Map<string, GeneratedColorV4> | undefined {
  const preview = new Map<string, GeneratedColorV4>();
  let moved = false;
  for (const member of members) {
    const origin = baseline.get(member.id) ?? member.color;
    const next = publish(setLightness(origin.oklch, origin.oklch.l + sign * delta));
    if (Math.abs(next.oklch.l - origin.oklch.l) >= 1e-6) moved = true;
    preview.set(member.id, next);
  }
  return moved ? preview : undefined;
}

function familyHoldsTarget(
  members: readonly SolvedTokenV4[],
  colors: Map<string, GeneratedColorV4>,
  metric: Metric,
): boolean {
  for (const member of members) {
    if (
      member.mode !== "contrast" ||
      member.target === undefined ||
      member.reached !== true
    ) {
      continue;
    }
    const color = colors.get(member.id) ?? member.color;
    if (against(metric, color.rgb, member, colors).min + 1e-6 < member.target)
      return false;
  }
  return true;
}

function misses(
  label: SolvedTokenV4,
  colors: Map<string, GeneratedColorV4>,
  metric: Metric,
): boolean {
  if (label.mode !== "contrast" || label.target === undefined) return false;
  const color = labelColor(label, colors);
  return against(metric, color.rgb, label, colors).min + 1e-6 < label.target;
}

function worstShortfall(
  labels: readonly SolvedTokenV4[],
  colors: Map<string, GeneratedColorV4>,
  metric: Metric,
): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const label of labels) {
    if (label.target === undefined) continue;
    const ach = against(metric, labelColor(label, colors).rgb, label, colors).min;
    const gap = ach - label.target;
    if (gap < worst) worst = gap;
  }
  return worst;
}

interface PairFailure {
  pair: readonly [string, string];
  target: number;
  achieved: number;
}

function firstFailure(
  target: SolvedTokenV4,
  tokens: readonly SolvedTokenV4[],
  candidates: Map<string, GeneratedColorV4>,
  sources: Map<string, ResolvedToken>,
  metric: Metric,
): PairFailure | undefined {
  const snapped = candidates.get(target.id);
  if (snapped === undefined) return undefined;
  const direction = sources.get(target.id)?.value.direction;
  if (direction !== undefined) {
    const ids = backdropIds(target);
    const hostId = ids[0] ?? PAGE;
    const host = candidates.get(hostId);
    if (host !== undefined) {
      const wrong =
        (direction === "lighter" && snapped.oklch.l < host.oklch.l - 1e-6) ||
        (direction === "darker" && snapped.oklch.l > host.oklch.l + 1e-6);
      if (wrong && target.target !== undefined) {
        return { pair: [target.id, hostId], target: target.target, achieved: 0 };
      }
    }
  }
  if (target.mode === "contrast" && target.target !== undefined) {
    const across = against(metric, snapped.rgb, target, candidates);
    if (across.min + 1e-6 < target.target) {
      const background = backdropIds(target)[across.index] ?? PAGE;
      return {
        pair: [target.id, background],
        target: target.target,
        achieved: across.min,
      };
    }
  }
  for (const token of tokens) {
    if (token.kind !== "text" || token.states.includes("disabled")) continue;
    if (token.mode !== "contrast" || token.target === undefined) continue;
    const watches = token.backdrop.some(
      (id) => candidates.get(id) !== undefined && id !== PAGE,
    );
    if (!watches) continue;
    const changed = token.backdrop.some((id) => {
      const next = candidates.get(id);
      const previous = tokens.find((entry) => entry.id === id)?.color;
      return next !== undefined && previous !== undefined && next.hex !== previous.hex;
    });
    if (!changed) continue;
    const across = against(metric, labelColor(token, candidates).rgb, token, candidates);
    if (across.min + 1e-6 < token.target) {
      const background = backdropIds(token)[across.index] ?? target.id;
      return { pair: [token.id, background], target: token.target, achieved: across.min };
    }
  }
  return undefined;
}

function rederiveState(
  token: SolvedTokenV4,
  exact: GeneratedColorV4,
  colors: Map<string, GeneratedColorV4>,
  input: PostSolveInput,
): GeneratedColorV4 {
  let chroma = exact.oklch.c;
  let steps = 0;
  let disabled = false;
  for (const state of token.states) {
    if (state === "selected") chroma *= SELECTED_CHROMA;
    if (state === "disabled") {
      disabled = true;
      chroma *= DISABLED_CHROMA;
      continue;
    }
    steps += stateStepCount(token.kind, state, input.states);
  }
  const backs = backdrops(token, colors);
  const seed: OKLCH = { l: exact.oklch.l, c: Math.max(0, chroma), h: exact.oklch.h };
  if (disabled) {
    const target =
      input.algorithm === "apca" ? DISABLED_TARGET.apca : DISABLED_TARGET.wcag2;
    const solved = solveAgainstSet(
      seed,
      backs.map((color) => color.rgb),
      target,
      {
        metric: input.metric,
      },
    );
    return publish(solved.color);
  }
  if (steps === 0 && Math.abs(chroma - exact.oklch.c) < 1e-9) return exact;
  const base = against(input.metric, exact.rgb, token, colors).min;
  const target =
    input.algorithm === "apca"
      ? base + steps * APCA_STATE_DELTA
      : base * WCAG_STATE_RATIO ** steps;
  const solved = solveAgainstSet(
    seed,
    backs.map((color) => color.rgb),
    target,
    {
      metric: input.metric,
      polarity: polarityOf(exact, backs),
    },
  );
  return publish(solved.color);
}

function resolveExactTarget(
  expansion: ResolvedExpansion,
  exact: boolean | string,
): ResolvedToken | undefined {
  const pool = [...expansion.tokens, ...expansion.generated];
  if (exact === true) {
    return pool.find(
      (token) => token.value.kind === "emphasis" && token.value.states.length === 0,
    );
  }
  return pool.find((token) => token.id === exact);
}

function extendsToken(candidate: SolvedTokenV4, host: SolvedTokenV4): boolean {
  if (candidate.id === host.id) return false;
  if (candidate.group !== host.group || candidate.kind !== host.kind) return false;
  if (candidate.ordinal !== host.ordinal) return false;
  if (candidate.states.length <= host.states.length) return false;
  return host.states.every((state, index) => candidate.states[index] === state);
}

function awaySign(token: SolvedTokenV4, colors: Map<string, GeneratedColorV4>): 1 | -1 {
  if (token.polarity === "lighter") return 1;
  if (token.polarity === "darker") return -1;
  const host = colors.get(backdropIds(token)[0] ?? PAGE);
  if (host === undefined) return 1;
  if (token.color.oklch.l > host.oklch.l + 1e-6) return 1;
  if (token.color.oklch.l < host.oklch.l - 1e-6) return -1;
  return preferredPolarity(host.rgb) === "lighter" ? 1 : -1;
}

function polarityOf(
  color: GeneratedColorV4,
  backs: readonly GeneratedColorV4[],
): Polarity {
  let host = backs[0];
  if (host === undefined) return "darker";
  let gap = Math.abs(color.oklch.l - host.oklch.l);
  for (const back of backs) {
    const next = Math.abs(color.oklch.l - back.oklch.l);
    if (next < gap) {
      gap = next;
      host = back;
    }
  }
  if (color.oklch.l > host.oklch.l + 1e-6) return "lighter";
  if (color.oklch.l < host.oklch.l - 1e-6) return "darker";
  return preferredPolarity(host.rgb);
}

function against(
  metric: Metric,
  foreground: RGB,
  token: SolvedTokenV4,
  colors: Map<string, GeneratedColorV4>,
): { min: number; index: number } {
  const ids = backdropIds(token);
  const backgrounds: RGB[] = [];
  for (const id of ids) {
    const color = colors.get(id);
    if (color !== undefined) backgrounds.push(color.rgb);
  }
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

function backdrops(
  token: SolvedTokenV4,
  colors: Map<string, GeneratedColorV4>,
): GeneratedColorV4[] {
  const found: GeneratedColorV4[] = [];
  for (const id of backdropIds(token)) {
    const color = colors.get(id);
    if (color !== undefined) found.push(color);
  }
  return found;
}

function backdropIds(token: SolvedTokenV4): readonly string[] {
  return token.backdrop.length === 0 ? [PAGE] : token.backdrop;
}

function labelColor(
  token: SolvedTokenV4,
  colors: Map<string, GeneratedColorV4>,
): GeneratedColorV4 {
  return colors.get(token.id) ?? token.color;
}

function overlay(
  base: Map<string, GeneratedColorV4>,
  preview: Map<string, GeneratedColorV4>,
): Map<string, GeneratedColorV4> {
  const next = new Map(base);
  for (const [id, color] of preview) next.set(id, color);
  return next;
}

function refresh(
  token: SolvedTokenV4,
  colors: Map<string, GeneratedColorV4>,
  metric: Metric,
): SolvedTokenV4 {
  const color = colors.get(token.id) ?? token.color;
  const across = against(metric, color.rgb, token, colors);
  const worst = backdropIds(token)[across.index];
  let next: SolvedTokenV4 = { ...token, color, achieved: across.min };
  if (worst !== undefined) next = { ...next, worst };
  if (token.mode === "contrast" && token.target !== undefined) {
    next = { ...next, reached: across.min + 1e-6 >= token.target };
  }
  return next;
}

function publish(color: OKLCH): GeneratedColorV4 {
  const mapped = toGamut(color);
  const rgb = oklchToRGBGamut(mapped);
  return { hex: rgbToHex(rgb), rgb, oklch: mapped };
}

function asOrdinal(value: number): LevelOrdinal {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

function unitOf(algorithm: ContrastAlgorithm): "Lc" | "ratio" {
  return algorithm === "apca" ? "Lc" : "ratio";
}
