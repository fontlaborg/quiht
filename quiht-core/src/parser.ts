/** Parsing helpers for Qt `.ui` XML documents. */

import type { QRect, QSize } from "./types.js";

/**
 * Parses a Qt `.ui` XML string into a Document.
 * @throws Error when the XML is malformed.
 */
export function parse(xmlText: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML Parsing Error: " + parserError.textContent);
  }
  return doc;
}

/** The value types a `<property>` can yield. */
export type PropertyValue = string | number | boolean | QRect | QSize | null;

/**
 * Returns the direct child elements of `node` whose tag name matches `tag`.
 *
 * Used instead of the CSS `:scope > tag` combinator because that combinator is
 * unreliable on XML-parsed documents in some DOM implementations (notably
 * jsdom), where it can match descendants rather than only direct children.
 */
export function directChildren(node: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
    if (c.tagName === tag) out.push(c);
  }
  return out;
}

/** Returns the first direct child element of `node` with tag name `tag`. */
export function firstChild(node: Element, tag: string): Element | null {
  for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
    if (c.tagName === tag) return c;
  }
  return null;
}

/**
 * Reads a direct-child `<property name="...">` from a widget/layout node,
 * dispatching on the property's typed child element.
 */
export function getProperty(node: Element, name: string): PropertyValue {
  let propNode: Element | null = null;
  for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
    if (c.tagName === "property" && c.getAttribute("name") === name) {
      propNode = c;
      break;
    }
  }
  if (!propNode) return null;

  const stringNode = propNode.querySelector("string");
  if (stringNode) return stringNode.textContent ?? "";

  const numberNode = propNode.querySelector("number");
  if (numberNode) return parseFloat(numberNode.textContent ?? "0");

  const boolNode = propNode.querySelector("bool");
  if (boolNode) return boolNode.textContent === "true";

  const rectNode = propNode.querySelector("rect");
  if (rectNode) {
    return {
      x: parseInt(rectNode.querySelector("x")?.textContent || "0", 10),
      y: parseInt(rectNode.querySelector("y")?.textContent || "0", 10),
      width: parseInt(rectNode.querySelector("width")?.textContent || "0", 10),
      height: parseInt(rectNode.querySelector("height")?.textContent || "0", 10),
    };
  }

  const sizeNode = propNode.querySelector("size");
  if (sizeNode) {
    return {
      width: parseInt(sizeNode.querySelector("width")?.textContent || "0", 10),
      height: parseInt(sizeNode.querySelector("height")?.textContent || "0", 10),
    };
  }

  const iconNode = propNode.querySelector("iconset");
  if (iconNode) {
    return iconNode.querySelector("normaloff")?.textContent || iconNode.textContent || null;
  }

  return null;
}
