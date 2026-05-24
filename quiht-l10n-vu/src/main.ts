/**
 * quiht-l10n-vu — three-pane Qt `.ui` localization reviewer.
 *
 * Built on quiht-core. The dataset is configurable: it loads the bundled
 * example manifest by default, and the user can open any `.quiht.zip`,
 * `.quiht.json`, or raw `.ui` file via the file picker or drag-and-drop.
 */

import "quiht-core/index.css";
import "./app.css";

import {
  Quiht,
  loadBundle,
  type QuihtBundle,
  type RenderOptions,
  type TranslationTable,
} from "quiht-core";

/** Default dataset URL, relative to the app (vendored under public/). */
const DEFAULT_DATASET = "./example/.quiht.json";

interface TranslatableItem {
  key: string;
  widgetName: string;
  widgetClass: string;
  type: string;
  originalText: string;
}

// --- App state ---------------------------------------------------------------
let bundle: QuihtBundle | null = null;
let translations: TranslationTable = {};
let currentLang = "de";
let currentUiDoc: Document | null = null;
let translatableItems: TranslatableItem[] = [];

// --- DOM helpers -------------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

// DOM references are resolved lazily in init() so that importing this module
// (e.g. from unit tests) does not require the app's HTML to be present.
let uiListEl: HTMLUListElement;
let gridTbodyEl: HTMLTableSectionElement;
let langSelectEl: HTMLSelectElement;
let activeTitleEl: HTMLDivElement;
let renderRootEl: HTMLDivElement;
let statTotalEl: HTMLSpanElement;
let statTranslatedEl: HTMLSpanElement;
let searchInputEl: HTMLInputElement;
let statusbarEl: HTMLElement;
let datasetInputEl: HTMLInputElement;

// --- Lifecycle ---------------------------------------------------------------
async function init(): Promise<void> {
  uiListEl = el<HTMLUListElement>("ui-files-list");
  gridTbodyEl = el<HTMLTableSectionElement>("grid-tbody");
  langSelectEl = el<HTMLSelectElement>("lang-select");
  activeTitleEl = el<HTMLDivElement>("canvas-active-title");
  renderRootEl = el<HTMLDivElement>("qt-renderer-root");
  statTotalEl = el("stat-total").querySelector("span") as HTMLSpanElement;
  statTranslatedEl = el("stat-translated").querySelector("span") as HTMLSpanElement;
  searchInputEl = el<HTMLInputElement>("grid-search");
  statusbarEl = el<HTMLElement>("app-statusbar");
  datasetInputEl = el<HTMLInputElement>("dataset-input");

  langSelectEl.addEventListener("change", () => {
    currentLang = langSelectEl.value;
    renderUi();
    renderTable();
  });

  searchInputEl.addEventListener("input", () => filterTable(searchInputEl.value));

  el("theme-light").addEventListener("click", () => {
    el("theme-light").classList.add("active");
    el("theme-dark").classList.remove("active");
    renderRootEl.classList.remove("q-dark-theme");
  });
  el("theme-dark").addEventListener("click", () => {
    el("theme-light").classList.remove("active");
    el("theme-dark").classList.add("active");
    renderRootEl.classList.add("q-dark-theme");
  });

  datasetInputEl.addEventListener("change", () => {
    const file = datasetInputEl.files?.[0];
    if (file) void loadFromFile(file);
  });

  setupDragAndDrop();

  await loadDataset(DEFAULT_DATASET);
}

/** Loads a dataset from any source accepted by quiht-core's loadBundle. */
async function loadDataset(source: ArrayBuffer | Uint8Array | Blob | string): Promise<void> {
  statusbarEl.textContent = "Loading dataset…";
  statusbarEl.style.color = "";
  try {
    bundle?.dispose();
    bundle = await loadBundle(source);
    translations = bundle.translations ?? {};
    populateSidebar();
    const first = Object.keys(bundle.manifest.ui)[0];
    if (first) selectUi(first);
    else statusbarEl.textContent = "Dataset has no UI files.";
  } catch (error) {
    console.error("Failed to load dataset:", error);
    statusbarEl.textContent = `Failed to load dataset: ${(error as Error).message}`;
    statusbarEl.style.color = "#d83b01";
  }
}

/** Loads a dataset from a dropped/picked File. */
async function loadFromFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".ui") || name.endsWith(".xml")) {
    await loadDataset(await file.text());
  } else {
    // .quiht.zip / .zip — load as binary; .quiht.json is rare as a lone file
    // since it references siblings, but we still pass the Blob through.
    await loadDataset(file);
  }
}

// --- Sidebar -----------------------------------------------------------------
function populateSidebar(): void {
  uiListEl.innerHTML = "";
  const uiNames = Object.keys(bundle?.manifest.ui ?? {});
  if (uiNames.length === 0) {
    uiListEl.innerHTML = '<li class="ui-item">No UI files found.</li>';
    return;
  }
  uiNames.forEach((uiName, index) => {
    const li = document.createElement("li");
    li.className = `ui-item ${index === 0 ? "active" : ""}`;
    li.innerHTML = `<span>${escapeHtml(uiName)}</span><span class="ui-item-badge">UI</span>`;
    li.addEventListener("click", () => {
      uiListEl.querySelectorAll(".ui-item").forEach((i) => i.classList.remove("active"));
      li.classList.add("active");
      selectUi(uiName);
    });
    uiListEl.appendChild(li);
  });
}

function selectUi(uiName: string): void {
  if (!bundle) return;
  const doc = bundle.uiDocs[uiName];
  if (!doc) {
    statusbarEl.textContent = `UI file not found in bundle: ${uiName}`;
    return;
  }
  currentUiDoc = doc;
  (activeTitleEl.querySelector("span") as HTMLSpanElement).textContent = uiName;

  parseTranslatableItems(doc);
  renderUi();
  renderTable();
  statusbarEl.textContent = `Loaded ${uiName}. Total strings: ${translatableItems.length}`;
}

// --- Translatable extraction (mirrors the renderer's key convention) ---------
/**
 * Walks a parsed `.ui` document and extracts localizable items using the same
 * `@key` / `<widgetName>.<property>` convention the renderer tags nodes with.
 * Pure (no app state) so it is directly unit-testable.
 */
function extractTranslatableItems(xmlDoc: Document): TranslatableItem[] {
  const items: TranslatableItem[] = [];
  const widgets = xmlDoc.querySelectorAll("widget");

  widgets.forEach((widget) => {
    const widgetName = widget.getAttribute("name") ?? "";
    const widgetClass = widget.getAttribute("class") ?? "";

    const addStringItem = (propName: string, rawValue: string | null): void => {
      if (!rawValue) return;
      const key = rawValue.startsWith("@") ? rawValue.substring(1) : `${widgetName}.${propName}`;
      if (items.some((item) => item.key === key)) return;
      items.push({ key, widgetName, widgetClass, type: propName, originalText: rawValue });
    };

    const stringProps = ["text", "windowTitle", "toolTip", "statusTip", "title", "placeholderText"];
    stringProps.forEach((prop) => {
      const propNode = widget.querySelector(`:scope > property[name="${prop}"] > string`);
      if (propNode?.textContent) addStringItem(prop, propNode.textContent.trim());
    });

    if (widgetClass === "QComboBox") {
      widget.querySelectorAll(":scope > item").forEach((item, idx) => {
        const textNode = item.querySelector('property[name="text"] > string');
        if (textNode?.textContent) addStringItem(`item[${idx}]`, textNode.textContent.trim());
      });
    }

    if (widgetClass === "QTabWidget") {
      widget.querySelectorAll("layout > item").forEach((tabItem, idx) => {
        const titleAttr = tabItem.querySelector('attribute[name="title"]');
        if (titleAttr?.textContent) addStringItem(`tab[${idx}]`, titleAttr.textContent.trim());
      });
    }
  });

  return items;
}

function parseTranslatableItems(xmlDoc: Document): void {
  translatableItems = extractTranslatableItems(xmlDoc);
  statTotalEl.textContent = String(translatableItems.length);
}

// --- Rendering ---------------------------------------------------------------
function translate(key: string, original: string): string {
  if (translations[key]?.[currentLang]) return translations[key][currentLang];
  if (translations[key]?.en) return translations[key].en;
  const cleanKey = original.startsWith("@") ? original.substring(1) : original;
  if (translations[cleanKey]?.[currentLang]) return translations[cleanKey][currentLang];
  return original;
}

function renderUi(): void {
  if (!currentUiDoc || !bundle) return;
  renderRootEl.innerHTML = "";

  const options: RenderOptions = {
    resourceResolver: bundle.resourceResolver,
    translationResolver: { translate },
  };

  renderRootEl.appendChild(Quiht.render(currentUiDoc, options));
  setupInteractiveEvents();
}

function renderTable(): void {
  gridTbodyEl.innerHTML = "";
  let translatedCount = 0;

  translatableItems.forEach((item) => {
    const row = document.createElement("tr");
    row.className = "grid-row";
    row.setAttribute("data-key", item.key);

    const hasTranslation = Boolean(translations[item.key]?.[currentLang]);
    if (hasTranslation || currentLang === "en") translatedCount++;

    const sourceText = translations[item.key]?.en ?? item.originalText;
    const destText = hasTranslation
      ? translations[item.key][currentLang]
      : currentLang === "en"
        ? sourceText
        : "";

    row.innerHTML = `
      <td>
        <span class="grid-key">${escapeHtml(item.key)}</span>
        <span class="grid-type">${escapeHtml(item.widgetClass)} : ${escapeHtml(item.type)}</span>
      </td>
      <td>
        <span class="grid-text-src">${escapeHtml(sourceText)}</span>
        <span class="grid-text-dest ${destText ? "" : "missing"}">${escapeHtml(destText || "[Missing Translation]")}</span>
      </td>`;

    row.addEventListener("mouseenter", () => highlightWidget(item.key, true));
    row.addEventListener("mouseleave", () => highlightWidget(item.key, false));
    row.addEventListener("click", () => scrollToWidget(item.key));

    gridTbodyEl.appendChild(row);
  });

  const pct = translatableItems.length
    ? Math.round((translatedCount / translatableItems.length) * 100)
    : 0;
  statTranslatedEl.textContent = `${translatedCount} (${pct}%)`;
}

// --- Bidirectional highlighting ---------------------------------------------
function setupInteractiveEvents(): void {
  const nodes = renderRootEl.querySelectorAll<HTMLElement>(
    "[data-quiht-key], .quiht-translatable-node",
  );
  nodes.forEach((node) => {
    const key = node.getAttribute("data-quiht-key") ?? node.id;
    if (!key) return;

    node.addEventListener("mouseenter", (e) => {
      e.stopPropagation();
      renderRootEl
        .querySelectorAll(".quiht-highlight-active")
        .forEach((x) => x.classList.remove("quiht-highlight-active"));
      node.classList.add("quiht-highlight-active");
      gridTbodyEl.querySelectorAll(".grid-row").forEach((r) => r.classList.remove("active"));
      const row = gridTbodyEl.querySelector(`.grid-row[data-key="${cssEscape(key)}"]`);
      if (row) {
        row.classList.add("active");
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      const origVal = node.getAttribute("data-quiht-original") ?? "";
      const qClass = node.getAttribute("data-q-class") ?? "";
      statusbarEl.textContent = `Widget: ${node.id || "unnamed"} (${qClass}) | Key: ${key} | Raw: "${origVal}"`;
    });

    node.addEventListener("mouseleave", () => {
      node.classList.remove("quiht-highlight-active");
      gridTbodyEl
        .querySelector(`.grid-row[data-key="${cssEscape(key)}"]`)
        ?.classList.remove("active");
    });
  });
}

function highlightWidget(key: string, activate: boolean): void {
  renderRootEl
    .querySelectorAll<HTMLElement>(`[data-quiht-key="${cssEscape(key)}"], #${cssEscape(key)}`)
    .forEach((node) => node.classList.toggle("quiht-highlight-active", activate));
  gridTbodyEl
    .querySelector(`.grid-row[data-key="${cssEscape(key)}"]`)
    ?.classList.toggle("active", activate);
}

function scrollToWidget(key: string): void {
  const node = renderRootEl.querySelector<HTMLElement>(
    `[data-quiht-key="${cssEscape(key)}"], #${cssEscape(key)}`,
  );
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("quiht-highlight-active");
  setTimeout(() => {
    if (!node.matches(":hover")) node.classList.remove("quiht-highlight-active");
  }, 1500);
}

function filterTable(query: string): void {
  const q = query.toLowerCase().trim();
  gridTbodyEl.querySelectorAll<HTMLElement>(".grid-row").forEach((row) => {
    row.style.display = (row.textContent ?? "").toLowerCase().includes(q) ? "" : "none";
  });
}

// --- Drag & drop -------------------------------------------------------------
function setupDragAndDrop(): void {
  const stop = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  ["dragenter", "dragover"].forEach((ev) =>
    document.body.addEventListener(ev, (e) => {
      stop(e as DragEvent);
      document.body.classList.add("is-dragover");
    }),
  );
  ["dragleave", "dragend"].forEach((ev) =>
    document.body.addEventListener(ev, (e) => {
      stop(e as DragEvent);
      if ((e as DragEvent).type !== "dragleave" || e.target === document.body) {
        document.body.classList.remove("is-dragover");
      }
    }),
  );
  document.body.addEventListener("drop", (e) => {
    stop(e as DragEvent);
    document.body.classList.remove("is-dragover");
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void loadFromFile(file);
  });
}

// --- Utilities ---------------------------------------------------------------
function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** CSS.escape with a safe fallback for non-DOM/test environments. */
function cssEscape(value: string): string {
  const c = globalThis.CSS;
  if (c && typeof c.escape === "function") return c.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

if (typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => void init());
}

export { extractTranslatableItems, escapeHtml, type TranslatableItem };
