<!-- this_file: CHANGELOG.md -->
# Changelog

All notable changes to **quiht** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow git-tag semver.

## [Unreleased]

### Release scripts (2026-05-25)

- `build.sh` now starts by removing generated build artifacts, uses lockfile
  installs for npm packages, treats `uv` as required for sample bundle creation,
  preserves `docs/design/` across the Vite demo rebuild, and leaves version
  tagging out of the build step.
- `publish.sh` is now the real release command with no `--yes` dry-run gate: it
  runs `./build.sh`, runs `uvx gitnextver` to commit/tag/push the next release,
  refuses to publish if no new tag was created, rebuilds `quiht-tools` after the
  release tag so `hatch-vcs` emits final artifacts, publishes to PyPI, and
  publishes the two npm packages with temporary tag-derived versions.

### Alpine.js compiler (task004) (2026-05-25)

Verified-complete (fresh: `quiht-core` 48 vitest passing — 15 new + 33 prior —
and `tsc -p tsconfig.json` exit 0; smoke-compiled real Proteus
`dlglayerpropagate.ui` / `newstrokesgallery.ui`).

Added an HTML-first, build-free compile path for embedding Qt `.ui` files in
Alpine.js apps (e.g. fog-online), kept **alongside** the DOM `render()` rather
than replacing it:

- `quiht-core/src/ast.ts` — typed, framework-agnostic AST (`UiRoot`,
  `WidgetNode`, `LayoutNode`, `Connection`) + `buildAst(doc)`. Splits XML
  traversal from element mapping; SSR-friendly.
- `quiht-core/src/compiler.ts` — `compile(docOrAst, options) => string` emitting
  Alpine markup: Qt classes → native tags/custom elements (DOM layer); inputs'
  initial values collected into one root `x-data` scope + `x-model` (state
  layer); `<connections>` → `$dispatch`/`.window` listeners with honest comments
  for unmapped signals (behaviour layer); layouts → flex/grid utilities (CSS
  layer). `{ strict }` + `{ customElements }` options.
- `quiht-core/src/webcomponents.ts` — `registerQuihtComponents()` (idempotent)
  defining `<q-angle-popup>`/`<q-opacity-bar>`/`<q-color-picker>`/`<q-widget>`
  with reflected `value` + `input` event (the `x-model` contract).
- `quiht-core/alpine.css` — production layout/control utilities, themeable via
  `--q-*` props inheriting fog-online `--th-*` tokens.
- Exports wired through `index.ts`; `alpine.css` added to package `exports`/
  `files`. New tests: `ast.test.ts`, `compiler.test.ts`, `webcomponents.test.ts`.
- `docs/design/fog-online.md` — integration/event/theming contract.

### Hardening pass — renderer coverage & cleanup (2026-05-25)

Verified-complete (fresh: `quiht-core` 33 vitest, `quiht-l10n-vu` 6 vitest, `build.sh` exit 0):

- **Widget coverage** (`quiht-core/src/render.ts` + `index.css`, census-driven by Proteus): added renderers for **QFrame, QSplitter, QSpinBox/QDoubleSpinBox, QSlider, QProgressBar, QDialogButtonBox, QListWidget/QTreeWidget, QMenuBar/QMenu, QMainWindow**, plus an explicit `QWidget` container case. `parser.ts` now reads `<enum>`/`<set>` properties.
- **FontLab `statusTip=@key` convention**: `textKeyFor()` prefers a `@`-prefixed `statusTip` as the canonical translation key over the synthesized `<name>.text`, aligning with FontLab's `.ts` catalogs; mirrored in the l10n viewer.
- **FontLab custom-widget preset** (`quiht-core/src/presets/fontlab.ts`, exported): `customRenderers` covering `YLineEditSuffix`, `YSelector`, `YDarker/YLighterWidget`, `YAngle/YPopupAngle`, `YCheckButton`, `YSimpleSlider`, `YOpacityBar`, `QtColorPicker`, `QtnPropertyView`.
- **quiht-l10n-vu**: CSS-transform zoom (buttons + ctrl/⌘-wheel) + drag-pan on the render canvas; per-`.ui` translation-coverage badges in the sidebar.
- **Tests**: +18 quiht-core (widgets/statustip/preset), +2 l10n-vu.
- **CI**: `.github/workflows/ci.yml` — per-package install+build+test on push/PR (no publish steps).
- **Cleanup**: deleted dead `quiht-core/quiht-core.js` (superseded by `src/`); moved `RESEARCH.md` → `docs/design/`; fixed `CLAUDE.md` Architecture section; removed stray `ruvector.db`/`.DS_Store` and gitignored them; tracked `example/proteus.quiht.zip` fixture.

**Real-data result:** the 6-UI Proteus bundle now renders with **0 dotted-placeholder divs** (was 24) once `fontlabPreset` is applied — all widget classes resolved.

### Added — re-engineering into a multi-package open-source repo (task003.1)

Verified-complete work (all test evidence fresh as of 2026-05-24):

- **quiht-core** — TypeScript NPM package (port of the original `quiht-core.js`).
  - Full Qt `.ui` → HTML rendering ported to `src/{index,parser,render,types,bundle}.ts`, preserving every widget/layout case and the localization tagging contract (`quiht-translatable-node`, `data-quiht-key`, `data-quiht-original`).
  - SSR-safe rendering: stylesheets inject into `options.targetDocument`/`ownerDocument` instead of the global `document.head`.
  - `.quiht.zip` loading via `fflate` — `loadBundle()` accepts a `.quiht.zip` (Blob/ArrayBuffer/Uint8Array/URL), a `.quiht.json` URL, or a raw `.ui` string; in-zip resources become object URLs.
  - `package.json` (ESM, `exports`/`types`/`style`), strict `tsconfig.json`, `tsc` build emitting `dist/` with `.d.ts`.
  - **15 vitest + jsdom tests pass.** README documents the API and `.quiht.zip`.
- **quiht-l10n-vu** — TypeScript Vite NPM package; depends on `quiht-core`.
  - `app.js` ported to TypeScript; dataset configurable via drag-drop / file picker for `.ui` / `.quiht.json` / `.quiht.zip`.
  - Three-pane reviewer UI with bidirectional highlight preserved. **4 vitest tests pass.**
- **quiht-tools** — Python PyPI package (was a single `quiht-jsongen.py` script).
  - Restructured to `src/quiht_tools/` with hatch-vcs git-tag semver.
  - Fire CLI: `gen`/`jsongen`, `pack`, `unpack`, `version`. FontLab/Proteus hardcodes removed (generic `resource_remap`; auto-discovers `.ui`).
  - `.quiht.zip` create/extract. **7 pytest tests pass.**
- **docs/** — static drag-drop demo for `https://fontlab.org/quiht/` (built from `quiht-demo/` via Vite → `docs/`), with theme toggle and error banner.
- **build.sh** — builds all four packages (Python via hatch/uv, JS via tsc/Vite). **publish.sh** — dry-run by default; `--yes` to publish; npm versions stamped from `git describe --tags`.
- Repo reorg + updated `CLAUDE.md`, `README.md`, `.gitignore`.

### Defined

- Canonical **`.quiht.zip`** format (shared Python + TypeScript): a ZIP whose root holds `.quiht.json` + `ui/` + `resources/` (+ optional `translations.json`); manifest `ui`/`resources` values are paths relative to the archive root.

### Verified with real FontLab data

- Generated `example/proteus.quiht.zip` from `../fontlab/Proteus/` `.ui` files + image assets via `quiht-tools`.
- `quiht-core` rendered all 6 Proteus UIs (36 translatable nodes tagged with a `translationResolver`).
- Discovered the FontLab convention: a widget's `statusTip` holds the `@`-prefixed translation key (e.g. `@pref_zoom.label_20`) while `text` holds the source string.
