import "./app.css";
import themes from "virtual:tint";

// Tailwind only emits classes it can see as literals, so spell the tint-* classes out.
const palettes: Record<string, string> = {
  base: "",
  brand: "tint-brand",
  info: "tint-info",
  success: "tint-success",
  warning: "tint-warning",
  error: "tint-error",
};

const card = (tint: string) => `
  <section class="${palettes[tint]} rounded-xl border border-default bg-surface-raised p-5 space-y-3">
    <h2 class="text-heading text-lg font-semibold">${tint}</h2>
    <p class="text-body">Body text at Lc 75. <span class="text-muted">Muted at Lc 50.</span></p>
    <div class="flex flex-wrap gap-2">
      <button class="rounded-md bg-action px-3 py-1.5 text-on-action hover:bg-action-hover active:bg-action-active focus-visible:outline-2 focus-visible:outline-ring">Primary</button>
      <button class="rounded-md bg-action-soft px-3 py-1.5 text-on-action-soft hover:bg-action-soft-hover">Soft</button>
      <button class="rounded-md bg-action-disabled px-3 py-1.5 text-on-action-disabled" disabled>Disabled</button>
    </div>
    <div class="grid grid-cols-6 gap-1 text-[10px]">
      ${["well", "", "raised", "lowlight", "highlight", "selection"]
        .map((v) => `<div class="h-8 rounded border border-subtle ${v ? `bg-surface-${v}` : "bg-surface"}" title="surface${v ? "-" + v : ""}"></div>`)
        .join("")}
    </div>
  </section>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="mb-6 flex items-center justify-between">
    <h1 class="text-heading text-2xl font-bold">tint playground</h1>
    <button id="toggle" class="rounded-md border border-strong px-3 py-1.5 text-body hover:bg-surface-highlight">Toggle dark</button>
  </header>
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">${Object.keys(palettes).map(card).join("")}</div>
  <pre class="mt-8 overflow-auto rounded-lg bg-surface-well p-4 text-xs text-muted">${themes
    .map((t) => `${t.name}: ${t.palettes.length} palettes, ${t.diagnostics.length} diagnostics`)
    .join("\n")}</pre>`;

document.querySelector("#toggle")!.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});
