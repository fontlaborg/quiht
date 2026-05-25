#!/usr/bin/env bash
# view.sh — build the packages, run the preview server, and open the browser.
#
# Usage:
#   ./view.sh
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Ensure dependencies are installed
if [ ! -d "quiht-core/node_modules" ]; then
  echo "==> Installing dependencies in quiht-core..."
  (cd quiht-core && npm install)
fi

if [ ! -d "quiht-l10n-vu/node_modules" ]; then
  echo "==> Installing dependencies in quiht-l10n-vu..."
  (cd quiht-l10n-vu && npm install)
fi

echo "==> Building quiht-core..."
(cd quiht-core && npm run build)

echo "==> Building quiht-l10n-vu..."
(cd quiht-l10n-vu && npm run build)

echo "==> Starting preview server and opening browser..."
# Runs the Vite preview server and automatically opens the URL in the browser
(cd quiht-l10n-vu && npm run preview -- --open)
