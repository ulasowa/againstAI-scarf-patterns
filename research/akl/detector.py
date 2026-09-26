"""Detector adapter.

Deliberately thin: the point is to pin down *which* detector and *which*
weights, because an attack result without that is not a result.

This module imports torch and torchvision lazily, so the bridge in
``akl.chart`` keeps working on a machine that has neither.

STATUS: written against the documented APIs, NOT executed in this repository.
See README.md, "What has not been run".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DetectorSpec:
    """Everything a result has to be reported alongside."""

    id: str
    family: str
    weights_enum: str
    weights_source: str
    input_normalization: str
    channel_order: str
    resize_behavior: str
    person_class_index: int
    license: str


# torchvision's COCO weights are the most traceable option: the enum names a
# specific checkpoint, and torchvision publishes the exact preprocessing
# transform alongside it, so nothing has to be guessed.
FASTER_RCNN = DetectorSpec(
    id="torchvision/fasterrcnn_resnet50_fpn_v2",
    family="Faster R-CNN ResNet50 FPN v2",
    weights_enum="FasterRCNN_ResNet50_FPN_V2_Weights.COCO_V1",
    weights_source="https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_v2_coco-dd69338a.pth",
    input_normalization="float [0,1]; the model applies its own mean/std internally",
    channel_order="RGB",
    resize_behavior="GeneralizedRCNNTransform resizes the shorter side to 800, longer side capped at 1333",
    person_class_index=1,  # COCO category 1 in torchvision's 91-class mapping
    license="BSD-3-Clause (torchvision); weights released under the same terms",
)


def load_detector(spec: DetectorSpec = FASTER_RCNN, device: str = "cuda") -> Any:
    """Load the detector described by ``spec``.

    Raises:
        ImportError: if torchvision is not installed. This is not a soft
            failure: a missing detector must never be mistaken for a detector
            that found nothing.
    """
    try:
        import torch
        from torchvision.models import detection
    except ImportError as error:  # pragma: no cover - depends on the environment
        raise ImportError(
            "torch and torchvision are required for the optimisation layer. "
            "Install them with: pip install -r requirements.txt -r requirements-optim.txt"
        ) from error

    if spec is not FASTER_RCNN:  # pragma: no cover
        raise NotImplementedError(f"No loader registered for {spec.id}")

    weights = detection.FasterRCNN_ResNet50_FPN_V2_Weights.COCO_V1
    model = detection.fasterrcnn_resnet50_fpn_v2(weights=weights)
    model.eval()
    return model.to(torch.device(device))
