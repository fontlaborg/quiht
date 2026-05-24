/* app.js - quiht-l10n-vu Reviewer Application Logic */
import { Quiht } from "../quiht-core/quiht-core.js";

// App State
let manifest = null;
let translations = null;
let currentUiName = "";
let currentLang = "de";
let currentUiDoc = null;
let translatableItems = []; // List of parsed localizable items

// Dom Elements
const uiListEl = document.getElementById("ui-files-list");
const gridTbodyEl = document.getElementById("grid-tbody");
const langSelectEl = document.getElementById("lang-select");
const activeTitleEl = document.getElementById("canvas-active-title");
const renderRootEl = document.getElementById("qt-renderer-root");
const statTotalEl = document.getElementById("stat-total").querySelector("span");
const statTranslatedEl = document.getElementById("stat-translated").querySelector("span");
const searchInputEl = document.getElementById("grid-search");
const statusbarEl = document.getElementById("app-statusbar");

// Initialize App
async function init() {
  try {
    // Load config maps
    const manifestResponse = await fetch("../example/.quiht.json");
    manifest = await manifestResponse.json();

    const translationsResponse = await fetch("../example/translations.json");
    translations = await translationsResponse.json();

    // Populate Sidebar UI list
    uiListEl.innerHTML = "";
    const uiNames = Object.keys(manifest.ui);
    
    if (uiNames.length === 0) {
      uiListEl.innerHTML = '<li class="ui-item">No UI files found.</li>';
      return;
    }

    uiNames.forEach((uiName, index) => {
      const li = document.createElement("li");
      li.className = `ui-item ${index === 0 ? "active" : ""}`;
      li.innerHTML = `
        <span>${uiName}</span>
        <span class="ui-item-badge">UI</span>
      `;
      li.addEventListener("click", () => {
        document.querySelectorAll(".ui-list .ui-item").forEach(item => item.classList.remove("active"));
        li.classList.add("active");
        selectUi(uiName);
      });
      uiListEl.appendChild(li);
    });

    // Setup controls
    langSelectEl.addEventListener("change", (e) => {
      currentLang = e.target.value;
      renderUi();
      renderTable();
    });

    searchInputEl.addEventListener("input", (e) => {
      filterTable(e.target.value);
    });

    // Theme Selector
    document.getElementById("theme-light").addEventListener("click", (e) => {
      document.getElementById("theme-light").classList.add("active");
      document.getElementById("theme-dark").classList.remove("active");
      renderRootEl.classList.remove("q-dark-theme");
    });

    document.getElementById("theme-dark").addEventListener("click", (e) => {
      document.getElementById("theme-light").classList.remove("active");
      document.getElementById("theme-dark").classList.add("active");
      renderRootEl.classList.add("q-dark-theme");
    });

    // Select the first UI file
    await selectUi(uiNames[0]);

  } catch (error) {
    console.error("Initialization Failed:", error);
    statusbarEl.textContent = "Initialization failed. Check console for details.";
    statusbarEl.style.color = "#d83b01";
  }
}

// Select and load a UI file
async function selectUi(uiName) {
  currentUiName = uiName;
  activeTitleEl.querySelector("span").textContent = uiName;
  statusbarEl.textContent = `Loading ${uiName}...`;

  try {
    const uiRelPath = manifest.ui[uiName];
    const response = await fetch(`../example/${uiRelPath}`);
    const xmlText = await response.text();

    // Parse UI XML
    currentUiDoc = Quiht.parse(xmlText);
    
    // Extract localizable items
    parseTranslatableItems(currentUiDoc);
    
    // Render and build table
    renderUi();
    renderTable();
    
    statusbarEl.textContent = `Successfully loaded ${uiName}. Total strings: ${translatableItems.length}`;
  } catch (error) {
    console.error(`Error loading UI ${uiName}:`, error);
    statusbarEl.textContent = `Error loading ${uiName}.`;
  }
}

// Extract translatable items from the parsed XML tree
function parseTranslatableItems(xmlDoc) {
  translatableItems = [];
  const widgets = xmlDoc.querySelectorAll("widget");

  widgets.forEach(widget => {
    const widgetName = widget.getAttribute("name") || "";
    const widgetClass = widget.getAttribute("class") || "";

    // Helper to add localizable key
    const addStringItem = (propName, rawValue) => {
      if (!rawValue) return;
      
      let key = rawValue;
      if (rawValue.startsWith("@")) {
        key = rawValue.substring(1);
      } else {
        key = `${widgetName}.${propName}`;
      }

      // Check duplicate
      if (translatableItems.some(item => item.key === key)) return;

      translatableItems.push({
        key: key,
        widgetName: widgetName,
        widgetClass: widgetClass,
        type: propName,
        originalText: rawValue
      });
    };

    // 1. Check standard string properties
    const stringProps = ["text", "windowTitle", "toolTip", "statusTip", "title", "placeholderText"];
    stringProps.forEach(prop => {
      const propNode = widget.querySelector(`:scope > property[name="${prop}"] > string`);
      if (propNode) {
        addStringItem(prop, propNode.textContent.trim());
      }
    });

    // 2. Check combobox items
    if (widgetClass === "QComboBox") {
      const items = widget.querySelectorAll(":scope > item");
      items.forEach((item, idx) => {
        const textNode = item.querySelector("property[name=\"text\"] > string");
        if (textNode) {
          addStringItem(`item[${idx}]`, textNode.textContent.trim());
        }
      });
    }

    // 3. Check tab widget page titles
    if (widgetClass === "QTabWidget") {
      const tabItems = widget.querySelectorAll("layout > item");
      tabItems.forEach((tabItem, idx) => {
        const titleAttr = tabItem.querySelector("attribute[name=\"title\"]");
        if (titleAttr) {
          addStringItem(`tab[${idx}]`, titleAttr.textContent.trim());
        }
      });
    }
  });

  // Update Stats
  statTotalEl.textContent = translatableItems.length;
}

// Render the UI layout in the canvas
function renderUi() {
  if (!currentUiDoc) return;

  renderRootEl.innerHTML = "";

  // Set up Quiht rendering options
  const options = {
    // Resolve resource path using the manifest
    resourceResolver: {
      resolveResource: (qrcPath) => {
        const mapped = manifest.resources[qrcPath];
        if (mapped) {
          return `../example/${mapped}`;
        }
        return qrcPath; // fallback
      }
    },
    // Translate text using our translations database
    translationResolver: {
      translate: (key, original) => {
        if (translations[key] && translations[key][currentLang]) {
          return translations[key][currentLang];
        }
        // Fallback: If English is selected, return the key's english mapping or the original string
        if (translations[key] && translations[key]["en"]) {
          return translations[key]["en"];
        }
        
        // Strip leading '@' for fallback matches
        const cleanKey = original.startsWith("@") ? original.substring(1) : original;
        if (translations[cleanKey] && translations[cleanKey][currentLang]) {
          return translations[cleanKey][currentLang];
        }

        return original;
      }
    }
  };

  // Render to DOM
  const renderedNode = Quiht.render(currentUiDoc, options);
  renderRootEl.appendChild(renderedNode);

  // Setup visual highlight interactions
  setupInteractiveEvents();
}

// Build the right translation grid list
function renderTable() {
  gridTbodyEl.innerHTML = "";
  
  let translatedCount = 0;

  translatableItems.forEach(item => {
    const row = document.createElement("tr");
    row.className = "grid-row";
    row.setAttribute("data-key", item.key);

    const hasTranslation = translations[item.key] && translations[item.key][currentLang];
    if (hasTranslation || currentLang === "en") {
      translatedCount++;
    }

    const sourceText = (translations[item.key] && translations[item.key]["en"]) || item.originalText;
    const destText = hasTranslation ? translations[item.key][currentLang] : (currentLang === "en" ? sourceText : "");

    row.innerHTML = `
      <td>
        <span class="grid-key">${item.key}</span>
        <span class="grid-type">${item.widgetClass} : ${item.type}</span>
      </td>
      <td>
        <span class="grid-text-src">${escapeHtml(sourceText)}</span>
        <span class="grid-text-dest ${destText ? '' : 'missing'}">${escapeHtml(destText || '[Missing Translation]')}</span>
      </td>
    `;

    // Row hover -> Canvas highlight
    row.addEventListener("mouseenter", () => {
      highlightWidget(item.key, true);
    });

    row.addEventListener("mouseleave", () => {
      highlightWidget(item.key, false);
    });

    row.addEventListener("click", () => {
      scrollToWidget(item.key);
    });

    gridTbodyEl.appendChild(row);
  });

  statTranslatedEl.textContent = `${translatedCount} (${Math.round((translatedCount / translatableItems.length) * 100 || 0)}%)`;
}

// Connect Canvas hover/click elements to the right sidebar table
function setupInteractiveEvents() {
  // Find all DOM elements in mockup that are translatable
  const nodes = renderRootEl.querySelectorAll("[data-quiht-key], .quiht-translatable-node");
  
  nodes.forEach(node => {
    const key = node.getAttribute("data-quiht-key") || node.getAttribute("id");
    if (!key) return;

    // Hover mockup widget -> Highlight row in grid
    node.addEventListener("mouseenter", (e) => {
      e.stopPropagation();
      
      // Remove other highlights
      document.querySelectorAll(".quiht-highlight-active").forEach(el => el.classList.remove("quiht-highlight-active"));
      
      // Highlight widget
      node.classList.add("quiht-highlight-active");

      // Highlight table row
      document.querySelectorAll(".grid-row").forEach(r => r.classList.remove("active"));
      const row = document.querySelector(`.grid-row[data-key="${key}"]`);
      if (row) {
        row.classList.add("active");
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // Update status bar
      const origVal = node.getAttribute("data-quiht-original") || "";
      const qClass = node.getAttribute("data-q-class") || "";
      statusbarEl.textContent = `Widget: ${node.id || 'unnamed'} (${qClass}) | Key: ${key} | Raw: "${origVal}"`;
    });

    node.addEventListener("mouseleave", (e) => {
      node.classList.remove("quiht-highlight-active");
      
      const row = document.querySelector(`.grid-row[data-key="${key}"]`);
      if (row) row.classList.remove("active");
    });
  });
}

// Highlight a mockup widget based on a table key
function highlightWidget(key, activate) {
  // Check both key and ID mappings
  const elements = renderRootEl.querySelectorAll(`[data-quiht-key="${key}"], #${key}`);
  elements.forEach(el => {
    el.classList.toggle("quiht-highlight-active", activate);
  });

  // Highlight table row
  const row = document.querySelector(`.grid-row[data-key="${key}"]`);
  if (row) {
    row.classList.toggle("active", activate);
  }
}

// Scroll to mockup widget
function scrollToWidget(key) {
  const element = renderRootEl.querySelector(`[data-quiht-key="${key}"], #${key}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    // Flash outline effect
    element.classList.add("quiht-highlight-active");
    setTimeout(() => {
      // If cursor is not hovering anymore, remove it
      if (!element.matches(':hover')) {
        element.classList.remove("quiht-highlight-active");
      }
    }, 1500);
  }
}

// Filter translation list rows based on search input
function filterTable(query) {
  const lowerQuery = query.toLowerCase().trim();
  const rows = document.querySelectorAll(".grid-row");
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    if (text.includes(lowerQuery)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// Utility to escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Run on page load
window.addEventListener("DOMContentLoaded", init);
