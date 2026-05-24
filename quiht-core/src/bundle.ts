/**
 * Bundle loading for quiht-core.
 *
 * A `.quiht.zip` is a standard ZIP archive whose root contains:
 *   - `.quiht.json`        the manifest
 *   - `ui/...`             the `.ui` files referenced by the manifest
 *   - `resources/...`      the image/icon resources referenced by the manifest
 *   - `translations.json`  (optional) the translation table
 *
 * Manifest `ui` and `resources` values are paths relative to the archive root.
 */

import { unzipSync } from "fflate";
import { parse } from "./parser.js";
import type {
  QuihtBundle,
  QuihtManifest,
  ResourceResolver,
  TranslationTable,
} from "./types.js";

const MANIFEST_NAME = ".quiht.json";
const TRANSLATIONS_NAME = "translations.json";

/** A static resolver backed by a manifest map of qrc -> URL. */
function manifestResolver(map: Record<string, string>): ResourceResolver {
  return {
    resolveResource(qrcPath: string): string {
      return map[qrcPath] ?? qrcPath;
    },
  };
}

/** Normalises a possible leading "./" and back-slashes in a zip path. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Reads any supported zip source into a `Uint8Array`. */
async function toBytes(source: ArrayBuffer | Uint8Array | Blob | string): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch bundle: ${source} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("Unsupported bundle source type");
}

/** Loads a `.quiht.zip` archive into a usable {@link QuihtBundle}. */
export async function loadZipBundle(
  source: ArrayBuffer | Uint8Array | Blob | string,
): Promise<QuihtBundle> {
  const bytes = await toBytes(source);
  const files = unzipSync(bytes);

  // Index files by normalised path.
  const byPath = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue; // directory entry
    byPath.set(normalizePath(name), data);
  }

  const decoder = new TextDecoder();
  const manifestBytes = byPath.get(MANIFEST_NAME);
  if (!manifestBytes) {
    throw new Error(`.quiht.zip is missing ${MANIFEST_NAME} at archive root`);
  }
  const manifest = JSON.parse(decoder.decode(manifestBytes)) as QuihtManifest;

  // Parse UI documents.
  const uiDocs: Record<string, Document> = {};
  for (const [uiName, relPath] of Object.entries(manifest.ui ?? {})) {
    const data = byPath.get(normalizePath(relPath));
    if (!data) throw new Error(`.quiht.zip missing UI file: ${relPath}`);
    uiDocs[uiName] = parse(decoder.decode(data));
  }

  // Create object URLs for resources so they can be used as image src.
  const objectUrls: string[] = [];
  const resourceMap: Record<string, string> = {};
  const canObjectUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function";

  for (const [qrcPath, relPath] of Object.entries(manifest.resources ?? {})) {
    const data = byPath.get(normalizePath(relPath));
    if (!data) continue; // tolerate missing resource entries
    if (canObjectUrl && typeof Blob !== "undefined") {
      const blob = new Blob([data as BlobPart], { type: guessMime(relPath) });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      resourceMap[qrcPath] = url;
    } else {
      // Fallback (e.g. SSR/Node without URL.createObjectURL): data URL.
      resourceMap[qrcPath] = `data:${guessMime(relPath)};base64,${base64(data)}`;
    }
  }

  // Optional translations.
  let translations: TranslationTable | undefined;
  const transBytes = byPath.get(TRANSLATIONS_NAME);
  if (transBytes) {
    translations = JSON.parse(decoder.decode(transBytes)) as TranslationTable;
  }

  return {
    manifest,
    uiDocs,
    resourceResolver: manifestResolver(resourceMap),
    translations,
    dispose() {
      if (canObjectUrl) objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.length = 0;
    },
  };
}

/**
 * Loads a `.quiht.json` manifest from a URL. Resource and UI paths are
 * resolved relative to the manifest URL.
 */
export async function loadManifestBundle(manifestUrl: string): Promise<QuihtBundle> {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${manifestUrl} (${res.status})`);
  const manifest = (await res.json()) as QuihtManifest;

  const base = new URL(manifestUrl, currentBase());

  const uiDocs: Record<string, Document> = {};
  for (const [uiName, relPath] of Object.entries(manifest.ui ?? {})) {
    const uiRes = await fetch(new URL(relPath, base).href);
    if (!uiRes.ok) throw new Error(`Failed to fetch UI file: ${relPath}`);
    uiDocs[uiName] = parse(await uiRes.text());
  }

  const resourceMap: Record<string, string> = {};
  for (const [qrcPath, relPath] of Object.entries(manifest.resources ?? {})) {
    resourceMap[qrcPath] = new URL(relPath, base).href;
  }

  let translations: TranslationTable | undefined;
  try {
    const transRes = await fetch(new URL(TRANSLATIONS_NAME, base).href);
    if (transRes.ok) translations = (await transRes.json()) as TranslationTable;
  } catch {
    // translations are optional
  }

  return {
    manifest,
    uiDocs,
    resourceResolver: manifestResolver(resourceMap),
    translations,
    dispose() {
      /* nothing to release for URL-based bundles */
    },
  };
}

/** Wraps a single `.ui` XML string into a minimal bundle. */
export function loadUiString(xmlText: string, name = "main.ui"): QuihtBundle {
  const manifest: QuihtManifest = {
    prefix: "",
    ui: { [name]: name },
    resources: {},
  };
  return {
    manifest,
    uiDocs: { [name]: parse(xmlText) },
    resourceResolver: manifestResolver({}),
    dispose() {
      /* no-op */
    },
  };
}

/**
 * Unified loader. Detects the source kind:
 *   - a `.quiht.zip` (Blob/ArrayBuffer/Uint8Array, or URL ending in `.quiht.zip`)
 *   - a `.quiht.json` manifest URL
 *   - a raw single `.ui` XML string
 */
export async function loadBundle(
  source: ArrayBuffer | Uint8Array | Blob | string,
): Promise<QuihtBundle> {
  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    return loadZipBundle(source);
  }
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return loadZipBundle(source);
  }
  if (typeof source === "string") {
    const trimmed = source.trimStart();
    if (trimmed.startsWith("<")) {
      // Looks like raw .ui XML.
      return loadUiString(source);
    }
    if (/\.quiht\.zip(\?.*)?$/i.test(source)) {
      return loadZipBundle(source);
    }
    if (/\.json(\?.*)?$/i.test(source) || /\.quiht\.json/i.test(source)) {
      return loadManifestBundle(source);
    }
    // Default: treat as a manifest URL.
    return loadManifestBundle(source);
  }
  throw new Error("Unsupported bundle source");
}

function currentBase(): string {
  if (typeof document !== "undefined" && document.baseURI) return document.baseURI;
  if (typeof location !== "undefined" && location.href) return location.href;
  return "http://localhost/";
}

function guessMime(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function base64(data: Uint8Array): string {
  const g = globalThis as { Buffer?: { from(d: Uint8Array): { toString(enc: string): string } } };
  if (typeof g.Buffer !== "undefined") return g.Buffer.from(data).toString("base64");
  let binary = "";
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}
