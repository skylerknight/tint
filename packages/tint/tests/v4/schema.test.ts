import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { schemaPath, schemaText } from "../../scripts/build-schema.js";

const committed = readFileSync(schemaPath, "utf8");
const schema: object = JSON.parse(committed) as object;

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    palette: { neutral: "#71717a" },
    tokens: { text: { DEFAULT: { kind: "text", scale: 3 } } },
    ...overrides,
  };
}

describe("v4 JSON Schema (numeric scale)", () => {
  it("matches the generator", async () => {
    expect(committed).toBe(await schemaText());
  });

  it("is published from the package", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, string> };
    expect(manifest.exports["./schema/v4.json"]).toBe("./schema/v4.json");
  });

  it("accepts scales, lightness, and comma-separated overrides", () => {
    const ok = validate(
      base({
        themes: { dim: { lightness: 40 } },
        overrides: {
          "warning,info": {
            action: { DEFAULT: { kind: "emphasis", scale: 2.5 } },
          },
        },
        tokens: {
          surface: { DEFAULT: { kind: "surface", scale: 0 } },
          text: { body: { kind: "text", scale: 3, on: "surface" } },
        },
      }),
    );
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("rejects level names and state", () => {
    expect(
      validate(base({ tokens: { text: { DEFAULT: { kind: "text", level: "body" } } } })),
    ).toBe(false);
    expect(
      validate(
        base({
          tokens: { action: { hover: { kind: "emphasis", scale: 4, state: "hover" } } },
        }),
      ),
    ).toBe(false);
  });

  it("rejects lightness outside 0..100", () => {
    expect(validate(base({ themes: { hot: { lightness: 140 } } }))).toBe(false);
    expect(validate(base({ themes: { bare: {} } }))).toBe(false);
  });

  it("accepts a negative surface scale and rejects scales outside the kind range", () => {
    expect(
      validate(
        base({
          tokens: {
            surface: { sunken: { kind: "surface", scale: -1 } },
            text: { edge: { kind: "text", scale: 0 } },
            emphasis: { solid: { kind: "emphasis", scale: 10 } },
          },
        }),
      ),
    ).toBe(true);
    expect(
      validate(base({ tokens: { text: { DEFAULT: { kind: "text", scale: -1 } } } })),
    ).toBe(true);
    expect(
      validate(
        base({ tokens: { action: { DEFAULT: { kind: "emphasis", scale: 11 } } } }),
      ),
    ).toBe(true);
    expect(
      validate(
        base({
          tokens: {
            hint: { DEFAULT: { kind: "text", scale: -2, decorative: true } },
          },
        }),
      ),
    ).toBe(true);
    expect(
      validate(
        base({
          tokens: {
            bad: { DEFAULT: { kind: "surface", scale: 1, decorative: true } },
          },
        }),
      ),
    ).toBe(false);
    expect(
      validate(
        base({ tokens: { surface: { DEFAULT: { kind: "surface", scale: -11 } } } }),
      ),
    ).toBe(false);
    expect(
      validate(
        base({ tokens: { surface: { DEFAULT: { kind: "surface", scale: 10.5 } } } }),
      ),
    ).toBe(false);
  });
});
