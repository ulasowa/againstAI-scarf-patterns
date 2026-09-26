# Third-party notices

This application bundles the following open-source software. Full licence texts
ship inside each package under `node_modules/<package>/LICENSE`.

Model weights are **not** bundled. They are downloaded at runtime, only after
the user asks, from the source named below.

---

## simplex-noise — MIT

Copyright (c) 2022 Jonas Wagner
<https://github.com/jwagner/simplex-noise.js>

Used for 2D and 4D simplex noise. The 4D function is what makes a genuinely
periodic repeat tile possible.

## image-q — MIT

Copyright (c) 2015-2018 Igor Bezkrovnyi
<https://github.com/ibezkrovnyi/image-quantization>

Used for palette extraction and error-diffusion dithering when converting an
image to a colourwork chart, with its `cie94-textiles` distance formula.

Itself derived from RgbQuant.js, NeuQuant and Wu's quantiser; see the package's
own notices.

## pdf-lib — MIT

Copyright (c) 2019 Andrew Dillon
<https://pdf-lib.js.org/>

Used to write printable knitting documents in the browser. Loaded through a
dynamic import, so it is absent from the initial bundle.

## zod — MIT

Copyright (c) 2020 Colin McDonnell
<https://github.com/colinhacks/zod>

Used to validate imported project files.

## idb-keyval — Apache-2.0

Copyright 2016, Jake Archibald
<https://github.com/jakearchibald/idb-keyval>

Used for local project storage in IndexedDB.

## TensorFlow.js and @tensorflow-models/coco-ssd — Apache-2.0

Copyright 2018 Google LLC
<https://github.com/tensorflow/tfjs>
<https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd>

Used to run person detection locally in the browser.

### COCO-SSD model weights

Downloaded at runtime from `https://storage.googleapis.com/tfjs-models/` and
cached by TensorFlow.js in IndexedDB. Released under Apache-2.0 as part of
tfjs-models; hosted by Google, not redistributed by this project.

The Evaluate tab has a control to clear the cached weights.

## React and React DOM — MIT

Copyright (c) Meta Platforms, Inc. and affiliates
<https://github.com/facebook/react>

---

# Attribution for conventions

## KnitPlot — MIT

Copyright (c) 2026 KnitPlot contributors
<https://github.com/syalr2/knitplot>

No source code from KnitPlot is included in this repository. Its `lib/chart.ts`
and `components/instructions-view.tsx` were inspected, and two domain
conventions were confirmed against them and reimplemented here with tests:

- the gauge formulas (`width = stitches × measure / stitch gauge`; physical cell
  aspect = row gauge / stitch gauge), credited in
  `src/features/knitting/gauge.ts`;
- the row-reading rule (right-side rows are odd and read right to left; rounds
  always read right to left), credited in
  `src/features/knitting/instructions.ts`.

See `docs/reuse-audit.md`.

---

# Cited research

Cited in `docs/research.md`. No code, weights, figures or results from any of
these are included or reproduced here.

- Hu et al., *Adversarial Texture for Fooling Person Detectors in the Physical
  World* — <https://arxiv.org/abs/2203.03373>; implementation (MIT)
  <https://github.com/WhoTHU/Adversarial_Texture>
- Xu et al., *Adversarial T-shirt! Evading Person Detectors in a Physical
  World*, ECCV 2020 —
  <https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123500647.pdf>
- Brown et al., *Adversarial Patch* — <https://arxiv.org/abs/1712.09665>
- Duan et al., *Adversarial Camouflage: Hiding Physical-World Attacks with
  Natural Styles*, CVPR 2020 — implementation publishes **no licence** and is
  therefore not reused:
  <https://github.com/RjDuan/AdvCam-Hide-Adv-with-Natural-Styles>
- Adversarial Robustness Toolbox (MIT), a Python toolkit that does not run in
  the browser — <https://github.com/Trusted-AI/adversarial-robustness-toolbox>

---

# Fonts and analytics

No web fonts are loaded; the interface uses system fonts. There is no analytics
of any kind.

The model download is the only external request this application makes.
