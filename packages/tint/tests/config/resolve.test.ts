import { describe, expect, it } from "vitest";
import { parseOn, PURE, resolveConfig } from "../../src/config/resolve.js";
import type { Config, OutputFormat } from "../../src/config/types.js";

function config(partial: Partial<Config> = {}): Config {
  return {
    name: "theme",
    mode: "light",
    colors: { brand: "#3366ff" },
    tokens: {
      surface: { $role: "surface", default: { ls: 0 }, raised: { ls: 2 } },
      text: {
        $on: "surface",
        $role: "text",
        heading: { lc: "heading" },
        body: { lc: 80 },
      },
    },
    ...partial,
  };
}

describe("parseOn", () => {
  it("splits group and optional variant", () => {
    expect(parseOn("surface")).toEqual({ group: "surface" });
    expect(parseOn("surface.raised")).toEqual({ group: "surface", variant: "raised" });
  });
});

describe("resolveConfig: top level and defaults", () => {
  it("applies defaults", () => {
    const resolved = resolveConfig(config());
    expect(resolved).toMatchObject({
      name: "theme",
      mode: "light",
      selector: ":root",
      scale: 0.02,
      offset: 0.015,
      output: { path: "./tint", formats: ["css"] },
    });
    expect("prefersColorScheme" in resolved).toBe(false);
    expect("prefersContrast" in resolved).toBe(false);
  });

  it("uses the dark offset default", () => {
    expect(resolveConfig(config({ mode: "dark" })).offset).toBe(0.15);
  });

  it("passes explicit top-level values through", () => {
    const resolved = resolveConfig(
      config({
        selector: ".dark",
        prefersColorScheme: "dark",
        prefersContrast: "more",
        scale: 0.05,
        offset: 0.2,
        output: { path: "./out", formats: ["json", "tailwind"] },
      }),
    );
    expect(resolved).toMatchObject({
      selector: ".dark",
      prefersColorScheme: "dark",
      prefersContrast: "more",
      scale: 0.05,
      offset: 0.2,
      output: { path: "./out", formats: ["json", "tailwind"] },
    });
  });

  it("fills only the missing output field", () => {
    expect(resolveConfig(config({ output: { path: "./x" } })).output).toEqual({
      path: "./x",
      formats: ["css"],
    });
    expect(resolveConfig(config({ output: { formats: ["flat"] } })).output).toEqual({
      path: "./tint",
      formats: ["flat"],
    });
  });

  it("copies the formats array rather than aliasing the input", () => {
    const formats: OutputFormat[] = ["css"];
    const resolved = resolveConfig(config({ output: { formats } }));
    expect(resolved.output.formats).not.toBe(formats);
  });
});

describe("resolveConfig: colors", () => {
  it("puts base first and keeps insertion order, unwrapping { value }", () => {
    const resolved = resolveConfig(
      config({
        colors: {
          error: "#ff0000",
          brand: { value: "#3366ff" },
          base: "#ffffff",
          ok: "#00ff00",
        },
      }),
    );
    expect(resolved.colors).toEqual([
      { name: "base", input: "#ffffff" },
      { name: "error", input: "#ff0000" },
      { name: "brand", input: "#3366ff" },
      { name: "ok", input: "#00ff00" },
    ]);
  });

  it("keeps insertion order when there is no base", () => {
    const resolved = resolveConfig(config({ colors: { b: "#000000", a: "#111111" } }));
    expect(resolved.colors.map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("resolveConfig: reference variant selection", () => {
  it("honours an explicit $reference", () => {
    const resolved = resolveConfig(
      config({ tokens: { surface: { a: { ls: 0, $reference: true }, b: { ls: 5 } } } }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("a");
    expect(resolved.groups.surface?.variants.a?.reference).toBe(true);
    expect(resolved.groups.surface?.variants.b?.reference).toBe(false);
  });

  it("picks the highest value otherwise, resolving lc shortcuts", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { low: { ls: 1 }, high: { ls: 4 }, mid: { ls: 2 } },
          text: { $on: "surface", body: { lc: "body" }, heading: { lc: "heading" } },
        },
      }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("high");
    expect(resolved.groups.text?.referenceVariant).toBe("heading");
  });

  it("excludes pure from auto-selection", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { pure: { ls: "pure" }, a: { ls: 1 } },
          text: { $on: "surface", pure: { lc: "pure" }, a: { lc: 30 } },
        },
      }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("a");
    expect(resolved.groups.text?.referenceVariant).toBe("a");
  });

  it("allows an explicit $reference on a pure variant", () => {
    const resolved = resolveConfig(
      config({
        tokens: { surface: { pure: { ls: "pure", $reference: true }, a: { ls: 1 } } },
      }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("pure");
  });

  it("falls back to the first variant when all are pure", () => {
    const resolved = resolveConfig(
      config({ tokens: { surface: { x: { ls: "pure" }, y: { ls: "pure" } } } }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("x");
  });

  it("breaks ties by insertion order (first wins)", () => {
    const resolved = resolveConfig(
      config({ tokens: { surface: { a: { ls: 2 }, b: { ls: 2 } } } }),
    );
    expect(resolved.groups.surface?.referenceVariant).toBe("a");
  });
});

describe("resolveConfig: variants", () => {
  it("resolves kinds, values and PURE sentinel", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { a: { ls: 3 }, p: { ls: "pure" } },
          text: {
            $on: "surface",
            h: { lc: "heading" },
            n: { lc: 42 },
            p: { lc: "pure" },
          },
        },
      }),
    );
    expect(resolved.groups.surface?.variants.a).toMatchObject({ kind: "ls", value: 3 });
    expect(resolved.groups.surface?.variants.p).toMatchObject({
      kind: "ls",
      value: PURE,
    });
    expect(resolved.groups.text?.variants.h).toMatchObject({ kind: "lc", value: 90 });
    expect(resolved.groups.text?.variants.n).toMatchObject({ kind: "lc", value: 42 });
    expect(resolved.groups.text?.variants.p).toMatchObject({ kind: "lc", value: -1 });
    expect(PURE).toBe(-1);
  });

  it("fills group, name and role", () => {
    const resolved = resolveConfig(config());
    expect(resolved.groups.text?.variants.body).toMatchObject({
      group: "text",
      name: "body",
      role: "text",
    });
    expect(resolved.groups.text?.role).toBe("text");
    const noRole = resolveConfig(config({ tokens: { g: { a: { ls: 0 } } } }));
    expect(noRole.groups.g?.role).toBeNull();
    expect(noRole.groups.g?.variants.a?.role).toBeNull();
  });

  it("resolves `on` to the target's reference variant when omitted", () => {
    const resolved = resolveConfig(config());
    expect(resolved.groups.text?.variants.body?.on).toEqual({
      group: "surface",
      variant: "raised",
    });
    expect(resolved.groups.surface?.variants.default?.on).toBeNull();
  });

  it("lets a variant $on override the group $on, keeping an explicit variant", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { default: { ls: 0 }, raised: { ls: 2 } },
          text: { $on: "surface", a: { lc: 1 }, b: { lc: 2, $on: "surface.default" } },
        },
      }),
    );
    expect(resolved.groups.text?.variants.a?.on).toEqual({
      group: "surface",
      variant: "raised",
    });
    expect(resolved.groups.text?.variants.b?.on).toEqual({
      group: "surface",
      variant: "default",
    });
  });

  it("combines decorative and invert from group and variant", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { default: { ls: 0 } },
          a: {
            $on: "surface",
            $decorative: true,
            x: { lc: 1 },
            y: { lc: 2, $invert: true },
          },
          b: {
            $on: "surface",
            $invert: true,
            x: { lc: 1 },
            y: { lc: 2, $decorative: true },
          },
        },
      }),
    );
    expect(resolved.groups.a?.variants.x).toMatchObject({
      decorative: true,
      invert: false,
    });
    expect(resolved.groups.a?.variants.y).toMatchObject({
      decorative: true,
      invert: true,
    });
    expect(resolved.groups.b?.variants.x).toMatchObject({
      decorative: false,
      invert: true,
    });
    expect(resolved.groups.b?.variants.y).toMatchObject({
      decorative: true,
      invert: true,
    });
  });
});

describe("resolveConfig: scale precedence", () => {
  const tokens: Config["tokens"] = {
    surface: { $scale: 0.03, default: { ls: 0 } },
    panel: { $on: "surface", a: { ls: 1 }, b: { ls: 1, $scale: 0.07 } },
    card: { $on: "surface", $scale: 0.04, a: { ls: 1 } },
    plain: { a: { ls: 1 } },
  };

  it("variant → group → $on group → config → default", () => {
    const resolved = resolveConfig(config({ tokens, scale: 0.05 }));
    expect(resolved.groups.panel?.variants.b?.scale).toBe(0.07); // variant
    expect(resolved.groups.card?.variants.a?.scale).toBe(0.04); // group
    expect(resolved.groups.panel?.variants.a?.scale).toBe(0.03); // inherited from $on group
    expect(resolved.groups.surface?.variants.default?.scale).toBe(0.03); // own group
    expect(resolved.groups.plain?.variants.a?.scale).toBe(0.05); // config
    expect(resolveConfig(config({ tokens })).groups.plain?.variants.a?.scale).toBe(0.02);
  });

  it("inherits from the group's $on even when $on names a variant", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { $scale: 0.09, default: { ls: 0 }, raised: { ls: 1 } },
          panel: { $on: "surface.default", a: { ls: 1 } },
        },
      }),
    );
    expect(resolved.groups.panel?.variants.a?.scale).toBe(0.09);
  });

  it("does not inherit from a variant-level $on", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { $scale: 0.09, default: { ls: 0 } },
          panel: { a: { ls: 1, $on: "surface" } },
        },
      }),
    );
    expect(resolved.groups.panel?.variants.a?.scale).toBe(0.02);
  });

  it("still computes a scale for lc variants", () => {
    const resolved = resolveConfig(config({ scale: 0.01 }));
    expect(resolved.groups.text?.variants.body?.scale).toBe(0.01);
  });
});

describe("resolveConfig: chroma precedence", () => {
  it("variant → group → 1", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          surface: { $chroma: 0.5, a: { ls: 0 }, b: { ls: 1, $chroma: 1.5 } },
          text: { $on: "surface", a: { lc: 1 }, b: { lc: 2, $chroma: 0 } },
        },
      }),
    );
    expect(resolved.groups.surface?.variants.a?.chroma).toBe(0.5);
    expect(resolved.groups.surface?.variants.b?.chroma).toBe(1.5);
    expect(resolved.groups.text?.variants.a?.chroma).toBe(1);
    expect(resolved.groups.text?.variants.b?.chroma).toBe(0);
  });
});

describe("resolveConfig: order", () => {
  function names(order: ReturnType<typeof resolveConfig>["order"]): string[] {
    return order.map((n) => `${n.group}.${n.variant}`);
  }

  it("puts every $on target before its dependents", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          text: { $on: "surface", body: { lc: 80 } },
          icon: { $on: "text.body", a: { lc: 1 } },
          surface: { default: { ls: 0 }, raised: { ls: 1 } },
        },
      }),
    );
    expect(names(resolved.order)).toEqual([
      "surface.default",
      "surface.raised",
      "text.body",
      "icon.a",
    ]);
  });

  it("includes every variant exactly once", () => {
    const resolved = resolveConfig(config());
    expect(names(resolved.order).sort()).toEqual(
      ["surface.default", "surface.raised", "text.body", "text.heading"].sort(),
    );
  });

  it("breaks ties by config insertion order", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          a: { x: { ls: 0 }, y: { ls: 1, $on: "c" } },
          b: { x: { ls: 0 } },
          c: { x: { ls: 0 } },
        },
      }),
    );
    // a.y becomes available after c.x; it is emitted as soon as it is the earliest
    // available node, i.e. right after c.x.
    expect(names(resolved.order)).toEqual(["a.x", "b.x", "c.x", "a.y"]);
  });

  it("prefers the earliest available node even when a later foundation is ready", () => {
    const resolved = resolveConfig(
      config({
        tokens: {
          a: { x: { ls: 0 } },
          b: { x: { lc: 1, $on: "a" } },
          c: { x: { ls: 0 } },
        },
      }),
    );
    expect(names(resolved.order)).toEqual(["a.x", "b.x", "c.x"]);
  });

  it("is deterministic across repeated calls", () => {
    const input = config();
    expect(resolveConfig(input)).toEqual(resolveConfig(input));
  });
});

describe("resolveConfig: overrides", () => {
  it("expands comma lists and resolves values through shortcuts", () => {
    const resolved = resolveConfig(
      config({
        colors: { brand: "#3366ff", error: "#ff0000", warning: "#ffaa00" },
        overrides: {
          "error, warning": {
            text: { body: { lc: "muted" } },
            surface: { raised: { ls: "pure" } },
          },
          brand: {
            text: {
              heading: { lc: 70, $decorative: true, $invert: false, $chroma: 0.5 },
            },
          },
        },
      }),
    );
    expect(resolved.overrides).toEqual({
      error: { "text.body": { value: 60 }, "surface.raised": { value: PURE } },
      warning: { "text.body": { value: 60 }, "surface.raised": { value: PURE } },
      brand: {
        "text.heading": { value: 70, decorative: true, invert: false, chroma: 0.5 },
      },
    });
  });

  it("maps $scale to scale and omits undefined keys", () => {
    const resolved = resolveConfig(
      config({ overrides: { brand: { surface: { raised: { $scale: 0.05 } } } } }),
    );
    expect(resolved.overrides.brand?.["surface.raised"]).toEqual({ scale: 0.05 });
    expect(Object.keys(resolved.overrides.brand?.["surface.raised"] ?? {})).toEqual([
      "scale",
    ]);
  });

  it("merges later keys for the same color over earlier ones", () => {
    const resolved = resolveConfig(
      config({
        colors: { brand: "#3366ff", error: "#ff0000" },
        overrides: {
          "brand,error": { text: { body: { lc: 50, $decorative: true } } },
          error: { text: { body: { lc: 20 } } },
        },
      }),
    );
    expect(resolved.overrides.brand?.["text.body"]).toEqual({
      value: 50,
      decorative: true,
    });
    expect(resolved.overrides.error?.["text.body"]).toEqual({
      value: 20,
      decorative: true,
    });
  });

  it("is empty when there are no overrides", () => {
    expect(resolveConfig(config()).overrides).toEqual({});
    expect(resolveConfig(config({ overrides: {} })).overrides).toEqual({});
  });
});

describe("resolveConfig: foundation groups", () => {
  it("resolves a config whose groups have no $on at all", () => {
    const resolved = resolveConfig(
      config({ tokens: { surface: { default: { ls: 0 }, raised: { ls: 1 } } } }),
    );
    expect(resolved.groups.surface?.variants.default?.on).toBeNull();
    expect(resolved.groups.surface?.variants.raised?.on).toBeNull();
    expect(resolved.order).toEqual([
      { group: "surface", variant: "default" },
      { group: "surface", variant: "raised" },
    ]);
  });
});
