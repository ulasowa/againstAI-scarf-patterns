"""Tests for the bridge layer. These run without torch or ART."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from akl.chart import (  # noqa: E402
    Gauge,
    build_project,
    decode_cells,
    encode_cells,
    image_to_indices,
    indices_to_image,
    rows_for_aspect,
    write_outputs,
)
from akl.palette import DEFAULT_PALETTE, nearest_indices, quantize  # noqa: E402


def test_run_length_round_trip():
    rng = np.random.default_rng(7)
    indices = rng.integers(0, 4, size=(11, 17), dtype=np.uint8)
    encoded = encode_cells(indices)
    assert np.array_equal(decode_cells(encoded, 17, 11), indices)


def test_run_length_is_compact_for_flat_charts():
    indices = np.full((40, 40), 2, dtype=np.uint8)
    assert encode_cells(indices) == "2x1600"


def test_decode_rejects_wrong_length():
    with pytest.raises(ValueError, match="shorter"):
        decode_cells("0x5", 4, 4)
    with pytest.raises(ValueError, match="longer"):
        decode_cells("0x40", 4, 4)


def test_gauge_matches_the_documented_regression_case():
    gauge = Gauge(20.0, 28.0)
    # 100 stitches at 20/10 cm = 50 cm; 140 rows at 28/10 cm = 50 cm.
    assert 100 * 10 / gauge.stitches_per_10cm == pytest.approx(50.0)
    assert 140 * 10 / gauge.rows_per_10cm == pytest.approx(50.0)
    assert gauge.cell_aspect == pytest.approx(1.4)


def test_rows_for_aspect_accounts_for_the_cell_shape():
    gauge = Gauge(20.0, 28.0)
    # A square image needs more rows than stitches, because rows are shorter.
    assert rows_for_aspect(64, 100, 100, gauge) == round(64 * 1.4)


def test_quantisation_maps_onto_the_palette_only():
    rng = np.random.default_rng(3)
    pixels = rng.integers(0, 256, size=(8, 8, 3), dtype=np.uint8)
    quantised = quantize(pixels, DEFAULT_PALETTE)
    allowed = {entry.rgb for entry in DEFAULT_PALETTE}
    produced = {tuple(int(c) for c in pixel) for pixel in quantised.reshape(-1, 3)}
    assert produced <= allowed


def test_exact_palette_colours_map_to_themselves():
    for index, entry in enumerate(DEFAULT_PALETTE):
        pixel = np.array([[list(entry.rgb)]], dtype=np.uint8)
        assert int(nearest_indices(pixel, DEFAULT_PALETTE)[0, 0]) == index


def test_image_conversion_is_bottom_origin():
    # Top half white, bottom half black.
    pixels = np.zeros((4, 2, 3), dtype=np.uint8)
    pixels[:2] = 255
    image = Image.fromarray(pixels, mode="RGB")
    indices = image_to_indices(image, 2, 4, DEFAULT_PALETTE)

    # Internal row 0 is the BOTTOM of the image, which is black -> Charcoal (0).
    assert int(indices[0, 0]) == 0
    # Internal row 3 is the top, which is white -> Undyed (1).
    assert int(indices[3, 0]) == 1


def test_image_round_trip_through_indices():
    pixels = np.zeros((6, 4, 3), dtype=np.uint8)
    pixels[:3] = 255
    image = Image.fromarray(pixels, mode="RGB")
    indices = image_to_indices(image, 4, 6, DEFAULT_PALETTE)
    restored = np.asarray(indices_to_image(indices, DEFAULT_PALETTE))
    assert restored.shape == (6, 4, 3)
    # Top of the restored image is the palette colour nearest white.
    assert tuple(restored[0, 0]) == DEFAULT_PALETTE[1].rgb


def test_project_matches_the_application_schema():
    indices = np.array([[0, 1], [2, 3]], dtype=np.uint8)
    project = build_project(indices, title="Test")

    assert project["format"] == "adversarial-knit-lab.project"
    assert project["schemaVersion"] == 1
    grid = project["project"]["grid"]
    assert grid["encoding"] == "rle-v1"
    assert grid["stitches"] == 2 and grid["rows"] == 2
    assert np.array_equal(decode_cells(grid["cells"], 2, 2), indices)
    # A texture from the research companion carries no measurements.
    assert project["project"]["evaluations"] == []


def test_project_rejects_an_index_outside_the_palette():
    indices = np.array([[0, 9]], dtype=np.uint8)
    with pytest.raises(ValueError, match="does not exist"):
        build_project(indices, title="Broken")


def test_write_outputs_produces_all_three_artifacts(tmp_path):
    indices = np.array([[0, 1, 2], [3, 0, 1]], dtype=np.uint8)
    written = write_outputs(
        indices, tmp_path, title="Run", provenance={"run_id": "smoke"}
    )
    assert set(written) == {"texture", "project", "provenance"}
    for path in written.values():
        assert path.exists() and path.stat().st_size > 0

    provenance = json.loads(written["provenance"].read_text())
    assert provenance["run_id"] == "smoke"
    assert "carries no measurements" in provenance["claim"]
    assert len(provenance["chart_sha256"]) == 64
