/**
 * Abstract syntax tree for Qt `.ui` documents.
 *
 * The DOM renderer in `render.ts` walks the XML and immediately produces
 * `HTMLElement`s. The Alpine compiler (`compiler.ts`) instead works against this
 * typed, framework-agnostic tree, which makes the compile step SSR-friendly
 * (string output, no live DOM) and keeps element-mapping logic separate from
 * XML traversal.
 */

import { directChildren, firstChild, getProperty } from "./parser.js";
import type { PropertyValue } from "./parser.js";

/** A single `<item>` inside a `QComboBox`/`QListWidget`/`QTreeWidget`. */
export interface ItemNode {
  /** The item's `text` property, verbatim (may be empty or `@key`). */
  text: string;
  /** Nested items (tree children); empty for flat lists/combos. */
  children: ItemNode[];
}

/** A `<spacer>` inside a layout item. */
export interface SpacerNode {
  orientation: string;
  width: number;
  height: number;
}

/** One `<item>` of a layout: holds a widget, nested layout, or spacer. */
export interface LayoutItem {
  row: number | null;
  column: number | null;
  rowSpan: number | null;
  colSpan: number | null;
  widget: WidgetNode | null;
  layout: LayoutNode | null;
  spacer: SpacerNode | null;
}

/** A `<layout>` node (`QVBoxLayout`/`QHBoxLayout`/`QGridLayout`/…). */
export interface LayoutNode {
  class: string;
  name: string;
  props: Record<string, PropertyValue>;
  items: LayoutItem[];
}

/** A `<widget>` node, the spine of the tree. */
export interface WidgetNode {
  class: string;
  name: string;
  props: Record<string, PropertyValue>;
  /** Direct layout child, if the widget arranges its children via a layout. */
  layout: LayoutNode | null;
  /** Direct `<widget>` children not wrapped in a layout. */
  children: WidgetNode[];
  /** Direct `<item>` children (combo options, list/tree rows). */
  items: ItemNode[];
}

/** A compiled-down `<connection>` (signal → slot). */
export interface Connection {
  sender: string;
  signal: string;
  receiver: string;
  slot: string;
}

/** The whole `.ui` file as a tree. */
export interface UiRoot {
  /** The `class` text node under `<ui>` (the generated class name), if present. */
  uiClass: string;
  root: WidgetNode;
  connections: Connection[];
}

/** The property names worth lifting into the AST (everything else is ignored). */
const PROPERTY_NAMES = [
  "text",
  "title",
  "windowTitle",
  "placeholderText",
  "toolTip",
  "statusTip",
  "icon",
  "geometry",
  "minimumSize",
  "maximumSize",
  "minimum",
  "maximum",
  "value",
  "singleStep",
  "prefix",
  "suffix",
  "orientation",
  "standardButtons",
  "frameShape",
  "frameShadow",
  "wordWrap",
  "checked",
  "spacing",
  "leftMargin",
  "rightMargin",
  "topMargin",
  "bottomMargin",
] as const;

/** Collects the AST-relevant `<property>` values of a node into a plain map. */
function collectProps(node: Element): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  for (const name of PROPERTY_NAMES) {
    const v = getProperty(node, name);
    if (v !== null) out[name] = v;
  }
  return out;
}

/** Reads the (possibly empty) `text` of an `<item>` and recurses into children. */
function buildItem(itemNode: Element): ItemNode {
  const textNode = itemNode.querySelector(':scope > property[name="text"] > string');
  const text = textNode?.textContent ?? "";
  return {
    text,
    children: directChildren(itemNode, "item").map(buildItem),
  };
}

/** Builds a {@link SpacerNode} from a `<spacer>` element. */
function buildSpacer(spacerNode: Element): SpacerNode {
  const orientation =
    spacerNode.querySelector('property[name="orientation"]')?.textContent ?? "";
  const sizeProp = getProperty(spacerNode, "size");
  const size =
    sizeProp && typeof sizeProp === "object" && "width" in sizeProp
      ? sizeProp
      : { width: 0, height: 0 };
  return { orientation, width: size.width, height: size.height };
}

/** Builds a {@link LayoutNode} (with its items) from a `<layout>` element. */
function buildLayout(layoutNode: Element): LayoutNode {
  const items: LayoutItem[] = directChildren(layoutNode, "item").map((itemNode) => {
    const childWidget = firstChild(itemNode, "widget");
    const childLayout = firstChild(itemNode, "layout");
    const childSpacer = firstChild(itemNode, "spacer");
    const num = (attr: string): number | null => {
      const raw = itemNode.getAttribute(attr);
      return raw === null ? null : parseInt(raw, 10);
    };
    return {
      row: num("row"),
      column: num("column"),
      rowSpan: num("rowspan"),
      colSpan: num("colspan"),
      widget: childWidget ? buildWidget(childWidget) : null,
      layout: childLayout ? buildLayout(childLayout) : null,
      spacer: childSpacer ? buildSpacer(childSpacer) : null,
    };
  });

  return {
    class: layoutNode.getAttribute("class") ?? "QVBoxLayout",
    name: layoutNode.getAttribute("name") ?? "",
    props: collectProps(layoutNode),
    items,
  };
}

/** Builds a {@link WidgetNode} (recursively) from a `<widget>` element. */
export function buildWidget(widgetNode: Element): WidgetNode {
  const layoutNode = firstChild(widgetNode, "layout");
  return {
    class: widgetNode.getAttribute("class") ?? "QWidget",
    name: widgetNode.getAttribute("name") ?? "",
    props: collectProps(widgetNode),
    layout: layoutNode ? buildLayout(layoutNode) : null,
    children: directChildren(widgetNode, "widget").map(buildWidget),
    items: directChildren(widgetNode, "item").map(buildItem),
  };
}

/** Extracts the `<connections>` block into a flat {@link Connection} list. */
export function buildConnections(doc: Document): Connection[] {
  const out: Connection[] = [];
  doc.querySelectorAll("connections > connection").forEach((c) => {
    out.push({
      sender: c.querySelector("sender")?.textContent ?? "",
      signal: c.querySelector("signal")?.textContent ?? "",
      receiver: c.querySelector("receiver")?.textContent ?? "",
      slot: c.querySelector("slot")?.textContent ?? "",
    });
  });
  return out;
}

/**
 * Builds the full {@link UiRoot} AST from a parsed `.ui` Document.
 * @throws Error when there is no root `<widget>` under `<ui>`.
 */
export function buildAst(doc: Document): UiRoot {
  const rootWidgetNode = doc.querySelector("ui > widget");
  if (!rootWidgetNode) {
    throw new Error("Invalid .ui file: Missing root <widget> under <ui>");
  }
  const uiClass = doc.querySelector("ui > class")?.textContent ?? "";
  return {
    uiClass,
    root: buildWidget(rootWidgetNode),
    connections: buildConnections(doc),
  };
}
