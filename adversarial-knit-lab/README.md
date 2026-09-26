# Adversarial Knit Lab

A browser studio for designing reproducible two-colour-per-row knitting charts
and measuring them against a computer-vision model you load yourself.

**What it does not do:** no pattern it produces is known to defeat any
computer-vision system. There is no published recipe for one — every result in
the literature comes from optimising a texture against a specific model with
gradients, and a generator cannot inherit that. The pattern families here are
built to the *structural properties* those papers report (high spatial
frequency, multi-scale energy, dense non-closing edges, abrupt transitions,
tileability) so that they are worth measuring. Measuring is what this tool
does. See `docs/research.md`, including the measurements where that structure
did **not** beat ordinary camouflage. Reducing person-detection confidence on some
photographs, with one model, under one set of settings, is a measurement about
that model. It is not evidence about other detectors, and it is not evidence
about face detection or face recognition, which are different tasks.

"Evaluated" means measurements exist. It does not mean the pattern works.

Controls are grouped into sub-tabs so each view fits a screen rather than
running several screen-heights deep; see `docs/ui-audit.md`.

## Two ways in

A **Guided mode** switch sits in the header. It replaces the four-tab interface
with four steps — pick a pattern, choose yarn and size, test it against a
detector, download the knitting document — exposing only the decisions that
change the outcome. Every caveat from the full interface has a plain-language
equivalent there; a guided interface that implied the pattern works would be
worse than a dense one, because the person using it has less to go on.

The preference is remembered per browser. Everything below describes the full
interface.

## The workflow

1. **Generate** — a reproducible pattern from a seed and a handful of shape
   parameters, or an imported image. Set the finished size in centimetres and
   the stitch count follows from your gauge. **Test the pattern on the model
   right there**: no photograph, no annotation — it renders the fabric at three
   scales and reports what the detector claims to see.
2. **Knit** — constrain it to a stitch grid and a yarn palette (seven presets,
   each with checked contrast), edit it, and
   read what it will actually cost to knit: colours per row, float lengths,
   isolated stitches, repeat fit.
3. **Evaluate** — take a frame with the laptop camera or drop in a photograph,
   let the detector mark
   the person and the garment region itself, then compare the chart against
   paired controls. A search can explore and refine candidates against real
   model output.
4. **Export** — printable charts, written colour sequences, images, editable
   project files and reproducible evaluation records.

The Evaluate tab also **optimises**: it edits the stitches against the loaded
detector and keeps a change only when the detector's grip on the target
weakens, rejecting anything that breaks the knitting constraints. That loop is
the transferable part of the published research; the patterns in those papers
are its outputs, not recipes. It works from forward queries alone, which is
weaker than the gradient attacks in the literature, and whether a run achieved
anything is decided by the held-out photographs rather than by the run itself.

## Running it

No backend, no database, no account, no API key — and no particular host.
GitHub Pages is one option, not a requirement.

```bash
cd adversarial-knit-lab
npm ci

npm run dev             # development server
npm run build           # -> dist/, copy it to any static host or folder
npm run build:offline   # -> one 2 MB HTML file you can just double-click
```

**A single file, no server.** `npm run build:offline` produces
`dist-offline/adversarial-knit-lab.html`. Open it from your filesystem: chart
generation, the editor, the bundled examples, PDF export and even model loading
all work from a `file://` page. Verified by a browser test.

**A folder, anywhere.** The build uses a relative base, so the same `dist/`
runs at a domain root, in any subdirectory, and under a GitHub Pages repository
subpath with no configuration. Also tested, by serving the unmodified build
from `/knit/lab/v1/`.

```bash
cd dist && python3 -m http.server 8000   # no Node needed to serve it
```

| Script | Purpose |
|---|---|
| `npm run typecheck` | `tsc -b`, strict |
| `npm run test` | Domain tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run build` | Type check, then build `dist/` |
| `npm run build:offline` | Single self-contained HTML file |
| `npm run build:portable` | Build, then copy into a deep subdirectory for testing |
| `npm run serve` | Serve `dist/` |

Everything except the Evaluate tab works with no internet at all. Full detail,
including the trade-offs of the single-file build, in `docs/deployment.md`.

## GitHub Pages, optionally

`.github/workflows/deploy-knit-lab.yml` type checks, tests, builds both
variants and publishes. It enables Pages itself on the first run and publishes
from `main` or from the `adversarial-knit-lab` branch; every run also uploads
the built site as a downloadable artifact, so the build is usable without Pages
at all.

Details, including the other three ways to run this without any host, are in
`docs/deployment.md`.

## What is honest about the measurements

- Four conditions are measured together: the original photograph, a
  solid-colour overlay, a **random control pattern** with the same palette and
  colour histogram, and the chart-derived pattern. The controls exist so you can
  tell "this pattern did something" apart from "the garment was covered" and
  "any busy texture does this".
- The detector never sees chart gridlines, row numbers or palette symbols. The
  evaluation renderer's options type cannot express them.
- A detection below the reporting threshold is **not detected at threshold**,
  never "zero confidence".
- A failed inference is **excluded**, never counted as a miss.
- A conditional miss rate with an empty denominator reads **N/A**, never 0% or
  100%.
- Scores from different models are never pooled, and there is no aggregate "AI
  confusion score".
- Every record stores the content hash of the chart it measured. Edit one
  stitch, one palette colour, the gauge or the repeat, and the record becomes
  visibly **stale**: kept in history, never shown as current.

`docs/evaluation.md` has the full methodology.

## Privacy

Imported photographs and charts stay in your browser. They are never uploaded.
Photographs are only written into an exported project file if you explicitly ask
for that.

The model download from `storage.googleapis.com` is the only external request
this application makes, and it happens only after you press the button. No
analytics, no web fonts.

## Model

COCO-SSD (`lite_mobilenet_v2`, 17.7 MB measured, or `mobilenet_v2`, 64.6 MB)
via TensorFlow.js, WebGL with a CPU fallback. Every artifact URL, licence,
input resolution, normalisation, resize behaviour, output layout, class mapping
and NMS behaviour is recorded in `public/model-manifest.json` — and a test
checks that file against the adapters, so it cannot quietly drift.

ONNX Runtime Web is deliberately not shipped. See `docs/reuse-audit.md`.

## Documentation

| Document | Contents |
|---|---|
| `docs/research.md` | Sources read, what was taken, what was not |
| `docs/reuse-audit.md` | Every dependency considered, with licences and reasons |
| `docs/evaluation.md` | Measurement methodology and metric definitions |
| `docs/knitting.md` | Conventions, float definitions and limitations |
| `docs/deployment.md` | Local setup and GitHub Pages |
| `docs/exports.md` | Every export format |
| `docs/ui-audit.md` | Accessibility and interface audit: method, findings, fixes |
| `docs/verification.md` | Every check actually run, every defect it caught, and what is unverified |
| `research/README.md` | Optional Python companion, and what has not been run |

## Layout

```
src/
  components/     canvas editor, annotator, palette, shared controls
  features/
    generator/    pattern families, seeded generation, presets
    chart/        stitch grid, regions, history, image import
    knitting/     gauge, analysis, instructions, repairs
    preview/      canvas renderers
    evaluation/   model adapters, overlay, transforms, metrics, run
    search/       bounded candidate search
    export/       PNG, SVG, PDF, project and measurement files
  lib/            rng, noise, colour, hashing, storage, base path
  schemas/        project file validation
  state/          project store
  examples/       five complete example projects, bundled rather than fetched
public/
  model-manifest.json
e2e/              browser tests
docs/             documentation
```

Mathematical and knitting-domain functions are independent of React.

## Licence

MIT. Third-party notices in `THIRD-PARTY-NOTICES.md`.
