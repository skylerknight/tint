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
  io.out(`  1. Tweak the seed colors and tokens in ${CONFIG_FILE_NAME}`);
  io.out("  2. Run `tint check` to validate and review contrast warnings");
  io.out("  3. Run `tint build` to write ./tint/<theme>/tokens.css");
  io.out("  4. Run `tint inspect` to see the full contrast audit");
  return 0;
}

export function renderConfig(options: { brand: string; dark: boolean }): string {
  const { brand, dark } = options;
  const light = `{
    name: "light",
    mode: "light",
    colors: lightColors,
    tokens,
  }`;
  const darkTheme = `{
    name: "dark",
    mode: "dark",
    // Applied under .dark and automatically when the OS prefers dark.
    selector: ".dark",
    prefersColorScheme: "dark",
    colors: darkColors,
    tokens,
  }`;

  const seeds = dark
    ? `// Seed colors. Every seed gets the full token structure below, so \`brand\`,
// \`error\` and \`success\` all produce surface.*, text.*, action.* … and a
// \`tint-error\` class can swap a whole component's palette.
const lightColors = {
  base: "#ffffff",
  brand: "${brand}",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
};

const darkColors = {
  base: "#1c1c1f",
  brand: "${brand}",
  success: "#4ade80",
  warning: "#fbbf24",
  error: "#f87171",
};`
    : `// Seed colors. Every seed gets the full token structure below, so \`brand\`,
// \`error\` and \`success\` all produce surface.*, text.*, action.* … and a
// \`tint-error\` class can swap a whole component's palette.
const lightColors = {
  base: "#ffffff",
  brand: "${brand}",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
};`;

  const exported = dark
    ? `export default defineConfig([
  ${light},
  ${darkTheme},
]);`
    : `export default defineConfig(${light});`;

  return `import { defineConfig } from "@skylerknight/tint";

${seeds}

// Token structure. Two kinds of variants:
//   - \`ls\` (lightness steps): offsets from the reference surface, for layering.
//   - \`lc\` (APCA contrast, 0–108): tint solves a color that reaches that contrast
//     against the \`$on\` reference, so light and dark modes need no separate values.
// \`$reference: true\` marks the variant other groups mean when they say \`$on: "group"\`.
// \`$decorative: true\` skips the accessibility minimums for that variant or group.
const tokens = {
  surface: { $role: "surface", well: { ls: 0 }, DEFAULT: { ls: 1 }, raised: { ls: 2, $reference: true }, highlight: { ls: 4 } },
  text: { $on: "surface", $role: "text", heading: { lc: 90 }, body: { lc: 75 }, muted: { lc: 50 }, placeholder: { lc: 40, $decorative: true } },
  border: { $on: "surface", $role: "border", $decorative: true, DEFAULT: { lc: 25 }, subtle: { ls: 3 }, strong: { lc: 40 } },
  action: { $on: "surface", $role: "action", DEFAULT: { lc: 60, $reference: true }, hover: { lc: 68 }, active: { lc: 52 }, soft: { ls: 3 }, "soft-hover": { ls: 4 } },
  on: { $role: "text", action: { lc: 60, $on: "action" }, "action-soft": { lc: 75, $on: "action.soft" } },
  ring: { $on: "surface", $role: "border", DEFAULT: { lc: 65 } },
} as const;

${exported}
`;
}
