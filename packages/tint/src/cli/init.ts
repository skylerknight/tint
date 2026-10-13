import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLIError } from "./shared.js";
import { paint, type IO } from "./ui.js";

export interface InitFlags {
  dark?: boolean | undefined;
  brand?: string | undefined;
  yes?: boolean | undefined;
}

export const CONFIG_FILE_NAME = "tint.config.ts";
export const DEFAULT_BRAND = "#2563eb";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalise a 3- or 6-digit hex color to `#rrggbb`; returns null when invalid. */
export function normalizeHex(input: string): string | null {
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  let digits = match[1]!.toLowerCase();
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return `#${digits}`;
}

function isYes(answer: string, def: boolean): boolean {
  const a = answer.trim().toLowerCase();
  if (a === "") return def;
  return a === "y" || a === "yes" || a === "true";
}

export async function init(io: IO, flags: InitFlags): Promise<number> {
  const target = resolve(io.cwd, CONFIG_FILE_NAME);
  const interactive = flags.yes !== true;

  if (flags.brand !== undefined && normalizeHex(flags.brand) === null) {
    throw new CLIError(
      `Invalid --brand color "${flags.brand}". Expected a hex color like #2563eb.`,
    );
  }

  if (existsSync(target)) {
    if (interactive) {
      const answer = await io.prompt(
        `${CONFIG_FILE_NAME} already exists. Overwrite? (y/N)`,
      );
      if (!isYes(answer, false)) {
        io.out("Aborted; existing config left untouched.");
        return 0;
      }
    } else {
      io.out(
        `${paint.yellow(io.color)("warn")} overwriting existing ${CONFIG_FILE_NAME}`,
      );
    }
  }

  let brand = flags.brand !== undefined ? normalizeHex(flags.brand)! : DEFAULT_BRAND;
  if (interactive && flags.brand === undefined) {
    for (;;) {
      const answer = await io.prompt("Brand color (hex)", DEFAULT_BRAND);
      const hex = normalizeHex(answer);
      if (hex) {
        brand = hex;
        break;
      }
      io.err(`"${answer}" is not a hex color. Try something like #2563eb.`);
    }
  }

  let dark = flags.dark === true;
  if (interactive && !dark) {
    dark = isYes(await io.prompt("Include a dark theme? (Y/n)"), true);
  }

  writeFileSync(target, renderConfig({ brand, dark }));
  io.out(`${paint.green(io.color)("✓")} Created ${CONFIG_FILE_NAME}`);
  io.out("");
  io.out("Next steps:");
  io.out(`  1. Tweak the palette colors and tokens in ${CONFIG_FILE_NAME}`);
  io.out("  2. Run `tint check` to validate and review contrast warnings");
  io.out("  3. Run `tint build` to write ./tint/<theme>/tokens.css");
  io.out("  4. Run `tint inspect` to see the full contrast audit");
  return 0;
}

export function renderConfig(options: { brand: string; dark: boolean }): string {
  const { brand, dark } = options;
  const themes = dark
    ? `{
    light: { mode: "light", selector: ".light", media: true },
    dark: {
      mode: "dark",
      selector: ".dark",
      media: true,
      palette: { brand: "#a78bfa" },
    },
  }`
    : `{
    light: { mode: "light", selector: ".light", media: true },
  }`;

  return `import { border, defineConfig, emphasis, surface, text } from "@skylerknight/tint";

// v4 starter (docs/v4-spec.md §8, without the light-hc theme).
// Every palette color gets the same tokens. \`tint-danger\` re-skins a subtree.
export default defineConfig({
  contrast: { algorithm: "apca", level: "standard" },

  palette: {
    neutral: "#71717a",
    brand: { color: "${brand}", exact: true },
    danger: "#dc2626",
    warning: "#d97706",
  },

  themes: ${themes},

  overrides: {
    "warning": { action: { DEFAULT: emphasis(4) } },
  },

  tokens: {
    surface: {
      sunken: surface(-2),
      DEFAULT: surface(0),
      raised: surface(1),
      floating: surface(2),
    },

    action: {
      DEFAULT: emphasis(3),
      hover: emphasis(3.5),
      pressed: emphasis(4),
      disabled: emphasis(2, { chroma: 0.3, lc: 15 }),
      on: text(3, { on: "action" }),
      "on-disabled": text(-1, { on: "action.disabled", chroma: 0.3 }),
    },

    soft: {
      DEFAULT: emphasis(2),
      hover: emphasis(2.1),
      pressed: emphasis(2.15),
      on: text(3, { on: "soft" }),
    },

    border: {
      hairline: border(1),
      DEFAULT: border(3),
      firm: border(4),
      focus: border(4, { on: "action" }),
    },

    text: {
      DEFAULT: text(3),
      strong: text(4),
      muted: text(2),
      faint: text(1),
      link: text(3, { chroma: 1.2 }),
    },

    row: {
      DEFAULT: surface(0),
      hover: surface(1),
      selected: surface(2, { chroma: 1.5 }),
      on: text(3, { on: "row" }),
    },
  },
});
`;
}
