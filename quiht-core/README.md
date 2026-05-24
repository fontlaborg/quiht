# quiht-core

Client-side renderer that displays Qt 5/6 `.ui` XML files as HTML/CSS — imitating
Qt's appearance **without implementing any Qt behavior**. It is the rendering
engine behind [`quiht`](https://fontlab.org/quiht/), built for localization
review workflows: show source and translated strings in the real visual context
of the rendered UI.

- Parses `.ui` XML with the native `DOMParser`.
- Renders the standard Qt widget/layout set to semantic HTML.
- Tags localizable text so a host app can wire visuals to a translation grid.
- Loads all-in-one `.quiht.zip` bundles, `.quiht.json` manifests, or a bare `.ui`.

Apache-2.0.

## Install

```bash
npm install quiht-core
```

The default Qt-Fusion-like skin ships as `index.css`:

```js
import "quiht-core/index.css";
```

## API

```ts
import { Quiht, render, parse, loadBundle } from "quiht-core";
import type {
  RenderOptions,
  ResourceResolver,
  TranslationResolver,
  QuihtManifest,
  QuihtBundle,
} from "quiht-core";
```

### `Quiht.parse(xmlText) -> Document` / `parse(xmlText)`

Parses a `.ui` XML string into a `Document`. Throws on malformed XML.

### `Quiht.render(doc, options?) -> HTMLElement` / `render(doc, options?)`

Renders a parsed `.ui` `Document` into an HTML element.

```ts
const doc = Quiht.parse(uiXmlString);
const el = Quiht.render(doc, {
  resourceResolver: { resolveResource: (qrc) => resourceMap[qrc] ?? qrc },
  translationResolver: { translate: (key, original) => table[key]?.de ?? original },
  customRenderers: {
    YPopupAngle: (node, opts) => {
      const div = document.createElement("div");
      div.className = "YPopupAngle QWidget";
      return div;
    },
  },
});
document.body.appendChild(el);
```

#### `RenderOptions`

| Field | Description |
|-------|-------------|
| `resourceResolver` | Maps a Qt qrc path (`:/images/open.png`) to a web URL. |
| `translationResolver` | Returns localized text for a `(key, original)` pair. |
| `customRenderers` | Per-class override map for unknown/custom widgets. |
| `targetDocument` | Document whose `<head>` receives `.ui` stylesheets. Defaults to the rendered element's `ownerDocument` — no implicit global `document.head` access, so the renderer is SSR-friendly. |

### Localization tagging contract

A string is localizable if it starts with `@` (key = text after `@`) or if a
`translationResolver` is present (key = `<widgetName>.<property>`). Such elements
receive `class="quiht-translatable-node"` plus `data-quiht-key` and
`data-quiht-original` attributes — the contract host apps rely on.

### `loadBundle(source) -> Promise<QuihtBundle>`

Unified loader. `source` may be:

- a **`.quiht.zip`** as a `Blob`, `ArrayBuffer`, `Uint8Array`, or a URL ending in `.quiht.zip`,
- a **`.quiht.json`** manifest URL,
- a raw single **`.ui`** XML string.

Returns a `QuihtBundle`:

```ts
interface QuihtBundle {
  manifest: QuihtManifest;
  uiDocs: Record<string, Document>;        // parsed .ui docs by manifest name
  resourceResolver: ResourceResolver;      // qrc -> object/data URL (zip) or URL (manifest)
  translations?: TranslationTable;         // parsed translations.json if present
  dispose(): void;                         // releases object URLs created for zip resources
}
```

```ts
const bundle = await loadBundle(zipBlob);
const doc = bundle.uiDocs["dlgnamesuffix.ui"];
const el = render(doc, { resourceResolver: bundle.resourceResolver });
// ... when done:
bundle.dispose();
```

### The `.quiht.zip` format

A standard ZIP archive whose **root** contains:

```
.quiht.json          manifest: { prefix, ui: {name -> relPath}, resources: {qrc -> relPath} }
ui/...               the .ui files referenced by the manifest
resources/...        the image/icon resources referenced by the manifest
translations.json    (optional) { "<key>": { "en": "...", "de": "...", ... } }
```

Manifest `ui` and `resources` values are paths **relative to the archive root**.
On load, each in-zip resource is exposed as an object URL (or a data URL when
`URL.createObjectURL` is unavailable, e.g. during SSR), and the returned
`resourceResolver` maps the manifest's qrc keys to those URLs. Unzipping uses
[`fflate`](https://github.com/101arrowz/fflate).

## Versioning

This package uses **git-tag semver**. `package.json` keeps `"version": "0.0.0"`
as a placeholder; the published version is set at publish time from
`git describe --tags` (see the repository's `publish.sh`). Do not hand-edit the
version field — create a git tag (e.g. `v1.2.3`) instead.

## Development

```bash
npm install
npm run build   # tsc -> dist/ with .js + .d.ts
npm test        # vitest + jsdom
```
