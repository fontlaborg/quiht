/**
 * Qt `.ui` → Alpine.js HTML-string compiler.
 *
 * Where {@link "./render".render} builds live DOM nodes for the localization
 * viewer, this module compiles the {@link UiRoot} AST into a **string** of
 * HTML-first, build-free markup enriched with Alpine.js attributes
 * (`x-data`/`x-model`/`@event`) and FontLab Web Components. The output is meant
 * to be dropped straight into an Alpine page (e.g. fog-online) with no React,
 * TypeScript, or Vite build step.
 *
 * Responsibilities mirror task004:
 *  - DOM layer: Qt classes → native HTML / registered custom elements.
 *  - State layer: input values collected into one root `x-data` scope, bound
 *    with `x-model`.
 *  - Behavior layer: `<connections>` compiled into Alpine `$dispatch` / `.window`
 *    event listeners.
 *  - CSS layer: layouts emitted as flex/grid utility classes (see `alpine.css`).
 */

import { buildAst } from "./ast.js";
import type {
  Connection,
  ItemNode,
  LayoutItem,
  LayoutNode,
  UiRoot,
  WidgetNode,
} from "./ast.js";
import type { PropertyValue } from "./parser.js";
import { isTranslatable, translate } from "./render.js";
import type { ResourceResolver, TranslationResolver } from "./types.js";

/** Options controlling an Alpine compile pass. */
export interface CompileOptions {
  /** Resolver for image/icon resource paths. */
  resourceResolver?: ResourceResolver;
  /** Resolver for translations (`@key` / `<name>.text`). */
  translationResolver?: TranslationResolver;
  /**
   * When true, an unknown widget class with no registered custom element throws
   * a compile error instead of emitting a `<q-widget>` fallback. Production apps
   * embedding a fixed widget set will want this on.
   */
  strict?: boolean;
  /**
   * Map of Qt custom-widget class name → custom-element tag. Defaults to
   * {@link defaultCustomElements} (the FontLab `Y*`/`Qt*` set). Anything not in
   * the map falls back to `<q-widget>` (or throws in `strict` mode).
   */
  customElements?: Record<string, string>;
}

/**
 * Default Qt-class → custom-element map, paired with the components registered
 * by `registerQuihtComponents()` in `webcomponents.ts`.
 */
export const defaultCustomElements: Record<string, string> = {
  YAngle: "q-angle-popup",
  YPopupAngle: "q-angle-popup",
  YOpacityBar: "q-opacity-bar",
  QtColorPicker: "q-color-picker",
};

/** Maps Qt signals to the native DOM event a sender should dispatch on. */
const SIGNAL_TO_DOM_EVENT: Record<string, string> = {
  clicked: "click",
  pressed: "mousedown",
  released: "mouseup",
  toggled: "change",
  stateChanged: "change",
  textChanged: "input",
  textEdited: "input",
  valueChanged: "input",
  currentIndexChanged: "change",
  editingFinished: "blur",
};

/** Internal mutable context threaded through the compile walk. */
interface Ctx {
  options: CompileOptions;
  custom: Record<string, string>;
  /** Collected root `x-data` fields: identifier → JS literal initializer. */
  state: Map<string, string>;
  /** name → extra attribute strings injected from `<connections>`. */
  extraAttrs: Map<string, string[]>;
  /** HTML comments appended after the root for un-compilable connections. */
  comments: string[];
  /** Counter for anonymous widgets needing a stable id. */
  counter: { n: number };
}

/** Escapes text for use as HTML element content. */
function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapes a string for use inside a double-quoted HTML attribute. */
function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turns a Qt name into a safe JS/HTML identifier for `x-data` fields. */
function ident(name: string, ctx: Ctx): string {
  let id = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (!id || /^[0-9]/.test(id)) id = `q_${id || ctx.counter.n++}`;
  return id;
}

/** kebab-cases a name for use as an Alpine event id. */
function kebab(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

function propString(props: Record<string, PropertyValue>, name: string): string {
  const v = props[name];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function propNumber(props: Record<string, PropertyValue>, name: string): number | null {
  const v = props[name];
  return typeof v === "number" ? v : null;
}

/** AST analogue of `textKeyFor`: a `@`-prefixed statusTip wins as the key. */
function textKeyFor(props: Record<string, PropertyValue>, name: string): string {
  const statusTip = propString(props, "statusTip");
  if (statusTip.startsWith("@")) return statusTip.substring(1);
  return `${name}.text`;
}

/**
 * Builds the localization-contract attribute string for a translatable node,
 * matching the DOM renderer's `quiht-translatable-node` tagging.
 */
function transAttrs(original: string, fallbackKey: string, ctx: Ctx): string {
  if (!original || !isTranslatable(original, ctx.options)) return "";
  const key = original.startsWith("@") ? original.substring(1) : fallbackKey;
  return ` class="quiht-translatable-node" data-quiht-key="${escAttr(key)}" data-quiht-original="${escAttr(original)}"`;
}

/** Joins any connection-injected attributes for `name`. */
function extra(name: string, ctx: Ctx): string {
  const list = ctx.extraAttrs.get(name);
  return list && list.length ? " " + list.join(" ") : "";
}

/** Records a bound field in the root `x-data` scope and returns its identifier. */
function bind(name: string, init: string, ctx: Ctx): string {
  const id = ident(name, ctx);
  ctx.state.set(id, init);
  return id;
}

/** Compiles `<connections>` into sender/receiver attribute injections. */
function compileConnections(connections: Connection[], ctx: Ctx): void {
  connections.forEach((c) => {
    const signalBase = c.signal.replace(/\(.*\)$/, "");
    const slotBase = c.slot.replace(/\(.*\)$/, "");
    const evt = `${kebab(c.sender)}-${kebab(signalBase)}`;
    const domEvent = SIGNAL_TO_DOM_EVENT[signalBase];

    if (domEvent) {
      push(ctx.extraAttrs, c.sender, `@${domEvent}="$dispatch('${evt}')"`);
    } else {
      // accepted()/rejected()/custom signals have no direct DOM event; record
      // them honestly so the markup stays inspectable rather than silently lossy.
      ctx.comments.push(
        `<!-- quiht: unmapped signal ${escText(c.sender)}.${escText(c.signal)} -> ${escText(c.receiver)}.${escText(c.slot)} -->`,
      );
      return;
    }

    // Translate the slot into an Alpine expression on the receiver.
    let slotExpr: string;
    if (slotBase === "clear") slotExpr = `${ident(c.receiver, ctx)} = ''`;
    else if (slotBase === "accept" || slotBase === "close") slotExpr = `$dispatch('accepted')`;
    else if (slotBase === "reject") slotExpr = `$dispatch('rejected')`;
    else slotExpr = `$dispatch('${kebab(c.receiver)}-${kebab(slotBase)}')`;
    push(ctx.extraAttrs, c.receiver, `@${evt}.window="${escAttr(slotExpr)}"`);
  });
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

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
};

/** Strips a Qt `&` accelerator mnemonic (`&&` → literal `&`). */
function stripMnemonic(text: string): string {
  const sentinel = String.fromCharCode(0);
  return text
    .replace(/&&/g, sentinel)
    .replace(/&/g, "")
    .replace(new RegExp(sentinel, "g"), "&");
}

/** Compiles a widget's localizable text via the resolver. */
function tr(text: string, key: string, ctx: Ctx): string {
  return translate(text, key, ctx.options);
}

/** Compiles child content: a layout, raw widget children, or nothing. */
function compileChildren(w: WidgetNode, ctx: Ctx): string {
  if (w.layout) return compileLayout(w.layout, ctx);
  return w.children.map((c) => compileWidget(c, ctx)).join("");
}

/** Compiles a `<layout>` into a flex/grid utility container. */
function compileLayout(layout: LayoutNode, ctx: Ctx): string {
  const cls =
    layout.class === "QHBoxLayout"
      ? "q-hbox-layout"
      : layout.class === "QGridLayout"
        ? "q-grid-layout"
        : "q-vbox-layout";
  const spacing = propNumber(layout.props, "spacing");
  const style = spacing !== null ? ` style="gap:${spacing}px"` : "";

  const inner = layout.items.map((item) => compileLayoutItem(item, layout, ctx)).join("");
  return `<div class="q-layout ${cls}"${style}>${inner}</div>`;
}

/** Compiles a single layout `<item>` (widget, nested layout, or spacer). */
function compileLayoutItem(item: LayoutItem, layout: LayoutNode, ctx: Ctx): string {
  let gridStyle = "";
  if (layout.class === "QGridLayout" && item.row !== null && item.column !== null) {
    const rs = item.rowSpan ?? 1;
    const cs = item.colSpan ?? 1;
    gridStyle = ` style="grid-row:${item.row + 1} / span ${rs};grid-column:${item.column + 1} / span ${cs}"`;
  }

  if (item.widget) {
    if (!gridStyle) return compileWidget(item.widget, ctx);
    return `<div class="q-grid-cell"${gridStyle}>${compileWidget(item.widget, ctx)}</div>`;
  }
  if (item.layout) {
    return `<div class="q-nested-layout"${gridStyle}>${compileLayout(item.layout, ctx)}</div>`;
  }
  if (item.spacer) {
    const horiz = item.spacer.orientation.includes("Horizontal");
    const s = horiz
      ? `width:${item.spacer.width}px;flex:0 0 auto`
      : `height:${item.spacer.height}px;flex:0 0 auto`;
    return `<div class="q-spacer" style="${s}"></div>`;
  }
  return "";
}

/** Compiles combo/list/tree `<item>` rows. */
function compileItems(items: ItemNode[], tag: string, ctx: Ctx): string {
  return items
    .map((it) => {
      const text = escText(tr(it.text, "", ctx));
      const nested = it.children.length ? compileItems(it.children, tag, ctx) : "";
      return `<${tag}>${text}${nested}</${tag}>`;
    })
    .join("");
}

/** Compiles one widget node into its HTML string. */
export function compileWidget(w: WidgetNode, ctx: Ctx): string {
  const id = w.name ? ` id="${escAttr(w.name)}"` : "";
  const cls = w.class;
  const e = extra(w.name, ctx);

  switch (cls) {
    case "QLabel": {
      const text = propString(w.props, "text");
      const key = textKeyFor(w.props, w.name);
      return `<span${id} class="q-label QLabel"${transAttrs(text, key, ctx)}${e}>${escText(tr(text, key, ctx))}</span>`;
    }

    case "QPushButton":
    case "QToolButton": {
      const text = propString(w.props, "text");
      const key = textKeyFor(w.props, w.name);
      // Default interactivity: a button dispatches a kebab event unless a
      // connection already injected an @click handler.
      const hasClick = (ctx.extraAttrs.get(w.name) ?? []).some((a) => a.startsWith("@click"));
      const click = hasClick ? "" : ` @click="$dispatch('${kebab(w.name || "q-button")}-clicked')"`;
      return `<button${id} class="q-btn ${cls}"${click}${transAttrs(text, key, ctx)}${e}>${escText(tr(text, key, ctx))}</button>`;
    }

    case "QLineEdit": {
      const field = bind(w.name, "''", ctx);
      const ph = propString(w.props, "placeholderText");
      const phAttr = ph
        ? ` placeholder="${escAttr(tr(ph, `${w.name}.placeholderText`, ctx))}"`
        : "";
      return `<input type="text"${id} class="q-input QLineEdit" x-model="${field}"${phAttr}${e}>`;
    }

    case "QTextEdit":
    case "QPlainTextEdit": {
      const field = bind(w.name, "''", ctx);
      return `<textarea${id} class="q-input ${cls}" x-model="${field}"${e}></textarea>`;
    }

    case "QCheckBox":
    case "QRadioButton": {
      const checked = w.props["checked"] === true;
      const field = bind(w.name, checked ? "true" : "false", ctx);
      const type = cls === "QCheckBox" ? "checkbox" : "radio";
      const text = propString(w.props, "text");
      const key = textKeyFor(w.props, w.name);
      return `<label${id} class="q-${type} ${cls}"${e}><input type="${type}" x-model="${field}"><span${transAttrs(text, key, ctx)}>${escText(tr(text, key, ctx))}</span></label>`;
    }

    case "QComboBox": {
      const field = bind(w.name, "''", ctx);
      const opts = w.items
        .map((it) => `<option>${escText(tr(it.text, "", ctx))}</option>`)
        .join("");
      return `<select${id} class="q-select QComboBox" x-model="${field}"${e}>${opts}</select>`;
    }

    case "QSpinBox":
    case "QDoubleSpinBox": {
      const value = propNumber(w.props, "value") ?? propNumber(w.props, "minimum") ?? 0;
      const field = bind(w.name, String(value), ctx);
      const min = propNumber(w.props, "minimum");
      const max = propNumber(w.props, "maximum");
      const step = propNumber(w.props, "singleStep");
      const a = [
        min !== null ? `min="${min}"` : "",
        max !== null ? `max="${max}"` : "",
        step !== null ? `step="${step}"` : cls === "QDoubleSpinBox" ? `step="any"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<input type="number"${id} class="q-input ${cls}" x-model.number="${field}" ${a}${e}>`;
    }

    case "QSlider": {
      const value = propNumber(w.props, "value") ?? propNumber(w.props, "minimum") ?? 0;
      const field = bind(w.name, String(value), ctx);
      const min = propNumber(w.props, "minimum");
      const max = propNumber(w.props, "maximum");
      const a = [min !== null ? `min="${min}"` : "", max !== null ? `max="${max}"` : ""]
        .filter(Boolean)
        .join(" ");
      return `<input type="range"${id} class="q-slider QSlider" x-model.number="${field}" ${a}${e}>`;
    }

    case "QProgressBar": {
      const value = propNumber(w.props, "value");
      const min = propNumber(w.props, "minimum") ?? 0;
      const max = propNumber(w.props, "maximum");
      const maxAttr = max !== null ? ` max="${max - min}"` : "";
      const valAttr = value !== null ? ` value="${value - min}"` : "";
      return `<progress${id} class="q-progress QProgressBar"${maxAttr}${valAttr}${e}></progress>`;
    }

    case "QDialogButtonBox": {
      const buttons = propString(w.props, "standardButtons")
        .split("|")
        .map((b) => b.trim())
        .filter(Boolean)
        .map((token) => {
          const name = token.split("::").pop() ?? token;
          const label = STANDARD_BUTTON_LABELS[name] ?? name;
          const key = `${w.name}.${name}`;
          const evt = name === "Cancel" || name === "Close" ? "rejected" : "accepted";
          return `<button class="q-btn" data-q-standard-button="${escAttr(name)}" @click="$dispatch('${evt}')"${transAttrs(label, key, ctx)}>${escText(tr(label, key, ctx))}</button>`;
        })
        .join("");
      return `<div${id} class="q-buttonbox QDialogButtonBox"${e}>${buttons}</div>`;
    }

    case "QListWidget":
    case "QTreeWidget": {
      return `<ul${id} class="q-item-view ${cls}"${e}>${compileItems(w.items, "li", ctx)}</ul>`;
    }

    case "QGroupBox": {
      const title = propString(w.props, "title");
      const key = `${w.name}.title`;
      return `<fieldset${id} class="q-groupbox QGroupBox"${e}><legend${transAttrs(title, key, ctx)}>${escText(tr(title, key, ctx))}</legend>${compileChildren(w, ctx)}</fieldset>`;
    }

    case "QDialog":
    case "QWidget":
    case "QFrame":
    case "QScrollArea":
    case "QMainWindow": {
      const title = propString(w.props, "windowTitle");
      const dataTitle =
        cls === "QDialog" && title
          ? ` data-q-title="${escAttr(tr(title, `${w.name}.windowTitle`, ctx))}"`
          : "";
      return `<div${id} class="q-widget ${cls}"${dataTitle}${e}>${compileChildren(w, ctx)}</div>`;
    }

    default:
      return compileCustom(w, ctx);
  }
}

/** Compiles a custom (`Y*`/`Qt*`) widget to a registered element or fallback. */
function compileCustom(w: WidgetNode, ctx: Ctx): string {
  const id = w.name ? ` id="${escAttr(w.name)}"` : "";
  const e = extra(w.name, ctx);
  const tag = ctx.custom[w.class];

  if (tag) {
    // Registered custom element: bind its reflected `value` via x-model.
    const field = bind(w.name, "''", ctx);
    const children = compileChildren(w, ctx);
    return `<${tag}${id} class="${escAttr(w.class)}" x-model="${field}"${e}>${children}</${tag}>`;
  }

  if (ctx.options.strict) {
    throw new Error(`quiht compile: unknown widget class "${w.class}" (strict mode)`);
  }

  // Production-strict fallback: a typed generic element, never a dotted mockup.
  return `<q-widget${id} class="${escAttr(w.class)}" data-q-class="${escAttr(w.class)}"${e}>${compileChildren(w, ctx)}</q-widget>`;
}

/**
 * Compiles a parsed `.ui` Document (or a pre-built {@link UiRoot}) into an
 * Alpine.js HTML string. The root carries the `x-data` scope collecting every
 * bound input's initial value.
 */
export function compile(input: Document | UiRoot, options: CompileOptions = {}): string {
  const ast: UiRoot = "root" in input ? input : buildAst(input as Document);

  const ctx: Ctx = {
    options,
    custom: options.customElements ?? defaultCustomElements,
    state: new Map(),
    extraAttrs: new Map(),
    comments: [],
    counter: { n: 0 },
  };

  // Connections must be compiled before widgets so the injected attributes are
  // available when each named element is emitted.
  compileConnections(ast.connections, ctx);

  const body = compileWidget(ast.root, ctx);

  // Splice the collected x-data scope into the root element's opening tag.
  const stateObj =
    "{ " +
    Array.from(ctx.state.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ") +
    " }";
  const withScope = body.replace(/^<([a-z-]+)/, `<$1 x-data="${escAttr(stateObj)}"`);

  return withScope + (ctx.comments.length ? "\n" + ctx.comments.join("\n") : "");
}
