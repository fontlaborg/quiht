/**
 * FontLab custom-widget renderer preset.
 *
 * Covers the most common FontLab `Y*`/`Qt*` custom widgets seen in the Proteus
 * `.ui` files, which otherwise fall through to quiht-core's dotted placeholder.
 * Pass it as `options.customRenderers` (or merge into your own map):
 *
 * ```ts
 * import { render, fontlabPreset } from "quiht-core";
 * render(doc, { customRenderers: fontlabPreset });
 * ```
 *
 * Text-bearing widgets honour the same localization tagging contract as the
 * core renderer (`@key` / `<name>.text`, with a `@`-prefixed `statusTip`
 * winning as the canonical key — see `textKeyFor`).
 */

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

/** YLineEditSuffix — a line edit with a trailing unit suffix. */
const renderYLineEditSuffix: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const wrap = d.createElement("span");
  wrap.className = "YLineEditSuffix q-suffix-edit QWidget";

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

/** YSelector — a labelled, selectable toggle (checkbox + caption). */
const renderYSelector: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const name = node.getAttribute("name") ?? "";
  const label = d.createElement("label");
  label.className = "YSelector q-selector QWidget";

  const input = d.createElement("input");
  input.type = "checkbox";
  label.appendChild(input);

  const raw = propString(node, "text");
  const key = textKeyFor(node, name);
  const span = d.createElement("span");
  span.textContent = translate(raw, key, options);
  if (raw && isTranslatable(raw, options)) tagTranslatable(span, raw, key);
  label.appendChild(span);
  return label;
};

/** Builds a simple styled `<div>` renderer carrying the widget class. */
function styledDiv(extraClass: string): CustomRenderer {
  return (node, options) => {
    const d = ownerDoc(node, options);
    const div = d.createElement("div");
    div.className = `${node.getAttribute("class") ?? "YWidget"} ${extraClass} QWidget`;
    return div;
  };
}

/** YCheckButton — an icon toggle button. */
const renderYCheckButton: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const btn = d.createElement("button");
  btn.className = "YCheckButton QToolButton QWidget";

  const iconPath = propString(node, "icon");
  if (iconPath) {
    let url = iconPath;
    if (options.resourceResolver) url = options.resourceResolver.resolveResource(iconPath);
    const img = d.createElement("img");
    img.src = url;
    img.style.width = "16px";
    img.style.height = "16px";
    btn.appendChild(img);
  }
  return btn;
};

/** YSimpleSlider — a horizontal range input. */
const renderYSimpleSlider: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const input = d.createElement("input");
  input.type = "range";
  input.className = "YSimpleSlider QSlider q-horizontal QWidget";
  return input;
};

/** YOpacityBar — a horizontal gradient strip (visual only). */
const renderYOpacityBar: CustomRenderer = (node, options) => {
  const d = ownerDoc(node, options);
  const div = d.createElement("div");
  div.className = "YOpacityBar q-opacity-bar QWidget";
  return div;
};

/**
 * The FontLab custom-widget preset. Keyed by Qt class name; pass as
 * `options.customRenderers`.
 */
export const fontlabPreset: Record<string, CustomRenderer> = {
  YLineEditSuffix: renderYLineEditSuffix,
  YSelector: renderYSelector,
  YDarkerWidget: styledDiv("q-darker-widget"),
  YLighterWidget: styledDiv("q-lighter-widget"),
  YAngle: styledDiv("q-angle-widget"),
  YPopupAngle: styledDiv("q-angle-widget"),
  YCheckButton: renderYCheckButton,
  YSimpleSlider: renderYSimpleSlider,
  YOpacityBar: renderYOpacityBar,
  // Qt-extension widgets common in Proteus, rendered as styled placeholders.
  QtColorPicker: styledDiv("q-color-picker"),
  QtnPropertyView: styledDiv("q-property-view"),
};
