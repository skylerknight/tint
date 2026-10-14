import "./app.css";
import { mountEditor } from "./panel.ts";

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
  ["overlay 3", "bg-surface-overlay"],
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

const samplePalettes = [
  "neutral",
  "brand",
  "info",
  "success",
  "warning",
  "error",
] as const;

function samplePaletteButton(name: string, pressed: boolean): string {
  return `<button type="button" data-sample-palette="${name}" aria-pressed="${pressed ? "true" : "false"}" class="rounded-md border border-default px-2 py-1 text-xs capitalize text-body">${name}</button>`;
}

function sampleUi(): string {
  return `<section id="sample-ui" class="mb-8 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-strong text-sm font-medium uppercase tracking-wide">Sample UI</h2>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Sample palette">
        ${samplePalettes.map((name) => samplePaletteButton(name, name === "neutral")).join("")}
      </div>
    </div>
    <div id="sample" class="max-w-md">
      <article class="space-y-4 rounded-xl border border-default bg-surface-raised p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <h3 class="text-strong text-lg font-semibold">Project update</h3>
            <p class="text-muted text-sm">A short note about what changed, set in muted text.</p>
          </div>
          <svg class="h-6 w-6 shrink-0 text-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3.5 14.2 8l4.8.6-3.5 3.3.9 4.8L12 14.6 7.6 16.7l.9-4.8L5 8.6 9.8 8 12 3.5z" />
          </svg>
        </div>
        <div class="h-px bg-divider" role="separator"></div>
        <label class="block space-y-1" for="sample-input">
          <span class="text-sm font-medium text-body">Email</span>
          <input id="sample-input" type="email" placeholder="you@example.com" class="w-full rounded-md border border-input bg-surface px-3 py-2 text-body outline-none placeholder:text-input-placeholder focus:outline-4 focus:outline-solid focus:outline-offset-2 focus:outline-input-focus" />
        </label>
        <div class="flex flex-wrap gap-2">
          ${button("Save", "bg-action text-action-on hover:bg-action-hover")}
          ${button("Soft", "bg-soft text-soft-on hover:bg-soft-hover")}
          <button type="button" disabled class="rounded-md bg-action-disabled px-3 py-1.5 text-sm font-medium text-action-on-disabled">Disabled</button>
        </div>
      </article>
    </div>
  </section>`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-strong text-2xl font-bold">tint playground</h1>
      <p class="text-faint text-xs">unified prototype — edit the palette and scales live</p>
    </div>
    <button id="toggle" type="button" class="rounded-md border border-strong px-3 py-1.5 text-body hover:bg-surface-overlay">Toggle dark</button>
  </header>
  <section class="mb-6 space-y-2">
    <h2 class="text-strong text-sm font-medium uppercase tracking-wide">Emphasis 0–10</h2>
    ${rampRow()}
  </section>
  ${sampleUi()}
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${Object.keys(palettes).map(card).join("")}</div>`;

// Without a class the OS preference decides; a class forces a mode either way.
const html = document.documentElement;
const isDark = () =>
  html.classList.contains("dark") ||
  (!html.classList.contains("light") &&
    matchMedia("(prefers-color-scheme: dark)").matches);

mountEditor(document.querySelector<HTMLElement>("#editor")!);

const sample = document.querySelector<HTMLElement>("#sample")!;
for (const paletteButton of document.querySelectorAll<HTMLButtonElement>(
  "[data-sample-palette]",
)) {
  paletteButton.addEventListener("click", () => {
    const name = paletteButton.dataset.samplePalette ?? "neutral";
    sample.className = name === "neutral" ? "max-w-md" : `max-w-md tint-${name}`;
    for (const other of document.querySelectorAll<HTMLButtonElement>(
      "[data-sample-palette]",
    )) {
      other.setAttribute("aria-pressed", other === paletteButton ? "true" : "false");
    }
  });
}

document.querySelector("#toggle")!.addEventListener("click", () => {
  const dark = isDark();
  html.classList.toggle("dark", !dark);
  html.classList.toggle("light", dark);
});
