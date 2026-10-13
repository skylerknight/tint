import { describe, expect, it } from "vitest";
import { text } from "../../../src/v4/kinds.js";
import { generateV4 } from "../../../src/v4/engine.js";
import { toDTCG, toDTCGJSON, type DTCGColorToken } from "../../../src/v4/output/dtcg.js";
import { light, theme, token, palette, paint } from "./_fixture.js";

/**
 * Test-local DTCG 2025.10 color check.
 * colorSpace and components are required. hex is a 6-digit fallback.
 * No schema package: this is the validator the suite runs.
 */
export function colorValueIssues(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["$value must be an object"];
  }
  const record = value as Record<string, unknown>;
  const issues: string[] = [];
  if (!Object.hasOwn(record, "colorSpace")) issues.push("colorSpace is required");
  else if (record.colorSpace !== "oklch") issues.push("colorSpace must be oklch");

  if (!Object.hasOwn(record, "components")) {
    issues.push("components is required");
  } else if (!Array.isArray(record.components)) {
    issues.push("components must be an array");
  } else if (
    record.components.length !== 3 ||
    record.components.some(
      (component) => typeof component !== "number" || !Number.isFinite(component),
    )
  ) {
    issues.push("components must be three finite numbers");
  } else {
    const [l, c, h] = record.components as [number, number, number];
    if (l < 0 || l > 1) issues.push("oklch lightness must be 0..1");
    if (c < 0) issues.push("oklch chroma must be >= 0");
    if (h < 0 || h >= 360) issues.push("oklch hue must be in [0, 360)");
  }

  if (typeof record.hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(record.hex)) {
    issues.push("hex must be a 6-digit CSS hex color");
  }
  return issues;
}

function walkTokens(file: unknown): DTCGColorToken[] {
  expect(file).toEqual(expect.any(Object));
  const tokens: DTCGColorToken[] = [];
  for (const groups of Object.values(file as Record<string, unknown>)) {
    expect(groups).toEqual(expect.any(Object));
    for (const group of Object.values(groups as Record<string, unknown>)) {
      expect(group).toEqual(expect.any(Object));
      for (const [key, tokenValue] of Object.entries(group as Record<string, unknown>)) {
        expect(key.startsWith("$") ? key : "token").not.toBe("$value");
        const color = tokenValue as DTCGColorToken;
        expect(color.$type).toBe("color");
        expect(typeof color.$description).toBe("string");
        expect(color.$description.length).toBeGreaterThan(0);
        expect(colorValueIssues(color.$value)).toEqual([]);
        expect(color.$extensions["dev.tint"]).toEqual(expect.any(Object));
        tokens.push(color);
      }
    }
  }
  return tokens;
}

describe("toDTCG", () => {
  const file = toDTCG(light);

  it("nests palette, group, and $root and keeps order", () => {
    expect(Object.keys(file)).toEqual(["neutral", "brand"]);
    expect(Object.keys(file.neutral ?? {})).toEqual(["tint", "action", "text", "border"]);
    expect(Object.keys(file.neutral?.action ?? {})).toEqual(["$root", "hover"]);
    expect(file.neutral?.action?.$root?.$type).toBe("color");
    expect(file.neutral?.tint?.ink?.$value).toEqual({
      colorSpace: "oklch",
      components: [0.25, 0.02, 250],
      hex: "#112233",
    });
  });

  it("records dev.tint metadata and a description", () => {
    expect(file.neutral?.action?.hover).toEqual({
      $type: "color",
      $value: {
        colorSpace: "oklch",
        components: [0.45, 0.18, 300],
        hex: "#6d28d9",
      },
      $description: "emphasis level 3, state hover, on surface.DEFAULT",
      $extensions: {
        "dev.tint": {
          kind: "emphasis",
          level: 3,
          state: "hover",
          on: ["surface.DEFAULT"],
          algorithm: "apca",
          target: 81,
          achieved: 81,
        },
      },
    });
    expect(file.neutral?.text?.strong?.$extensions["dev.tint"]).toEqual({
      kind: "text",
      level: 4,
      on: ["surface.DEFAULT", "surface.raised"],
      algorithm: "apca",
      target: 90,
      achieved: 88,
    });
    expect(file.neutral?.tint?.ink?.$description).toBe("text level 4, on page");
  });

  it("omits target and state when the solver did not record them", () => {
    const surface = token({
      group: "surface",
      name: "DEFAULT",
      kind: "surface",
      ordinal: 3,
      color: paint("#ffffff", { r: 255, g: 255, b: 255 }, 1, 0, 0),
      mode: "lightness",
      achieved: 0,
      backdrop: ["page"],
    });
    const doc = toDTCG(
      theme({ name: "light", palettes: [palette("neutral", true, [surface])] }),
    );
    expect(doc.neutral?.surface?.$root?.$extensions["dev.tint"]).toEqual({
      kind: "surface",
      level: 3,
      on: ["page"],
      algorithm: "apca",
      achieved: 0,
    });
    expect(doc.neutral?.surface?.$root?.$description).toBe("surface level 3, on page");
  });

  it("wraps hue 360 back into the DTCG range", () => {
    const spun = token({
      group: "tint",
      name: "ink",
      kind: "text",
      ordinal: 4,
      color: paint("#112233", { r: 17, g: 34, b: 51 }, 0.25, 0.02, 360),
      target: 90,
    });
    const doc = toDTCG(
      theme({ name: "light", palettes: [palette("neutral", true, [spun])] }),
    );
    expect(doc.neutral?.tint?.ink?.$value.components[2]).toBe(0);
  });

  it("validates every color in the fixture", () => {
    const tokens = walkTokens(file);
    expect(tokens.length).toBe(10);
    expect(file.neutral?.action).not.toHaveProperty("__rest_emphasis_3");
  });

  it("rejects a missing colorSpace, missing components, and a non-6-digit hex", () => {
    expect(colorValueIssues({ components: [0, 0, 0], hex: "#112233" })).toContain(
      "colorSpace is required",
    );
    expect(colorValueIssues({ colorSpace: "oklch", hex: "#112233" })).toContain(
      "components is required",
    );
    expect(
      colorValueIssues({ colorSpace: "oklch", components: [0, 0, 0], hex: "#1122" }),
    ).toContain("hex must be a 6-digit CSS hex color");
    expect(
      colorValueIssues({ colorSpace: "oklch", components: [0, 0, 0], hex: "#11223344" }),
    ).toContain("hex must be a 6-digit CSS hex color");
    expect(
      colorValueIssues({ colorSpace: "oklch", components: [0, 0, 360], hex: "#112233" }),
    ).toContain("oklch hue must be in [0, 360)");
  });

  it("serializes deterministically", () => {
    expect(toDTCGJSON(light)).toBe(toDTCGJSON(light));
    expect(toDTCGJSON(light).startsWith('{\n  "neutral"')).toBe(true);
  });
});

describe("generated DTCG", () => {
  it("checks solved colors against the DTCG rules", () => {
    const [lightTheme] = generateV4({
      palette: { neutral: "#71717a", brand: "#7c3aed" },
      tokens: {
        tint: { ink: text(3) },
        action: { DEFAULT: text(3) },
      },
    });
    if (lightTheme === undefined) throw new Error("missing theme");
    const doc = toDTCG(lightTheme);
    const tokens = walkTokens(doc);
    expect(tokens.length).toBe(4);
    const inkToken = doc.neutral?.tint?.ink;
    const solved = lightTheme.palettes[0]?.tokens.find(
      (entry) => entry.id === "tint.ink",
    );
    expect(inkToken?.$value.hex).toBe(solved?.color.hex);
    expect(inkToken?.$value.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(inkToken?.$value.components[0]).toBe(solved?.color.oklch.l);
    expect(inkToken?.$value.components[1]).toBe(solved?.color.oklch.c);
    expect(inkToken?.$extensions["dev.tint"].algorithm).toBe(lightTheme.algorithm);
    expect(toDTCGJSON(lightTheme)).toBe(toDTCGJSON(lightTheme));
  });
});
