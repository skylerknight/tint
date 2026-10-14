import type { RGB } from "../../../src/color/types.js";
import type {
  GeneratedColorV4,
  GenerationResultV4,
  PaletteResultV4,
  SolvedTokenV4,
} from "../../../src/v4/engine.js";
import type { CanonicalState } from "../../../src/v4/states.js";
import type {
  ContrastAlgorithm,
  ContrastLevel,
  Kind,
  LevelOrdinal,
  Mode,
} from "../../../src/v4/types.js";

export function paint(
  hex: string,
  rgb: RGB,
  l: number,
  c: number,
  h: number,
): GeneratedColorV4 {
  return { hex, rgb, oklch: { l, c, h } };
}

export const ink = paint("#112233", { r: 17, g: 34, b: 51 }, 0.25, 0.02, 250);
export const action = paint("#7c3aed", { r: 124, g: 58, b: 237 }, 0.5, 0.2, 300);
export const actionHover = paint("#6d28d9", { r: 109, g: 40, b: 217 }, 0.45, 0.18, 300);
export const strong = paint("#0a0a0a", { r: 10, g: 10, b: 10 }, 0.1, 0.01, 250);
export const firm = paint("#3f3f46", { r: 63, g: 63, b: 70 }, 0.4, 0.03, 250);

export const brandInk = paint("#5b21b6", { r: 91, g: 33, b: 182 }, 0.4, 0.16, 300);
export const brandAction = paint("#8b5cf6", { r: 139, g: 92, b: 246 }, 0.55, 0.22, 300);
export const brandActionHover = paint(
  "#7c3aed",
  { r: 124, g: 58, b: 237 },
  0.48,
  0.2,
  300,
);
export const brandStrong = paint("#1e1b4b", { r: 30, g: 27, b: 75 }, 0.12, 0.05, 300);
export const brandFirm = paint("#4c1d95", { r: 76, g: 29, b: 149 }, 0.42, 0.08, 300);

const page: GeneratedColorV4 = paint("#ffffff", { r: 255, g: 255, b: 255 }, 1, 0, 0);

interface TokenSpec {
  group: string;
  name: string;
  kind: Kind;
  ordinal: LevelOrdinal;
  scale?: number;
  color: GeneratedColorV4;
  states?: readonly CanonicalState[];
  backdrop?: readonly string[];
  mode?: SolvedTokenV4["mode"];
  target?: number;
  achieved?: number;
  generated?: boolean;
}

export function token(spec: TokenSpec): SolvedTokenV4 {
  const row: SolvedTokenV4 = {
    id: `${spec.group}.${spec.name}`,
    group: spec.group,
    name: spec.name,
    generated: spec.generated ?? false,
    kind: spec.kind,
    scale: spec.scale ?? spec.ordinal,
    ordinal: spec.ordinal,
    states: spec.states ?? [],
    backdrop: spec.backdrop ?? ["page"],
    color: spec.color,
    mode: spec.mode ?? "contrast",
    achieved: spec.achieved ?? spec.target ?? 75,
  };
  if (spec.target !== undefined) return { ...row, target: spec.target };
  return row;
}

export function palette(
  name: string,
  isDefault: boolean,
  tokens: readonly SolvedTokenV4[],
): PaletteResultV4 {
  const seed = tokens[0]?.color ?? ink;
  return { name, isDefault, seed, page, tokens };
}

export function theme(spec: {
  name: string;
  palettes: readonly PaletteResultV4[];
  mode?: Mode;
  selector?: string;
  media?: boolean | string;
  algorithm?: ContrastAlgorithm;
  contrastLevel?: ContrastLevel;
}): GenerationResultV4 {
  const result: GenerationResultV4 = {
    name: spec.name,
    mode: spec.mode ?? "light",
    selector: spec.selector ?? ":root",
    algorithm: spec.algorithm ?? "apca",
    contrastLevel: spec.contrastLevel ?? "standard",
    palettes: spec.palettes,
    diagnostics: [],
  };
  if (spec.media !== undefined) return { ...result, media: spec.media };
  return result;
}

/** Neutral tokens, plus one generated rest the emitters must ignore. */
export function neutralTokens(): SolvedTokenV4[] {
  return [
    token({
      group: "tint",
      name: "ink",
      kind: "text",
      ordinal: 4,
      color: ink,
      target: 90,
      achieved: 90,
    }),
    token({
      group: "action",
      name: "DEFAULT",
      kind: "emphasis",
      ordinal: 3,
      color: action,
      backdrop: ["surface.DEFAULT"],
      target: 75,
    }),
    token({
      group: "action",
      name: "hover",
      kind: "emphasis",
      ordinal: 3,
      color: actionHover,
      states: ["hover"],
      backdrop: ["surface.DEFAULT"],
      target: 81,
    }),
    token({
      group: "text",
      name: "strong",
      kind: "text",
      ordinal: 4,
      color: strong,
      backdrop: ["surface.DEFAULT", "surface.raised"],
      target: 90,
      achieved: 88,
    }),
    token({
      group: "border",
      name: "firm",
      kind: "border",
      ordinal: 4,
      color: firm,
      backdrop: ["surface.DEFAULT"],
      target: 60,
    }),
    token({
      group: "action",
      name: "__rest_emphasis_3",
      kind: "emphasis",
      ordinal: 3,
      color: action,
      generated: true,
      target: 75,
    }),
  ];
}

export function brandTokens(): SolvedTokenV4[] {
  return [
    token({
      group: "tint",
      name: "ink",
      kind: "text",
      ordinal: 4,
      color: brandInk,
      target: 90,
    }),
    token({
      group: "action",
      name: "DEFAULT",
      kind: "emphasis",
      ordinal: 3,
      color: brandAction,
      backdrop: ["surface.DEFAULT"],
      target: 75,
    }),
    token({
      group: "action",
      name: "hover",
      kind: "emphasis",
      ordinal: 3,
      color: brandActionHover,
      states: ["hover"],
      backdrop: ["surface.DEFAULT"],
      target: 81,
    }),
    token({
      group: "text",
      name: "strong",
      kind: "text",
      ordinal: 4,
      color: brandStrong,
      backdrop: ["surface.DEFAULT", "surface.raised"],
      target: 90,
      achieved: 86,
    }),
    token({
      group: "border",
      name: "firm",
      kind: "border",
      ordinal: 4,
      color: brandFirm,
      backdrop: ["surface.DEFAULT"],
      target: 60,
    }),
  ];
}

export const neutral = palette("neutral", true, neutralTokens());
export const brand = palette("brand", false, brandTokens());

/** One theme, two palettes, the §8 names used by the snapshots. */
export const light = theme({ name: "light", palettes: [neutral, brand] });

export function single(
  name: string,
  color: GeneratedColorV4,
  isDefault: boolean,
): PaletteResultV4 {
  return palette(name, isDefault, [
    token({
      group: "tint",
      name: "ink",
      kind: "text",
      ordinal: 4,
      color,
      target: 90,
    }),
  ]);
}
