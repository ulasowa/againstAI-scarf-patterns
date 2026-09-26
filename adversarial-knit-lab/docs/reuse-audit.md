# Reuse audit

Every third-party option considered before writing code, what was inspected, and
why it was taken or left. Inspected on 2026-09-25.

Licences were read from each project's own repository or npm metadata on that
date. Where a repository publishes no licence file, that is recorded as such
rather than assumed.

## Decisions

| Component | Candidate | Source | Version / commit inspected | Licence | Browser | Decision | Reason | Attribution |
|---|---|---|---|---|---|---|---|---|
| Colour quantisation | image-q | https://github.com/ibezkrovnyi/image-quantization | npm `image-q@4.0.0` (published 2022-01-08) | MIT (declared in npm metadata and the README; the repository root has no LICENSE file) | Yes, ESM with types | **Reuse** | Mature palette extraction with a textile-weighted distance formula (`cie94-textiles`), exactly the hard part of image-to-yarn conversion. Reimplementing Wu quantisation would be worse and slower. | MIT notice in THIRD-PARTY-NOTICES.md |
| Procedural noise | simplex-noise | https://github.com/jwagner/simplex-noise.js | npm `simplex-noise@4.0.3` | MIT | Yes, ESM, no dependencies | **Reuse** | Provides seedable 2D and 4D simplex noise. The 4D function is what makes a genuinely periodic tile possible (see `src/lib/noise.ts`). | MIT notice |
| PDF generation | pdf-lib | https://pdf-lib.js.org/ | npm `pdf-lib@1.17.1` | MIT | Yes | **Reuse** | Writes real PDFs in the browser with no server. Loaded through a dynamic import so it stays out of the initial bundle. | MIT notice |
| Browser detection | @tensorflow-models/coco-ssd + @tensorflow/tfjs | https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd | npm `2.2.3` / `4.22.0` | Apache-2.0 (weights hosted by Google on storage.googleapis.com) | Yes, WebGL with a CPU fallback | **Reuse** | The only browser person-detector we could verify end to end: published weights, documented preprocessing, package-side NMS and class mapping. Used as a labelled baseline, not as a stand-in for detectors in general. | Apache-2.0 notice |
| Schema validation | zod | https://github.com/colinhacks/zod | npm `zod@4.6.5` | MIT | Yes | **Reuse** | Project files are untrusted input. Hand-written validation for this many fields would be longer and less careful. | MIT notice |
| IndexedDB access | idb-keyval | https://github.com/jakearchibald/idb-keyval | npm `idb-keyval@6.3.0` | Apache-2.0 | Yes | **Reuse** | ~600 bytes over the raw IndexedDB API. Writing a promise wrapper by hand is the kind of reinvention this audit exists to prevent. | Apache-2.0 notice |
| Colourwork chart editor | KnitPlot | https://github.com/syalr2/knitplot | `HEAD` at 2026-09-01 (`lib/chart.ts`, `components/instructions-view.tsx`) | MIT | Application, not a package | **Partial reuse: conventions only** | The repository is a Next.js application coupled to Clerk auth, a Neon Postgres database and a hosted OpenAI integration; `package.json` lists `@clerk/nextjs`, `@neondatabase/serverless` and `server-only`. There is no publishable module to import, and importing those dependencies into a static site is exactly the failure mode the brief warns about. Its `lib/chart.ts` is framework-free but organised around *shaping* symbols (k2tog, M1L, no-stitch) with a top-origin grid, whereas this project's grid is bottom-origin palette indices for colourwork. What was reused is its treatment of two domain conventions, reimplemented rather than copied: the gauge formulas (`width = stitches × measure / stitch gauge`, cell aspect = row gauge / stitch gauge) and the row-reading rule (`rightSide = number % 2 === 1`, read right-to-left on right-side rows and in the round). No source lines were copied. | Credited in `src/features/knitting/gauge.ts` and here |
| Chart editor | Amidz | https://github.com/kikuomax/amidz | `HEAD` at 2022-12-30 | MIT | Vue 2 + Vuex application | **Rejected** | Vue 2 with a Vuex store and SVG symbol registry; last pushed in 2022. Porting its components to React would cost more than the chart canvas in `src/components/ChartCanvas.tsx`, and its model is stitch symbols rather than colourwork. Nothing extracted. | n/a |
| Machine knitting | knitout-frontend-js and friends | https://github.com/textiles-lab/knitout-frontend-js | `HEAD` at 2024-10-14 | MIT | Yes | **Rejected for now** | knitout describes machine instructions: carriers, needle beds, cast-on and cast-off strategies. A colourwork chart is not any of those, and emitting knitout from a pixel grid would produce a file that looks machine-ready and is not. Deliberately not shipped rather than shipped as a misleading button. See docs/knitting.md. | n/a |
| Repeating adversarial texture | Adversarial_Texture | https://github.com/WhoTHU/Adversarial_Texture | `HEAD` at 2026-06-29 | MIT | No — PyTorch training code | **Not integrated into the web app** | Its published results belong to its models and conditions. Its expandable-texture idea informs the repeat-tile family; none of its code or weights is used, and none of its numbers are reproduced here. Referenced in docs/research.md and research/README.md. | Cited |
| Natural-style camouflage | AdvCam | https://github.com/RjDuan/AdvCam-Hide-Adv-with-Natural-Styles | `HEAD` at 2023-03-24 | **No licence file published** | No — TensorFlow 1.x research code | **Rejected** | The repository publishes no licence, so the code cannot be reused. Used only as a cited reference for texture aesthetics. | Cited only |
| Attack toolkit | Adversarial Robustness Toolbox | https://github.com/Trusted-AI/adversarial-robustness-toolbox | `HEAD` at 2025-12-12 | MIT | No — Python | **Out of the web app, noted for the research companion** | ART is a Python library; it cannot run in the browser. Its attacks are also estimator-specific: a classifier-oriented patch API does not optimise a detector, and its similarly named texture attacks are not R1. See research/README.md. | Cited |
| ONNX Runtime Web | onnxruntime-web | https://onnxruntime.ai/docs/tutorials/web/ | not installed | MIT | Yes | **Rejected for this release** | Adding a second inference runtime is only worth its bundle cost once there is a verified artifact behind it: licence, input layout, normalisation, resize behaviour and an output decoder we have actually tested. Without that, "load any ONNX model" produces confident numbers that mean nothing. The `ModelAdapter` interface in `src/features/evaluation/adapter.ts` is the seam where it would go. | n/a |
| Optimiser library | (various JS optimisers) | — | — | — | — | **Rejected** | The search is a bounded random search over generator parameters with a documented objective. An optimisation framework adds a dependency without changing what the search can do, because inference gives no gradients. | n/a |

## Code adapted from upstream

None. No third-party source file was copied or modified into this repository.
The KnitPlot entry above is a conventions credit, not an extraction; the
formulas it names are standard chart arithmetic, reimplemented here with tests.

## Assets

No third-party pattern assets, texture assets or paper figures are bundled.
Imported images stay in the user's browser and are the user's responsibility to
license. The interface says so at the import control.
