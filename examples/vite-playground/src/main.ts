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

const surfaces = [
  ["well", "bg-surface-well"],
  ["page", "bg-surface"],
  ["raised", "bg-surface-raised"],
  ["lowlight", "bg-surface-lowlight"],
  ["highlight", "bg-surface-highlight"],
  ["selection", "bg-surface-selection"],
] as const;

const card = (tint: string) => `
  <section class="${palettes[tint]} rounded-xl border border-default bg-surface-raised p-5 space-y-3">
    <h2 class="text-strong text-lg font-semibold">${tint}</h2>
    <p class="text-body">Body text. <span class="text-muted">Muted.</span> <span class="text-faint">Faint.</span></p>
    <div class="flex flex-wrap gap-2">
      <button class="rounded-md bg-action px-3 py-1.5 text-action-on hover:bg-action-hover active:bg-action-pressed disabled:bg-action-disabled disabled:text-action-on-disabled focus-visible:outline-2 focus-visible:outline-border-focus">Primary</button>
      <button class="rounded-md bg-soft px-3 py-1.5 text-soft-on hover:bg-soft-hover active:bg-soft-pressed">Soft</button>
      <button class="rounded-md bg-action-disabled px-3 py-1.5 text-action-on-disabled" disabled>Disabled</button>
    </div>
    <div class="grid grid-cols-6 gap-1 text-[10px]">
      ${surfaces
        .map(
          ([name, bg]) =>
            `<div class="h-8 rounded border border-subtle ${bg}" title="surface ${name}"></div>`,
        )
        .join("")}
    </div>
  </section>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-strong text-2xl font-bold">tint playground</h1>
      <p class="text-faint text-xs">numeric-scale prototype — scales, not level names</p>
    </div>
    <button id="toggle" class="rounded-md border border-strong px-3 py-1.5 text-body hover:bg-surface-highlight">Toggle dark</button>
  </header>
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">${Object.keys(palettes).map(card).join("")}</div>
  <pre class="mt-8 overflow-auto rounded-lg bg-surface-well p-4 text-xs text-muted">${themes
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
