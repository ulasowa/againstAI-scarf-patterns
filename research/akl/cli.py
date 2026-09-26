"""Command line entry point for the bridge.

    python -m akl.cli texture.png --out out/ --stitches 64 --title "My texture"

Converts a texture image into a knitting chart and writes the three artifacts
the browser application can consume. No ML dependencies are required.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from .chart import Gauge, image_to_indices, rows_for_aspect, write_outputs
from .palette import DEFAULT_PALETTE, PaletteEntry


def parse_palette(text: str | None) -> list[PaletteEntry]:
    if not text:
        return DEFAULT_PALETTE
    entries = []
    symbols = ".o/x+=~*#-vc"
    for index, value in enumerate(text.split(",")):
        value = value.strip()
        if not value.startswith("#"):
            value = f"#{value}"
        entries.append(
            PaletteEntry(f"c{index + 1}", value, symbols[index % len(symbols)], f"Colour {index + 1}")
        )
    return entries


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path, help="texture image (PNG, JPEG or WebP)")
    parser.add_argument("--out", type=Path, default=Path("out"), help="output directory")
    parser.add_argument("--stitches", type=int, default=64, help="chart width in stitches")
    parser.add_argument("--rows", type=int, default=0, help="chart height; 0 keeps the aspect")
    parser.add_argument("--title", default="Research texture")
    parser.add_argument("--palette", default=None, help="comma-separated hex colours")
    parser.add_argument("--stitch-gauge", type=float, default=20.0)
    parser.add_argument("--row-gauge", type=float, default=28.0)
    parser.add_argument("--repeat", default=None, help="STITCHESxROWS, e.g. 32x40")
    parser.add_argument("--run-id", default="manual", help="recorded in provenance.json")
    args = parser.parse_args(argv)

    palette = parse_palette(args.palette)
    gauge = Gauge(args.stitch_gauge, args.row_gauge)

    with Image.open(args.image) as image:
        rows = args.rows or rows_for_aspect(args.stitches, image.width, image.height, gauge)
        indices = image_to_indices(image, args.stitches, rows, palette)
        source = {"file": args.image.name, "width": image.width, "height": image.height}

    repeat = None
    if args.repeat:
        width, _, height = args.repeat.partition("x")
        repeat = (int(width), int(height))

    written = write_outputs(
        indices,
        args.out,
        title=args.title,
        palette=palette,
        gauge=gauge,
        repeat=repeat,
        provenance={"run_id": args.run_id, "source_image": source, "optimisation": "none"},
    )
    print(json.dumps({key: str(path) for key, path in written.items()}, indent=2))
    print(
        "\nThis chart carries no measurements. Open it in the browser application "
        "and evaluate it there."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
