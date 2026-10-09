import { describe, expect, it } from "vitest";
import {
  parseColor,
  tryParseColor,
  parseHex,
  parseRGB,
  parseHSL,
  parseOKLCH,
  rgbToHex,
} from "../../src/color/parse.js";
import { rgbToOKLCH, isOKLCHInGamut } from "../../src/color/convert.js";

const RED = { r: 255, g: 0, b: 0 };

const expectInvalid = (fn: () => unknown, input: string): void => {
  expect(fn).toThrow(TypeError);
  expect(fn).toThrow(`Invalid color: "${input}"`);
};

describe("parseHex", () => {
  it.each([
    ["#f00", RED],
    ["#F00", RED],
    ["f00", RED],
    ["#f008", RED],
    ["#ff0000", RED],
    ["ff0000", RED],
    ["#ff000080", RED],
    ["#FF000000", RED],
    ["  #abc  ", { r: 0xaa, g: 0xbb, b: 0xcc }],
    ["#7c3aed", { r: 0x7c, g: 0x3a, b: 0xed }],
  ])("parses %s", (input, rgb) => {
    expect(parseHex(input)).toEqual(rgb);
  });

  it.each(["#", "#ff", "#fffff", "#fffffff", "#ggg", "#ff00000000", ""])(
    "rejects %s",
    (input) => expectInvalid(() => parseHex(input), input),
  );
});

describe("parseRGB", () => {
  it.each([
    ["rgb(255, 0, 0)", RED],
    ["rgb(255 0 0)", RED],
    ["RGB(255,0,0)", RED],
    ["rgba(255, 0, 0, 0.5)", RED],
    ["rgb(255 0 0 / 0.5)", RED],
    ["rgb(255 0 0 / 50%)", RED],
    ["rgba(255 0 0 / .5)", RED],
    ["rgb(100%, 0%, 0%)", RED],
    ["rgb(100% 0% 0%)", RED],
    ["rgb(50% 50% 50%)", { r: 128, g: 128, b: 128 }],
    ["rgb(300, -10, 12.6)", { r: 255, g: 0, b: 13 }],
    ["rgb(1e2 0 0)", { r: 100, g: 0, b: 0 }],
    ["  rgb( 10 , 20 , 30 )  ", { r: 10, g: 20, b: 30 }],
  ])("parses %s", (input, rgb) => {
    expect(parseRGB(input)).toEqual(rgb);
  });

  it.each(["rgb()", "rgb(1 2)", "rgb(1, 2, 3, 4, 5)", "rgb(a b c)", "rgb(1 2 3"])(
    "rejects %s",
    (input) => expectInvalid(() => parseRGB(input), input),
  );
});

describe("parseHSL", () => {
  it.each([
    ["hsl(0, 100%, 50%)", RED],
    ["hsl(0 100% 50%)", RED],
    ["hsla(0, 100%, 50%, 0.5)", RED],
    ["hsl(0 100% 50% / 0.5)", RED],
    ["hsl(360deg 100% 50%)", RED],
    ["hsl(1turn 100% 50%)", RED],
    ["hsl(0.5turn 100% 50%)", { r: 0, g: 255, b: 255 }],
    ["hsl(200grad 100% 50%)", { r: 0, g: 255, b: 255 }],
    ["hsl(3.14159265rad 100% 50%)", { r: 0, g: 255, b: 255 }],
    ["hsl(120 100% 50%)", { r: 0, g: 255, b: 0 }],
    ["hsl(-240 100% 50%)", { r: 0, g: 255, b: 0 }],
    ["hsl(210 40% 50%)", { r: 77, g: 128, b: 179 }],
    ["hsl(210 40 50)", { r: 77, g: 128, b: 179 }],
    ["hsl(0 0% 100%)", { r: 255, g: 255, b: 255 }],
    ["hsl(0 150% 50%)", RED],
  ])("parses %s", (input, rgb) => {
    expect(parseHSL(input)).toEqual(rgb);
  });

  it.each(["hsl()", "hsl(0 100%)", "hsl(0deg)", "hsl(x 1% 1%)"])("rejects %s", (input) =>
    expectInvalid(() => parseHSL(input), input),
  );
});

describe("parseOKLCH", () => {
  it("parses plain numbers", () => {
    expect(parseOKLCH("oklch(0.7 0.15 250)")).toEqual({
      l: 0.7,
      c: 0.15,
      h: 250,
    });
  });

  it("parses percent lightness, percent chroma and hue units", () => {
    expect(parseOKLCH("oklch(70% 0.15 250deg)")).toEqual({
      l: 0.7,
      c: 0.15,
      h: 250,
    });
    expect(parseOKLCH("oklch(70% 100% 0.5turn)")).toEqual({
      l: 0.7,
      c: 0.4,
      h: 180,
    });
    expect(parseOKLCH("oklch(50% 50% 100grad)")).toEqual({
      l: 0.5,
      c: 0.2,
      h: 90,
    });
    const rad = parseOKLCH("oklch(0.5 0.1 3.141592653589793rad)");
    expect(rad.h).toBeCloseTo(180, 10);
  });

  it("ignores alpha and clamps ranges", () => {
    expect(parseOKLCH("oklch(0.7 0.15 250 / 0.5)")).toEqual({
      l: 0.7,
      c: 0.15,
      h: 250,
    });
    expect(parseOKLCH("oklch(1.5 -0.1 -90)")).toEqual({ l: 1, c: 0, h: 270 });
    expect(parseOKLCH("OKLCH(0.5 0.1 720)")).toEqual({ l: 0.5, c: 0.1, h: 0 });
  });

  it("does not gamut-map", () => {
    const lch = parseOKLCH("oklch(0.5 0.4 30)");
    expect(lch.c).toBe(0.4);
    expect(isOKLCHInGamut(lch)).toBe(false);
  });

  it.each(["oklch()", "oklch(0.5 0.1)", "oklch(0.5, 0.1, 30)", "oklch(a b c)"])(
    "rejects %s",
    (input) => expectInvalid(() => parseOKLCH(input), input),
  );
});

describe("parseColor", () => {
  it("dispatches across syntaxes", () => {
    expect(parseColor("#f00")).toEqual(RED);
    expect(parseColor("ff0000")).toEqual(RED);
    expect(parseColor("rgb(255 0 0)")).toEqual(RED);
    expect(parseColor("hsl(0 100% 50%)")).toEqual(RED);
    expect(parseColor("red")).toEqual(RED);
    expect(parseColor("  Red  ")).toEqual(RED);
    expect(parseColor("REBECCAPURPLE")).toEqual({ r: 0x66, g: 0x33, b: 0x99 });
  });

  it("gamut-maps oklch input instead of throwing", () => {
    const rgb = parseColor("oklch(0.5 0.4 30)");
    for (const v of [rgb.r, rgb.g, rgb.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    // Hue and lightness should survive the mapping closely.
    const back = rgbToOKLCH(rgb);
    expect(Math.abs(back.l - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(back.h - 30)).toBeLessThan(1);
  });

  it("round-trips oklch for an in-gamut color", () => {
    const red = rgbToOKLCH(RED);
    expect(parseColor(`oklch(${red.l} ${red.c} ${red.h})`)).toEqual(RED);
  });

  it("knows all 148 CSS named colors", () => {
    const names = [
      "aliceblue",
      "antiquewhite",
      "aqua",
      "aquamarine",
      "azure",
      "beige",
      "bisque",
      "black",
      "blanchedalmond",
      "blue",
      "blueviolet",
      "brown",
      "burlywood",
      "cadetblue",
      "chartreuse",
      "chocolate",
      "coral",
      "cornflowerblue",
      "cornsilk",
      "crimson",
      "cyan",
      "darkblue",
      "darkcyan",
      "darkgoldenrod",
      "darkgray",
      "darkgreen",
      "darkgrey",
      "darkkhaki",
      "darkmagenta",
      "darkolivegreen",
      "darkorange",
      "darkorchid",
      "darkred",
      "darksalmon",
      "darkseagreen",
      "darkslateblue",
      "darkslategray",
      "darkslategrey",
      "darkturquoise",
      "darkviolet",
      "deeppink",
      "deepskyblue",
      "dimgray",
      "dimgrey",
      "dodgerblue",
      "firebrick",
      "floralwhite",
      "forestgreen",
      "fuchsia",
      "gainsboro",
      "ghostwhite",
      "gold",
      "goldenrod",
      "gray",
      "green",
      "greenyellow",
      "grey",
      "honeydew",
      "hotpink",
      "indianred",
      "indigo",
      "ivory",
      "khaki",
      "lavender",
      "lavenderblush",
      "lawngreen",
      "lemonchiffon",
      "lightblue",
      "lightcoral",
      "lightcyan",
      "lightgoldenrodyellow",
      "lightgray",
      "lightgreen",
      "lightgrey",
      "lightpink",
      "lightsalmon",
      "lightseagreen",
      "lightskyblue",
      "lightslategray",
      "lightslategrey",
      "lightsteelblue",
      "lightyellow",
      "lime",
      "limegreen",
      "linen",
      "magenta",
      "maroon",
      "mediumaquamarine",
      "mediumblue",
      "mediumorchid",
      "mediumpurple",
      "mediumseagreen",
      "mediumslateblue",
      "mediumspringgreen",
      "mediumturquoise",
      "mediumvioletred",
      "midnightblue",
      "mintcream",
      "mistyrose",
      "moccasin",
      "navajowhite",
      "navy",
      "oldlace",
      "olive",
      "olivedrab",
      "orange",
      "orangered",
      "orchid",
      "palegoldenrod",
      "palegreen",
      "paleturquoise",
      "palevioletred",
      "papayawhip",
      "peachpuff",
      "peru",
      "pink",
      "plum",
      "powderblue",
      "purple",
      "rebeccapurple",
      "red",
      "rosybrown",
      "royalblue",
      "saddlebrown",
      "salmon",
      "sandybrown",
      "seagreen",
      "seashell",
      "sienna",
      "silver",
      "skyblue",
      "slateblue",
      "slategray",
      "slategrey",
      "snow",
      "springgreen",
      "steelblue",
      "tan",
      "teal",
      "thistle",
      "tomato",
      "turquoise",
      "violet",
      "wheat",
      "white",
      "whitesmoke",
      "yellow",
      "yellowgreen",
    ];
    expect(names).toHaveLength(148);
    expect(new Set(names).size).toBe(148);
    for (const name of names) {
      expect(() => parseColor(name)).not.toThrow();
    }
  });

  it("spot-checks named color values", () => {
    expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("black")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor("navy")).toEqual({ r: 0, g: 0, b: 128 });
    expect(parseColor("green")).toEqual({ r: 0, g: 128, b: 0 });
    expect(parseColor("lime")).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseColor("gray")).toEqual(parseColor("grey"));
    expect(parseColor("aqua")).toEqual(parseColor("cyan"));
    expect(parseColor("fuchsia")).toEqual(parseColor("magenta"));
  });

  it.each([
    "",
    "   ",
    "transparent",
    "currentcolor",
    "notacolor",
    "#ggg",
    "rgb(1 2)",
    "hsl(0 0 0 0 0)",
    "oklch(0.5)",
    "lab(50% 0 0)",
    "#12345",
  ])("throws TypeError for %j", (input) => {
    expectInvalid(() => parseColor(input), input);
  });

  it("includes the original (untrimmed, original-case) input in the message", () => {
    expectInvalid(() => parseColor("  RGB(bad)  "), "  RGB(bad)  ");
  });
});

describe("tryParseColor", () => {
  it("returns RGB for valid input", () => {
    expect(tryParseColor("#f00")).toEqual(RED);
    expect(tryParseColor("tomato")).toEqual({ r: 255, g: 99, b: 71 });
  });

  it("returns null for invalid input", () => {
    expect(tryParseColor("nope")).toBeNull();
    expect(tryParseColor("")).toBeNull();
    expect(tryParseColor("transparent")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats lowercase #rrggbb with zero padding", () => {
    expect(rgbToHex(RED)).toBe("#ff0000");
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe("#010203");
    expect(rgbToHex({ r: 0x7c, g: 0x3a, b: 0xed })).toBe("#7c3aed");
  });

  it("clamps and rounds channels", () => {
    expect(rgbToHex({ r: 300, g: -5, b: 127.6 })).toBe("#ff0080");
  });

  it("round-trips with parseHex for every channel value", () => {
    for (let v = 0; v < 256; v++) {
      const rgb = { r: v, g: 255 - v, b: (v * 7) % 256 };
      expect(parseHex(rgbToHex(rgb))).toEqual(rgb);
    }
  });
});
