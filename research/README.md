# Research companion

An optional local pathway for heavier optimisation. **The deployed website does
not need any of this.** The site is static and works on its own; nothing here
runs on GitHub Pages, and no Python training server is involved.

Two layers, kept apart on purpose.

## Layer 1 — the bridge (verified, runs anywhere)

Converts between a texture image and the browser application's project format,
with no ML dependencies.

```bash
cd research
python -m pip install -r requirements.txt
python -m akl.cli my-texture.png --out out/run1 --stitches 64 --repeat 32x40 \
    --title "Optimised texture" --run-id run1
```

Writes three artifacts:

| File | Contents |
|---|---|
| `texture.png` | The chart rendered back to an image, palette colours only. |
| `project.json` | An `adversarial-knit-lab.project` v1 file. Open it in the Export tab. |
| `provenance.json` | Run id, source image, palette, chart SHA-256, and an explicit statement that the chart carries no measurements. |

The written project always has `evaluations: []`. Whatever an optimiser
reported was measured on a **different model**, in a different renderer, and
**before hard quantisation**. It does not describe the chart. Re-evaluate in the
browser.

**Status: verified.** `python -m pytest tests/ -q` passes (17 tests), covering
run-length round-tripping, the documented gauge regression case, bottom-origin
conversion, palette quantisation, schema shape and the artifact writer. The
browser application has a matching test
(`src/features/export/pythonBridge.test.ts`) that imports a fixture produced by
this CLI, so a drift on either side fails a test rather than a user's import.

## Layer 2 — optimisation (written, NOT run)

```bash
# On a machine with a CUDA GPU:
python -m pip install -r requirements.txt -r requirements-optim.txt
```

### Detector

`akl/detector.py` pins torchvision's Faster R-CNN ResNet50 FPN v2 with
`FasterRCNN_ResNet50_FPN_V2_Weights.COCO_V1`. torchvision was chosen because
the weights enum names a specific checkpoint and the preprocessing transform is
published alongside it, so nothing about normalisation, resize behaviour or
class mapping has to be guessed.

If torch is missing, `load_detector` raises. It does not fall back to anything.
A missing detector must never be mistaken for a detector that found nothing.

### Attacks, and the three traps

`akl/attack.py` exists mostly to refuse to paper over three things.

**1. Estimator contracts.** ART binds each attack to an estimator type. A patch
attack written against a *classifier* does not optimise a *detector* because you
handed it one — it optimises a different objective and returns numbers anyway.
`check_estimator_contract()` reads the attack's own
`_estimator_requirements` and raises before anything runs. Tested with fakes, so
the guard is verified even without ART installed.

**2. Naming.** ART contains attacks whose names resemble "adversarial texture".
They are **not** an implementation of Hu et al. 2022 (arXiv:2203.03373).
Nothing here claims to reproduce that paper. If you want R1, use
<https://github.com/WhoTHU/Adversarial_Texture> (MIT) directly, and budget for
its older environment.

**3. Quantisation.** Mapping a texture onto a fixed yarn palette is a hard
argmax with no useful gradient. `StraightThroughQuantizer` names the relaxation
— straight-through estimator, forward hard, backward identity — and says
plainly that it is **not validated here**. A straight-through estimator biases
gradients when the quantisation step is coarse, and a four-colour palette is
about as coarse as it gets.

`requantize_and_report()` exists because the final hard-quantised chart must be
re-evaluated whatever the optimiser reported. It returns the mean and maximum
shift: a large shift means the optimiser was exploiting colours the palette
cannot express, and whatever it achieved probably does not survive the chart.

### Smoke configuration

`configs/smoke.yaml` is sized so a first run finishes in minutes and a mistake
is cheap: 32 × 40 stitches, 20 steps, batch of 2. It proves the wiring, not the
method.

Compute: one CUDA GPU with at least 8 GB of VRAM, roughly 250 MB of disk for
the torch weights. Runtime for anything larger is **unmeasured**, because it has
not been run.

You supply your own photographs. None are committed here.

## What has not been run

Stated plainly, because the difference matters:

- **Never executed in this repository:** torch, torchvision or ART were never
  installed; no detector was loaded; no attack was constructed; no optimisation
  step was taken; `configs/smoke.yaml` has never been run.
- **No trained checkpoint exists.** None is committed, and none is referenced.
- **No effectiveness figure appears anywhere in this project.** Not in this
  directory, not in the web application, not in the docs.
- Layer 2 is written against the documented APIs of torchvision and ART as of
  2026-09-25. It is an adapter awaiting verification, not a working experiment.

The bridge (layer 1) and the contract guard **are** tested and do run. The
division above is the point of keeping the two layers separate.

## Layout

```
research/
  README.md
  requirements.txt          bridge only, no ML dependencies
  requirements-optim.txt    GPU layer, not installed here
  akl/
    palette.py              yarn palettes and quantisation
    chart.py                texture <-> project.json bridge
    cli.py                  python -m akl.cli
    detector.py             detector spec and loader (unverified)
    attack.py               estimator guard, quantiser, re-evaluation (unverified)
  configs/smoke.yaml
  tests/                    17 tests, all passing
```
