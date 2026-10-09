import { test } from "vitest";
import {
  generate, toCSS, toJSON, toFlatMap, toTailwind, toCSSWithTailwind,
  toCSSWithTailwindAndTint, toTailwindIntelliSense, audit, formatAuditTable,
  validateConfig, calcAPCA, parseColor, LC_SHORTCUTS, APCA_THRESHOLDS,
} from "../../src/index.js";

const sep = (t: string) => console.log(`\n\n===== ${t} =====\n`);

test("docs", () => {
  // 1. pitch
  const pitch = {
    name: "light", mode: "light",
    colors: { base: "#ffffff", brand: "#7c3aed", error: "#dc2626" },
    tokens: {
      surface: { DEFAULT: { ls: 0 }, raised: { ls: 2, $reference: true } },
      text: { $on: "surface", heading: { lc: 90 }, body: { lc: 75 } },
      action: { $on: "surface", DEFAULT: { lc: 60 } },
      on: { action: { lc: 60, $on: "action" } },
    },
  } as const;
  const p = generate(pitch);
  sep("PITCH toCSS"); console.log(toCSS(p));
  sep("PITCH diagnostics"); console.log(JSON.stringify(p.diagnostics, null, 2));
  sep("PITCH toCSS oklch"); console.log(toCSS(p, { format: "oklch" }));
  sep("PITCH toTailwind"); console.log(toTailwind(p));
  sep("PITCH toCSSWithTailwind"); console.log(toCSSWithTailwind(p));
  sep("PITCH toCSSWithTailwindAndTint"); console.log(toCSSWithTailwindAndTint(p));
  sep("PITCH toJSON"); console.log(toJSON(p));
  sep("PITCH toFlatMap"); console.log(JSON.stringify(toFlatMap(p), null, 2));
  sep("PITCH intellisense"); console.log(toTailwindIntelliSense(p, { generateTintUtilities: true }));
  sep("PITCH audit"); console.log(formatAuditTable(audit(p)));
  sep("PITCH token sample"); console.log(JSON.stringify(p.palettes[1]!.tokens.text, null, 2));
  sep("PITCH token on.action"); console.log(JSON.stringify(p.palettes[1]!.tokens.on, null, 2));

  // dark version of pitch
  const pitchDark = { ...pitch, name: "dark", mode: "dark", selector: ".dark", prefersColorScheme: "dark",
    colors: { base: "#1c1c1f", brand: "#a78bfa", error: "#f87171" } } as const;
  const pd = generate(pitchDark);
  sep("PITCH DARK toCSS"); console.log(toCSS(pd));
  sep("PITCH DARK audit"); console.log(formatAuditTable(audit(pd)));

  // 2. playground
  const tokens = {
    surface: { $role: "surface", well: { ls: 0 }, DEFAULT: { ls: 1 }, raised: { ls: 2, $reference: true }, lowlight: { ls: 3 }, highlight: { ls: 4 }, selection: { ls: 6 } },
    text: { $on: "surface", $role: "text", heading: { lc: 90 }, body: { lc: 75 }, muted: { lc: 50 }, placeholder: { lc: 40, $decorative: true } },
    border: { $on: "surface", $role: "border", $decorative: true, DEFAULT: { lc: 25 }, subtle: { ls: 3 }, strong: { lc: 40 } },
    action: { $on: "surface", $role: "action", DEFAULT: { lc: 60, $reference: true }, hover: { lc: 68 }, active: { lc: 52 }, disabled: { lc: 25, $decorative: true }, soft: { ls: 3 }, "soft-hover": { ls: 4 }, "soft-active": { ls: 5 } },
    on: { $role: "text", action: { lc: 60, $on: "action" }, "action-soft": { lc: 75, $on: "action.soft" }, "action-disabled": { lc: 45, $on: "action.disabled", $decorative: true } },
    ring: { $on: "surface", $role: "border", DEFAULT: { lc: 65 } },
  } as const;
  const themes = generate([
    { name: "light", mode: "light", selector: ":root", colors: { base: "#ffffff", brand: "#7c3aed", info: "#2563eb", success: "#16a34a", warning: "#d97706", error: "#dc2626" }, tokens },
    { name: "dark", mode: "dark", selector: ".dark", prefersColorScheme: "dark", colors: { base: "#1c1c1f", brand: "#a78bfa", info: "#60a5fa", success: "#4ade80", warning: "#fbbf24", error: "#f87171" }, tokens },
  ]);
  sep("PLAYGROUND diagnostics light"); console.log(JSON.stringify(themes[0]!.diagnostics, null, 2));
  sep("PLAYGROUND diagnostics dark"); console.log(JSON.stringify(themes[1]!.diagnostics, null, 2));
  sep("PLAYGROUND tailwind+tint"); console.log(toCSSWithTailwindAndTint(themes));
  sep("PLAYGROUND audit light"); console.log(formatAuditTable(audit(themes[0]!)));
  sep("PLAYGROUND audit dark"); console.log(formatAuditTable(audit(themes[1]!)));

  // 3. diagnostics showcase
  const diag = generate({
    name: "light", mode: "light",
    colors: { base: "#ffffff", brand: "#7c3aed", text: "#ff0000", neon: "oklch(0.7 0.3 150)" },
    tokens: {
      surface: { DEFAULT: { ls: 0 } },
      action: { $on: "surface", $role: "action", DEFAULT: { lc: 45 }, faint: { lc: 5 }, weak: { lc: 20 } },
      on: { $role: "text", action: { lc: 75, $on: "action" } },
      text: { $on: "surface", $role: "text", tiny: { lc: 30 } },
    },
  });
  sep("DIAG diagnostics"); console.log(JSON.stringify(diag.diagnostics, null, 2));
  sep("DIAG audit"); console.log(formatAuditTable(audit(diag)));

  // 3b. mid-tone fixed with invert / darker action
  const fixed = generate({
    name: "light", mode: "light",
    colors: { base: "#ffffff", brand: "#7c3aed" },
    tokens: {
      surface: { DEFAULT: { ls: 0 } },
      action: { $on: "surface", DEFAULT: { lc: 60 } },
      on: { action: { lc: 60, $on: "action" }, actionPure: { lc: "pure", $on: "action" }, actionInv: { lc: 45, $on: "action", $invert: true } },
    },
  });
  sep("FIXED"); console.log(formatAuditTable(audit(fixed))); console.log(JSON.stringify(fixed.diagnostics, null, 2));

  // 4. validation error
  const v = validateConfig({
    name: "light", mode: "light", colors: { brand: "#7c3aed", bad: "not-a-color" },
    tokens: { text: { $on: "surface", heading: { lc: 90, ls: 2 }, body: { lc: 200 } }, surface: { $on: "text", DEFAULT: { ls: 0 } } },
    extra: true,
  });
  sep("VALIDATION"); console.log(JSON.stringify(v, null, 2));

  // 5. prefersContrast + overrides + offset + chroma
  const hc = generate({
    name: "light-hc", mode: "light", prefersContrast: "more", offset: 0,
    colors: { base: "#ffffff", brand: "#7c3aed", warning: "#d97706" },
    tokens: {
      surface: { DEFAULT: { ls: 0 }, tinted: { ls: 2, $chroma: 1.5 } },
      text: { $on: "surface", body: { lc: "body" } },
      action: { $on: "surface", DEFAULT: { lc: 60 } },
    },
    overrides: { "warning": { action: { DEFAULT: { lc: 70 } } } },
  });
  sep("HC toCSS"); console.log(toCSS(hc));
  sep("HC audit"); console.log(formatAuditTable(audit(hc)));

  // 6. numbers
  sep("NUMBERS");
  console.log("LC_SHORTCUTS", JSON.stringify(LC_SHORTCUTS));
  console.log("APCA_THRESHOLDS", JSON.stringify(APCA_THRESHOLDS));
  console.log("black/white", calcAPCA(parseColor("#000"), parseColor("#fff")));
  console.log("white/black", calcAPCA(parseColor("#fff"), parseColor("#000")));
  console.log("#888/#fff", calcAPCA(parseColor("#888"), parseColor("#fff")));
  console.log("#fff/#888", calcAPCA(parseColor("#fff"), parseColor("#888")));
  console.log("#777/#fff", calcAPCA(parseColor("#777"), parseColor("#fff")), "#fff/#777", calcAPCA(parseColor("#fff"), parseColor("#777")));
  console.log("#767676 on #fff (WCAG 4.5:1)", calcAPCA(parseColor("#767676"), parseColor("#fff")), "#fff on #767676", calcAPCA(parseColor("#fff"), parseColor("#767676")));
});
