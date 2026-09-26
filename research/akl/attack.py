"""Optimisation adapter.

STATUS: written against the documented APIs, NOT executed in this repository.
Nothing here has produced a trained texture, and no effectiveness figure appears
anywhere in this project. See README.md, "What has not been run".

Three things this module refuses to paper over:

1.  **Estimator contracts.** An ART attack is bound to an estimator type. A
    patch attack written against a classifier does not optimise a detector
    because you handed it one. :func:`check_estimator_contract` verifies the
    pairing at runtime and raises rather than producing numbers.

2.  **Naming.** ART contains attacks whose names resemble "adversarial
    texture". They are not an implementation of Hu et al. 2022
    (arXiv:2203.03373). This module does not claim to reproduce that paper.

3.  **Quantisation.** Mapping a texture onto a fixed yarn palette is a hard
    argmax and has no useful gradient. :class:`StraightThroughQuantizer` names
    the relaxation used, and :func:`requantize_and_report` exists because the
    final hard-quantised chart must be re-evaluated whatever the optimiser
    reported.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .palette import PaletteEntry, palette_array, quantize


class EstimatorContractError(RuntimeError):
    """Raised when an attack is paired with an estimator it does not support."""


def check_estimator_contract(attack_class: type, estimator: Any) -> None:
    """Verify that ``estimator`` satisfies ``attack_class._estimator_requirements``.

    ART declares each attack's requirements as a tuple of mixin classes. This
    is the check that catches "classifier attack pointed at a detector" before
    it silently optimises the wrong objective.
    """
    requirements = getattr(attack_class, "_estimator_requirements", None)
    if requirements is None:  # pragma: no cover - depends on the ART version
        raise EstimatorContractError(
            f"{attack_class.__name__} declares no _estimator_requirements; "
            "verify its contract against the ART documentation before using it."
        )
    missing = [r.__name__ for r in requirements if not isinstance(estimator, r)]
    if missing:
        raise EstimatorContractError(
            f"{attack_class.__name__} requires {missing}, which "
            f"{type(estimator).__name__} does not satisfy. This pairing would "
            "optimise a different objective than the one you intend."
        )


@dataclass
class StraightThroughQuantizer:
    """Straight-through estimator for palette quantisation.

    Forward pass: hard nearest-palette-colour assignment.
    Backward pass: identity, i.e. the gradient is passed through unchanged as if
    quantisation were not there.

    This is an **approximation**, it is named here so it can be argued with, and
    it has not been validated in this repository. A straight-through estimator
    is known to bias gradients when the quantisation step is coarse, and a
    four-colour palette is about as coarse as it gets. Treat any optimisation
    result obtained through it as a hypothesis to be re-measured, never as a
    measurement.
    """

    palette: list[PaletteEntry]

    def forward_numpy(self, texture: np.ndarray) -> np.ndarray:
        """Hard quantisation, for the honest evaluation at the end."""
        return quantize(texture, self.palette)

    def forward_torch(self, texture: Any) -> Any:  # pragma: no cover - needs torch
        """Differentiable-in-name-only quantisation for a torch tensor.

        ``texture`` is expected as ``(B, 3, H, W)`` in 0-1.
        """
        import torch

        colors = torch.tensor(
            palette_array(self.palette) / 255.0,
            dtype=texture.dtype,
            device=texture.device,
        )
        flat = texture.permute(0, 2, 3, 1).reshape(-1, 3)
        distance = torch.cdist(flat, colors)
        hard = colors[distance.argmin(dim=1)]
        hard = hard.reshape(texture.shape[0], texture.shape[2], texture.shape[3], 3)
        hard = hard.permute(0, 3, 1, 2)
        # Straight-through: value of `hard`, gradient of `texture`.
        return texture + (hard - texture).detach()


def requantize_and_report(texture: np.ndarray, palette: list[PaletteEntry]) -> dict:
    """Hard-quantise a texture and report how far it moved.

    A large mean shift means the optimiser was exploiting colours the palette
    cannot express, and whatever it achieved probably does not survive the
    chart.
    """
    hard = quantize(texture, palette)
    delta = np.abs(hard.astype(np.int32) - texture.astype(np.int32))
    return {
        "quantized": hard,
        "mean_abs_shift": float(delta.mean()),
        "max_abs_shift": int(delta.max(initial=0)),
        "note": (
            "Measured before and after hard quantisation. The optimiser's own "
            "figures describe the unquantised texture and do not carry over."
        ),
    }
