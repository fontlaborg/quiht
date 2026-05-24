#!/usr/bin/env bash
# this_file: publish.sh
# publish.sh — build, version, push, and publish quiht packages.
#
# This script intentionally has no dry-run flag. It performs the complete
# release flow: clean/build everything, commit+tag+push with gitnextver, publish
# quiht-tools to PyPI, then publish the npm packages with temporary semver
# stamps derived from the newly created git tag.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ "$#" -ne 0 ]]; then
  echo "usage: ./publish.sh" >&2
  echo "publish.sh always performs a real release; it does not accept --yes or dry-run flags." >&2
  exit 2
fi

section() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
run() {
  echo "+ $*"
  "$@"
}
latest_tag() {
  git describe --tags --abbrev=0 2>/dev/null || true
}

PREVIOUS_TAG="$(latest_tag)"

section "Clean and build all packages"
run ./build.sh

section "Commit, tag, and push with gitnextver"
GITNEXTVER_OUTPUT="$(uvx gitnextver --directory "$ROOT" --verbose)"
printf '%s\n' "$GITNEXTVER_OUTPUT"

RAW_TAG="$(printf '%s\n' "$GITNEXTVER_OUTPUT" | awk '/^v[0-9]+\.[0-9]+\.[0-9]+$/ { tag=$1 } END { print tag }')"
if [[ -z "$RAW_TAG" ]]; then
  RAW_TAG="$(latest_tag)"
fi

if [[ -z "$RAW_TAG" || "$RAW_TAG" == "$PREVIOUS_TAG" ]]; then
  echo "gitnextver did not create a new release tag; refusing to publish." >&2
  exit 1
fi

# --- Resolve version from git tags -------------------------------------------
VERSION="${RAW_TAG#v}"
section "Version from git: $RAW_TAG -> $VERSION"

# --- Python: quiht-tools -> PyPI ---------------------------------------------
section "quiht-tools -> PyPI"
(
  cd quiht-tools
  # hatch-vcs reads the current git tag. Rebuild after gitnextver creates the
  # release tag so PyPI receives A.B.C artifacts, not pre-tag .dev artifacts.
  run uvx hatch clean
  run uv build
  # uv publish reads PyPI credentials from env/keyring (UV_PUBLISH_TOKEN, etc.)
  run uv publish
)

# --- npm: quiht-core then quiht-l10n-vu --------------------------------------
publish_npm() {
  local dir="$1"
  local core_dependency="${2:-0}"
  section "$dir -> npm (version $VERSION)"
  (
    cd "$dir"
    local tmpdir
    tmpdir="$(mktemp -d)"
    cp package.json "$tmpdir/package.json"
    if [[ -f package-lock.json ]]; then
      cp package-lock.json "$tmpdir/package-lock.json"
    fi
    restore_package_files() {
      cp "$tmpdir/package.json" package.json
      if [[ -f "$tmpdir/package-lock.json" ]]; then
        cp "$tmpdir/package-lock.json" package-lock.json
      fi
      rm -rf "$tmpdir"
    }
    trap restore_package_files EXIT

    node - "$VERSION" "$core_dependency" <<'NODE'
const fs = require("node:fs");
const version = process.argv[2];
const rewriteCoreDependency = process.argv[3] === "1";

function rewritePackageJson(path) {
  const packageJson = JSON.parse(fs.readFileSync(path, "utf8"));
  packageJson.version = version;
  if (rewriteCoreDependency && packageJson.dependencies?.["quiht-core"]) {
    packageJson.dependencies["quiht-core"] = `^${version}`;
  }
  fs.writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
}

rewritePackageJson("package.json");

if (fs.existsSync("package-lock.json")) {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.version = version;
  if (lock.packages?.[""]) {
    lock.packages[""].version = version;
    if (rewriteCoreDependency && lock.packages[""].dependencies?.["quiht-core"]) {
      lock.packages[""].dependencies["quiht-core"] = `^${version}`;
    }
  }
  fs.writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
}
NODE
    run npm publish --access public
  )
}

publish_npm quiht-core
publish_npm quiht-l10n-vu 1

section "Done."
echo "Published quiht release $RAW_TAG."
exit 0
