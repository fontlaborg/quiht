# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`quiht` renders Qt 5/6 QWidgets `.ui` XML files as HTML/CSS in the browser, imitating Qt's appearance **without implementing any Qt behavior**. It is a viewer/renderer meant to be embedded in or reused by other projects. The driving goal (see `IDEA.md`) is a localization review workflow: show source and translated strings in the actual visual context of the rendered UI.

The repo has three parts plus an example dataset:

- **`quiht-core/`** — the renderer library (`quiht-core.js`). The `Quiht` class is the entire engine; everything else consumes it.
- **`quiht-l10n-vu/`** — a static single-page reviewer app that imports `quiht-core` and adds a three-pane localization UI.
- **`quiht-tools/quiht-jsongen.py`** — a Python Fire CLI that copies `.ui` + `.png` assets out of a Qt source tree and emits the `.quiht.json` manifest.
- **`example/`** — sample `.ui` files (from FontLab's Proteus codebase), their resources, the generated `.quiht.json`, and `translations.json`.

> Note: `SPEC.md` files describe a TypeScript API, but the implementation is plain ES-module JavaScript with no build step or type checking. Treat the specs as design intent, the `.js` as ground truth.

## Running and testing

There is no build system, no `package.json`, and no test suite. The app is static ES modules loaded via `<script type="module">` and `fetch()`, so it **must be served over HTTP** (file:// breaks module + fetch). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/quiht-l10n-vu/index.html
```

Regenerate the example manifest from a Qt source tree:

```bash
# requires: pip install fire
python3 quiht-tools/quiht-jsongen.py generate <src_dir> ./example --url_prefix http://localhost:8000/
```

`generate` accepts `--ui_files "a.ui,b.ui"` to override the default Proteus file set. It walks `src_dir` indexing every `.png`, parses each `.ui` for `:/...` / `.png` resource references, copies matches (including `@2x` variants) into `example/`, and writes `example/.quiht.json`.

## Architecture

### Renderer: `Quiht` (quiht-core/quiht-core.js)

Two static entry points: `Quiht.parse(xmlText) → Document` (uses `DOMParser`, throws on `parsererror`) and `Quiht.render(doc, options) → HTMLElement`. All work is static methods — no instances, no state.

Rendering is a recursive tree walk:
- `_renderWidget` switches on the Qt `class` attribute (`QDialog`, `QLabel`, `QPushButton`, `QLineEdit`, `QComboBox`, `QGroupBox`, `QTabWidget`, etc.) to build the matching HTML element. Every element gets `class="<QtClass> QWidget"`, plus `data-q-class`, `data-q-name`, and `id` = the widget's `name`.
- `_renderLayout` handles `QVBoxLayout`/`QHBoxLayout`/`QGridLayout` via flexbox/grid classes (`q-vbox-layout`, etc.), mapping Qt `spacing`→`gap` and margins→`padding`, and grid `row`/`column`/`rowspan`/`colspan`→ CSS grid placement (Qt is 0-based, CSS is 1-based — note the `+1`).
- `_getProperty` is the typed property reader: it dispatches on the child element of `<property>` (`string`/`number`/`bool`/`rect`/`size`/`iconset`) and returns the appropriate JS value/object.

Three extension hooks passed via `options` (`RenderOptions`):
- `resourceResolver.resolveResource(qrcPath)` — maps a Qt resource path like `:/images/resources/open.png` to a real URL.
- `translationResolver.translate(key, originalText)` — returns localized text.
- `customRenderers[className](node, options)` — overrides rendering for unknown/custom widget classes (e.g. FontLab's `YPopupAngle`). Without an override, unknown classes fall back to a dotted-border placeholder `div`.

**QSS handling:** `_injectStyleSheets` collects every `styleSheet` property in the file, does a *regex* rewrite of Qt class selectors to CSS classes (`QLabel` → `.QLabel`) and converts `qlineargradient(...)` → `linear-gradient(...)`, then injects one `<style id="quiht-injected-stylesheets">` into `document.head`. This is best-effort string transformation, not a real QSS parser.

**Localization tagging is built into the renderer.** A string is treated as localizable if it starts with `@` (the key is the text after `@`) or if a `translationResolver` is present (the key is synthesized as `<widgetName>.<property>`). Localizable elements get `class="quiht-translatable-node"` and `data-quiht-key` / `data-quiht-original` attributes — these are the contract the l10n app relies on to wire visuals to the translation grid.

### Default skin: `quiht-core/index.css`

Provides the Qt-Fusion-like appearance via CSS variables and the `.QWidget`/`.Q*` classes the renderer emits. Loaded directly by consumers (the l10n app links it before its own `app.css`).

### Reviewer app: `quiht-l10n-vu/`

`index.html` + `app.css` + `app.js`. On load, `app.js`:
1. Fetches `../example/.quiht.json` (manifest) and `../example/translations.json`.
2. Lists `.ui` files in the sidebar; selecting one fetches and `Quiht.parse`s it.
3. `parseTranslatableItems` independently re-walks the XML to build the translation grid (same `@`/`<widgetName>.<prop>` key convention as the renderer — keep these two in sync if you change the key scheme).
4. `renderUi` calls `Quiht.render` with a `resourceResolver` (manifest lookup → `../example/...`) and a `translationResolver` (looks up `translations[key][lang]`, falling back to `en` then raw).
5. `setupInteractiveEvents` cross-links the rendered widgets and the grid rows by `data-quiht-key` for bidirectional hover/click highlighting.

`translations.json` shape: `{ "<key>": { "en": "...", "de": "...", ... } }`.

## Data conventions

- **Manifest (`.quiht.json`):** `{ prefix, ui: {name → relPath}, resources: {qrcPath → relPath} }`. Paths in `ui`/`resources` are relative to the manifest's directory; the l10n app prepends `../example/`. (The `prefix` field is written by the generator but not currently consumed by the app.)
- **Resource keys** in the manifest are the *raw* Qt paths (`:/images/resources/document_open.png`), which is exactly what `_getProperty` returns for an `iconset` — so the resolver can look them up directly.
- The generator hardcodes a couple of Proteus-specific filename remaps (`document_open.png`→`file_open.png`, `document_new.png`→`new.png`); these are dataset quirks, not general logic.

## When extending

- **New widget type:** add a `case` in `_renderWidget`. Emit `class="<QtClass> QWidget"` and add matching styling to `index.css`. If it carries localizable text, set the `quiht-translatable-node` class + `data-quiht-*` attributes the way the existing cases do, and add the property to `parseTranslatableItems` in the l10n app.
- **Custom/non-standard widgets:** prefer `options.customRenderers` over editing the core switch.
- The two SPEC files are the place to record API intent; update them alongside behavior changes.


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>