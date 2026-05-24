/**
 * quiht demo — drag-and-drop a Qt `.ui`, `.quiht.json`, or `.quiht.zip`, or load
 * one of the bundled FontLab examples, and see it rendered via quiht-core.
 * Pure static client-side app (no server).
 */

import "quiht-core/index.css";
import "./demo.css";

import { render, loadBundle, fontlabPreset, type QuihtBundle } from "quiht-core";

const dropzone = byId<HTMLElement>("dropzone");
const fileInput = byId<HTMLInputElement>("file-input");
const errorEl = byId<HTMLDivElement>("error");
const resultEl = byId<HTMLElement>("result");
const resultMetaEl = byId<HTMLSpanElement>("result-meta");
const tabsEl = byId<HTMLElement>("ui-tabs");
const renderRootEl = byId<HTMLDivElement>("render-root");
const themeToggle = byId<HTMLButtonElement>("theme-toggle");
const galleryEl = byId<HTMLDivElement>("gallery");

let bundle: QuihtBundle | null = null;

interface ExampleEntry {
  name: string;
  file: string;
  uiCount: number;
  blurb: string;
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultEl.hidden = true;
}

function clearError(): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

/** Loads any supported source and shows the result, or a friendly error. */
async function load(
  source: ArrayBuffer | Uint8Array | Blob | string,
  label: string,
): Promise<void> {
  clearError();
  try {
    bundle?.dispose();
    bundle = await loadBundle(source);
    const names = Object.keys(bundle.manifest.ui);
    if (names.length === 0) {
      showError("That file loaded, but it contains no .ui documents.");
      return;
    }
    resultEl.hidden = false;
    resultMetaEl.textContent = `${label} — ${names.length} UI file${names.length > 1 ? "s" : ""}`;
    buildTabs(names);
    selectUi(names[0]);
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    showError(`Could not load that file: ${(err as Error).message}`);
  }
}

function buildTabs(names: string[]): void {
  tabsEl.innerHTML = "";
  names.forEach((name, i) => {
    const tab = document.createElement("button");
    tab.className = `ui-tab ${i === 0 ? "active" : ""}`;
    tab.textContent = name;
    tab.addEventListener("click", () => {
      tabsEl.querySelectorAll(".ui-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      selectUi(name);
    });
    tabsEl.appendChild(tab);
  });
}

function selectUi(name: string): void {
  if (!bundle) return;
  const doc = bundle.uiDocs[name];
  if (!doc) return;
  renderRootEl.innerHTML = "";
  // The FontLab preset resolves Y*/Qt* custom widgets to real controls rather
  // than dotted placeholders.
  renderRootEl.appendChild(
    render(doc, {
      resourceResolver: bundle.resourceResolver,
      customRenderers: fontlabPreset,
    }),
  );
}

/** Routes a dropped/picked File to the right loader input. */
async function loadFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".ui") || name.endsWith(".xml")) {
    await load(await file.text(), file.name);
  } else {
    await load(file, file.name);
  }
}

// --- Example gallery ---------------------------------------------------------
async function setupGallery(): Promise<void> {
  try {
    const res = await fetch("./examples/index.json");
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { examples: ExampleEntry[] };
    galleryEl.innerHTML = "";
    for (const ex of data.examples) {
      const card = document.createElement("button");
      card.className = "gallery-card";
      card.type = "button";
      card.innerHTML =
        `<span class="gallery-card-name">${escapeHtml(ex.name)}</span>` +
        `<span class="gallery-card-count">${ex.uiCount} UIs</span>` +
        `<span class="gallery-card-blurb">${escapeHtml(ex.blurb)}</span>`;
      card.addEventListener("click", () => void load(ex.file, ex.name));
      galleryEl.appendChild(card);
    }
  } catch {
    galleryEl.innerHTML = `<p class="gallery-empty">Examples unavailable.</p>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

// --- Wiring ------------------------------------------------------------------
function setupDropzone(): void {
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    }),
  );
  ["dragleave", "dragend", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    }),
  );
  dropzone.addEventListener("drop", (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
}

function setupTheme(): void {
  const prefersLight =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches;
  const initial = localStorage.getItem("quiht-theme") ?? (prefersLight ? "light" : "dark");
  applyTheme(initial);
  themeToggle.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("quiht-theme", next);
  });
}

function applyTheme(theme: string): void {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "light" ? "☀ Light" : "☾ Dark";
  themeToggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
}

setupDropzone();
setupTheme();
void setupGallery();
