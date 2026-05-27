# quiht-tools

CLI utilities for [quiht](https://fontlab.org/quiht/), the Qt `.ui` → HTML
renderer. `quiht-tools` generates `.quiht.json` manifests from Qt source trees
and packs everything into a single, portable `.quiht.zip`.

## Install

```bash
pip install quiht-tools
# or, for a one-off run without installing:
uvx quiht-tools --help
```

Requires Python 3.10+. The only runtime dependency is [`fire`](https://github.com/google/python-fire).

## The `.quiht.zip` format

A `.quiht.zip` is a standard ZIP archive whose **root** contains:

```
.quiht.json        # the manifest
ui/                # all .ui files
resources/         # all resource files (PNG icons, etc.)
translations.json  # optional
```

The manifest's `ui` and `resources` values are paths **relative to the archive
root**, so a `.quiht.zip` is a self-contained, all-in-one package that a quiht
viewer can load directly.

## Commands

The console script is `quiht`.

### `gen` (alias `jsongen`) — build a bundle + manifest

Scan a Qt source tree, copy referenced `.ui` files and their resources into a
bundle directory, and write `.quiht.json`.

```bash
quiht gen <src_dir> <dest_dir> \
    --url_prefix "https://example.com/ui/" \
    --ui_files "ui/dialog.ui,forms/welcome.ui"
```

- `--ui_files` accepts a comma-separated list (paths relative to `src_dir`, or
  bare filenames). Omit it to auto-discover **every** `.ui` under `src_dir`.
- `--url_prefix` is written into the manifest's `prefix` field (optional).
- `--resource_remap` lets you supply dataset-specific filename fixups; nothing
  is hardcoded.

### `pack` — create a `.quiht.zip`

From an existing bundle directory (one that already contains `.quiht.json`):

```bash
quiht pack ./example --output mybundle.quiht.zip
```

Or directly from a Qt source tree (runs `gen` into a temp dir first):

```bash
quiht pack <src_dir> --from_src --name mybundle --ui_files "a.ui,b.ui"
```

Defaults to `<bundle-name>.quiht.zip` in the current directory.

### `uipack` — one-step `.ui` → `.quiht.zip`

Package a single `.ui` file without naming a source directory. `uipack` reads the
`.ui`, auto-locates the asset tree by climbing the file's parent directories until
its referenced resources resolve, builds the bundle in a temp dir, and zips it:

```bash
quiht uipack path/to/info_names.ui
# -> ./info_names.quiht.zip  (defaults to {cwd}/{ui_basename}.quiht.zip)

quiht uipack path/to/info_names.ui --output dist/info_names.quiht.zip
```

### `unpack` — extract a `.quiht.zip`

```bash
quiht unpack mybundle.quiht.zip ./out
```

### `version`

```bash
quiht version
```

## Library use

```python
from quiht_tools import generate, pack, uipack, unpack

generate("src/qt", "build/bundle")
pack("build/bundle", output="bundle.quiht.zip")
uipack("src/qt/forms/info_names.ui")  # one-step .ui -> .quiht.zip
unpack("bundle.quiht.zip", "build/extracted")
```

## Development

```bash
cd quiht-tools
uv run --with fire --with pytest python -m pytest -x
```

Versioning is driven by git tags via `hatch-vcs`; `src/quiht_tools/__version__.py`
is generated at build time and is git-ignored.

## License

Apache-2.0.
