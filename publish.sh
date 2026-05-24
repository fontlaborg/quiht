#!/usr/bin/env bash
# publish.sh — publish quiht packages to PyPI (Python) and npm (TypeScript).
#
# Publishing is IRREVERSIBLE, so this script is a DRY RUN by default: it prints
# exactly what it would do and changes nothing. Pass --yes to actually publish.
#
#   ./publish.sh            # dry run (default)
#   ./publish.sh --yes      # really publish
#
# NPM package versions are stamped from `git describe --tags` (the packages keep
# a 0.0.0 placeholder in package.json). The stamp is applied to a temporary copy
# only when publishing for real, and reverted afterwards.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DO_PUBLISH=0
[[ "${1:-}" == "--yes" ]] && DO_PUBLISH=1

section() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
run() {
  if [[ "$DO_PUBLISH" -eq 1 ]]; then
    echo "+ $*"
    "$@"
  else
    echo "[dry-run] would run: $*"
  fi
}

# --- Resolve version from git tags -------------------------------------------
RAW_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)"
VERSION="${RAW_TAG#v}"
section "Version from git: $RAW_TAG -> $VERSION"
if [[ "$DO_PUBLISH" -eq 0 ]]; then
  echo "DRY RUN — nothing will be published. Re-run with --yes to publish."
fi

# --- Python: quiht-tools -> PyPI ---------------------------------------------
section "quiht-tools -> PyPI"
(
  cd quiht-tools
  run uvx hatch clean
  run uv build
  # uv publish reads PyPI credentials from env/keyring (UV_PUBLISH_TOKEN, etc.)
  run uv publish
)

# --- npm: quiht-core then quiht-l10n-vu --------------------------------------
publish_npm() {
  local dir="$1"
  section "$dir -> npm (version $VERSION)"
  (
    cd "$dir"
    if [[ "$DO_PUBLISH" -eq 1 ]]; then
      # Stamp version from git, publish, then restore the 0.0.0 placeholder.
      cp package.json package.json.bak
      npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
      echo "+ npm publish --access public  (version $VERSION)"
      npm publish --access public
      mv package.json.bak package.json
    else
      echo "[dry-run] would set version to $VERSION and run: npm publish --access public"
    fi
  )
}

publish_npm quiht-core
publish_npm quiht-l10n-vu

section "Done."
[[ "$DO_PUBLISH" -eq 0 ]] && echo "This was a dry run. Re-run with --yes to publish for real."
exit 0
