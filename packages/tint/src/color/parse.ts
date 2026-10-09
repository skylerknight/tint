import type { RGB, OKLCH } from "./types.js";
import { hslToRGB } from "./convert.js";
import { oklchToRGBGamut } from "./gamut.js";

/** CSS Color Level 4 named colors (148 entries), lowercase name → `rrggbb`. */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aqua: "00ffff",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  black: "000000",
  blanchedalmond: "ffebcd",
  blue: "0000ff",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  cyan: "00ffff",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgreen: "006400",
  darkgrey: "a9a9a9",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkslategrey: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  fuchsia: "ff00ff",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  gray: "808080",
  green: "008000",
  greenyellow: "adff2f",
  grey: "808080",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgreen: "90ee90",
  lightgrey: "d3d3d3",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "778899",
  lightslategrey: "778899",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  lime: "00ff00",
  limegreen: "32cd32",
  linen: "faf0e6",
  magenta: "ff00ff",
  maroon: "800000",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  navy: "000080",
  oldlace: "fdf5e6",
  olive: "808000",
  olivedrab: "6b8e23",
  orange: "ffa500",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "ff0000",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  silver: "c0c0c0",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  slategrey: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  teal: "008080",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  white: "ffffff",
  whitesmoke: "f5f5f5",
  yellow: "ffff00",
  yellowgreen: "9acd32",
};

/** CSS <number>: optional sign, decimal, optional exponent. */
const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
/** <number> | <percentage>. */
const NUM_PCT = `${NUM}%?`;
/** <hue>: number with optional angle unit. */
const HUE = `${NUM}(?:deg|grad|rad|turn)?`;
/** Optional alpha: ` / a` (modern) or `, a` (legacy); value is ignored. */
const ALPHA = String.raw`(?:\s*[/,]\s*${NUM_PCT})?`;
/** Separator between arguments: comma or whitespace. */
const SEP = String.raw`\s*,\s*|\s+`;

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = new RegExp(
  String.raw`^rgba?\(\s*(${NUM_PCT})(?:${SEP})(${NUM_PCT})(?:${SEP})(${NUM_PCT})${ALPHA}\s*\)$`,
  "i",
);
const HSL_RE = new RegExp(
  String.raw`^hsla?\(\s*(${HUE})(?:${SEP})(${NUM_PCT})(?:${SEP})(${NUM_PCT})${ALPHA}\s*\)$`,
  "i",
);
const OKLCH_RE = new RegExp(
  String.raw`^oklch\(\s*(${NUM_PCT})\s+(${NUM_PCT})\s+(${HUE})${ALPHA}\s*\)$`,
  "i",
);

const invalid = (input: string): TypeError => new TypeError(`Invalid color: "${input}"`);

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Parse `<number>|<percentage>` where 100% maps to `full`, else the raw number. */
function numberOrPercent(token: string, full: number): number {
  return token.endsWith("%") ? (parseFloat(token) / 100) * full : parseFloat(token);
}

/** Parse a CSS `<hue>` with optional unit into degrees, wrapped to 0..360. */
function hueToDegrees(token: string): number {
  const value = parseFloat(token);
  const unit = token.replace(/^[^a-z]*/i, "").toLowerCase();
  let deg = value;
  if (unit === "turn") deg = value * 360;
  else if (unit === "rad") deg = (value * 180) / Math.PI;
  else if (unit === "grad") deg = value * 0.9;
  return ((deg % 360) + 360) % 360;
}

/** Parse `rrggbb` (6 hex digits) into RGB. */
function hex6ToRGB(hex: string): RGB {
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Parse `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (alpha ignored, `#` optional). */
export function parseHex(input: string): RGB {
  const match = HEX_RE.exec(input.trim());
  if (!match) throw invalid(input);
  let digits = match[1] as string;
  if (digits.length <= 4) {
    digits = [...digits].map((d) => d + d).join("");
  }
  return hex6ToRGB(digits.slice(0, 6));
}

/** Parse `rgb()`/`rgba()` with comma or space syntax, percentages, ignored alpha. */
export function parseRGB(input: string): RGB {
  const match = RGB_RE.exec(input.trim());
  if (!match) throw invalid(input);
  const channel = (token: string | undefined): number =>
    clamp(Math.round(numberOrPercent(token as string, 255)), 0, 255);
  return { r: channel(match[1]), g: channel(match[2]), b: channel(match[3]) };
}

/** Parse `hsl()`/`hsla()` with hue units and ignored alpha, returning sRGB. */
export function parseHSL(input: string): RGB {
  const match = HSL_RE.exec(input.trim());
  if (!match) throw invalid(input);
  const pct = (token: string | undefined): number =>
    clamp(numberOrPercent(token as string, 100), 0, 100);
  return hslToRGB({
    h: hueToDegrees(match[1] as string),
    s: pct(match[2]),
    l: pct(match[3]),
  });
}

/**
 * Parse `oklch()`. Lightness as number (0..1) or percent, chroma as number
 * or percent (100% = 0.4), hue with optional unit. Result may be out of gamut.
 */
export function parseOKLCH(input: string): OKLCH {
  const match = OKLCH_RE.exec(input.trim());
  if (!match) throw invalid(input);
  return {
    l: clamp(numberOrPercent(match[1] as string, 1), 0, 1),
    c: Math.max(0, numberOrPercent(match[2] as string, 0.4)),
    h: hueToDegrees(match[3] as string),
  };
}

/**
 * Parse any supported CSS color (hex, named, rgb(), hsl(), oklch()) to sRGB.
 * Out-of-gamut oklch() input is gamut-mapped. Throws `TypeError` otherwise.
 */
export function parseColor(input: string): RGB {
  if (typeof input !== "string") throw invalid(String(input));
  const text = input.trim().toLowerCase();

  const named = NAMED_COLORS[text];
  if (named !== undefined) return hex6ToRGB(named);

  try {
    if (HEX_RE.test(text)) return parseHex(text);
    if (text.startsWith("rgb")) return parseRGB(text);
    if (text.startsWith("hsl")) return parseHSL(text);
    if (text.startsWith("oklch")) return oklchToRGBGamut(parseOKLCH(text));
  } catch {
    throw invalid(input);
  }
  throw invalid(input);
}

/** Like `parseColor` but returns `null` instead of throwing. */
export function tryParseColor(input: string): RGB | null {
  try {
    return parseColor(input);
  } catch {
    return null;
  }
}

/** Format sRGB as lowercase `#rrggbb`, clamping and rounding channels. */
export function rgbToHex(rgb: RGB): string {
  const hex = (v: number): string =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}
