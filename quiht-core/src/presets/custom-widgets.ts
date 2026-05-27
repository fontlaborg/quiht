/**
 * Custom-widget renderer preset.
 *
 * Maps supported `Y*`/`Qt*`/chart custom widgets to sensible HTML
 * approximations, so they render as real controls instead of quiht-core's
 * dotted placeholder. Pass it as
 * `options.customRenderers` (or merge into your own map):
 *
 * ```ts
 * import { render, customWidgetPreset } from "quiht-core";
 * render(doc, { customRenderers: customWidgetPreset });
 * ```
 *
 * The mapping is derived from the widgets' C++ base classes (e.g. a widget
 * extending `QLineEdit` becomes an `<input>`, one extending `QLabel` a `<span>`,
 * a `QWidget` container a `<div>` that children flow into). Text-bearing widgets
 * honour the same localization tagging contract as the core renderer (`@key` /
 * `<name>.text`, with a `@`-prefixed `statusTip` winning — see `textKeyFor`).
 *
 * Visual-only widgets (colour pickers, gradient bars, glyph/font previews) are
 * approximated with styled `<div>`s; quiht imitates appearance, not behaviour.
 */

import { directChildren } from "../parser.js";
import {
  isTranslatable,
  propString,
  tagTranslatable,
  textKeyFor,
  translate,
} from "../render.js";
import type { RenderOptions } from "../types.js";

type CustomRenderer = (element: Element, options: RenderOptions) => HTMLElement;

/** Picks the HTML document to build into (test/SSR safe). */
function ownerDoc(node: Element, options: RenderOptions): Document {
  return (
    options.targetDocument ??
    (typeof document !== "undefined" ? document : (node.ownerDocument as unknown as Document))
  );
}

/** Resolves a widget's `icon` property to a URL via the resource resolver. */
function iconUrl(node: Element, options: RenderOptions): string {
  const iconPath = propString(node, "icon");
  if (!iconPath) return "";
  return options.resourceResolver ? options.resourceResolver.resolveResource(iconPath) : iconPath;
}

/** Builds the base class string carrying the original Qt class + a modifier. */
function classes(node: Element, extraClass: string, fallback = "QWidget"): string {
  return `${node.getAttribute("class") ?? fallback} ${extraClass} QWidget`.trim();
}

/** A text-bearing label widget → `<span>` with localization tagging. */
function labelRenderer(extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const name = node.getAttribute("name") ?? "";
    const span = d.createElement("span");
    span.className = `${classes(node, extraClass)} QLabel`;
    const raw = propString(node, "text");
    const key = textKeyFor(node, name);
    span.textContent = translate(raw, key, options);
    if (raw && isTranslatable(raw, options)) tagTranslatable(span, raw, key);
    return span;
  };
}

/** A single-line input widget → `<input>` (carries placeholder if any). */
function inputRenderer(type: string, extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const input = d.createElement("input");
    input.type = type;
    input.className = `${classes(node, extraClass)} QLineEdit`;
    const ph = propString(node, "placeholderText");
    const name = node.getAttribute("name") ?? "";
    if (ph) input.placeholder = translate(ph, `${name}.placeholderText`, options);
    return input;
  };
}

/** A multi-line editor widget → `<textarea>`. */
function textareaRenderer(extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const ta = d.createElement("textarea");
    ta.className = classes(node, extraClass);
    const ph = propString(node, "placeholderText");
    const name = node.getAttribute("name") ?? "";
    if (ph) ta.placeholder = translate(ph, `${name}.placeholderText`, options);
    return ta;
  };
}

/**
 * A container widget → a styled `<div>` (or other tag). The core renderer walks
 * the widget's layout/children into whatever element is returned here, so these
 * compose naturally.
 */
function containerRenderer(extraClass: string, tag = "div"): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const div = d.createElement(tag);
    div.className = classes(node, extraClass);
    return div;
  };
}

/** Builds a simple styled `<div>` renderer carrying the widget class. */
function styledDiv(extraClass: string): CustomRenderer {
  return containerRenderer(extraClass);
}

/** An icon checkbox/radio → `<label><img><input type><span></label>`. */
function iconToggleRenderer(type: "checkbox" | "radio", extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const name = node.getAttribute("name") ?? "";
    const label = d.createElement("label");
    label.className = `${classes(node, extraClass)} ${type === "checkbox" ? "QCheckBox" : "QRadioButton"}`;

    const url = iconUrl(node, options);
    if (url) {
      const img = d.createElement("img");
      img.src = url;
      img.style.width = "16px";
      img.style.height = "16px";
      label.appendChild(img);
    }
    const input = d.createElement("input");
    input.type = type;
    label.appendChild(input);

    const raw = propString(node, "text");
    const key = textKeyFor(node, name);
    if (raw) {
      const span = d.createElement("span");
      span.textContent = translate(raw, key, options);
      if (isTranslatable(raw, options)) tagTranslatable(span, raw, key);
      label.appendChild(span);
    }
    return label;
  };
}

/** An icon tool button (checkable) → `<button>` with optional icon. */
function iconButtonRenderer(extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const btn = d.createElement("button");
    btn.className = `${classes(node, extraClass)} QToolButton`;
    const url = iconUrl(node, options);
    if (url) {
      const img = d.createElement("img");
      img.src = url;
      img.style.width = "16px";
      img.style.height = "16px";
      btn.appendChild(img);
    }
    const raw = propString(node, "text");
    const name = node.getAttribute("name") ?? "";
    const key = textKeyFor(node, name);
    if (raw) {
      const span = d.createElement("span");
      span.textContent = translate(raw, key, options);
      if (isTranslatable(raw, options)) tagTranslatable(span, raw, key);
      btn.appendChild(span);
    }
    return btn;
  };
}

/** An item-view widget (list/tree) → `<ul>` populated from `<item>` rows. */
function itemViewRenderer(extraClass: string): CustomRenderer {
  const renderItems = (
    items: Element[],
    parent: HTMLElement,
    options: RenderOptions,
    d: Document,
    depth: number,
  ): void => {
    items.forEach((item) => {
      const textNode = item.querySelector(':scope > property[name="text"] > string');
      const raw = textNode?.textContent ?? "";
      const li = d.createElement("li");
      li.className = "q-item";
      if (depth > 0) li.style.paddingLeft = `${depth * 14}px`;
      const span = d.createElement("span");
      span.textContent = translate(raw, "", options);
      if (raw && isTranslatable(raw, options)) tagTranslatable(span, raw, "");
      li.appendChild(span);
      parent.appendChild(li);
      const kids = directChildren(item, "item");
      if (kids.length) renderItems(kids, parent, options, d, depth + 1);
    });
  };
  return (node, options) => {
    const d = ownerDoc(node, options);
    const ul = d.createElement("ul");
    ul.className = `${classes(node, extraClass)} q-item-view`;
    renderItems(directChildren(node, "item"), ul, options, d, 0);
    return ul;
  };
}

/** A colour swatch button (`<button>` wrapping a coloured `<span>`). */
const renderYColorButton: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const btn = d.createElement("button");
  btn.className = `${classes(node, "q-color-button")} QToolButton`;
  const swatch = d.createElement("span");
  swatch.className = "q-color-swatch";
  btn.appendChild(swatch);
  return btn;
};

/** A node-shape preview button. */
const renderYNodePreview: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const btn = d.createElement("button");
  btn.className = `${classes(node, "q-node-preview")} QToolButton`;
  const dot = d.createElement("span");
  dot.className = "q-node-dot";
  btn.appendChild(dot);
  return btn;
};

/** A 3×3 anchor/transform-origin selector grid. */
const renderYCenterSelector: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const grid = d.createElement("div");
  grid.className = classes(node, "q-center-selector");
  for (let i = 0; i < 9; i++) {
    const cell = d.createElement("button");
    cell.className = "q-center-dot";
    cell.type = "button";
    if (i === 4) cell.classList.add("active");
    grid.appendChild(cell);
  }
  return grid;
};

/** YLineEditSuffix — a line edit with a trailing unit suffix. */
const renderYLineEditSuffix: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const wrap = d.createElement("span");
  wrap.className = `${classes(node, "q-suffix-edit")}`;
  const input = d.createElement("input");
  input.type = "text";
  input.className = "QLineEdit QWidget";
  wrap.appendChild(input);
  const suffix = propString(node, "suffix");
  if (suffix) {
    const suf = d.createElement("span");
    suf.className = "q-suffix-edit-suffix";
    suf.textContent = suffix;
    wrap.appendChild(suf);
  }
  return wrap;
};

/**
 * YSelector — extends QLabel: a clickable text label, *not* a checkbox. In
 * FontLab the adjacent icon button carries the toggle state; YSelector is just
 * the caption. Rendering it with a checkbox added a spurious square and broke row
 * alignment, so it is a plain (clickable-styled) text span.
 */
const renderYSelector: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const name = node.getAttribute("name") ?? "";
  const span = d.createElement("span");
  span.className = `${classes(node, "q-selector")} QLabel`;

  const raw = propString(node, "text");
  const key = textKeyFor(node, name);
  span.textContent = translate(raw, key, options);
  if (raw && isTranslatable(raw, options)) tagTranslatable(span, raw, key);
  return span;
};

/**
 * The custom-widget preset, keyed by Qt class name. Pass as
 * `options.customRenderers`. Grouped by the HTML they render to.
 */
export const customWidgetPreset: Record<string, CustomRenderer> = {
  // --- QLineEdit-derived ---
  YLineEditSuffix: renderYLineEditSuffix,
  YLineEditArrowDown: inputRenderer("text", "q-arrow-edit"),

  // --- QLabel-derived (text-bearing) ---
  YSelector: renderYSelector,
  YTitleLabel: labelRenderer("q-title-label"),
  YRoundedLabel: labelRenderer("q-rounded-label"),
  YTransparentLabel: labelRenderer("q-transparent-label"),
  YRotatedLabel: labelRenderer("q-rotated-label"),

  // --- QCheckBox / QRadioButton (icon variants) ---
  YIconCheckBox: iconToggleRenderer("checkbox", "q-icon-check"),
  YIconRadioButton: iconToggleRenderer("radio", "q-icon-radio"),
  YSelectorCheck: iconToggleRenderer("checkbox", "q-selector-check"),

  // --- QToolButton / QAbstractButton ---
  YCheckButton: iconButtonRenderer("q-check-button"),
  YColorButton: renderYColorButton,
  YNodePreview: renderYNodePreview,

  // --- QComboBox ---
  YComboBox: (node, options) => {
    const d = ownerDoc(node, options);
    const sel = d.createElement("select");
    sel.className = `${classes(node, "q-ycombo")} QComboBox`;
    directChildren(node, "item").forEach((item) => {
      const t = item.querySelector('property[name="text"] > string')?.textContent ?? "";
      const opt = d.createElement("option");
      opt.textContent = translate(t, "", options);
      sel.appendChild(opt);
    });
    return sel;
  },

  // --- QPlainTextEdit / QTextEdit ---
  YPlainTextEdit: textareaRenderer("q-plain-text"),
  YTextEdit: textareaRenderer("q-text-edit"),
  CodeEditor: textareaRenderer("q-code-editor"),

  // --- QTreeWidget / QListWidget ---
  YSelectableTree: itemViewRenderer("q-tree"),
  YSelectableList: itemViewRenderer("q-list"),
  ShapesTree: itemViewRenderer("q-tree"),
  LayersTree: itemViewRenderer("q-tree"),

  // --- QWidget containers (children flow in) ---
  YBaseWidget: containerRenderer("q-base-widget"),
  YDarkerWidget: containerRenderer("q-darker-widget"),
  YLighterWidget: containerRenderer("q-lighter-widget"),
  YPanelWidget: containerRenderer("q-panel-widget", "section"),
  YSidebarWidget: containerRenderer("q-sidebar-widget", "aside"),
  YToolTipsWidget: containerRenderer("q-tooltip-widget"),
  YTrackingFrame: containerRenderer("q-tracking-frame"),
  YSearchWidget: containerRenderer("q-search-widget", "section"),
  YEmptyScrollArea: containerRenderer("q-empty-scroll"),
  YButtonGroup: containerRenderer("q-button-group"),
  AboutContent: containerRenderer("q-about-content"),

  // --- Sliders / angle / opacity ---
  YSimpleSlider: (node, options) => {
    const d = ownerDoc(node, options);
    const input = d.createElement("input");
    input.type = "range";
    input.className = `${classes(node, "q-horizontal")} YSimpleSlider QSlider`;
    return input;
  },
  YOpacityBar: styledDiv("q-opacity-bar"),
  YAngle: styledDiv("q-angle-widget"),
  YPopupAngle: styledDiv("q-angle-widget"),
  YCenterSelector: renderYCenterSelector,

  // --- Colour pickers / bars (visual approximations) ---
  YColorPreview: styledDiv("q-color-preview"),
  YColorBar: styledDiv("q-color-bar"),
  YColorRing: styledDiv("q-color-ring"),
  YColorSource: styledDiv("q-color-source"),
  YGradientBar: styledDiv("q-gradient-bar"),
  YHueBar: styledDiv("q-hue-bar"),
  YSaturationBar: styledDiv("q-saturation-bar"),
  YBrushStrokePreview: styledDiv("q-stroke-preview"),
  YPathPreview: styledDiv("q-path-preview"),
  YPreviewBackgroundWidget: styledDiv("q-preview-bg"),

  // --- Glyph / font previews & charts (visual placeholders) ---
  FontPreviewWidget: styledDiv("q-font-preview"),
  GlyphPreviewWidget: styledDiv("q-glyph-preview"),
  FontCellChart: styledDiv("q-cell-chart"),
  CellChart: styledDiv("q-cell-chart"),
  CIconViewWidget: styledDiv("q-icon-view"),
  PerspectiveWidget: styledDiv("q-perspective"),

  // --- Colour/stroke panels & miscellaneous widgets ---
  WidgetColorPanel: containerRenderer("q-color-panel", "section"),
  WidgetStrokePanel: containerRenderer("q-stroke-panel", "section"),
  WidgetColorBox: styledDiv("q-color-box"),
  WidgetColorSliders: containerRenderer("q-color-sliders"),
  YContinueWidget: containerRenderer("q-continue-widget"),
  GalleryListWidget: itemViewRenderer("q-gallery-list"),
  CellChartScrollBar: styledDiv("q-scrollbar q-vertical"),

  // --- Long-tail custom widgets ---
  YDisplayLabel: labelRenderer("q-display-label"),
  YToolbar: containerRenderer("q-toolbar"),
  YLocation: containerRenderer("q-location"),
  YPictureWidget: styledDiv("q-picture"),
  YRangeSelector: styledDiv("q-range-selector"),
  YMetaMap: styledDiv("q-meta-map"),
  YNonLinearMap: styledDiv("q-meta-map"),
  YSlidingPreview: styledDiv("q-glyph-preview"),
  PaintPanel: containerRenderer("q-paint-panel", "section"),
  LookupsPanel: containerRenderer("q-lookups-panel", "section"),
  ActionOverlayList: itemViewRenderer("q-list"),
  KerningPairList: itemViewRenderer("q-list"),
  YTableWidgetWithCopyPaste: styledDiv("q-table-grid"),
  MetricsTable: styledDiv("q-table-grid"),
  WidgetSwatch: styledDiv("q-color-preview"),
  TensionWidget: styledDiv("q-glyph-preview"),
  KerningPairPreview: styledDiv("q-glyph-preview"),
  PosPreviewWidget: styledDiv("q-glyph-preview"),
  BlendPreviewWidget: styledDiv("q-glyph-preview"),
  RenderWidget: styledDiv("q-canvas-surface"),
  GlyphsBar: styledDiv("q-glyph-preview"),
  ShapeCellChart: styledDiv("q-cell-chart"),
  UnicodeCellChart: styledDiv("q-cell-chart"),

  // --- Qt-extension widgets ---
  QtColorPicker: styledDiv("q-color-picker"),
  QtnPropertyView: styledDiv("q-property-view"),
};
