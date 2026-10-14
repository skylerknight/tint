// @ts-nocheck — old level/state API, excluded on proto/numeric-scale
import { describe, expect, it } from "vitest";
import * as publicApi from "../../src/index.js";
import { emphasis, surface, text } from "../../src/v4/kinds.js";
import { PAGE, type ResolvedToken } from "../../src/v4/graph.js";
import {
  resolveConfig,
  type ResolvedConfig,
  type ResolvedExpansion,
} from "../../src/v4/resolve.js";

function mustResolve(input: unknown): ResolvedConfig {
  const result = resolveConfig(input);
  expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
  return result.config;
}

function expansion(
  config: ResolvedConfig,
  theme: string,
  palette: string,
): ResolvedExpansion {
  const found = config.expansions.find(
    (entry) => entry.theme === theme && entry.palette === palette,
  );
  if (found === undefined) {
    throw new Error(`missing expansion ${theme}/${palette}`);
  }
  return found;
}

function token(exp: ResolvedExpansion, id: string): ResolvedToken {
  const found = [...exp.tokens, ...exp.generated].find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing token ${id}`);
  return found;
}

describe("backdrop sets (§6.2)", () => {
  const config = mustResolve({
    palette: { neutral: "#71717a" },
    tokens: {
      surface: {
        DEFAULT: surface(),
        hover: surface({ state: "hover" }),
        disabled: surface({ state: "disabled" }),
      },
      panel: {
        DEFAULT: surface("raised", { on: "surface" }),
      },
      action: {
        DEFAULT: emphasis(),
        hover: emphasis({ state: "hover" }),
        pressed: emphasis({ state: "pressed" }),
        disabled: emphasis({ state: "disabled" }),
        on: text({ on: "action" }),
        "on-disabled": text({ state: "disabled", on: "action" }),
      },
      row: {
        DEFAULT: surface(),
        hover: surface({ state: "hover" }),
        selected: surface({ state: "selected" }),
        "selected-hover": surface({ state: "selected-hover" }),
        "selected-disabled": surface({ state: "selected-disabled" }),
        disabled: surface({ state: "disabled" }),
        on: text({ on: "row.selected" }),
        "on-disabled": text({ state: "selected-disabled", on: "row.selected" }),
      },
      label: {
        DEFAULT: text({ on: "action.hover" }),
      },
      ink: {
        DEFAULT: text(),
      },
      well: {
        DEFAULT: surface(),
      },
      note: {
        DEFAULT: text({ state: "disabled" }),
      },
      orphan: {
        DEFAULT: text({ state: "disabled", on: "panel" }),
      },
    },
  });
  const exp = expansion(config, "light", "neutral");

  it("uses the first surface group's DEFAULT as the base surface", () => {
    expect(exp.baseSurface).toBe("surface.DEFAULT");
  });

  it("omits on for a non-surface: the base surface token only", () => {
    expect(token(exp, "ink.DEFAULT").backdrop).toEqual(["surface.DEFAULT"]);
    expect(token(exp, "action.DEFAULT").backdrop).toEqual(["surface.DEFAULT"]);
  });

  it("omits on for a surface: the page", () => {
    expect(token(exp, "surface.DEFAULT").backdrop).toEqual([PAGE]);
    expect(token(exp, "well.DEFAULT").backdrop).toEqual([PAGE]);
    expect(token(exp, "surface.hover").backdrop).toEqual([PAGE]);
  });

  it("expands on: group to DEFAULT plus states, minus disabled", () => {
    expect(token(exp, "action.on").backdrop).toEqual([
      "action.DEFAULT",
      "action.hover",
      "action.pressed",
    ]);
  });

  it("expands on: group.token to that token plus its states, minus disabled", () => {
    expect(token(exp, "row.on").backdrop).toEqual(["row.selected", "row.selected-hover"]);
    expect(token(exp, "label.DEFAULT").backdrop).toEqual(["action.hover"]);
  });

  it("steps a surface with on from that surface instead of the page", () => {
    expect(token(exp, "panel.DEFAULT").backdrop).toEqual([
      "surface.DEFAULT",
      "surface.hover",
    ]);
  });

  it("points a disabled token at the disabled state of its target", () => {
    expect(token(exp, "action.on-disabled").backdrop).toEqual(["action.disabled"]);
    expect(token(exp, "row.on-disabled").backdrop).toEqual(["row.selected-disabled"]);
    expect(token(exp, "note.DEFAULT").backdrop).toEqual(["surface.disabled"]);
  });

  it("keeps the ordinary set when the target has no disabled state", () => {
    expect(token(exp, "orphan.DEFAULT").backdrop).toEqual(["panel.DEFAULT"]);
  });
});

describe("base surface preference", () => {
  it("falls through to the first ordinal-3 surface when DEFAULT is not base", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        well: { DEFAULT: surface("sunken") },
        card: { inset: surface("flat"), DEFAULT: surface() },
        text: { DEFAULT: text() },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(exp.baseSurface).toBe("card.DEFAULT");
    expect(token(exp, "text.DEFAULT").backdrop).toEqual(["card.DEFAULT"]);
  });

  it("uses the first ordinal-3 surface when the first surface group has no DEFAULT", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        well: { side: surface("sunken"), base: surface() },
        text: { DEFAULT: text() },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(exp.baseSurface).toBe("well.base");
    expect(token(exp, "text.DEFAULT").backdrop).toEqual(["well.base"]);
  });

  it("prefers DEFAULT over an earlier ordinal-3 token in that group", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        surface: { inset: surface(), DEFAULT: surface() },
        text: { DEFAULT: text() },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(exp.baseSurface).toBe("surface.DEFAULT");
    expect(token(exp, "text.DEFAULT").backdrop).toEqual(["surface.DEFAULT"]);
  });

  it("uses the page when the template has no ordinal-3 surface", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: { text: { DEFAULT: text() } },
    });
    const exp = expansion(config, "light", "neutral");
    expect(exp.baseSurface).toBe(PAGE);
    expect(token(exp, "text.DEFAULT").backdrop).toEqual([PAGE]);
  });
});

describe("state → rest linking", () => {
  it("links selected-hover → selected → rest and solves in that dependency order", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        row: {
          "selected-hover": surface({ state: "selected-hover" }),
          selected: surface({ state: "selected" }),
          DEFAULT: surface(),
        },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(token(exp, "row.selected-hover").derivesFrom).toBe("row.selected");
    expect(token(exp, "row.selected").derivesFrom).toBe("row.DEFAULT");
    expect(token(exp, "row.DEFAULT").derivesFrom).toBeUndefined();
    expect(exp.tokens.map((entry) => entry.id)).toEqual([
      "row.selected-hover",
      "row.selected",
      "row.DEFAULT",
    ]);
    expect(exp.order).toEqual(["row.DEFAULT", "row.selected", "row.selected-hover"]);
    expect(exp.generated).toEqual([]);
  });

  it("generates the missing prefix and rest internally", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        row: { "selected-hover": surface({ state: "selected-hover" }) },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(token(exp, "row.selected-hover").derivesFrom).toBe("row.__selected_surface_3");
    expect(token(exp, "row.__selected_surface_3").derivesFrom).toBe(
      "row.__rest_surface_3",
    );
    expect(token(exp, "row.__rest_surface_3").value.states).toEqual([]);
    expect(token(exp, "row.__selected_surface_3").value.states).toEqual(["selected"]);
    expect(exp.tokens.map((entry) => entry.id)).toEqual(["row.selected-hover"]);
    expect(exp.order).toEqual([
      "row.__rest_surface_3",
      "row.__selected_surface_3",
      "row.selected-hover",
    ]);
    expect(exp.diagnostics.map((entry) => entry.id)).toEqual([
      "row.__selected_surface_3",
      "row.__rest_surface_3",
    ]);
  });

  it("does not link a state to a rest of a different level", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        row: {
          DEFAULT: surface(),
          hover: surface("raised", { state: "hover" }),
        },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(token(exp, "row.hover").derivesFrom).toBe("row.__rest_surface_4");
    expect(token(exp, "row.DEFAULT").derivesFrom).toBeUndefined();
  });

  it("prefers DEFAULT when several rests share the kind and level", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        row: {
          base: surface(),
          DEFAULT: surface(),
          hover: surface({ state: "hover" }),
        },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(token(exp, "row.hover").derivesFrom).toBe("row.DEFAULT");
  });
});

describe("tune precedence", () => {
  it("applies token < tune < theme palette delta", () => {
    const config = mustResolve({
      palette: {
        brand: { color: "#111111", tune: { action: { chroma: 0.5 } } },
        plain: "#222222",
      },
      themes: {
        light: { mode: "light" },
        dark: {
          mode: "dark",
          palette: { brand: { tune: { action: { chroma: 0.9 } } } },
        },
        swap: { mode: "dark", palette: { brand: "#abcdef" } },
      },
      tokens: {
        action: { DEFAULT: emphasis({ chroma: 0.2 }) },
      },
    });

    expect(
      token(expansion(config, "light", "brand"), "action.DEFAULT").value.chroma,
    ).toBe(0.5);
    expect(
      token(expansion(config, "light", "plain"), "action.DEFAULT").value.chroma,
    ).toBe(0.2);
    expect(token(expansion(config, "dark", "brand"), "action.DEFAULT").value.chroma).toBe(
      0.9,
    );
    expect(token(expansion(config, "dark", "plain"), "action.DEFAULT").value.chroma).toBe(
      0.2,
    );
    const swapped = expansion(config, "swap", "brand");
    expect(swapped.color).toBe("#abcdef");
    expect(token(swapped, "action.DEFAULT").value.chroma).toBe(0.5);
  });

  it("treats group as DEFAULT, group.* as the group, and group.token as one token", () => {
    const config = mustResolve({
      palette: {
        brand: {
          color: "#111111",
          tune: {
            "action.*": { chroma: 0.2 },
            action: { chroma: 0.5 },
            "action.hover": { chroma: 0.8 },
          },
        },
      },
      tokens: {
        action: {
          DEFAULT: emphasis({ chroma: 0.1 }),
          hover: emphasis({ state: "hover", chroma: 0.1 }),
          pressed: emphasis({ state: "pressed", chroma: 0.1 }),
        },
      },
    });
    const exp = expansion(config, "light", "brand");
    expect(token(exp, "action.DEFAULT").value.chroma).toBe(0.5);
    expect(token(exp, "action.hover").value.chroma).toBe(0.8);
    expect(token(exp, "action.pressed").value.chroma).toBe(0.2);
  });

  it("replaces a token when tune passes a kind, and lets a theme wildcard win", () => {
    const config = mustResolve({
      palette: {
        warning: { color: "#333333", tune: { action: emphasis("bold") } },
        brand: { color: "#111111", tune: { "action.hover": { chroma: 0.4 } } },
      },
      themes: {
        light: { mode: "light" },
        dark: {
          mode: "dark",
          palette: { brand: { tune: { "action.*": { chroma: 0.9 } } } },
        },
      },
      tokens: {
        action: {
          DEFAULT: emphasis({ chroma: 0.2 }),
          hover: emphasis({ state: "hover", chroma: 0.2 }),
        },
      },
    });
    expect(token(expansion(config, "light", "warning"), "action.DEFAULT").value).toEqual({
      kind: "emphasis",
      ordinal: 4,
      states: [],
    });
    expect(token(expansion(config, "light", "brand"), "action.hover").value.chroma).toBe(
      0.4,
    );
    expect(token(expansion(config, "dark", "brand"), "action.hover").value.chroma).toBe(
      0.9,
    );
    expect(token(expansion(config, "dark", "brand"), "action.DEFAULT").value.chroma).toBe(
      0.9,
    );
  });
});

describe("theme extends", () => {
  const config = mustResolve({
    contrast: { level: "max" },
    palette: {
      brand: { color: "#000000", exact: true, tune: { action: { chroma: 0.3 } } },
    },
    themes: {
      light: {
        mode: "light",
        selector: ".light",
        media: true,
        palette: { brand: "#aaaaaa" },
      },
      dim: {
        extends: "light",
        palette: { brand: { color: "#bbbbbb", tune: { action: { chroma: 0.6 } } } },
      },
      "light-hc": {
        extends: "dim",
        contrast: { level: "more" },
        media: "(prefers-contrast: more)",
      },
    },
    tokens: { action: { DEFAULT: emphasis({ chroma: 0.1 }) } },
  });

  it("inherits mode, selector, and media, and lets the child override", () => {
    expect(config.themes.map((theme) => theme.name)).toEqual([
      "light",
      "dim",
      "light-hc",
    ]);
    expect(config.themes[0]).toEqual({
      name: "light",
      mode: "light",
      selector: ".light",
      media: true,
      contrastLevel: "max",
    });
    expect(config.themes[1]).toEqual({
      name: "dim",
      mode: "light",
      selector: ".light",
      media: true,
      contrastLevel: "max",
      extends: "light",
    });
    expect(config.themes[2]).toEqual({
      name: "light-hc",
      mode: "light",
      selector: ".light",
      media: "(prefers-contrast: more)",
      contrastLevel: "more",
      extends: "dim",
    });
  });

  it("merges palette deltas down the extends chain", () => {
    const light = expansion(config, "light", "brand");
    const dim = expansion(config, "dim", "brand");
    const hc = expansion(config, "light-hc", "brand");
    expect(light.color).toBe("#aaaaaa");
    expect(token(light, "action.DEFAULT").value.chroma).toBe(0.3);
    expect(light.exact).toBe(true);
    expect(dim.color).toBe("#bbbbbb");
    expect(token(dim, "action.DEFAULT").value.chroma).toBe(0.6);
    expect(dim.exact).toBe(true);
    expect(hc.color).toBe("#bbbbbb");
    expect(token(hc, "action.DEFAULT").value.chroma).toBe(0.6);
    expect(hc.contrastLevel).toBe("more");
    expect(hc.exact).toBe(true);
  });

  it("reports an extends cycle and still resolves each theme's own fields", () => {
    const result = resolveConfig({
      palette: { neutral: "#000" },
      themes: {
        a: { mode: "light", selector: ".a", extends: "b" },
        b: { mode: "dark", selector: ".b", extends: "a" },
      },
      tokens: { text: { DEFAULT: text() } },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain(
      "Theme extends cycle: a → b → a.",
    );
    expect(
      result.config.themes.map((theme) => [theme.name, theme.mode, theme.selector]),
    ).toEqual([
      ["a", "light", ".a"],
      ["b", "dark", ".b"],
    ]);
  });
});

describe("on graph errors", () => {
  it("reports a cycle as a.b → c.d → a.b", () => {
    const result = resolveConfig({
      palette: { neutral: "#000" },
      tokens: {
        a: { b: { kind: "surface", on: "c.d" } },
        c: { d: { kind: "surface", on: "a.b" } },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "Backdrop cycle: a.b → c.d → a.b.",
    ]);
    const found = result.issues.find((issue) =>
      issue.message.includes("a.b → c.d → a.b"),
    );
    expect(found?.path).toBe("tokens.a.b.on");
    expect(found?.expected).toBe("on edges that do not form a cycle");
  });

  it("reports a self-reference through the token path and through the group", () => {
    const viaPath = resolveConfig({
      palette: { neutral: "#000" },
      tokens: { a: { b: { kind: "surface", on: "a.b" } } },
    });
    expect(viaPath.issues.map((issue) => issue.message)).toEqual([
      'Token "a.b" cannot use itself as a backdrop.',
    ]);
    const viaGroup = resolveConfig({
      palette: { neutral: "#000" },
      tokens: { a: { DEFAULT: { kind: "surface", on: "a" } } },
    });
    expect(viaGroup.issues.map((issue) => issue.message)).toEqual([
      'Token "a.DEFAULT" cannot use itself as a backdrop.',
    ]);
  });

  it("suggests an unknown group and an unknown token", () => {
    const group = resolveConfig({
      palette: { neutral: "#000" },
      tokens: {
        action: { DEFAULT: emphasis() },
        text: { DEFAULT: text({ on: "actoin" }) },
      },
    });
    const groupIssue = group.issues.find(
      (issue) => issue.path === "tokens.text.DEFAULT.on",
    );
    expect(groupIssue?.message).toBe('Unknown backdrop "actoin".');
    expect(groupIssue?.didYouMean).toBe("action");
    expect(groupIssue?.fix).toEqual({
      path: "tokens.text.DEFAULT.on",
      replace: "action",
    });

    const tokenIssue = resolveConfig({
      palette: { neutral: "#000" },
      tokens: {
        surface: {
          DEFAULT: surface(),
          hover: surface({ state: "hover" }),
        },
        text: { DEFAULT: text({ on: "surface.hovr" }) },
      },
    }).issues.find((issue) => issue.path === "tokens.text.DEFAULT.on");
    expect(tokenIssue?.didYouMean).toBe("surface.hover");
    expect(tokenIssue?.hint).toBe('Did you mean "surface.hover"?');
  });
});

describe("config order", () => {
  it("keeps theme, palette, and token output in config order", () => {
    const config = mustResolve({
      palette: { zed: "#111111", alpha: { color: "#222222", default: true } },
      themes: {
        dark: { mode: "dark" },
        light: { mode: "light" },
      },
      tokens: {
        z: { DEFAULT: surface({ on: "a" }) },
        a: { DEFAULT: surface() },
        m: { DEFAULT: text() },
      },
    });

    expect(config.palette.map((color) => [color.name, color.isDefault])).toEqual([
      ["zed", false],
      ["alpha", true],
    ]);
    expect(config.expansions.map((entry) => `${entry.theme}/${entry.palette}`)).toEqual([
      "dark/zed",
      "dark/alpha",
      "light/zed",
      "light/alpha",
    ]);

    const exp = expansion(config, "dark", "zed");
    expect(exp.tokens.map((entry) => entry.id)).toEqual([
      "z.DEFAULT",
      "a.DEFAULT",
      "m.DEFAULT",
    ]);
    expect(exp.baseSurface).toBe("z.DEFAULT");
    expect(exp.order).toEqual(["a.DEFAULT", "z.DEFAULT", "m.DEFAULT"]);
  });

  it("breaks solve-order ties by config order", () => {
    const config = mustResolve({
      palette: { neutral: "#000" },
      tokens: {
        b: { DEFAULT: surface() },
        a: { DEFAULT: surface() },
      },
    });
    const exp = expansion(config, "light", "neutral");
    expect(exp.tokens.map((entry) => entry.id)).toEqual(["b.DEFAULT", "a.DEFAULT"]);
    expect(exp.order).toEqual(["b.DEFAULT", "a.DEFAULT"]);
  });

  it("is stable across two resolves", () => {
    const input = {
      palette: { brand: "#111111", neutral: "#222222" },
      themes: { dark: { mode: "dark" }, light: { mode: "light", extends: "dark" } },
      tokens: {
        surface: { DEFAULT: surface(), hover: surface({ state: "hover" }) },
        action: {
          DEFAULT: emphasis(),
          hover: emphasis({ state: "hover" }),
          on: text({ on: "action" }),
        },
      },
    };
    expect(resolveConfig(input)).toEqual(resolveConfig(input));
  });
});

describe("public entry", () => {
  it("keeps the v4 graph off the v3 public entry", () => {
    expect(publicApi).not.toHaveProperty("buildTokenGraph");
    expect(publicApi).not.toHaveProperty("PAGE");
  });
});
