# quiht-l10n-vu

A three-pane Qt `.ui` **localization reviewer** SPA built on
[`quiht-core`](https://www.npmjs.com/package/quiht-core). It shows source and
translated strings in the *actual visual context* of the rendered interface, so
translators and reviewers can see exactly where every string lands.

- **Left pane** — the `.ui` files in the loaded dataset.
- **Center pane** — the live render of the selected `.ui` (via `quiht-core`),
  with a Fusion light/dark theme toggle.
- **Right pane** — the translation grid; hovering a row highlights the matching
  widget and vice-versa.

Apache-2.0.

## Datasets

The dataset is configurable. On load the app shows a bundled example, but you
can open any dataset two ways:

- the **Open dataset…** button (file picker), or
- **drag-and-drop** onto the window.

Accepted inputs (all handled by `quiht-core`'s `loadBundle`):

- a **`.quiht.zip`** all-in-one package,
- a **`.quiht.json`** manifest (resources resolved relative to it),
- a raw single **`.ui`** XML file.

## Develop

```bash
npm install
npm run dev      # Vite dev server
npm run build    # type-check (tsc --noEmit) + vite build -> dist/
npm run preview  # serve the production build
npm test         # vitest
```

The build emits static files into `dist/` with **relative** asset paths
(`base: "./"`), so it can be served from any sub-path or the file system.

## Versioning

This package uses **git-tag semver**. `package.json` keeps `"version": "0.0.0"`
as a placeholder; the published version is stamped at publish time from
`git describe --tags` (see the repository's `publish.sh`). Do not hand-edit the
version — create a git tag (e.g. `v1.2.3`) instead.
