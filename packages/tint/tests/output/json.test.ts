import { describe, it, expect } from "vitest";
import { toDTCG, toJSON, toFlatMap, DTCG_SCHEMA } from "../../src/output/json.js";
import { light, dark, withBg, highContrast } from "./_fixtures.js";

describe("toDTCG", () => {
  it("builds palette -> group -> variant tokens with dev.tint metadata", () => {
    expect(toDTCG(withBg)).toEqual({
      $schema: DTCG_SCHEMA,
      base: {
        bg: {
          DEFAULT: {
            $type: "color",
            $value: "#f9fafb",
            $extensions: { "dev.tint": { kind: "ls", ls: 0, reference: true } },
          },
          muted: {
            $type: "color",
            $value: "#eef0f3",
            $extensions: { "dev.tint": { kind: "ls", ls: 2 } },
          },
        },
        text: {
          DEFAULT: {
            $type: "color",
            $value: "#2f3338",
            $extensions: {
              "dev.tint": {
                kind: "lc",
                lc: 80,
                target: 80,
                on: "bg.DEFAULT",
                reference: true,
              },
            },
          },
          heading: {
            $type: "color",
            $value: "#15181c",
            $extensions: {
              "dev.tint": { kind: "lc", lc: 90, target: 90, on: "bg.DEFAULT" },
            },
          },
        },
      },
      brand: {
        bg: {
          DEFAULT: {
            $type: "color",
            $value: "#faf7ff",
            $extensions: { "dev.tint": { kind: "ls", ls: 0, reference: true } },
          },
          muted: {
            $type: "color",
            $value: "#efe9fb",
            $extensions: { "dev.tint": { kind: "ls", ls: 2 } },
          },
        },
        text: {
          DEFAULT: {
            $type: "color",
            $value: "#3a2d5c",
            $extensions: {
              "dev.tint": {
                kind: "lc",
                lc: 80,
                target: 80,
                on: "bg.DEFAULT",
                reference: true,
              },
            },
          },
          heading: {
            $type: "color",
            $value: "#1b1233",
            $extensions: {
              "dev.tint": { kind: "lc", lc: 90, target: 90, on: "bg.DEFAULT" },
            },
          },
        },
      },
    });
  });

  it("keeps DEFAULT as a key and preserves config order", () => {
    const base = toDTCG(light).base as Record<string, Record<string, unknown>>;
    expect(Object.keys(base)).toEqual(["surface", "text", "action", "on"]);
    expect(Object.keys(base.surface ?? {})).toEqual(["DEFAULT", "raised"]);
    expect(Object.keys(base.text ?? {})).toEqual(["heading", "body", "muted"]);
  });

  it("omits on/reference from metadata when absent", () => {
    const token = (toDTCG(highContrast).base as Record<string, Record<string, unknown>>)
      .text?.DEFAULT as Record<string, unknown>;
    expect(token.$extensions).toEqual({
      "dev.tint": { kind: "lc", lc: 106, target: 106 },
    });
  });

  it("option metadata: false drops $extensions", () => {
    const out = toDTCG(withBg, { metadata: false });
    const token = (out.base as Record<string, Record<string, unknown>>).bg?.DEFAULT;
    expect(token).toEqual({ $type: "color", $value: "#f9fafb" });
  });

  it("option includeSchema: false drops $schema", () => {
    const out = toDTCG(withBg, { includeSchema: false });
    expect(out).not.toHaveProperty("$schema");
    expect(Object.keys(out)).toEqual(["base", "brand"]);
  });

  it("option useOKLCH formats values via formatOKLCH", () => {
    const out = toDTCG(withBg, { useOKLCH: true, metadata: false });
    const token = (out.base as Record<string, Record<string, unknown>>).bg?.DEFAULT;
    expect(token).toEqual({ $type: "color", $value: "oklch(98.00% 0.0100 250.00)" });
  });

  it("does not mutate the result", () => {
    const before = JSON.stringify(light);
    toDTCG(light);
    expect(JSON.stringify(light)).toBe(before);
  });
});

describe("toJSON", () => {
  it("stringifies the DTCG object with two-space indentation by default", () => {
    const json = toJSON(highContrast);
    expect(json).toBe(
      [
        "{",
        `  "$schema": "${DTCG_SCHEMA}",`,
        '  "base": {',
        '    "text": {',
        '      "DEFAULT": {',
        '        "$type": "color",',
        '        "$value": "#000000",',
        '        "$extensions": {',
        '          "dev.tint": {',
        '            "kind": "lc",',
        '            "lc": 106,',
        '            "target": 106',
        "          }",
        "        }",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("honors indent and forwards the other options", () => {
    const json = toJSON(highContrast, {
      indent: 0,
      includeSchema: false,
      metadata: false,
    });
    expect(json).toBe(
      '{"base":{"text":{"DEFAULT":{"$type":"color","$value":"#000000"}}}}',
    );
  });

  it("round-trips through JSON.parse to the same object as toDTCG", () => {
    expect(JSON.parse(toJSON(dark))).toEqual(toDTCG(dark));
  });
});

describe("toFlatMap", () => {
  it("maps dotted paths to hex and drops DEFAULT", () => {
    expect(toFlatMap(withBg)).toEqual({
      "base.bg": "#f9fafb",
      "base.bg.muted": "#eef0f3",
      "base.text": "#2f3338",
      "base.text.heading": "#15181c",
      "brand.bg": "#faf7ff",
      "brand.bg.muted": "#efe9fb",
      "brand.text": "#3a2d5c",
      "brand.text.heading": "#1b1233",
    });
  });

  it("covers every token of the standard theme in config order", () => {
    const keys = Object.keys(toFlatMap(light));
    expect(keys).toHaveLength(14);
    expect(keys.slice(0, 7)).toEqual([
      "base.surface",
      "base.surface.raised",
      "base.text.heading",
      "base.text.body",
      "base.text.muted",
      "base.action",
      "base.on.action",
    ]);
    expect(toFlatMap(light)["brand.on.action"]).toBe("#ffffff");
  });
});

describe("toDTCG — decorative metadata", () => {
  it("records decorative tokens in $extensions", async () => {
    const { generate } = await import("../../src/engine/generate.js");
    const result = generate({
      name: "t",
      mode: "light",
      colors: { base: "#fff" },
      tokens: {
        surface: { DEFAULT: { ls: 1 } },
        text: { $on: "surface", body: { lc: 75 }, hint: { lc: 30, $decorative: true } },
      },
    });
    const dtcg = toDTCG(result) as Record<string, any>;
    expect(dtcg.base.text.hint.$extensions["dev.tint"].decorative).toBe(true);
    expect(dtcg.base.text.body.$extensions["dev.tint"].decorative).toBeUndefined();
  });
});
