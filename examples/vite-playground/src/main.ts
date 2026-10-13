import "./app.css";
import themes from "virtual:tint";

const palettes: Record<string, string> = {
  neutral: "",
  brand: "tint-brand",
  info: "tint-info",
  success: "tint-success",
  warning: "tint-warning",
  error: "tint-error",
};

const ramp = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const surfaces = [
  ["page 0", "bg-surface"],
  ["sunken 4", "bg-surface-sunken"],
  ["raised 7", "bg-surface-raised"],
  ["overlay 10", "bg-surface-overlay"],
] as const;

function swatch(label: string, bg: string): string {
  return `<div class="space-y-1"><div class="h-10 rounded-md border border-subtle ${bg}"></div><div class="text-center text-[10px] text-muted">${label}</div></div>`;
}

function button(label: string, classes: string): string {
  return `<button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium ${classes}">${label}</button>`;
}

const card = (tint: string) => `
  <section class="${palettes[tint]} rounded-xl border border-default bg-surface-raised p-4 space-y-3">
    <h2 class="text-strong text-lg font-semibold capitalize">${tint}</h2>
    <p class="text-body text-sm">Body text. <span class="text-muted">Muted.</span> <span class="text-faint">Faint.</span></p>
    <div class="flex flex-wrap gap-2">
      ${button("Action", "bg-action text-action-on")}
      ${button("Hover", "bg-action-hover text-action-on")}
      ${button("Pressed", "bg-action-pressed text-action-on")}
      ${button("Disabled", "bg-action-disabled text-action-on-disabled")}
    </div>
    <div class="flex flex-wrap gap-2">
      ${button("Soft", "bg-soft text-soft-on")}
      ${button("Soft hover", "bg-soft-hover text-soft-on")}
      ${button("Soft pressed", "bg-soft-pressed text-soft-on")}
      ${button("Soft disabled", "bg-soft-disabled text-soft-on-disabled")}
    </div>
    <div class="grid grid-cols-4 gap-1">
      ${surfaces.map(([name, bg]) => swatch(name, bg)).join("")}
    </div>
  </section>`;

function rampRow(): string {
  return `<div class="grid grid-cols-11 gap-1">${ramp
    .map((n) => swatch(String(n), `bg-ramp-n${n}`))
    .join("")}</div>`;
}

function themePanel(mode: "light" | "dark"): string {
  return `
    <section class="${mode} rounded-2xl border border-strong bg-surface p-4 space-y-4">
      <header class="flex items-baseline justify-between gap-3">
        <h2 class="text-strong text-xl font-bold capitalize">${mode}</h2>
        <p class="text-muted text-xs">emphasis 0–10 · soft is surface + text · disabled stays on its number</p>
      </header>
      <div>
        <p class="text-body mb-2 text-xs font-medium uppercase tracking-wide">Emphasis</p>
        ${rampRow()}
      </div>
      <div class="grid gap-3 md:grid-cols-2">${Object.keys(palettes).map(card).join("")}</div>
    </section>`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-strong text-2xl font-bold">tint playground</h1>
      <p class="text-muted text-sm">Unified 0–10 scale</p>
    </div>
    <button id="toggle" class="rounded-md border border-strong px-3 py-1.5 text-body hover:bg-surface-overlay">Toggle page</button>
  </header>
  <div class="space-y-6">
    ${themePanel("light")}
    ${themePanel("dark")}
  </div>
  <pre class="mt-8 overflow-auto rounded-lg bg-surface-sunken p-4 text-xs text-muted">${themes
    .map(
      (t) =>
        `${t.name}: ${t.palettes.length} palettes, ${t.diagnostics.length} diagnostics`,
    )
    .join("\n")}</pre>`;

const html = document.documentElement;
const isDark = () =>
  html.classList.contains("dark") ||
  (!html.classList.contains("light") &&
    matchMedia("(prefers-color-scheme: dark)").matches);

document.querySelector("#toggle")!.addEventListener("click", () => {
  const dark = isDark();
  html.classList.toggle("dark", !dark);
  html.classList.toggle("light", dark);
});
