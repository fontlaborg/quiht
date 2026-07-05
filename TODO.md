<!-- this_file: TODO.md -->
# TODO

Bigger ideas parked here during the 2026-07 modernization pass. Low-hanging
fruit (root `test.sh`, tag-triggered release CI, flagged code comments, gitignore
hygiene, project icon) is already done — see `CHANGELOG.md`.

## Documentation

- [ ] Add a developer-docs layer under `docs/_docs/` (the demo in `docs/` is the
      built Vite app; a Jekyll `_docs/` layer can live beside it on Pages):
  - [ ] `docs/_docs/l10n-reviewer.md` — the three-pane reviewer workflow and the
        `translations.json` format (`{ "<key>": { "en": ..., "de": ... } }`).
  - [ ] API reference for `quiht-core` TypeScript exports (`parse`, `render`,
        `loadBundle`, `customWidgetPreset`, `RenderOptions`).
  - [ ] `quiht-tools` CLI reference (`generate`, `pack`, `unpack`, `uipack`).
  - [ ] A table of the `Y*` / `Qt*` widget classes covered by `customWidgetPreset`
        (`quiht-core/src/presets/custom-widgets.ts`).

## Cross-package contract

- [ ] Add a shared `schemas/quiht-bundle.schema.json` for the `.quiht.json`
      manifest, referenced by both the Python generator (`quiht-tools`) and the
      TypeScript loader (`quiht-core/src/bundle.ts`), so a schema change forces a
      coordinated update on both sides. Validate against it in each test suite.
