"""Texture image <-> knitting chart bridge.

Writes the same project format the browser application reads
(``adversarial-knit-lab.project``, schema version 1), so an optimised texture
can be opened in the editor, checked against the knitting analysis, and
exported as a chart.

Coordinate convention, matching the application:
    internal row 0 is the BOTTOM chart row; image row 0 is the top.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .palette import DEFAULT_PALETTE, PaletteEntry, nearest_indices, palette_array

SCHEMA_VERSION = 1
PROJECT_FORMAT = "adversarial-knit-lab.project"
GENERATOR_FAMILY = "imported-image"


@dataclass(frozen=True)
class Gauge:
    stitches_per_10cm: float = 20.0
    rows_per_10cm: float = 28.0

    @property
    def cell_aspect(self) -> float:
        """Physical cell width / height = row gauge / stitch gauge."""
        return self.rows_per_10cm / self.stitches_per_10cm


def encode_cells(indices: np.ndarray) -> str:
    """Run-length encode palette indices in internal order (bottom row first)."""
    flat = np.asarray(indices, dtype=np.int64).reshape(-1)
    if flat.size == 0:
        return ""
    # Boundaries where the value changes.
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate(([0], change))
    lengths = np.diff(np.concatenate((starts, [flat.size])))
    return ".".join(
        f"{value}" if length == 1 else f"{value}x{length}"
        for value, length in zip(flat[starts].tolist(), lengths.tolist())
    )


def decode_cells(encoded: str, stitches: int, rows: int) -> np.ndarray:
    """Inverse of :func:`encode_cells`."""
    cells = np.zeros(stitches * rows, dtype=np.uint8)
    if not encoded:
        return cells.reshape(rows, stitches)
    at = 0
    for token in encoded.split("."):
        value_text, _, run_text = token.partition("x")
        value = int(value_text)
        run = int(run_text) if run_text else 1
        if run < 1:
            raise ValueError(f"Invalid run length in stitch data: {token}")
        if at + run > cells.size:
            raise ValueError("Stitch data is longer than the declared chart")
        cells[at : at + run] = value
        at += run
    if at != cells.size:
        raise ValueError("Stitch data is shorter than the declared chart")
    return cells.reshape(rows, stitches)


def rows_for_aspect(stitches: int, width: int, height: int, gauge: Gauge) -> int:
    """Row count that keeps an image's proportions at a given gauge."""
    if width <= 0 or height <= 0:
        return stitches
    return max(1, round(stitches * (height / width) * gauge.cell_aspect))


def image_to_indices(
    image: Image.Image,
    stitches: int,
    rows: int,
    palette: list[PaletteEntry],
) -> np.ndarray:
    """Resample an image to the stitch grid and quantise it to the palette.

    Returns an ``(rows, stitches)`` array in **internal** order: index 0 is the
    bottom chart row.
    """
    resampled = image.convert("RGB").resize((stitches, rows), Image.LANCZOS)
    pixels = np.asarray(resampled, dtype=np.uint8)
    indices = nearest_indices(pixels, palette)
    # Image row 0 is the top; internal row 0 is the bottom.
    return np.flipud(indices).astype(np.uint8)


def indices_to_image(indices: np.ndarray, palette: list[PaletteEntry]) -> Image.Image:
    """Render internal-order palette indices back to an RGB image (top-origin)."""
    colors = palette_array(palette).astype(np.uint8)
    top_origin = np.flipud(np.asarray(indices))
    return Image.fromarray(colors[top_origin], mode="RGB")


def build_project(
    indices: np.ndarray,
    *,
    title: str,
    palette: list[PaletteEntry] | None = None,
    gauge: Gauge | None = None,
    repeat: tuple[int, int] | None = None,
    working_method: str = "flat-stranded",
    provenance: dict | None = None,
) -> dict:
    """Build a project dictionary the browser application can import."""
    palette = palette or DEFAULT_PALETTE
    gauge = gauge or Gauge()
    rows, stitches = indices.shape
    repeat_stitches, repeat_rows = repeat or (stitches, rows)

    if int(indices.max(initial=0)) >= len(palette):
        raise ValueError("Chart refers to a palette colour that does not exist")

    timestamp = "1970-01-01T00:00:00.000Z"
    project = {
        "id": f"research_{_hash(indices.tobytes())[:12]}",
        "title": title,
        "createdAt": timestamp,
        "modifiedAt": timestamp,
        "generator": {
            "family": GENERATOR_FAMILY,
            "version": "research-1.0.0",
            "seed": 0,
            "params": {
                "featureSize": 8,
                "detailBalance": 0.5,
                "contrast": 0.5,
                "density": 0.5,
                "warp": 0.0,
                "symmetry": 0.0,
                "minRegion": 0,
                "tileRepeat": repeat is not None,
                "variant": "imported",
            },
        },
        "grid": {
            "stitches": int(stitches),
            "rows": int(rows),
            "encoding": "rle-v1",
            "cells": encode_cells(indices),
        },
        "palette": [
            {"id": e.id, "hex": e.hex, "symbol": e.symbol, "name": e.name} for e in palette
        ],
        "gauge": {
            "stitchesPer10cm": gauge.stitches_per_10cm,
            "rowsPer10cm": gauge.rows_per_10cm,
        },
        "workingMethod": working_method,
        "repeat": {"stitches": int(repeat_stitches), "rows": int(repeat_rows)},
        "analysisOptions": {
            "longFloatThreshold": 7,
            "isolatedRegionThreshold": 2,
            "maxColorsPerRow": 2,
        },
        # No evaluations: whatever this texture scored during optimisation was
        # measured on a different model, in a different renderer, before hard
        # quantisation. Carrying those numbers over would be a fabrication.
        "evaluations": [],
    }
    if provenance is not None:
        project["placement"] = {
            "note": "Produced by the research companion. See the provenance file.",
            "region": provenance.get("run_id", "research"),
        }
    return {"format": PROJECT_FORMAT, "schemaVersion": SCHEMA_VERSION, "project": project}


def write_outputs(
    indices: np.ndarray,
    out_dir: Path,
    *,
    title: str,
    palette: list[PaletteEntry] | None = None,
    gauge: Gauge | None = None,
    repeat: tuple[int, int] | None = None,
    provenance: dict | None = None,
) -> dict[str, Path]:
    """Write the three artifacts: PNG texture, project JSON, provenance JSON."""
    palette = palette or DEFAULT_PALETTE
    out_dir.mkdir(parents=True, exist_ok=True)

    png_path = out_dir / "texture.png"
    indices_to_image(indices, palette).save(png_path)

    project = build_project(
        indices,
        title=title,
        palette=palette,
        gauge=gauge,
        repeat=repeat,
        provenance=provenance,
    )
    project_path = out_dir / "project.json"
    project_path.write_text(json.dumps(project, indent=2) + "\n", encoding="utf-8")

    record = dict(provenance or {})
    record.update(
        {
            "tool": "adversarial-knit-lab research companion",
            "stitches": int(indices.shape[1]),
            "rows": int(indices.shape[0]),
            "palette": [e.hex for e in palette],
            "chart_sha256": _hash(indices.tobytes()),
            "claim": (
                "This chart was produced by the research companion. It carries no "
                "measurements. Any figure obtained during optimisation was measured on a "
                "different model and before hard quantisation, and does not describe this "
                "chart. Re-evaluate it in the browser application."
            ),
        }
    )
    provenance_path = out_dir / "provenance.json"
    provenance_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    return {"texture": png_path, "project": project_path, "provenance": provenance_path}


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
