# this_file: quiht-tools/src/quiht_tools/jsongen.py
"""Generate a `.quiht.json` manifest from a Qt source tree.

Scans a source directory for `.ui` files, copies them (and the resource files
they reference) into a destination bundle directory, and writes a `.quiht.json`
manifest mapping widget files and Qt resource paths to bundle-relative paths.

This module is intentionally generic: it does not hardcode any project-specific
UI file list or resource-name remapping. Callers supply the UI file selection
explicitly (or let it auto-discover every `.ui` under the source tree), and may
supply a `resource_remap` mapping for dataset-specific filename fixups.
"""

from __future__ import annotations

import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_RESOURCE_EXTS: tuple[str, ...] = (".png", ".svg", ".jpg", ".jpeg", ".gif", ".ico")


def _index_resources(src_dir: Path, exts: tuple[str, ...]) -> dict[str, Path]:
    """Index every resource file under ``src_dir`` by filename and path suffix."""
    index: dict[str, Path] = {}
    for path in src_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in exts:
            continue
        index.setdefault(path.name, path)
        parts = path.relative_to(src_dir).parts
        for i in range(len(parts)):
            index["/".join(parts[i:])] = path
    return index


def _extract_resource_refs(ui_path: Path) -> list[str]:
    """Return unique Qt resource references found in a `.ui` file."""
    try:
        root = ET.parse(ui_path).getroot()
    except ET.ParseError as exc:
        raise ValueError(f"Failed to parse UI XML in {ui_path}: {exc}") from exc

    refs: set[str] = set()
    for elem in root.iter():
        if elem.text and (":/" in elem.text or ".png" in elem.text):
            refs.add(elem.text.strip())
        for val in elem.attrib.values():
            if ":/" in val or ".png" in val:
                refs.add(val.strip())
    return sorted(refs)


def _clean_qrc_path(qrc: str, strip_prefixes: tuple[str, ...]) -> str:
    """Normalize a Qt resource path (`:/images/foo.png`) to a lookup key."""
    clean = qrc[2:] if qrc.startswith(":/") else qrc
    for prefix in strip_prefixes:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    return clean


def _discover_ui_files(src_dir: Path) -> list[str]:
    """Return all `.ui` files under ``src_dir`` as source-relative POSIX paths."""
    return sorted(
        p.relative_to(src_dir).as_posix()
        for p in src_dir.rglob("*.ui")
        if p.is_file()
    )


def generate(
    src_dir: str | Path,
    dest_dir: str | Path,
    url_prefix: str = "",
    ui_files: str | list[str] | None = None,
    resource_remap: dict[str, str] | None = None,
    strip_prefixes: tuple[str, ...] = ("images/",),
    resource_exts: tuple[str, ...] = DEFAULT_RESOURCE_EXTS,
    verbose: bool = True,
) -> dict:
    """Scan a Qt source tree and emit a bundle directory + `.quiht.json`.

    :param src_dir: Source directory of the Qt codebase.
    :param dest_dir: Destination bundle directory (gets `ui/`, `resources/`, `.quiht.json`).
    :param url_prefix: Optional prefix written to the manifest (e.g. a base URL).
    :param ui_files: Comma-separated string or list of UI file paths (relative to
        ``src_dir`` or bare filenames). If None, every `.ui` under ``src_dir`` is used.
    :param resource_remap: Optional ``{clean_path: replacement_clean_path}`` fixups
        for dataset-specific filename differences. Generic; nothing is hardcoded.
    :param strip_prefixes: Path prefixes stripped from cleaned resource paths
        before lookup (first match wins).
    :param resource_exts: Resource file extensions to index/copy.
    :param verbose: Print progress to stdout.
    :returns: The manifest dict that was written.
    """
    src = Path(src_dir).resolve()
    dest = Path(dest_dir).resolve()
    remap = resource_remap or {}

    if isinstance(ui_files, str):
        ui_paths = [x.strip() for x in ui_files.split(",") if x.strip()]
    elif ui_files is None:
        ui_paths = _discover_ui_files(src)
    else:
        ui_paths = list(ui_files)

    if not ui_paths:
        raise ValueError(f"No .ui files found in {src}")

    ui_dest = dest / "ui"
    res_dest = dest / "resources"
    ui_dest.mkdir(parents=True, exist_ok=True)
    res_dest.mkdir(parents=True, exist_ok=True)

    def log(msg: str) -> None:
        if verbose:
            print(msg)

    log(f"Source: {src}")
    log(f"Destination: {dest}")
    log("Indexing resource files...")
    res_index = _index_resources(src, resource_exts)

    manifest: dict = {"prefix": url_prefix, "ui": {}, "resources": {}}

    for ui_rel in ui_paths:
        ui_src = src / ui_rel
        if not ui_src.exists():
            matches = list(src.rglob(Path(ui_rel).name))
            if not matches:
                log(f"Warning: UI file {ui_rel} not found in {src}. Skipping.")
                continue
            ui_src = matches[0]

        ui_name = ui_src.name
        shutil.copy2(ui_src, ui_dest / ui_name)
        manifest["ui"][ui_name] = f"ui/{ui_name}"
        log(f"Copied UI: {ui_name}")

        for ref in _extract_resource_refs(ui_dest / ui_name):
            clean = _clean_qrc_path(ref, strip_prefixes)
            clean = remap.get(clean, clean)
            resolved = res_index.get(clean) or res_index.get(Path(clean).name)
            if not resolved or not resolved.exists():
                log(f"  Warning: unresolved resource {ref} (cleaned: {clean})")
                continue

            shutil.copy2(resolved, res_dest / resolved.name)
            manifest["resources"][ref] = f"resources/{resolved.name}"
            log(f"  Resolved resource: {ref} -> resources/{resolved.name}")

            # Copy a sibling @2x variant if present.
            twox = resolved.with_name(f"{resolved.stem}@2x{resolved.suffix}")
            if twox.exists():
                shutil.copy2(twox, res_dest / twox.name)
                stem, ext = ref.rsplit(".", 1) if "." in ref else (ref, "")
                twox_ref = f"{stem}@2x.{ext}" if ext else f"{ref}@2x"
                manifest["resources"][twox_ref] = f"resources/{twox.name}"
                log(f"  Resolved @2x: {twox_ref} -> resources/{twox.name}")

    manifest_path = dest / ".quiht.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"Wrote manifest: {manifest_path}")
    return manifest
