import "./app.css";
import themes from "virtual:tint";

// Tailwind only emits classes it can see as literals, so spell the tint-* classes out.
const palettes: Record<string, string> = {
  neutral: "",
  brand: "tint-brand",
  info: "tint-info",
  success: "tint-success",
  warning: "tint-warning",
  error: "tint-error",
};

// Full class names, not a template, so Tailwind's scanner can see them.
const ramp = [
  ["0", "bg-ramp-n0"],
  ["1", "bg-ramp-n1"],
  ["2", "bg-ramp-n2"],
  ["3", "bg-ramp-n3"],
  ["4", "bg-ramp-n4"],
  ["5", "bg-ramp-n5"],
  ["6", "bg-ramp-n6"],
  ["7", "bg-ramp-n7"],
  ["8", "bg-ramp-n8"],
  ["9", "bg-ramp-n9"],
  ["10", "bg-ramp-n10"],
] as const;

const surfaces = [
  ["sunken −1", "bg-surface-sunken"],
  ["page 0", "bg-surface"],
  ["raised 1", "bg-surface-raised"],
  ["overlay 2", "bg-surface-overlay"],
] as const;

function swatch(label: string, bg: string): string {
  return `<div class="space-y-1"><div class="h-8 rounded border border-subtle ${bg}" title="${label}"></div><div class="text-center text-[10px] text-muted">${label}</div></div>`;
}

function button(label: string, classes: string): string {
  return `<button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-border-focus ${classes}">${label}</button>`;
}

const card = (tint: string) => `
  <section class="${palettes[tint]} rounded-xl border border-default bg-surface-raised p-5 space-y-3">
    <h2 class="text-strong text-lg font-semibold capitalize">${tint}</h2>
    <p class="text-body">Body text. <span class="text-muted">Muted.</span> <span class="text-faint">Faint.</span></p>
    <div class="flex flex-wrap gap-2">
      ${button("Action", "bg-action text-action-on hover:bg-action-hover active:bg-action-pressed")}
      ${button("Hover", "bg-action-hover text-action-on")}
      ${button("Pressed", "bg-action-pressed text-action-on")}
      ${button("Disabled", "bg-action-disabled text-action-on-disabled")}
    </div>
    <div class="flex flex-wrap gap-2">
      ${button("Soft", "bg-soft text-soft-on hover:bg-soft-hover active:bg-soft-pressed")}
      ${button("Hover", "bg-soft-hover text-soft-on")}
      ${button("Pressed", "bg-soft-pressed text-soft-on")}
      ${button("Disabled", "bg-soft-disabled text-soft-on-disabled")}
    </div>
    <div class="grid grid-cols-4 gap-1">
      ${surfaces.map(([name, bg]) => swatch(name, bg)).join("")}
    </div>
  </section>`;

function rampRow(): string {
  return `<div class="grid grid-cols-11 gap-1">${ramp
    .map(([name, bg]) => swatch(name, bg))
    .join("")}</div>`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-strong text-2xl font-bold">tint playground</h1>
      <p class="text-faint text-xs">unified prototype — signed surfaces, emphasis 0–10</p>
    </div>
    <button id="toggle" type="button" class="rounded-md border border-strong px-3 py-1.5 text-body hover:bg-surface-overlay">Toggle dark</button>
  </header>
  <section class="mb-6 space-y-2">
    <h2 class="text-strong text-sm font-medium uppercase tracking-wide">Emphasis 0–10</h2>
    ${rampRow()}
  </section>
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">${Object.keys(palettes).map(card).join("")}</div>
  <pre class="mt-8 overflow-auto rounded-lg bg-surface-sunken p-4 text-xs text-muted">${themes
    .map(
      (t) =>
        `${t.name}: ${t.palettes.length} palettes, ${t.diagnostics.length} diagnostics`,
    )
    .join("\n")}</pre>`;

// Without a class the OS preference decides; a class forces a mode either way.
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
