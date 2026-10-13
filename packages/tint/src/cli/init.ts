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

  return `import { border, defineConfig, disabled, emphasis, surface, text } from "@skylerknight/tint";

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
    "warning": { action: { DEFAULT: emphasis(9) } },
  },

  tokens: {
    surface: {
      DEFAULT: surface(0),
      sunken: surface(-1),
      raised: surface(1),
      overlay: surface(2),
    },

    action: {
      DEFAULT: emphasis(8),
      hover: emphasis(7),
      pressed: emphasis(9),
      disabled: disabled.emphasis(8),
      on: text(5, { on: "action" }),
      "on-disabled": disabled.text(5, { on: "action.disabled" }),
    },

    // Raised steps stay inside the light page (L 0.96, step 0.02) through surface(2).
    soft: {
      DEFAULT: surface(1),
      hover: surface(1.5),
      pressed: surface(2),
      disabled: disabled.surface(1),
      on: text(5, { on: "soft" }),
      "on-disabled": disabled.text(5, { on: "soft.disabled" }),
    },

    border: {
      hairline: border(1),
      DEFAULT: border(3),
      firm: border(5),
      focus: border(8, { on: "action" }),
    },

    text: {
      DEFAULT: text(5),
      strong: text(8),
      muted: text(3),
      faint: text(1),
      link: text(5, { chroma: 1.2 }),
    },

    row: {
      DEFAULT: surface(0),
      hover: surface(-1),
      selected: surface(1, { chroma: 1.5 }),
      on: text(5, { on: "row" }),
    },
  },
});
`;
}
