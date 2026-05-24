# this_file: quiht-tools/src/quiht_tools/__main__.py
"""Fire CLI entry point for quiht-tools.

Subcommands:
    quiht gen <src> <dest> [--url_prefix=...] [--ui_files="a.ui,b.ui"]
    quiht jsongen ...        # alias of gen
    quiht pack <src> [--output=...] [--name=...] [--from_src]
    quiht unpack <archive> <dest>
    quiht version
"""

from __future__ import annotations

import fire

from quiht_tools import __version__
from quiht_tools.jsongen import generate
from quiht_tools.pack import pack, unpack


def _version() -> str:
    """Print the installed quiht-tools version."""
    return __version__


def main() -> None:
    """Console-script entry point (``quiht``)."""
    fire.Fire(
        {
            "gen": generate,
            "jsongen": generate,
            "pack": pack,
            "unpack": unpack,
            "version": _version,
        }
    )


if __name__ == "__main__":
    main()
