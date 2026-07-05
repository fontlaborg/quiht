#!/usr/bin/env bash
# this_file: test.sh
# test.sh — run every quiht test suite: the TypeScript packages and the Python tool.
#
# Idempotent. Run from anywhere; paths resolve relative to this script.
#
#   ./test.sh
#
# Runs, in order:
#   1. quiht-core      (vitest)
#   2. quiht-l10n-vu   (vitest, depends on quiht-core's built dist/)
#   3. quiht-tools     (pytest)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

section() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
npm_install() {
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

# quiht-l10n-vu imports quiht-core's built dist/, so build core before testing it.
section "quiht-core (TypeScript library)"
( cd quiht-core && npm_install && npm run build && npm test )

section "quiht-l10n-vu (TypeScript reviewer SPA)"
( cd quiht-l10n-vu && npm_install && npm test )

section "quiht-tools (Python package)"
( cd quiht-tools && uv run --extra test python -m pytest -q )

section "All test suites passed."
