# this_file: quiht-tools/src/quiht_tools/pack.py
"""Create and extract `.quiht.zip` all-in-one packages.

Canonical `.quiht.zip` format: a standard ZIP archive whose root contains
`.quiht.json` (the manifest), `ui/` (all .ui files), `resources/` (all resource
files), and optionally `translations.json`. Manifest `ui`/`resources` values are
paths relative to the archive root.
"""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path

MANIFEST_NAME = ".quiht.json"
EXTRA_FILES: tuple[str, ...] = ("translations.json",)


def _iter_bundle_files(bundle: Path) -> list[Path]:
    """Return the files that belong in a `.quiht.zip` from a bundle directory."""
    manifest_path = bundle / MANIFEST_NAME
    if not manifest_path.is_file():
        raise FileNotFoundError(f"No {MANIFEST_NAME} found in bundle: {bundle}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files: list[Path] = [manifest_path]

    for rel in list(manifest.get("ui", {}).values()) + list(manifest.get("resources", {}).values()):
        path = bundle / rel
        if path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Manifest references missing file: {rel}")

    for extra in EXTRA_FILES:
        path = bundle / extra
        if path.is_file():
            files.append(path)

    # De-duplicate while preserving order.
    seen: set[Path] = set()
    unique: list[Path] = []
    for f in files:
        if f not in seen:
            seen.add(f)
            unique.append(f)
    return unique


def pack(
    src: str | Path,
    output: str | Path | None = None,
    name: str | None = None,
    from_src: bool = False,
    verbose: bool = True,
    **gen_kwargs,
) -> str:
    """Create a `.quiht.zip` from a bundle directory (or a Qt source tree).

    :param src: A bundle directory containing `.quiht.json` (default), or a Qt
        source tree when ``from_src=True``.
    :param output: Output `.quiht.zip` path. Defaults to ``<name>.quiht.zip`` in
        the current directory.
    :param name: Archive base name. Defaults to the bundle directory name.
    :param from_src: If True, run `generate` on ``src`` into a temp bundle first.
    :param verbose: Print progress.
    :param gen_kwargs: Extra args forwarded to `generate` when ``from_src=True``
        (e.g. ``ui_files=...``, ``url_prefix=...``).
    :returns: The path to the created `.quiht.zip`.
    """
    src_path = Path(src).resolve()

    if from_src:
        from quiht_tools.jsongen import generate

        tmp = Path(tempfile.mkdtemp(prefix="quiht-pack-"))
        generate(src_path, tmp, verbose=verbose, **gen_kwargs)
        bundle = tmp
    else:
        bundle = src_path

    base = name or bundle.name
    out_path = Path(output).resolve() if output else Path.cwd() / f"{base}.quiht.zip"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    files = _iter_bundle_files(bundle)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            arcname = path.relative_to(bundle).as_posix()
            zf.write(path, arcname)
            if verbose:
                print(f"Added: {arcname}")

    if verbose:
        print(f"Created package: {out_path}")
    return str(out_path)


def unpack(archive: str | Path, dest: str | Path, verbose: bool = True) -> str:
    """Extract a `.quiht.zip` archive into a destination directory.

    :param archive: Path to a `.quiht.zip` file.
    :param dest: Destination directory (created if needed).
    :param verbose: Print progress.
    :returns: The destination directory path.
    """
    archive_path = Path(archive).resolve()
    dest_path = Path(dest).resolve()
    dest_path.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive_path, "r") as zf:
        if MANIFEST_NAME not in zf.namelist():
            raise ValueError(f"{archive_path} is not a valid .quiht.zip ({MANIFEST_NAME} missing at root)")
        zf.extractall(dest_path)
        if verbose:
            for name in zf.namelist():
                print(f"Extracted: {name}")

    if verbose:
        print(f"Unpacked to: {dest_path}")
    return str(dest_path)
