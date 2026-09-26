"""Yarn palettes.

A palette is a small, fixed list of colours you can actually buy. That is the
constraint the whole pipeline exists to respect: an optimised texture that needs
40,000 colours is not a knitting chart.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class PaletteEntry:
    """One yarn. ``hex`` is a display approximation, never a yarn match."""

    id: str
    hex: str
    symbol: str
    name: str

    @property
    def rgb(self) -> tuple[int, int, int]:
        value = self.hex.lstrip("#")
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


DEFAULT_PALETTE: list[PaletteEntry] = [
    PaletteEntry("c1", "#1b1d1c", ".", "Charcoal"),
    PaletteEntry("c2", "#e8e3d6", "o", "Undyed"),
    PaletteEntry("c3", "#7d7f6f", "/", "Lichen"),
    PaletteEntry("c4", "#b4522f", "x", "Madder"),
]


def palette_array(palette: list[PaletteEntry]) -> np.ndarray:
    """Palette as an (n, 3) float array."""
    return np.array([entry.rgb for entry in palette], dtype=np.float64)


def nearest_indices(pixels: np.ndarray, palette: list[PaletteEntry]) -> np.ndarray:
    """Map RGB pixels to palette indices.

    Uses the same "redmean" weighting as the browser application, so a texture
    quantised here lands on the same colours it would land on there.

    Args:
        pixels: ``(..., 3)`` array of RGB values in 0-255.
        palette: target yarns.

    Returns:
        Integer array of palette indices with the leading shape of ``pixels``.
    """
    colors = palette_array(palette)
    flat = pixels.reshape(-1, 3).astype(np.float64)

    # redmean: cheap perceptual weighting, no colour-space conversion needed.
    rmean = (flat[:, None, 0] + colors[None, :, 0]) / 2.0
    delta = flat[:, None, :] - colors[None, :, :]
    distance = (
        ((512 + rmean) * delta[:, :, 0] ** 2) / 256
        + 4 * delta[:, :, 1] ** 2
        + ((767 - rmean) * delta[:, :, 2] ** 2) / 256
    )
    return np.argmin(distance, axis=1).reshape(pixels.shape[:-1])


def quantize(pixels: np.ndarray, palette: list[PaletteEntry]) -> np.ndarray:
    """Hard-quantise pixels to the palette, returning RGB.

    This operation is **not differentiable**. Any gradient-based optimisation
    that wants to work through it needs a named, documented and validated
    relaxation, and the final hard-quantised result must be re-evaluated
    regardless. See ``akl/attack.py``.
    """
    indices = nearest_indices(pixels, palette)
    return palette_array(palette)[indices].astype(np.uint8)
