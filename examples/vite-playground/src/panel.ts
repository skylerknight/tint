import {
  EDITOR_SECTIONS,
  LIGHTNESS_RANGE,
  PALETTES,
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
  type ScaleGroup,
} from "./editor.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isScaleGroup(value: string): value is ScaleGroup {
  return EDITOR_SECTIONS.some((section) => section.group === value);
}

function scaleField(group: string, name: string) {
  return EDITOR_SECTIONS.find((section) => section.group === group)?.fields.find(
    (field) => field.name === name,
  );
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

function scaleSections(state: EditorState): string {
  return EDITOR_SECTIONS.map((section) => {
    const values = state[section.group] as Record<string, number>;
    const rows = section.fields
      .map((field) =>
        scaleRow(
          section.group,
          field.name,
          field.label,
          values[field.name] ?? 0,
          field.min,
          field.max,
        ),
      )
      .join("");
    return `<section>
      <h3>${escapeHtml(section.title)}</h3>
      <p class="note">${escapeHtml(section.note)}</p>
      ${rows}
    </section>`;
  }).join("");
}

function lightnessRow(theme: "light" | "dark", value: number): string {
  const label = theme === "light" ? "Light" : "Dark";
  return `<label class="scale">
    <span>${label}</span>
    <input type="range" min="${LIGHTNESS_RANGE.min}" max="${LIGHTNESS_RANGE.max}" step="${LIGHTNESS_RANGE.step}" value="${value}" data-lightness="${theme}" data-role="range" aria-label="${label} theme lightness" />
    <input type="number" min="${LIGHTNESS_RANGE.min}" max="${LIGHTNESS_RANGE.max}" step="${LIGHTNESS_RANGE.step}" value="${value}" data-lightness="${theme}" data-role="number" aria-label="${label} theme lightness value" />
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
      <h3>Theme lightness</h3>
      <p class="note">The anchor, 0–100. surface(0) is this level. Defaults are 97 light and 18 dark. The painted page is surface.DEFAULT.</p>
      ${lightnessRow("light", state.light.lightness)}
      ${lightnessRow("dark", state.dark.lightness)}
    </section>
    ${scaleSections(state)}
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
  for (const section of EDITOR_SECTIONS) {
    const values = state[section.group] as Record<string, number>;
    for (const field of section.fields) {
      writeScale(section.group, field.name, values[field.name] ?? 0);
    }
  }
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
  group: ScaleGroup,
  name: string,
  value: number,
  source?: HTMLInputElement,
): void {
  const target = state[group] as Record<string, number>;
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
    if (group === undefined || name === undefined || !isScaleGroup(group)) return;
    if (target.value === "") return;
    const numeric = Number(target.value);
    if (!Number.isFinite(numeric)) return;
    const field = scaleField(group, name);
    if (field === undefined) return;
    setScale(state, group, name, snapScale(numeric, field.min, field.max), target);
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
    if (group === undefined || name === undefined || !isScaleGroup(group)) return;
    const values = state[group] as Record<string, number>;
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
    state.sharePalette = next.sharePalette;
    state.light = next.light;
    state.dark = next.dark;
    for (const section of EDITOR_SECTIONS) replaceGroup(state, next, section.group);
    syncForm(state);
    localStorage.removeItem("tint-playground-editor-v1");
    localStorage.removeItem("tint-playground-editor-v2");
    localStorage.removeItem("tint-playground-editor-v3");
    localStorage.removeItem("tint-playground-editor-v4");
    publish(state);
  });

  return state;
}

function replaceGroup<G extends ScaleGroup>(
  state: EditorState,
  next: EditorState,
  group: G,
): void {
  state[group] = next[group];
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
