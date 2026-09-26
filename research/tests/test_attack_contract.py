"""The estimator-contract guard is testable without ART installed."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from akl.attack import (  # noqa: E402
    EstimatorContractError,
    StraightThroughQuantizer,
    check_estimator_contract,
    requantize_and_report,
)
from akl.palette import DEFAULT_PALETTE  # noqa: E402


class ClassifierMixin:
    pass


class DetectorMixin:
    pass


class ClassifierAttack:
    _estimator_requirements = (ClassifierMixin,)


class DetectorAttack:
    _estimator_requirements = (DetectorMixin,)


class UndeclaredAttack:
    pass


class Detector(DetectorMixin):
    pass


def test_accepts_a_matching_pairing():
    check_estimator_contract(DetectorAttack, Detector())


def test_rejects_a_classifier_attack_pointed_at_a_detector():
    with pytest.raises(EstimatorContractError, match="ClassifierMixin"):
        check_estimator_contract(ClassifierAttack, Detector())


def test_rejects_an_attack_that_declares_no_contract():
    with pytest.raises(EstimatorContractError, match="no _estimator_requirements"):
        check_estimator_contract(UndeclaredAttack, Detector())


def test_hard_quantisation_reports_how_far_the_texture_moved():
    texture = np.full((4, 4, 3), 128, dtype=np.uint8)
    report = requantize_and_report(texture, DEFAULT_PALETTE)
    assert report["mean_abs_shift"] > 0
    assert report["quantized"].shape == texture.shape
    # Mid grey is not in the palette, so something must have moved.
    assert report["max_abs_shift"] > 0


def test_quantiser_forward_uses_palette_colours_only():
    quantiser = StraightThroughQuantizer(DEFAULT_PALETTE)
    rng = np.random.default_rng(1)
    texture = rng.integers(0, 256, size=(5, 5, 3), dtype=np.uint8)
    out = quantiser.forward_numpy(texture)
    allowed = {entry.rgb for entry in DEFAULT_PALETTE}
    assert {tuple(int(c) for c in p) for p in out.reshape(-1, 3)} <= allowed
