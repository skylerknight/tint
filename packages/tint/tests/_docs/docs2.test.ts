import { test } from "vitest";
import { generate, toCSS, audit, formatAuditTable, calcAPCAabs, parseColor, maxContrast, rgbToOKLCH } from "../../src/index.js";
const sep = (t: string) => console.log(`\n\n===== ${t} =====\n`);
test("docs2", () => {
  sep("FAQ midtone table");
  for (const lc of [45, 50, 55, 60, 65, 70, 75, 80]) {
    const r = generate({ name: "l", mode: "light", colors: { brand: "#7c3aed" }, tokens: { surface: { DEFAULT: { ls: 0 } }, action: { $on: "surface", DEFAULT: { lc } } } });
    const t = r.palettes[0]!.tokens.action!.DEFAULT!;
    const seed = rgbToOKLCH(parseColor("#7c3aed"));
    const w = maxContrast(seed, t.rgb, "lighter").lc, d = maxContrast(seed, t.rgb, "darker").lc;
    console.log(`action lc ${lc} -> ${t.hex} L=${t.oklch.l.toFixed(2)} | white Lc ${calcAPCAabs(parseColor("#fff"), t.rgb).toFixed(1)} | black Lc ${calcAPCAabs(parseColor("#000"), t.rgb).toFixed(1)} | max lighter ${w.toFixed(1)} darker ${d.toFixed(1)}`);
  }

  sep("CHROMA demo");
  const c = generate({ name: "l", mode: "light", colors: { base: "#ffffff", brand: "#7c3aed" }, tokens: {
    surface: { DEFAULT: { ls: 0 }, raised: { ls: 2 }, vivid: { ls: 2, $chroma: 2 }, grey: { ls: 2, $chroma: 0 } },
    text: { $on: "surface", body: { lc: 75 }, soft: { lc: 75, $chroma: 0.3 }, mono: { lc: 75, $chroma: 0 } },
  } });
  console.log(toCSS(c));

  sep("OFFSET/SCALE demo");
  for (const [offset, scale] of [[undefined, undefined], [0, undefined], [0.05, undefined], [undefined, 0.04]] as const) {
    const r = generate({ name: "l", mode: "light", ...(offset !== undefined && { offset }), ...(scale !== undefined && { scale }), colors: { base: "#fff" }, tokens: { surface: { DEFAULT: { ls: 0 }, raised: { ls: 2 }, deep: { ls: 6 } } } });
    const s = r.palettes[0]!.tokens.surface!;
    console.log(`offset=${offset ?? "default"} scale=${scale ?? "default"}: DEFAULT ${s.DEFAULT!.hex} (L ${s.DEFAULT!.oklch.l.toFixed(3)}) raised ${s.raised!.hex} (L ${s.raised!.oklch.l.toFixed(3)}) deep ${s.deep!.hex} (L ${s.deep!.oklch.l.toFixed(3)})`);
  }
  const d = generate({ name: "d", mode: "dark", colors: { base: "#1c1c1f" }, tokens: { surface: { DEFAULT: { ls: 0 }, raised: { ls: 2 }, deep: { ls: 6 } } } });
  const s = d.palettes[0]!.tokens.surface!;
  console.log(`dark default: DEFAULT ${s.DEFAULT!.hex} (L ${s.DEFAULT!.oklch.l.toFixed(3)}) raised ${s.raised!.hex} (L ${s.raised!.oklch.l.toFixed(3)}) deep ${s.deep!.hex} (L ${s.deep!.oklch.l.toFixed(3)})`);

  sep("STATUS recipe");
  const st = generate({ name: "l", mode: "light", colors: { base: "#ffffff", success: "#16a34a", warning: "#d97706", error: "#dc2626" }, tokens: {
    surface: { DEFAULT: { ls: 0 } },
    status: { $on: "surface", $role: "status", DEFAULT: { lc: 60 }, bg: { ls: 2 }, border: { lc: 25, $decorative: true } },
    on: { status: { lc: 60, $on: "status" }, "status-bg": { lc: 75, $on: "status.bg" } },
  } });
  console.log(toCSS(st)); console.log(formatAuditTable(audit(st)));

  sep("SOLID vs PURE in dark");
  const dk = generate({ name: "d", mode: "dark", colors: { base: "#1c1c1f", brand: "#a78bfa" }, tokens: {
    surface: { DEFAULT: { ls: 0 }, raised: { ls: 2, $reference: true } },
    action: { $on: "surface", DEFAULT: { lc: 60 }, strong: { lc: 75 } },
    on: { action: { lc: 60, $on: "action" }, "action-strong": { lc: 60, $on: "action.strong" }, "action-pure": { lc: "pure", $on: "action" } },
  } });
  console.log(toCSS(dk)); console.log(formatAuditTable(audit(dk))); console.log(dk.warnings);

  sep("OVERRIDE demo");
  const ov = generate({ name: "l", mode: "light", colors: { base: "#ffffff", brand: "#7c3aed", warning: "#d97706", info: "#2563eb" }, tokens: {
    surface: { DEFAULT: { ls: 0 } }, action: { $on: "surface", DEFAULT: { lc: 60 } }, on: { action: { lc: 60, $on: "action" } },
  }, overrides: { "warning,info": { action: { DEFAULT: { lc: 70 } } }, warning: { on: { action: { $invert: true, lc: 50 } } } } });
  console.log(toCSS(ov)); console.log(formatAuditTable(audit(ov))); console.log(JSON.stringify(ov.diagnostics.map(d=>d.message)));
});
