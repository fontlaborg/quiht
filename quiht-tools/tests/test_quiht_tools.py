# this_file: quiht-tools/tests/test_quiht_tools.py
"""Tests for quiht-tools: gen, pack, and unpack round-trips."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from quiht_tools.jsongen import generate
from quiht_tools.pack import MANIFEST_NAME, pack, uipack, unpack

EXAMPLE_DIR = Path(__file__).resolve().parents[2] / "example"


def _make_src_tree(root: Path) -> Path:
    """Create a tiny Qt-like source tree with one .ui and one referenced icon."""
    (root / "ui").mkdir(parents=True)
    (root / "images" / "resources").mkdir(parents=True)
    (root / "images" / "resources" / "open.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "ui" / "dialog.ui").write_text(
        """<?xml version="1.0"?>
<ui version="4.0">
 <widget class="QDialog" name="Dialog">
  <property name="windowIcon">
   <iconset><normaloff>:/images/resources/open.png</normaloff></iconset>
  </property>
 </widget>
</ui>
""",
        encoding="utf-8",
    )
    return root


def test_generate_produces_valid_manifest(tmp_path: Path) -> None:
    src = _make_src_tree(tmp_path / "src")
    dest = tmp_path / "bundle"

    manifest = generate(src, dest, verbose=False)

    manifest_file = dest / MANIFEST_NAME
    assert manifest_file.is_file()
    on_disk = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert on_disk == manifest
    assert "dialog.ui" in manifest["ui"]
    assert manifest["ui"]["dialog.ui"] == "ui/dialog.ui"
    assert ":/images/resources/open.png" in manifest["resources"]
    assert (dest / "ui" / "dialog.ui").is_file()
    assert (dest / "resources" / "open.png").is_file()


def test_generate_no_product_hardcodes(tmp_path: Path) -> None:
    """The generic generator must not invent product-specific remaps."""
    src = tmp_path / "src"
    (src / "ui").mkdir(parents=True)
    (src / "images").mkdir(parents=True)
    (src / "images" / "document_open.png").write_bytes(b"\x89PNG")
    (src / "ui" / "a.ui").write_text(
        '<ui><widget class="QDialog" name="D">'
        "<property name='i'><iconset><normaloff>:/images/document_open.png</normaloff></iconset></property>"
        "</widget></ui>",
        encoding="utf-8",
    )
    manifest = generate(src, tmp_path / "out", verbose=False)
    # No remap to file_open.png; the real referenced file is resolved as-is.
    assert (
        manifest["resources"][":/images/document_open.png"]
        == "resources/document_open.png"
    )


def test_pack_creates_zip_with_manifest_at_root(tmp_path: Path) -> None:
    src = _make_src_tree(tmp_path / "src")
    bundle = tmp_path / "bundle"
    generate(src, bundle, verbose=False)

    out = pack(bundle, output=tmp_path / "test.quiht.zip", verbose=False)

    assert Path(out).is_file()
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        assert MANIFEST_NAME in names
        assert "ui/dialog.ui" in names
        assert "resources/open.png" in names
        assert zf.testzip() is None


def test_pack_from_src(tmp_path: Path) -> None:
    src = _make_src_tree(tmp_path / "src")
    out = pack(src, output=tmp_path / "fromsrc.quiht.zip", from_src=True, verbose=False)
    with zipfile.ZipFile(out) as zf:
        assert MANIFEST_NAME in zf.namelist()
        assert "ui/dialog.ui" in zf.namelist()


def test_unpack_round_trip(tmp_path: Path) -> None:
    src = _make_src_tree(tmp_path / "src")
    bundle = tmp_path / "bundle"
    manifest = generate(src, bundle, verbose=False)
    archive = pack(bundle, output=tmp_path / "rt.quiht.zip", verbose=False)

    out_dir = tmp_path / "extracted"
    unpack(archive, out_dir, verbose=False)

    extracted_manifest = json.loads(
        (out_dir / MANIFEST_NAME).read_text(encoding="utf-8")
    )
    assert extracted_manifest == manifest
    assert (out_dir / "ui" / "dialog.ui").is_file()
    assert (out_dir / "resources" / "open.png").is_file()


def test_unpack_rejects_non_quiht_zip(tmp_path: Path) -> None:
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("readme.txt", "not a quiht package")
    with pytest.raises(ValueError):
        unpack(bad, tmp_path / "out", verbose=False)


def test_uipack_one_step_from_ui_only(tmp_path: Path) -> None:
    """`uipack` auto-locates assets from just the .ui path and zips them."""
    src = _make_src_tree(tmp_path / "src")
    out = uipack(
        src / "ui" / "dialog.ui", output=tmp_path / "dialog.quiht.zip", verbose=False
    )
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        assert MANIFEST_NAME in names
        assert "ui/dialog.ui" in names
        assert "resources/open.png" in names
        manifest = json.loads(zf.read(MANIFEST_NAME))
        assert (
            manifest["resources"][":/images/resources/open.png"] == "resources/open.png"
        )


def test_uipack_default_output_is_cwd_stem(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without --output, the zip lands at {cwd}/{ui_stem}.quiht.zip."""
    src = _make_src_tree(tmp_path / "src")
    cwd = tmp_path / "run"
    cwd.mkdir()
    monkeypatch.chdir(cwd)
    out = uipack(src / "ui" / "dialog.ui", verbose=False)
    assert Path(out) == cwd / "dialog.quiht.zip"
    assert (cwd / "dialog.quiht.zip").is_file()


@pytest.mark.skipif(not EXAMPLE_DIR.is_dir(), reason="example/ fixture not present")
def test_pack_existing_example_bundle(tmp_path: Path) -> None:
    """Pack the committed example/ bundle as a real-world fixture."""
    out = pack(EXAMPLE_DIR, output=tmp_path / "example.quiht.zip", verbose=False)
    with zipfile.ZipFile(out) as zf:
        assert MANIFEST_NAME in zf.namelist()
        assert any(n.startswith("ui/") for n in zf.namelist())
