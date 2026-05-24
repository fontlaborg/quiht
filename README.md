# quiht

**Render Qt 5/6 `.ui` XML as HTML/CSS in the browser** — imitating Qt's
appearance *without implementing any Qt behavior*. A viewer/renderer built for
localization review: show source and translated strings in the real visual
context of the rendered UI.

Live demo: **https://fontlab.org/quiht/** — drag in a `.ui`, `.quiht.json`, or
`.quiht.zip`.

Apache-2.0.

## Repository layout

| Path | What it is | Built/published as |
|------|------------|--------------------|
| **`quiht-core/`** | The renderer + bundle loader. TypeScript library. | npm: `quiht-core` |
| **`quiht-l10n-vu/`** | Three-pane localization reviewer SPA (Vite + TS) on top of `quiht-core`. | npm: `quiht-l10n-vu` |
| **`quiht-demo/`** | Source of the static drag-and-drop demo (Vite + TS). | builds into `docs/` |
| **`quiht-tools/`** | Python CLI: generate `.quiht.json` manifests and build `.quiht.zip` packages. | PyPI: `quiht-tools` |
| **`docs/`** | Built static demo for GitHub Pages (https://fontlab.org/quiht/). | committed build output |
| **`example/`** | Sample `.ui` files, resources, manifest, and translations (fixtures). | — |

## Data formats

- **`.ui`** — a Qt Designer XML file. Renders standalone.
- **`.quiht.json`** — a manifest: `{ prefix, ui: {name → relPath}, resources: {qrc → relPath} }`,
  with paths relative to the manifest. References external `.ui`/resource files.
- **`.quiht.zip`** — the canonical all-in-one package: a ZIP whose **root**
  contains `.quiht.json` + `ui/` + `resources/` (+ optional `translations.json`).
  Manifest paths are relative to the archive root.

`quiht-core`'s `loadBundle(source)` accepts all three.

## Build everything

```bash
./build.sh
```

Deletes previous build artifacts, then builds in order: `quiht-core` (tsc →
`dist/`), refreshes the vendored sample data, `quiht-l10n-vu` (Vite →
`dist/`), `quiht-demo` (Vite → `docs/`), and `quiht-tools` (`uv build` →
`dist/`). Idempotent.

## Publish

```bash
./publish.sh
```

Publishes for real: it runs `./build.sh`, runs `uvx gitnextver` to commit,
tag, and push the next `vA.B.C` release, publishes `quiht-tools` to PyPI, then
publishes `quiht-core` and `quiht-l10n-vu` to npm. npm package versions are
temporarily stamped from the newly created git tag for publication; the Python
package gets its version from git tags via `hatch-vcs`.

## Versioning

All packages are **git-tag semver**: tag a release (`git tag v1.2.3`) and the
build/publish scripts derive versions from it. Don't hand-edit version fields.

## Local development

Each package has its own README. Quick start:

```bash
cd quiht-core     && npm install && npm run build && npm test
cd quiht-l10n-vu  && npm install && npm run dev      # reviewer SPA
cd quiht-demo     && npm install && npm run dev      # demo page
cd quiht-tools    && uv run python -m quiht_tools --help
```
