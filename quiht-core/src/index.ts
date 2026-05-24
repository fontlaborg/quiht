/**
 * quiht-core — client-side Qt `.ui` -> HTML/CSS renderer.
 *
 * Public entry point. The {@link Quiht} class preserves the original
 * static `parse`/`render` API; bundle loading and types are exported
 * alongside it.
 */

import { parse } from "./parser.js";
import { render } from "./render.js";
import type { RenderOptions } from "./types.js";

export { parse } from "./parser.js";
export { render, injectStyleSheets } from "./render.js";
export { loadBundle, loadZipBundle, loadManifestBundle, loadUiString } from "./bundle.js";
export { fontlabPreset } from "./presets/fontlab.js";
export { buildAst, buildWidget, buildConnections } from "./ast.js";
export type {
  UiRoot,
  WidgetNode,
  LayoutNode,
  LayoutItem,
  ItemNode,
  SpacerNode,
  Connection,
} from "./ast.js";
export { compile, compileWidget, defaultCustomElements } from "./compiler.js";
export type { CompileOptions } from "./compiler.js";
export { registerQuihtComponents, QUIHT_COMPONENT_TAGS } from "./webcomponents.js";
export type {
  ResourceResolver,
  TranslationResolver,
  RenderOptions,
  QuihtManifest,
  QuihtBundle,
  TranslationTable,
  QRect,
  QSize,
} from "./types.js";

/**
 * Static façade matching the original `quiht-core.js` API.
 */
export class Quiht {
  /** Parses a Qt `.ui` XML string into a browser Document. */
  static parse(xmlText: string): Document {
    return parse(xmlText);
  }

  /** Renders a parsed Qt `.ui` Document into an HTML DOM element. */
  static render(doc: Document, options: RenderOptions = {}): HTMLElement {
    return render(doc, options);
  }
}

export default Quiht;
