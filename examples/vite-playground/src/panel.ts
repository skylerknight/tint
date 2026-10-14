import {
  LIGHTNESS_RANGE,
  PALETTES,
  SCALE_RANGE,
  SURFACE_RANGE,
  applyState,
  configSource,
  defaultState,
  loadState,
  normalizeHex,
  saveState,
  snapLightness,
  snapScale,
  type EditorState,
  type LiveResult,
  type PaletteName,
} from "./editor.ts";

const ACTION_FIELDS = [
  ["rest", "Rest"],
  ["hover", "Hover"],
  ["pressed", "Pressed"],
] as const;

const SOFT_FIELDS = [
  ["rest", "Rest"],
  ["hover", "Hover"],
  ["pressed", "Pressed"],
] as const;

const SURFACE_FIELDS = [
  ["page", "Page"],
  ["sunken", "Sunken"],
  ["raised", "Raised"],
  ["overlay", "Overlay"],
] as const;

const TEXT_FIELDS = [
  ["faint", "Faint"],
  ["muted", "Muted"],
  ["body", "Body"],
  ["strong", "Strong"],
] as const;

const BORDER_FIELDS = [
  ["subtle", "Subtle"],
  ["default", "Default"],
  ["strong", "Strong"],
  ["focus", "Focus"],
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colorRows(
  theme: "light" | "dark",
  colors: EditorState["light"]["palette"],
): string {
  return PALETTES.map((name) => {
    const value = colors[name];
    return `<label class="color">
      <span>${name}</span>
      <input type="color" value="${value}" data-theme="${theme}" data-name="${name}" data-role="picker" aria-label="${theme} ${name} color" />
      <input type="text" value="${value}" spellcheck="false" maxlength="7" autocomplete="off" data-theme="${theme}" data-name="${name}" data-role="hex" aria-label="${theme} ${name} hex" />
    </label>`;
  }).join("");
}

function scaleRow(
  group: string,
  name: string,
  label: string,
  value: number,
  min: number,
  max: number,
): string {
  return `<label class="scale">
    <span>${label}</span>
    <input type="range" min="${min}" max="${max}" step="0.5" value="${value}" data-group="${group}" data-name="${name}" data-role="range" aria-label="${group} ${label}" />
    <input type="number" min="${min}" max="${max}" step="0.5" value="${value}" data-group="${group}" data-name="${name}" data-role="number" aria-label="${group} ${label} value" />
  </label>`;
}

function scaleSection(
  title: string,
  note: string,
  group: string,
  fields: readonly (readonly [string, string])[],
  values: Record<string, number>,
  min: number,
  max: number,
): string {
  const rows = fields
    .map(([name, label]) => scaleRow(group, name, label, values[name] ?? 0, min, max))
    .join("");
  return `<section>
    <h3>${title}</h3>
    <p class="note">${note}</p>
    ${rows}
  </section>`;
}

function lightnessRow(theme: "light" | "dark", value: number): string {
  const label = theme === "light" ? "Light" : "Dark";
  return `<label class="scale">
    <span>${label}</span>
    <input type="range" min="${LIGHTNESS_RANGE.min}" max="${LIGHTNESS_RANGE.max}" step="${LIGHTNESS_RANGE.step}" value="${value}" data-lightness="${theme}" data-role="range" aria-label="${label} page lightness" />
    <input type="number" min="${LIGHTNESS_RANGE.min}" max="${LIGHTNESS_RANGE.max}" step="${LIGHTNESS_RANGE.step}" value="${value}" data-lightness="${theme}" data-role="number" aria-label="${label} page lightness value" />
  </label>`;
}

function panelMarkup(state: EditorState): string {
  return `<form id="editor-form">
    <header class="editor-bar">
      <h2>Edit theme</h2>
      <div class="editor-actions">
        <button type="button" id="copy-config">Copy config</button>
        <button type="button" id="reset-config">Reset</button>
      </div>
    </header>
    <button type="button" id="open-diagnostics" class="diagnostics-open" aria-haspopup="dialog" aria-controls="diagnostics-dialog">Diagnostics (0)</button>
    <dialog id="diagnostics-dialog" aria-labelledby="diagnostics-title">
      <div class="dialog-panel">
        <header class="dialog-bar">
          <h3 id="diagnostics-title">Diagnostics</h3>
          <button type="button" id="close-diagnostics">Close</button>
        </header>
        <div id="diagnostics"></div>
      </div>
    </dialog>
    <section>
      <label class="share">
        <input type="checkbox" id="share-palette" ${state.sharePalette ? "checked" : ""} />
        <span>Use one palette for light and dark</span>
      </label>
    </section>
    <section>
      <h3>Light palette</h3>
      ${colorRows("light", state.light.palette)}
    </section>
    <section id="dark-palette" ${state.sharePalette ? "hidden" : ""}>
      <h3>Dark palette</h3>
      ${colorRows("dark", state.dark.palette)}
    </section>
    <section>
      <h3>Page lightness</h3>
      <p class="note">0–100. The light and dark selectors stay on the toggle.</p>
      ${lightnessRow("light", state.light.lightness)}
      ${lightnessRow("dark", state.dark.lightness)}
    </section>
    ${scaleSection("Action", "Emphasis, 0–10. Warning and error rest stay at 8.5.", "action", ACTION_FIELDS, state.action, SCALE_RANGE.min, SCALE_RANGE.max)}
    ${scaleSection("Soft", "Surface steps, −10–10.", "soft", SOFT_FIELDS, state.soft, SURFACE_RANGE.min, SURFACE_RANGE.max)}
    ${scaleSection("Surface", "Signed steps. Page is surface.DEFAULT. The lightness slider still moves the theme page under it.", "surface", SURFACE_FIELDS, state.surface, SURFACE_RANGE.min, SURFACE_RANGE.max)}
    ${scaleSection("Text", "Contrast steps, 0–10. Button labels use the body step.", "text", TEXT_FIELDS, state.text, SCALE_RANGE.min, SCALE_RANGE.max)}
    ${scaleSection("Border", "Contrast steps, 0–10.", "border", BORDER_FIELDS, state.border, SCALE_RANGE.min, SCALE_RANGE.max)}
  </form>`;
}

function warningCount(result: LiveResult): number {
  return result.diagnostics.filter((item) => item.severity === "warning").length;
}

function renderDiagnostics(result: LiveResult): void {
  const opener = document.querySelector("#open-diagnostics");
  const list = document.querySelector("#diagnostics");
  if (opener instanceof HTMLButtonElement) {
    opener.textContent = `Diagnostics (${warningCount(result)})`;
  }
  if (list === null) return;
  if (result.error !== undefined) {
    list.innerHTML = `<p class="diagnostic error">${escapeHtml(result.error)}</p>`;
    return;
  }
  if (result.diagnostics.length === 0) {
    list.innerHTML = `<p class="diagnostic quiet">No diagnostics.</p>`;
    return;
  }
  list.innerHTML = result.diagnostics
    .map(
      (item) => `<article class="diagnostic ${item.severity}">
        <p><strong>${escapeHtml(item.severity)}</strong> ${escapeHtml(item.theme)} · ${escapeHtml(item.path)}</p>
        <p>${escapeHtml(item.message)}</p>
        <p class="hint">${escapeHtml(item.hint)}</p>
      </article>`,
    )
    .join("");
}

function writeScale(
  group: string,
  name: string,
  value: number,
  skip?: HTMLInputElement,
): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(
    `[data-group="${group}"][data-name="${name}"]`,
  )) {
    if (input !== skip) input.value = String(value);
  }
}

function writeLightness(
  theme: "light" | "dark",
  value: number,
  skip?: HTMLInputElement,
): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(
    `[data-lightness="${theme}"]`,
  )) {
    if (input !== skip) input.value = String(value);
  }
}

function writeColor(theme: "light" | "dark", name: PaletteName, value: string): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(
    `[data-theme="${theme}"][data-name="${name}"]`,
  )) {
    input.value = value;
    input.removeAttribute("aria-invalid");
  }
}

function syncForm(state: EditorState): void {
  const share = document.querySelector<HTMLInputElement>("#share-palette");
  if (share !== null) share.checked = state.sharePalette;
  document.querySelector("#dark-palette")?.toggleAttribute("hidden", state.sharePalette);
  for (const name of PALETTES) {
    writeColor("light", name, state.light.palette[name]);
    writeColor("dark", name, state.dark.palette[name]);
  }
  writeLightness("light", state.light.lightness);
  writeLightness("dark", state.dark.lightness);
  for (const [name] of ACTION_FIELDS) writeScale("action", name, state.action[name]);
  for (const [name] of SOFT_FIELDS) writeScale("soft", name, state.soft[name]);
  for (const [name] of SURFACE_FIELDS) writeScale("surface", name, state.surface[name]);
  for (const [name] of TEXT_FIELDS) writeScale("text", name, state.text[name]);
  for (const [name] of BORDER_FIELDS) writeScale("border", name, state.border[name]);
}

let publishFrame = 0;

function publish(state: EditorState): void {
  cancelAnimationFrame(publishFrame);
  publishFrame = requestAnimationFrame(() => {
    saveState(state);
    renderDiagnostics(applyState(state));
  });
}

function setScale(
  state: EditorState,
  group: string,
  name: string,
  value: number,
  source?: HTMLInputElement,
): void {
  const target = state[
    group as "action" | "soft" | "surface" | "text" | "border"
  ] as Record<string, number>;
  target[name] = value;
  const skip = source?.dataset.role === "number" ? source : undefined;
  writeScale(group, name, value, skip);
  publish(state);
}

export function mountEditor(root: HTMLElement): EditorState {
  const state = loadState();
  root.innerHTML = panelMarkup(state);
  publish(state);

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === "share-palette") {
      state.sharePalette = target.checked;
      document
        .querySelector("#dark-palette")
        ?.toggleAttribute("hidden", state.sharePalette);
      publish(state);
      return;
    }

    const theme = target.dataset.theme;
    const colorName = target.dataset.name;
    if (
      (theme === "light" || theme === "dark") &&
      colorName !== undefined &&
      isPaletteName(colorName)
    ) {
      if (target.dataset.role === "picker") {
        const hex = normalizeHex(target.value);
        if (hex === null) return;
        state[theme].palette[colorName] = hex;
        writeColor(theme, colorName, hex);
        publish(state);
        return;
      }
      const hex = normalizeHex(target.value);
      if (hex === null) target.setAttribute("aria-invalid", "true");
      else target.removeAttribute("aria-invalid");
      if (hex === null) return;
      state[theme].palette[colorName] = hex;
      const picker = root.querySelector<HTMLInputElement>(
        `[data-theme="${theme}"][data-name="${colorName}"][data-role="picker"]`,
      );
      if (picker !== null) picker.value = hex;
      publish(state);
      return;
    }

    const lightness = target.dataset.lightness;
    if (lightness === "light" || lightness === "dark") {
      if (target.value === "" || !Number.isFinite(Number(target.value))) return;
      const value = snapLightness(Number(target.value));
      state[lightness].lightness = value;
      writeLightness(
        lightness,
        value,
        target.dataset.role === "number" ? target : undefined,
      );
      publish(state);
      return;
    }

    const group = target.dataset.group;
    const name = target.dataset.name;
    if (group === undefined || name === undefined || target.value === "") return;
    const numeric = Number(target.value);
    if (!Number.isFinite(numeric)) return;
    const range = group === "soft" || group === "surface" ? SURFACE_RANGE : SCALE_RANGE;
    setScale(state, group, name, snapScale(numeric, range.min, range.max), target);
  });

  root.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.role === "hex") {
      const theme = target.dataset.theme;
      const name = target.dataset.name;
      if (
        (theme === "light" || theme === "dark") &&
        name !== undefined &&
        isPaletteName(name)
      ) {
        writeColor(theme, name, state[theme].palette[name]);
      }
      return;
    }
    if (target.dataset.role !== "number") return;
    const lightness = target.dataset.lightness;
    if (lightness === "light" || lightness === "dark") {
      writeLightness(lightness, state[lightness].lightness);
      return;
    }
    const group = target.dataset.group;
    const name = target.dataset.name;
    if (group === undefined || name === undefined) return;
    const values = state[
      group as "action" | "soft" | "surface" | "text" | "border"
    ] as Record<string, number>;
    writeScale(group, name, values[name] ?? 0);
  });

  root.addEventListener("submit", (event) => event.preventDefault());

  const diagnosticsDialog = document.querySelector("#diagnostics-dialog");
  if (diagnosticsDialog instanceof HTMLDialogElement) {
    diagnosticsDialog.addEventListener("click", (event) => {
      if (event.target === diagnosticsDialog) diagnosticsDialog.close();
    });
  }
  document.querySelector("#open-diagnostics")?.addEventListener("click", () => {
    if (diagnosticsDialog instanceof HTMLDialogElement && !diagnosticsDialog.open) {
      diagnosticsDialog.showModal();
    }
  });
  document.querySelector("#close-diagnostics")?.addEventListener("click", () => {
    if (diagnosticsDialog instanceof HTMLDialogElement) diagnosticsDialog.close();
  });

  document.querySelector("#copy-config")?.addEventListener("click", () => {
    void copyConfig(configSource(state));
  });

  document.querySelector("#reset-config")?.addEventListener("click", () => {
    const next = defaultState();
    Object.assign(state, next);
    state.light = next.light;
    state.dark = next.dark;
    state.action = next.action;
    state.soft = next.soft;
    state.surface = next.surface;
    state.text = next.text;
    state.border = next.border;
    syncForm(state);
    localStorage.removeItem("tint-playground-editor-v1");
    localStorage.removeItem("tint-playground-editor-v2");
    publish(state);
  });

  return state;
}

function isPaletteName(value: string): value is PaletteName {
  return (PALETTES as readonly string[]).includes(value);
}

function copyWithSelection(source: string): boolean {
  const area = document.createElement("textarea");
  area.value = source;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
}

async function copyConfig(source: string): Promise<void> {
  const button = document.querySelector("#copy-config");
  let copied = false;
  try {
    const write = navigator.clipboard.writeText(source);
    void write.catch(() => undefined);
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("clipboard timeout")), 400);
    });
    await Promise.race([write, timeout]);
    copied = true;
  } catch {
    copied = copyWithSelection(source);
  }
  if (!(button instanceof HTMLButtonElement)) return;
  const label = button.textContent;
  button.textContent = copied ? "Copied" : "Copy failed";
  window.setTimeout(() => {
    button.textContent = label ?? "Copy config";
  }, 1500);
}

export { DEFAULT_STATE };
