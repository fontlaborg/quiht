# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`quiht` renders Qt 5/6 QWidgets `.ui` XML files as HTML/CSS in the browser, imitating Qt's appearance **without implementing any Qt behavior**. It is a viewer/renderer meant to be embedded in or reused by other projects. The driving goal (see `IDEA.md`) is a localization review workflow: show source and translated strings in the actual visual context of the rendered UI.

The repo has four packages plus an example dataset and the built demo:

- **`quiht-core/`** — the renderer + bundle loader. A **TypeScript** npm package (`quiht-core`), built with `tsc` → `dist/`, dependency `fflate`. Exports `Quiht.parse`/`Quiht.render`, the `render`/`parse` functions, and `loadBundle`. The `Quiht` class preserves the original static API; everything else consumes it.
- **`quiht-l10n-vu/`** — the three-pane localization reviewer SPA. A **TypeScript** npm package (`quiht-l10n-vu`) built with **Vite**. Imports `quiht-core`, loads its dataset via `loadBundle` (default example, or any dropped/picked `.quiht.zip` / `.quiht.json` / `.ui`).
- **`quiht-demo/`** — source of the static drag-and-drop demo (Vite + TS). Builds into the repo's `docs/` for GitHub Pages (https://fontlab.org/quiht/). Not published to npm.
- **`quiht-tools/`** — a **Python** package (`quiht-tools`, PyPI) with a Fire CLI: `generate` emits a `.quiht.json` manifest from a Qt source tree, `pack`/`unpack` build and extract `.quiht.zip` packages. Versioned via `hatch-vcs` from git tags.
- **`example/`** — sample `.ui` files (from FontLab's Proteus codebase), their resources, the `.quiht.json`, and `translations.json`. The canonical fixtures; `build.sh` vendors copies into the demo and reviewer.
- **`docs/`** — the built static demo (committed build output served by Pages).

> Note: `SPEC.md` files describe design intent. The implementation is now real TypeScript with build steps and tests — treat the TS sources as ground truth.

## Building, running, testing

Everything builds via the top-level scripts:

```bash
./build.sh            # builds quiht-core, quiht-l10n-vu, quiht-demo (->docs/), quiht-tools
./publish.sh          # DRY RUN by default; ./publish.sh --yes to publish to PyPI + npm
```

Per package:

```bash
cd quiht-core     && npm install && npm run build && npm test   # tsc -> dist, vitest
cd quiht-l10n-vu  && npm install && npm run dev                  # Vite reviewer SPA
cd quiht-demo     && npm install && npm run dev                  # Vite demo page
cd quiht-tools    && uv run python -m quiht_tools --help         # Fire CLI
```

The TS apps use Vite with `base: "./"`, so built output uses relative asset
paths and serves from any sub-path or the file system.

Regenerate the example manifest / build a `.quiht.zip` from a Qt source tree:

```bash
cd quiht-tools
uv run python -m quiht_tools generate <src_dir> ../example --url_prefix http://localhost:8000/
uv run python -m quiht_tools pack ../example --output ../sample.quiht.zip --name sample
```

`generate` walks `src_dir` indexing every `.png`, parses each `.ui` for `:/...` / `.png` resource references, copies matches (including `@2x` variants), and writes `.quiht.json`. `pack` zips a bundle dir (or, with `from_src=True`, a source tree) into a `.quiht.zip`.

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

`index.html` + `src/main.ts` + `src/app.css` (Vite). On load, `main.ts`:
1. Calls `loadBundle("./example/.quiht.json")` for the default dataset; the
   **Open dataset…** button and drag-and-drop let the user load any
   `.quiht.zip` / `.quiht.json` / `.ui` (also via `loadBundle`).
2. Lists the bundle's `.ui` files in the sidebar; selecting one renders
   `bundle.uiDocs[name]`.
3. `extractTranslatableItems` (a pure, unit-tested function) re-walks the XML to build the translation grid, using the same `@`/`<widgetName>.<prop>` key convention as the renderer — keep these two in sync if you change the key scheme.
4. `renderUi` calls `Quiht.render` with the bundle's `resourceResolver` and a `translationResolver` (looks up `translations[key][lang]`, falling back to `en` then raw).
5. `setupInteractiveEvents` cross-links the rendered widgets and the grid rows by `data-quiht-key` for bidirectional hover/click highlighting.

`translations.json` shape: `{ "<key>": { "en": "...", "de": "...", ... } }`.

## Data conventions

- **Manifest (`.quiht.json`):** `{ prefix, ui: {name → relPath}, resources: {qrcPath → relPath} }`. Paths in `ui`/`resources` are relative to the manifest/archive root; `loadBundle` resolves them (URLs relative to the manifest, or object URLs for in-zip resources). (The `prefix` field is written by the generator but not currently consumed.)
- **`.quiht.zip`:** a ZIP whose root holds `.quiht.json` + `ui/` + `resources/` (+ optional `translations.json`). Built by `quiht-tools pack`; loaded by `quiht-core loadBundle`.
- **Resource keys** in the manifest are the *raw* Qt paths (`:/images/resources/document_open.png`), which is exactly what `_getProperty` returns for an `iconset` — so the resolver can look them up directly.
- The generator hardcodes a couple of Proteus-specific filename remaps (`document_open.png`→`file_open.png`, `document_new.png`→`new.png`); these are dataset quirks, not general logic.

## When extending

- **New widget type:** add a `case` in `_renderWidget`. Emit `class="<QtClass> QWidget"` and add matching styling to `index.css`. If it carries localizable text, set the `quiht-translatable-node` class + `data-quiht-*` attributes the way the existing cases do, and add the property to `extractTranslatableItems` in the l10n app (`quiht-l10n-vu/src/main.ts`).
- **Custom/non-standard widgets:** prefer `options.customRenderers` over editing the core switch.
- The two SPEC files are the place to record API intent; update them alongside behavior changes.


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>