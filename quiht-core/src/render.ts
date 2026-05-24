/** Qt `.ui` -> HTML rendering engine. Ports quiht-core.js to TypeScript. */

import { directChildren, firstChild, getProperty } from "./parser.js";
import type { QRect, QSize, RenderOptions } from "./types.js";

/**
 * Renders a parsed Qt `.ui` Document into an HTML DOM element.
 *
 * Stylesheets declared inside the `.ui` are injected into
 * `options.targetDocument` (defaulting to the produced element's
 * `ownerDocument`), so the renderer no longer touches a global
 * `document.head` and stays SSR-friendly.
 */
export function render(doc: Document, options: RenderOptions = {}): HTMLElement {
  const rootWidgetNode = doc.querySelector("ui > widget");
  if (!rootWidgetNode) {
    throw new Error("Invalid .ui file: Missing root <widget> under <ui>");
  }

  const root = renderWidget(rootWidgetNode, options, true);

  // Collect every styleSheet property declared in the .ui file.
  const styles: string[] = [];
  doc.querySelectorAll('property[name="styleSheet"] > string').forEach((sheet) => {
    if (sheet.textContent) styles.push(sheet.textContent);
  });

  if (styles.length > 0) {
    const targetDoc = options.targetDocument ?? root.ownerDocument;
    if (targetDoc) injectStyleSheets(styles, targetDoc);
  }

  return root;
}

/** Injects converted Qt stylesheets into the given document's `<head>`. */
export function injectStyleSheets(sheets: string[], targetDocument: Document): void {
  const styleId = "quiht-injected-stylesheets";
  let styleTag = targetDocument.getElementById(styleId) as HTMLStyleElement | null;
  const head = targetDocument.head ?? targetDocument.documentElement;
  if (!styleTag) {
    styleTag = targetDocument.createElement("style");
    styleTag.id = styleId;
    head.appendChild(styleTag);
  }

  const cssText = sheets
    .map((sheet) => {
      // Convert Qt QSS class selectors to standard CSS classes (QLabel -> .QLabel).
      let converted = sheet.replace(
        /(^|[{};\s,])(QLabel|QPushButton|QToolButton|QLineEdit|QTextEdit|QPlainTextEdit|QComboBox|QCheckBox|QRadioButton|QGroupBox|QWidget|QFrame|QSplitter|QSpinBox|QDoubleSpinBox|QSlider|QProgressBar|QDialogButtonBox|QListWidget|QTreeWidget|QMenuBar|QMenu|QMainWindow|QStatusBar|QDialog)/g,
        "$1.$2",
      );

      // Convert qlineargradient(...) to CSS linear-gradient(...).
      converted = converted.replace(/qlineargradient\(([^)]+)\)/g, (_match, content: string) => {
        const parts = content.split(",").map((s) => s.trim());
        const stops = parts.filter((p) => p.startsWith("stop:"));
        const cssStops = stops
          .map((stop) => {
            const matchStop = stop.match(/stop:([0-9.]+)\s+(#[0-9a-fA-F]+|[a-zA-Z]+)/);
            if (matchStop) {
              const percent = parseFloat(matchStop[1]) * 100;
              return `${matchStop[2]} ${percent}%`;
            }
            return "";
          })
          .filter((s) => s !== "");

        return `linear-gradient(to bottom, ${cssStops.join(", ")})`;
      });

      return converted;
    })
    .join("\n");

  styleTag.textContent = cssText;
}

/** Reads a property and coerces it to a string (or "" when absent). */
export function propString(node: Element, name: string): string {
  const v = getProperty(node, name);
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Translates a string via the resolver if available, mirroring Qt key rules. */
export function translate(text: string, key: string, options: RenderOptions): string {
  if (!text) return text;
  let lookupKey = key;
  if (text.startsWith("@")) {
    lookupKey = text.substring(1);
  }
  if (options.translationResolver) {
    return options.translationResolver.translate(lookupKey, text);
  }
  return text;
}

/** True when a string should be tagged as a translatable node. */
export function isTranslatable(text: string, options: RenderOptions): boolean {
  return text.startsWith("@") || options.translationResolver != null;
}

/** Tags an element with the localization contract attributes. */
export function tagTranslatable(el: Element, original: string, fallbackKey: string): void {
  el.classList.add("quiht-translatable-node");
  el.setAttribute("data-quiht-key", original.startsWith("@") ? original.substring(1) : fallbackKey);
  el.setAttribute("data-quiht-original", original);
}

/**
 * Resolves the translation key for a widget's localizable `text`, honouring
 * FontLab's `.ts` convention: when a widget carries a `statusTip` of the form
 * `@some.key`, that key is the canonical translation key and wins over the
 * synthesized `<widgetName>.text` fallback. When the `text` itself begins with
 * `@`, {@link translate}/{@link tagTranslatable} already prefer it, so this
 * helper only supplies the fallback used when the text is plain source.
 */
export function textKeyFor(widgetNode: Element, widgetName: string): string {
  const statusTip = propString(widgetNode, "statusTip");
  if (statusTip.startsWith("@")) return statusTip.substring(1);
  return `${widgetName}.text`;
}

/**
 * Strips a Qt accelerator mnemonic from menu/action text: a single `&` marks
 * the following character as the accelerator and is removed; a literal `&&`
 * collapses to one `&`.
 */
function stripMnemonic(text: string): string {
  const sentinel = String.fromCharCode(0);
  return text
    .replace(/&&/g, sentinel)
    .replace(/&/g, "")
    .replace(new RegExp(sentinel, "g"), "&");
}

/** Human-readable labels for Qt `QDialogButtonBox` standard buttons. */
const STANDARD_BUTTON_LABELS: Record<string, string> = {
  Ok: "OK",
  Cancel: "Cancel",
  Apply: "Apply",
  Close: "Close",
  Yes: "Yes",
  No: "No",
  Help: "Help",
  Save: "Save",
  Discard: "Discard",
  Reset: "Reset",
  RestoreDefaults: "Restore Defaults",
  Open: "Open",
  SaveAll: "Save All",
  Retry: "Retry",
  Ignore: "Ignore",
  Abort: "Abort",
  YesToAll: "Yes to All",
  NoToAll: "No to All",
};

/**
 * Renders `<item>` rows for `QListWidget`/`QTreeWidget` into `parent`, recursing
 * into nested `<item>`s (tree children). Item text is localizable.
 */
function renderItemViewItems(
  items: Element[],
  parent: HTMLElement,
  options: RenderOptions,
  d: Document,
  widgetName: string,
  depth: number,
): void {
  items.forEach((item, index) => {
    const textNode = item.querySelector(':scope > property[name="text"] > string');
    const rawText = textNode?.textContent ?? "";

    const li = d.createElement("li");
    li.className = "q-item";
    if (depth > 0) li.style.paddingLeft = `${depth * 14}px`;

    const span = d.createElement("span");
    const fallbackKey = `${widgetName}.item[${index}]`;
    span.textContent = translate(rawText, fallbackKey, options);
    if (rawText && isTranslatable(rawText, options)) {
      tagTranslatable(span, rawText, fallbackKey);
    }
    li.appendChild(span);
    parent.appendChild(li);

    // Nested <item>s represent tree children.
    const childItems = directChildren(item, "item");
    if (childItems.length > 0) {
      renderItemViewItems(childItems, parent, options, d, widgetName, depth + 1);
    }
  });
}

/**
 * Renders the structure of a `QMenuBar`/`QMenu`: child `<widget class="QMenu">`
 * nodes become titled submenus, and `<addaction>` references become action
 * rows. Titles/action text are localizable with `&` mnemonic handling.
 */
function renderMenuChildren(
  menuNode: Element,
  parent: HTMLElement,
  options: RenderOptions,
  d: Document,
): void {
  // Submenus: nested <widget class="QMenu"> children.
  const submenus = new Map<string, Element>();
  directChildren(menuNode, "widget").forEach((w) => {
    if (w.getAttribute("class") === "QMenu") {
      submenus.set(w.getAttribute("name") ?? "", w);

      const li = d.createElement("li");
      li.className = "q-menu-title";
      const rawTitle = propString(w, "title");
      const span = d.createElement("span");
      const wName = w.getAttribute("name") ?? "";
      span.textContent = stripMnemonic(translate(rawTitle, `${wName}.title`, options));
      if (rawTitle && isTranslatable(rawTitle, options)) {
        tagTranslatable(span, rawTitle, `${wName}.title`);
      }
      li.appendChild(span);

      const sub = d.createElement("ul");
      sub.className = "QMenu q-submenu QWidget";
      renderMenuChildren(w, sub, options, d);
      li.appendChild(sub);
      parent.appendChild(li);
    }
  });

  // Actions: <addaction name="..."/> referencing top-level <action> definitions.
  directChildren(menuNode, "addaction").forEach((add) => {
    const actionName = add.getAttribute("name") ?? "";
    if (actionName === "separator") {
      const sep = d.createElement("li");
      sep.className = "q-menu-separator";
      parent.appendChild(sep);
      return;
    }
    if (submenus.has(actionName)) return; // already rendered as a submenu title

    const doc = menuNode.ownerDocument;
    const action = doc.querySelector(`action[name="${actionName}"]`);
    const rawText = action ? propString(action, "text") : actionName;

    const li = d.createElement("li");
    li.className = "q-menu-action";
    const span = d.createElement("span");
    span.textContent = stripMnemonic(translate(rawText, `${actionName}.text`, options));
    if (rawText && isTranslatable(rawText, options)) {
      tagTranslatable(span, rawText, `${actionName}.text`);
    }
    li.appendChild(span);
    parent.appendChild(li);
  });
}

/** Renders a single `<widget>` node into an HTMLElement. */
export function renderWidget(
  widgetNode: Element,
  options: RenderOptions,
  isRoot = false,
): HTMLElement {
  const ownerDoc = widgetNode.ownerDocument;
  // The .ui XML document cannot create HTML elements; use a real HTML document.
  const d: Document =
    options.targetDocument ??
    (typeof document !== "undefined" ? document : (ownerDoc as unknown as Document));

  const className = widgetNode.getAttribute("class") || "QWidget";
  const widgetName = widgetNode.getAttribute("name") || "";

  let el: HTMLElement;
  let contentContainer: HTMLElement | null = null;

  switch (className) {
    case "QDialog": {
      el = d.createElement("div");
      el.className = "QDialog QWidget";

      const titlebar = d.createElement("div");
      titlebar.className = "q-dialog-titlebar";

      const titleText = propString(widgetNode, "windowTitle") || "Dialog";
      const translatedTitle = translate(titleText, `${widgetName}.windowTitle`, options);

      const titleSpan = d.createElement("span");
      titleSpan.textContent = translatedTitle;
      if (isTranslatable(titleText, options)) {
        tagTranslatable(titleSpan, titleText, `${widgetName}.windowTitle`);
      }
      titlebar.appendChild(titleSpan);

      const closeBtn = d.createElement("button");
      closeBtn.className = "QPushButton";
      closeBtn.style.width = "16px";
      closeBtn.style.height = "16px";
      closeBtn.style.padding = "0";
      closeBtn.style.minWidth = "0";
      closeBtn.textContent = "×";
      titlebar.appendChild(closeBtn);

      el.appendChild(titlebar);

      contentContainer = d.createElement("div");
      contentContainer.className = "q-dialog-content";
      el.appendChild(contentContainer);
      break;
    }

    case "QLabel": {
      el = d.createElement("span");
      el.className = "QLabel QWidget";

      const labelText = propString(widgetNode, "text");
      const labelKey = textKeyFor(widgetNode, widgetName);
      el.textContent = translate(labelText, labelKey, options);

      const wordWrap = getProperty(widgetNode, "wordWrap");
      if (wordWrap) el.classList.add("q-word-wrap");

      if (isTranslatable(labelText, options)) {
        tagTranslatable(el, labelText, labelKey);
      }
      break;
    }

    case "QPushButton":
    case "QToolButton": {
      el = d.createElement("button");
      el.className = `${className} QWidget`;

      const btnText = propString(widgetNode, "text");
      const btnKey = textKeyFor(widgetNode, widgetName);
      el.textContent = translate(btnText, btnKey, options);

      const iconPath = getProperty(widgetNode, "icon");
      if (typeof iconPath === "string" && iconPath) {
        let resolvedUrl = iconPath;
        if (options.resourceResolver) {
          resolvedUrl = options.resourceResolver.resolveResource(iconPath);
        }
        const img = d.createElement("img");
        img.src = resolvedUrl;
        img.style.height = "16px";
        img.style.width = "16px";
        el.prepend(img);
      }

      if (isTranslatable(btnText, options)) {
        tagTranslatable(el, btnText, btnKey);
      }
      break;
    }

    case "QLineEdit": {
      const input = d.createElement("input");
      input.type = "text";
      input.className = "QLineEdit QWidget";
      const placeholder = propString(widgetNode, "placeholderText");
      if (placeholder) {
        input.placeholder = translate(placeholder, `${widgetName}.placeholderText`, options);
      }
      el = input;
      break;
    }

    case "QTextEdit":
    case "QPlainTextEdit": {
      el = d.createElement("textarea");
      el.className = `${className} QWidget`;
      break;
    }

    case "QCheckBox": {
      const label = d.createElement("label");
      label.className = "QCheckBox QWidget";

      const cbInput = d.createElement("input");
      cbInput.type = "checkbox";
      label.appendChild(cbInput);

      const cbText = propString(widgetNode, "text");
      const cbKey = textKeyFor(widgetNode, widgetName);
      const cbSpan = d.createElement("span");
      cbSpan.textContent = translate(cbText, cbKey, options);
      label.appendChild(cbSpan);

      if (isTranslatable(cbText, options)) {
        tagTranslatable(cbSpan, cbText, cbKey);
      }
      el = label;
      break;
    }

    case "QRadioButton": {
      const label = d.createElement("label");
      label.className = "QRadioButton QWidget";

      const rbInput = d.createElement("input");
      rbInput.type = "radio";
      rbInput.name =
        (widgetNode.parentNode as Element | null)?.getAttribute?.("name") || "radio-group";
      label.appendChild(rbInput);

      const rbText = propString(widgetNode, "text");
      const rbKey = textKeyFor(widgetNode, widgetName);
      const rbSpan = d.createElement("span");
      rbSpan.textContent = translate(rbText, rbKey, options);
      label.appendChild(rbSpan);

      if (isTranslatable(rbText, options)) {
        tagTranslatable(rbSpan, rbText, rbKey);
      }
      el = label;
      break;
    }

    case "QComboBox": {
      const container = d.createElement("div");
      container.className = "QComboBox-container QWidget";

      const select = d.createElement("select");
      select.className = "QComboBox QWidget";
      container.appendChild(select);

      directChildren(widgetNode, "item").forEach((item) => {
        const itemTextNode = item.querySelector('property[name="text"] > string');
        if (itemTextNode) {
          const rawText = itemTextNode.textContent ?? "";
          const opt = d.createElement("option");
          opt.textContent = translate(rawText, "", options);
          select.appendChild(opt);
        }
      });

      el = container;
      break;
    }

    case "QGroupBox": {
      el = d.createElement("div");
      el.className = "QGroupBox QWidget";

      const groupTitleText = propString(widgetNode, "title");
      const legend = d.createElement("legend");
      legend.textContent = translate(groupTitleText, `${widgetName}.title`, options);
      el.appendChild(legend);

      if (isTranslatable(groupTitleText, options)) {
        tagTranslatable(legend, groupTitleText, `${widgetName}.title`);
      }
      break;
    }

    case "QTabWidget": {
      el = d.createElement("div");
      el.className = "QTabWidget QWidget";

      const tabBar = d.createElement("ul");
      tabBar.className = "q-tab-bar";
      el.appendChild(tabBar);

      const tabStack = d.createElement("div");
      tabStack.className = "q-tab-stack";
      el.appendChild(tabStack);

      contentContainer = tabStack;

      el.addEventListener("click", (e) => {
        const target = e.target as Element | null;
        const btn = target?.closest?.(".q-tab-button");
        if (!btn) return;
        const index = parseInt(btn.getAttribute("data-index") || "0", 10);

        tabBar.querySelectorAll(".q-tab-button").forEach((b, i) => {
          b.classList.toggle("active", i === index);
        });
        tabStack.querySelectorAll(".q-tab-page").forEach((p, i) => {
          p.classList.toggle("active", i === index);
        });
      });
      break;
    }

    case "QScrollArea": {
      el = d.createElement("div");
      el.className = "QScrollArea QWidget";
      contentContainer = d.createElement("div");
      contentContainer.className = "QWidget";
      el.appendChild(contentContainer);
      break;
    }

    case "QWidget": {
      // The generic container/base class — a plain `<div>`, never a placeholder.
      el = d.createElement("div");
      el.className = "QWidget";
      break;
    }

    case "QFrame": {
      el = d.createElement("div");
      el.className = "QFrame QWidget";
      // Honour simple frameShape/frameShadow hints as CSS modifier classes.
      const shape = propString(widgetNode, "frameShape");
      const shadow = propString(widgetNode, "frameShadow");
      if (shape.includes("Box")) el.classList.add("q-frame-box");
      else if (shape.includes("Panel")) el.classList.add("q-frame-panel");
      else if (shape.includes("HLine")) el.classList.add("q-frame-hline");
      else if (shape.includes("VLine")) el.classList.add("q-frame-vline");
      else if (shape.includes("StyledPanel")) el.classList.add("q-frame-styled");
      if (shadow.includes("Sunken")) el.classList.add("q-frame-sunken");
      else if (shadow.includes("Raised")) el.classList.add("q-frame-raised");
      break;
    }

    case "QSplitter": {
      el = d.createElement("div");
      el.className = "QSplitter QWidget";
      const splitterOrient = propString(widgetNode, "orientation");
      el.classList.add(splitterOrient.includes("Vertical") ? "q-vertical" : "q-horizontal");
      break;
    }

    case "QSpinBox":
    case "QDoubleSpinBox": {
      const input = d.createElement("input");
      input.type = "number";
      input.className = `${className} QWidget`;

      const min = getProperty(widgetNode, "minimum");
      const max = getProperty(widgetNode, "maximum");
      const value = getProperty(widgetNode, "value");
      const step = getProperty(widgetNode, "singleStep");
      if (typeof min === "number") input.min = String(min);
      if (typeof max === "number") input.max = String(max);
      if (typeof value === "number") input.value = String(value);
      if (typeof step === "number") input.step = String(step);
      else if (className === "QDoubleSpinBox") input.step = "any";

      const prefix = propString(widgetNode, "prefix");
      const suffix = propString(widgetNode, "suffix");
      if (prefix || suffix) {
        // Wrap so the prefix/suffix can sit alongside the numeric input.
        const wrap = d.createElement("span");
        wrap.className = "q-spinbox-wrap QWidget";
        if (prefix) {
          const pre = d.createElement("span");
          pre.className = "q-spinbox-prefix";
          pre.textContent = prefix;
          wrap.appendChild(pre);
        }
        wrap.appendChild(input);
        if (suffix) {
          const suf = d.createElement("span");
          suf.className = "q-spinbox-suffix";
          suf.textContent = suffix;
          wrap.appendChild(suf);
        }
        el = wrap;
      } else {
        el = input;
      }
      break;
    }

    case "QSlider": {
      const input = d.createElement("input");
      input.type = "range";
      input.className = "QSlider QWidget";
      const sliderOrient = propString(widgetNode, "orientation");
      input.classList.add(sliderOrient.includes("Vertical") ? "q-vertical" : "q-horizontal");
      const min = getProperty(widgetNode, "minimum");
      const max = getProperty(widgetNode, "maximum");
      const value = getProperty(widgetNode, "value");
      if (typeof min === "number") input.min = String(min);
      if (typeof max === "number") input.max = String(max);
      if (typeof value === "number") input.value = String(value);
      el = input;
      break;
    }

    case "QProgressBar": {
      const progress = d.createElement("progress");
      progress.className = "QProgressBar QWidget";
      const min = getProperty(widgetNode, "minimum");
      const max = getProperty(widgetNode, "maximum");
      const value = getProperty(widgetNode, "value");
      // <progress> has no `min`; offset value/max by the minimum when present.
      const minN = typeof min === "number" ? min : 0;
      if (typeof max === "number") progress.max = max - minN;
      if (typeof value === "number") progress.value = value - minN;
      el = progress;
      break;
    }

    case "QDialogButtonBox": {
      el = d.createElement("div");
      el.className = "QDialogButtonBox QWidget";
      const buttons = propString(widgetNode, "standardButtons");
      buttons
        .split("|")
        .map((b) => b.trim())
        .filter(Boolean)
        .forEach((token) => {
          // Tokens look like "QDialogButtonBox::Ok" or "QDialogButtonBox::StandardButton::Ok".
          const name = token.split("::").pop() ?? token;
          const btn = d.createElement("button");
          btn.className = "QPushButton QWidget";
          btn.setAttribute("data-q-standard-button", name);
          const label = STANDARD_BUTTON_LABELS[name] ?? name;
          btn.textContent = translate(label, `${widgetName}.${name}`, options);
          if (isTranslatable(label, options)) {
            tagTranslatable(btn, label, `${widgetName}.${name}`);
          }
          el.appendChild(btn);
        });
      break;
    }

    case "QListWidget":
    case "QTreeWidget": {
      el = d.createElement("ul");
      el.className = `${className} q-item-view QWidget`;
      renderItemViewItems(directChildren(widgetNode, "item"), el, options, d, widgetName, 0);
      break;
    }

    case "QMenuBar":
    case "QMenu": {
      el = d.createElement("ul");
      el.className = `${className} QWidget`;
      renderMenuChildren(widgetNode, el, options, d);
      break;
    }

    case "QMainWindow": {
      el = d.createElement("div");
      el.className = "QMainWindow QWidget";

      // QMainWindow nests its regions as direct <widget> children, identified
      // either by class or by a <attribute name="..."> on the central widget.
      directChildren(widgetNode, "widget").forEach((child) => {
        const childClass = child.getAttribute("class") ?? "";
        if (childClass === "QMenuBar") {
          const bar = renderWidget(child, options);
          bar.classList.add("q-mainwindow-menubar");
          el.appendChild(bar);
        } else if (childClass === "QStatusBar") {
          const status = d.createElement("div");
          status.className = "QStatusBar q-mainwindow-statusbar QWidget";
          status.id = child.getAttribute("name") || "";
          status.setAttribute("data-q-class", "QStatusBar");
          el.appendChild(status);
        } else {
          // Central widget (or toolbars/docks rendered inline).
          const wrap = d.createElement("div");
          wrap.className = "q-mainwindow-central";
          wrap.appendChild(renderWidget(child, options));
          el.appendChild(wrap);
        }
      });
      // The regions are rendered above; suppress the generic child walk at the
      // bottom of this function by pointing it at a detached, hidden container.
      contentContainer = d.createElement("div");
      contentContainer.style.display = "none";
      break;
    }

    default: {
      if (options.customRenderers && options.customRenderers[className]) {
        el = options.customRenderers[className](widgetNode, options);
      } else {
        el = d.createElement("div");
        el.className = `${className} QWidget`;
        el.style.border = "1px dotted #ccc";
        el.style.minHeight = "24px";
        el.title = `Custom Widget: ${className}`;

        if (!widgetNode.querySelector("layout")) {
          const span = d.createElement("span");
          span.style.fontSize = "9px";
          span.style.color = "#999";
          span.style.padding = "4px";
          span.textContent = className;
          el.appendChild(span);
        }
      }
      break;
    }
  }

  el.setAttribute("data-q-class", className);
  el.setAttribute("data-q-name", widgetName);
  el.id = widgetName;

  // Apply geometry for the root widget or widgets not inside a layout item.
  const geometry = getProperty(widgetNode, "geometry") as QRect | null;
  const parentEl = widgetNode.parentNode as Element | null;
  if (geometry && (isRoot || !parentEl || parentEl.tagName !== "item")) {
    el.style.position = "absolute";
    el.style.left = `${geometry.x}px`;
    el.style.top = `${geometry.y}px`;
    el.style.width = `${geometry.width}px`;
    el.style.height = `${geometry.height}px`;
  }

  const minSize = getProperty(widgetNode, "minimumSize") as QSize | null;
  if (minSize) {
    if (minSize.width > 0) el.style.minWidth = `${minSize.width}px`;
    if (minSize.height > 0) el.style.minHeight = `${minSize.height}px`;
  }

  const maxSize = getProperty(widgetNode, "maximumSize") as QSize | null;
  if (maxSize) {
    if (maxSize.width > 0 && maxSize.width < 16777215) el.style.maxWidth = `${maxSize.width}px`;
    if (maxSize.height > 0 && maxSize.height < 16777215)
      el.style.maxHeight = `${maxSize.height}px`;
  }

  const toolTipText = propString(widgetNode, "toolTip");
  if (toolTipText) {
    el.setAttribute("title", translate(toolTipText, `${widgetName}.toolTip`, options));
    if (isTranslatable(toolTipText, options)) {
      el.setAttribute(
        "data-quiht-tooltip-key",
        toolTipText.startsWith("@") ? toolTipText.substring(1) : `${widgetName}.toolTip`,
      );
    }
  }

  const statusTipText = propString(widgetNode, "statusTip");
  if (statusTipText) {
    el.setAttribute("data-statustip", translate(statusTipText, `${widgetName}.statusTip`, options));
    if (isTranslatable(statusTipText, options)) {
      el.setAttribute(
        "data-quiht-statustip-key",
        statusTipText.startsWith("@") ? statusTipText.substring(1) : `${widgetName}.statusTip`,
      );
    }
  }

  const targetContainer = contentContainer || el;

  const layoutNode = firstChild(widgetNode, "layout");
  if (layoutNode) {
    renderLayout(layoutNode, targetContainer, options, d);
  } else {
    directChildren(widgetNode, "widget").forEach((childNode) => {
      targetContainer.appendChild(renderWidget(childNode, options));
    });
  }

  return el;
}

/** Renders a `<layout>` node, populating it with its items. */
export function renderLayout(
  layoutNode: Element,
  parentEl: HTMLElement,
  options: RenderOptions,
  d: Document,
): void {
  const layoutClass = layoutNode.getAttribute("class") || "QVBoxLayout";
  const layoutName = layoutNode.getAttribute("name") || "";

  const layoutContainer = d.createElement("div");
  layoutContainer.className = `q-layout ${layoutName}`;
  parentEl.appendChild(layoutContainer);

  if (layoutClass === "QVBoxLayout") {
    layoutContainer.classList.add("q-vbox-layout");
  } else if (layoutClass === "QHBoxLayout") {
    layoutContainer.classList.add("q-hbox-layout");
  } else if (layoutClass === "QGridLayout") {
    layoutContainer.classList.add("q-grid-layout");
  }

  const spacing = getProperty(layoutNode, "spacing");
  if (spacing !== null) {
    layoutContainer.style.gap = `${spacing}px`;
  }

  const leftMargin = (getProperty(layoutNode, "leftMargin") as number | null) ?? 0;
  const rightMargin = (getProperty(layoutNode, "rightMargin") as number | null) ?? 0;
  const topMargin = (getProperty(layoutNode, "topMargin") as number | null) ?? 0;
  const bottomMargin = (getProperty(layoutNode, "bottomMargin") as number | null) ?? 0;
  layoutContainer.style.padding = `${topMargin}px ${rightMargin}px ${bottomMargin}px ${leftMargin}px`;

  const itemNodes = directChildren(layoutNode, "item");
  const parentClass = (parentEl.parentNode as Element | null)?.getAttribute?.("data-q-class");

  itemNodes.forEach((itemNode, index) => {
    const row = itemNode.getAttribute("row");
    const column = itemNode.getAttribute("column");
    const rowSpan = itemNode.getAttribute("rowspan");
    const colSpan = itemNode.getAttribute("colspan");

    let itemEl: HTMLElement | null = null;

    const childWidget = firstChild(itemNode, "widget");
    const childLayout = firstChild(itemNode, "layout");
    const childSpacer = firstChild(itemNode, "spacer");

    if (childWidget) {
      itemEl = renderWidget(childWidget, options);
    } else if (childLayout) {
      itemEl = d.createElement("div");
      itemEl.className = "q-nested-layout-wrapper";
      renderLayout(childLayout, itemEl, options, d);
    } else if (childSpacer) {
      itemEl = d.createElement("div");
      itemEl.className = "q-spacer";
      const orientation =
        childSpacer.querySelector('property[name="orientation"]')?.textContent || "";
      const size = getProperty(childSpacer, "size") as QSize | null;
      if (size) {
        if (orientation.includes("Horizontal")) {
          itemEl.style.width = `${size.width}px`;
          itemEl.style.height = "1px";
          itemEl.style.flexGrow = "0";
          itemEl.style.flexShrink = "0";
        } else {
          itemEl.style.height = `${size.height}px`;
          itemEl.style.width = "1px";
          itemEl.style.flexGrow = "0";
          itemEl.style.flexShrink = "0";
        }
      } else {
        itemEl.style.flexGrow = "1";
      }
    }

    if (!itemEl) return;

    if (parentClass === "QTabWidget") {
      const tabTitle =
        itemNode.querySelector('attribute[name="title"]')?.textContent || `Tab ${index + 1}`;
      const translatedTabTitle = translate(tabTitle, "", options);

      const tabBar = (parentEl.parentNode as Element).querySelector(".q-tab-bar");
      const tabBtn = d.createElement("li");
      tabBtn.className = `q-tab-button ${index === 0 ? "active" : ""}`;
      tabBtn.setAttribute("data-index", String(index));
      tabBtn.textContent = translatedTabTitle;
      tabBar?.appendChild(tabBtn);

      const pageWrapper = d.createElement("div");
      pageWrapper.className = `q-tab-page ${index === 0 ? "active" : ""}`;
      pageWrapper.appendChild(itemEl);
      layoutContainer.appendChild(pageWrapper);
    } else {
      layoutContainer.appendChild(itemEl);
    }

    if (layoutClass === "QGridLayout" && row !== null && column !== null) {
      const r = parseInt(row, 10) + 1;
      const c = parseInt(column, 10) + 1;
      const rs = rowSpan ? parseInt(rowSpan, 10) : 1;
      const cs = colSpan ? parseInt(colSpan, 10) : 1;
      itemEl.style.gridRow = `${r} / span ${rs}`;
      itemEl.style.gridColumn = `${c} / span ${cs}`;
    }
  });
}
