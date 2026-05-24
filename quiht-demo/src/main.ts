/**
 * quiht demo — drag-and-drop a Qt `.ui`, `.quiht.json`, or `.quiht.zip` and
 * see it rendered via quiht-core. Pure static client-side app (no server).
 */

import "quiht-core/index.css";
import "./demo.css";

import { render, loadBundle, type QuihtBundle } from "quiht-core";

/** A vendored sample bundle (copied into the build by Vite from public/). */
const SAMPLE_BUNDLE = "./sample.quiht.zip";

const dropzone = byId<HTMLElement>("dropzone");
const fileInput = byId<HTMLInputElement>("file-input");
const sampleBtn = byId<HTMLButtonElement>("sample-btn");
const errorEl = byId<HTMLDivElement>("error");
const resultEl = byId<HTMLElement>("result");
const resultMetaEl = byId<HTMLSpanElement>("result-meta");
const tabsEl = byId<HTMLElement>("ui-tabs");
const renderRootEl = byId<HTMLDivElement>("render-root");
const themeToggle = byId<HTMLButtonElement>("theme-toggle");

let bundle: QuihtBundle | null = null;

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
async function load(source: ArrayBuffer | Uint8Array | Blob | string, label: string): Promise<void> {
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
  renderRootEl.appendChild(render(doc, { resourceResolver: bundle.resourceResolver }));
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

  sampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void load(SAMPLE_BUNDLE, "sample.quiht.zip");
  });
}

function setupTheme(): void {
  const stored = localStorage.getItem("quiht-theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("quiht-theme", next);
  });
}

setupDropzone();
setupTheme();
