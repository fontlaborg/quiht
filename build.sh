#!/usr/bin/env bash
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

# --- 1. quiht-core -----------------------------------------------------------
section "quiht-core (TypeScript library)"
( cd quiht-core && npm install && npm run build && npm test )

# --- Refresh vendored sample data --------------------------------------------
# The demo + reviewer ship a copy of the example dataset. Refresh it from the
# canonical example/ so the published artifacts never drift.
section "Refresh vendored sample data from example/"
rm -rf quiht-l10n-vu/public/example
mkdir -p quiht-l10n-vu/public/example
cp -R example/.quiht.json example/translations.json example/ui example/resources \
  quiht-l10n-vu/public/example/

mkdir -p quiht-demo/public
if command -v uv >/dev/null 2>&1; then
  ( cd quiht-tools && uv run python -m quiht_tools pack ../example \
      --output ../quiht-demo/public/sample.quiht.zip --name sample --verbose=False )
else
  echo "uv not found; leaving any existing quiht-demo/public/sample.quiht.zip in place"
fi

# --- 2. quiht-l10n-vu --------------------------------------------------------
section "quiht-l10n-vu (TypeScript reviewer SPA)"
( cd quiht-l10n-vu && npm install && npm run build && npm test )

# --- 3. quiht-demo -> docs ---------------------------------------------------
section "quiht-demo (static demo -> docs/)"
( cd quiht-demo && npm install && npm run build )

# --- 4. quiht-tools ----------------------------------------------------------
section "quiht-tools (Python package)"
(
  cd quiht-tools
  uvx hatch clean || true
  # gitnextver is optional; never fail the build if it is missing.
  if command -v gitnextver >/dev/null 2>&1; then
    gitnextver . || echo "gitnextver returned non-zero; continuing"
  elif uvx --help >/dev/null 2>&1 && uvx gitnextver --help >/dev/null 2>&1; then
    uvx gitnextver . || echo "uvx gitnextver returned non-zero; continuing"
  else
    echo "gitnextver not available; skipping (version comes from git tags via hatch-vcs)"
  fi
  uv build
)

section "Done. Artifacts:"
echo "  quiht-core/dist        (npm package)"
echo "  quiht-l10n-vu/dist     (static SPA)"
echo "  docs/                  (static demo for GitHub Pages)"
echo "  quiht-tools/dist       (wheel + sdist)"
