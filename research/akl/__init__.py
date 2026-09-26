"""Adversarial Knit Lab research companion.

Two layers, deliberately separate:

``akl.chart``
    Converts between a texture image and the browser application's project
    format. Pure numpy and Pillow, no ML dependencies, and covered by tests
    that run anywhere.

``akl.detector`` / ``akl.attack``
    Adapters for running a detector and a detector attack. These need PyTorch
    and the Adversarial Robustness Toolbox, and are documented as unverified:
    see ``README.md``.

Nothing here is needed by the deployed website. The site is static and works on
its own.
"""

__version__ = "0.1.0"
