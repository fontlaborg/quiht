/** Public type definitions for quiht-core. */

export interface ResourceResolver {
  /** Resolves a QRC path (e.g. ':/images/resources/open.png') to a web-accessible URL. */
  resolveResource(qrcPath: string): string;
}

export interface TranslationResolver {
  /** Resolves a key (e.g. '@demo.dialog.labelAsset') or original text to a localized string. */
  translate(key: string, originalText: string): string;
}

export interface RenderOptions {
  /** Optional resolver for image/icon resources. */
  resourceResolver?: ResourceResolver;
  /** Optional resolver for translations. */
  translationResolver?: TranslationResolver;
  /** Custom widget renderers override map, keyed by Qt class name. */
  customRenderers?: Record<string, (element: Element, options: RenderOptions) => HTMLElement>;
  /**
   * Document into whose `<head>` collected `.ui` stylesheets are injected.
   * Defaults to the rendered element's `ownerDocument`, keeping the renderer
   * SSR-friendly (no implicit reference to a global `document`).
   */
  targetDocument?: Document;
}

export interface QuihtManifest {
  prefix: string;
  ui: Record<string, string>;
  resources: Record<string, string>;
}

/** A geometry rectangle read from a `<rect>` property. */
export interface QRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A size read from a `<size>` property. */
export interface QSize {
  width: number;
  height: number;
}

/** Shape of `translations.json`: key -> { lang -> text }. */
export type TranslationTable = Record<string, Record<string, string>>;

/**
 * A loaded, ready-to-render bundle produced by {@link loadBundle}.
 */
export interface QuihtBundle {
  /** The parsed manifest (synthesised when loading a bare `.ui`). */
  manifest: QuihtManifest;
  /** Parsed `.ui` documents keyed by their manifest UI name. */
  uiDocs: Record<string, Document>;
  /** A resolver mapping qrc paths to usable URLs (object URLs for zip bundles). */
  resourceResolver: ResourceResolver;
  /** Optional parsed translations (`translations.json` if present). */
  translations?: TranslationTable;
  /**
   * Releases any object URLs created for in-zip resources. Call when the
   * bundle is no longer needed to avoid leaking blob URLs.
   */
  dispose(): void;
}
