#!/usr/bin/env bash
# this_file: build.sh
# build.sh — build every quiht package: the TS libraries/apps and the Python tool.
#
# Idempotent. Run from anywhere; paths are resolved relative to this script.
#
#   ./build.sh
#
# Builds, in order:
#   1. quiht-core      (TS library  -> dist/ via tsc)
#   2. quiht-l10n-vu   (TS SPA      -> dist/ via Vite)
#   3. quiht-demo      (TS demo     -> ../docs via Vite, for GitHub Pages)
#   4. quiht-tools     (Python pkg  -> dist/ via uv build)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

section() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
clean_dir() {
  local path="$1"
  if [[ -e "$path" ]]; then
    rm -rf "$path"
  fi
}
npm_install() {
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

section "Clean build artifacts"
clean_dir quiht-core/dist
clean_dir quiht-l10n-vu/dist
clean_dir quiht-demo/public/sample.quiht.zip
clean_dir quiht-tools/build
clean_dir quiht-tools/dist
find quiht-tools -maxdepth 2 -name "*.egg-info" -exec rm -rf {} +
( cd quiht-tools && uvx hatch clean )

# --- 1. quiht-core -----------------------------------------------------------
section "quiht-core (TypeScript library)"
( cd quiht-core && npm_install && npm run build && npm test )

# --- Refresh vendored sample data --------------------------------------------
# The demo + reviewer ship a copy of the example dataset. Refresh it from the
# canonical example/ so the published artifacts never drift.
section "Refresh vendored sample data from example/"
rm -rf quiht-l10n-vu/public/example
mkdir -p quiht-l10n-vu/public/example
cp -R example/.quiht.json example/translations.json example/ui example/resources \
  quiht-l10n-vu/public/example/

mkdir -p quiht-demo/public
( cd quiht-tools && uv run python -m quiht_tools pack ../example \
    --output ../quiht-demo/public/sample.quiht.zip --name sample --verbose=False )

# Regenerate the demo's themed gallery bundles from their synthetic sources, so
# the gallery never drifts from example-sets/.
mkdir -p quiht-demo/public/examples
for set_dir in quiht-demo/example-sets/*/; do
  [[ -d "$set_dir" ]] || continue
  set_name="$(basename "$set_dir")"
  ( cd quiht-tools && uv run python -m quiht_tools pack "../$set_dir" \
      --from_src=True --output "../quiht-demo/public/examples/${set_name}.quiht.zip" \
      --name "$set_name" --verbose=False )
done

# --- 2. quiht-l10n-vu --------------------------------------------------------
section "quiht-l10n-vu (TypeScript reviewer SPA)"
( cd quiht-l10n-vu && npm_install && npm run build && npm test )

# --- 3. quiht-demo -> docs ---------------------------------------------------
section "quiht-demo (static demo -> docs/)"
DOCS_DESIGN_BACKUP="$(mktemp -d)"
if [[ -d docs/design ]]; then
  mkdir -p "$DOCS_DESIGN_BACKUP/design"
  cp -R docs/design/. "$DOCS_DESIGN_BACKUP/design/"
fi
restore_docs_design() {
  if [[ -d "$DOCS_DESIGN_BACKUP/design" ]]; then
    mkdir -p docs/design
    cp -R "$DOCS_DESIGN_BACKUP/design/." docs/design/
  fi
  rm -rf "$DOCS_DESIGN_BACKUP"
}
if ! ( cd quiht-demo && npm_install && npm run build ); then
  restore_docs_design
  exit 1
fi
restore_docs_design

# --- 4. quiht-tools ----------------------------------------------------------
section "quiht-tools (Python package)"
(
  cd quiht-tools
  uv build
)

section "Done. Artifacts:"
echo "  quiht-core/dist        (npm package)"
echo "  quiht-l10n-vu/dist     (static SPA)"
echo "  docs/                  (static demo for GitHub Pages)"
echo "  quiht-tools/dist       (wheel + sdist)"
