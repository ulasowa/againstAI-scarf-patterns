# Record of checks actually run

Everything below was executed on 2026-09-25 on macOS 14.6 (arm64), Node v24.4.0,
Chromium 1243 via Playwright 1.63.0. Nothing in this file is a plan or an
expectation.

## Passing

| Check | Command | Result |
|---|---|---|
| Type checking | `npm run typecheck` (`tsc -b`, strict, `noUncheckedIndexedAccess`) | clean |
| Domain tests | `npm run test` | **153 passed**, 21 files; run six consecutive times to check for flakiness |
| Browser tests | `npm run test:e2e` | **40 passed** (39 desktop, 1 mobile), including 17 accessibility, keyboard and layout tests |
| Production build | `npm run build` | succeeds; tfjs, pdf-lib and image-q in separate lazy chunks |
| Portable build | `npm run build:portable` | succeeds; the unmodified `dist/` was served from `/knit/lab/v1/` and passed |
| Offline single file | `npm run build:offline` | succeeds; 2.0 MB, opened over `file://` and passed |
| Python bridge | `python -m pytest research/tests -q` | **17 passed** |

### Real model inference

`e2e/evaluation.spec.ts › real model inference` is the only test that touches
the network. It was **executed and passed**, not skipped:

- COCO-SSD `lite_mobilenet_v2` was downloaded from
  `https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json`
- loaded into TensorFlow.js in Chromium,
- run over a paired four-condition evaluation,
- and a results table containing every condition was rendered.

A second test cancelled a running evaluation mid-flight and confirmed the
partial results were discarded rather than presented.

There is no mocked substitute for these. A mocked model proves nothing about
inference.

### Running without GitHub Pages

Three deployments were exercised, not assumed:

- **`dist/` at a domain root** — the default preview server; the whole browser
  suite runs against it.
- **`dist/` in a deep subdirectory** — the same build, copied unmodified into
  `dist-nested/knit/lab/v1/` and served from there. The test fails on any
  asset URL beginning with `/` and on any response of 400 or above, and checks
  that a hash route survives a reload.
- **A single file over `file://`** — `dist-offline/adversarial-knit-lab.html`
  opened directly from the filesystem, with no server. Pattern generation, the
  chart editor, a bundled example and a PDF export all succeeded with no failed
  requests and no console errors. **Model loading also succeeded** from that
  opaque origin, because the weight host sends
  `access-control-allow-origin: *` — checked directly with `curl -H "Origin:
  null"` before relying on it. IndexedDB was available in Chromium on
  `file://`; that is browser-dependent and the application degrades with a
  visible warning where it is not.

### Interface audit

`e2e/a11y.spec.ts` (13 tests) runs axe-core over all four tabs and over the
expanded-detail, error, populated and imported-image states, and adds keyboard
traversal, focus-ring, canvas-operability, 320 px reflow, touch-target and
document-title checks. Colour contrast was computed for every token pair rather
than eyeballed. Ten defects were found and fixed; `docs/ui-audit.md` has the
method, the measured ratios and the deliberate decisions.

### The shortened evaluation loop

Auto-annotation was verified in both directions, but only one of them with a
real photograph:

- **The refusal path is tested end to end.** A synthetic scene is fed to the
  loaded model, no person clears the threshold, and the interface says so and
  annotates nothing rather than guessing a target.
- **The detection path is not verified against a real photograph.** No photo of
  a person is committed to this repository, and a drawn silhouette is not a
  substitute: when probed, COCO-SSD classified one as **"teddy bear" at 0.987**
  and a plain rectangle as "tie" at 0.143. Neither is a person, which is
  precisely why auto-annotation refuses to invent a target. The box-to-torso
  geometry, the target-picking rule and the validation it must satisfy are
  covered by unit tests.

### The pattern probe

Verified against the real model, not mocked: the probe loads COCO-SSD, renders
each bundled preset as fabric at 24, 48 and 96 stitches across, and reports what
the detector claims to see. Sample output is in `docs/evaluation.md`; the
detector reported a cake, a traffic light, a train and a bear in flat knitting.

The panel states, next to the button, that this is not evidence the pattern
hides a person, and a test asserts that sentence is on screen.

### Cross-language bridge

`research/tests/fixtures/python-export.json` was produced by
`python -m akl.cli` and is imported by
`src/features/export/pythonBridge.test.ts` through the application's own
validator. Both sides are checked, so a drift fails a test rather than a user's
import.

## Visual verification

Rendered and inspected, not merely produced as valid bytes:

- All four tabs at 1500×1000 and on a Pixel 7 viewport.
- Chart canvas with symbols on, and with gauge-correct cells.
- Both texture previews.
- Palette with a 40-character name and a yarn note containing `’`, `×`, `—` and
  Cyrillic text.
- The error state after importing an invalid project file.
- `small-chart.pdf` (8 pages) and `large-chart.pdf` (31 pages, a 140 × 180
  chart) rendered to PNG at 110 dpi with PyMuPDF and read page by page:
  summary page, single-page chart, and tiled sheets with corner assembly
  crosses, overlap note and both numbering axes.
- Exported SVG, decorated chart PNG and repeated-pattern PNG.

## Defects found by these checks, and fixed

1. **PDF export failed outright.** `WinAnsi cannot encode "←" (0x2190)` — the
   direction arrows, and any non-Latin-1 character in a project title, colour
   name or yarn note, made pdf-lib throw. Fixed with ASCII direction markers
   and a `toWinAnsi` fold applied to every drawn string. Covered by
   `pdf.text.test.ts`.
2. **Wrong model artifact URL.** The descriptor pointed at
   `ssd_lite_mobilenet_v2`, which 404s; the real path is
   `ssdlite_mobilenet_v2`. This was written into every evaluation record as
   provenance. Fixed, and the prefix now mirrors the package's own `getPrefix`.
3. **Fabricated download sizes.** `approximateDownloadBytes` held guessed
   values (5.6 MB and 13.6 MB). Measured for real: 18,561,843 and 67,771,262
   bytes. The manifest now records how they were measured, and
   `manifest.test.ts` holds it to the adapters.
4. **Region cleanup did not converge.** Adjacent small regions swapped colours
   instead of merging, leaving regions below the requested minimum. Fixed by
   merging sequentially against the working copy.
5. **Tiling could be destroyed by cleanup.** Small-region merging ran over the
   whole chart and joined regions across tile copies. The tile is now generated
   and cleaned at tile size, then repeated. Regression tested with cleanup and
   symmetry both enabled.
6. **Zoom was not anchored on the pointer**, so the cell under the cursor moved
   when zooming. Fixed, and the browser test asserts the cell under a fixed
   screen point is unchanged across a zoom.
7. **Preset descriptions contradicted the charts.** "Four colours, two per row
   in most rows" described a chart where all 80 rows use four colours and
   floats reach 43 stitches. Descriptions now quote measured figures, and
   `presets.test.ts` fails if generation drifts from them.
8. **PDF sheets wasted half the page.** Tiles were packed to capacity at the
   minimum cell size, leaving a thin final sheet and a blank lower half. The
   chart is now spread evenly across sheets and the cell grown to fit;
   `pdfTiles.test.ts` checks full coverage, overlap, and that no cell falls
   below the readable minimum.
9. **The example list vanished on a tab change**, because the panel state was
   lost on unmount. The index is now fetched when the Export tab opens.
10. **A flaky domain test**, found by running the suite six times rather than
    once: one test failed on roughly half of runs by exceeding the default 5 s
    timeout. Not a correctness bug — it crossed every variant name against
    every family, testing combinations that cannot occur and building three
    times as many noise fields to do it. Now scoped to each family's own
    variants, with an explicit timeout. Six consecutive clean runs.
11. **The generator preview recomputed on every slider tick.** Measured: 10-20 ms
    at the default size, 111 ms at 200 x 300 stitches, which a slider would
    feel. The preview is now debounced.
12. **The build only worked at a configured base path.** An absolute base meant
    `dist/` ran at a domain root or a pre-declared subpath and nowhere else, and
    the examples were fetched at runtime, which a `file://` page cannot do. The
    base is now relative, the examples are bundled, and both cases are covered
    by tests. This also removed the base-path computation from the deployment
    workflow: one build now serves every target.
13. **The search re-measured the baseline for every candidate.** Compositing
    nothing does not depend on the pattern, so the identical baseline was being
    re-run once per candidate. It is now measured once per (image,
    transformation) and reused, which is checked by a budget test: 2 images and
    16 candidates went from 136 inference calls to 104, and the saving grows
    with the candidate count.
14. **The search never followed up a good result.** It drew random candidates
    and kept the best. It now explores, then refines around the best with
    shrinking mutation steps, with both phases reported separately.
15. **The interface was taller than any device.** Measured at up to 5.6 screen
    heights on a phone and 2.9 on a desktop, with the generator's control
    column alone at 2615 px. Controls are now grouped into sub-tabs and the
    palette collapses to the selected colour: 1.0-1.3 screens on desktop and
    1.3-3.0 on a phone, with regression tests holding the ceiling.
16. **Two stale-artifact traps in the suite itself.** An interrupted run left
    its preview server behind and the next run waited on the occupied port for
    21 minutes; and the `file://` tests opened whatever single file an earlier
    build had left in `dist-offline/`, so a stale artifact could pass. Ports are
    now freed before each run and the offline file is built in `globalSetup`.
17. **Two palette presets had colours a knitter could not tell apart.** The
    contrast test written alongside them caught the default palette at 1.23
    (Lichen against Madder) and Moorland at 1.09. Both look perfectly fine as
    swatches and read as a single colour in fabric from two metres. Every
    preset now clears 1.8, enforced by a test.
18. **A sub-tab's badge was folding into its accessible name.** "Palette"
    became "Palette 4" as soon as a colour was added, so nothing could refer to
    the tab reliably -- the tests that did took 90 seconds to time out each,
    and one run ballooned to 1.2 hours. The name is now the label alone and the
    count is announced as a description.
19. **Twelve interface defects**, listed in `docs/ui-audit.md`: two serious
    (colour contrast below WCAG AA on two tokens; scrollable regions
    unreachable by keyboard), five moderate (skipped heading level, feedback
    not announced, static document title, touch targets under 44 px, disabled
    actions with no explanation), one correctness (the baseline condition could
    be switched off, which made every metric read N/A), and two layout
    (320 px reflow, tabs cut off).

## Not verified

- **The Python optimisation layer has never been executed.** torch,
  torchvision and ART were never installed; no detector was loaded, no attack
  constructed, no optimisation step taken, and `configs/smoke.yaml` has never
  been run. No trained checkpoint exists and none is referenced. See
  `research/README.md`.
- **No effectiveness result exists anywhere in this project.** No pattern here
  has been shown to affect any computer-vision system. The evaluation tooling
  measures; measuring is not the same as working.
- **The site is not deployed.** The workflow is written and its build steps run
  locally, but GitHub Pages must be enabled manually
  (Settings → Pages → Source → GitHub Actions) and the workflow has not run on
  GitHub. There is no live URL, and none is claimed.
- **Physical knitting.** No chart from this tool has been knitted, and no
  photograph of knitted fabric has been measured.
- **Browsers other than Chromium.** Firefox and Safari were not tested, which
  matters most for the `file://` build: each browser applies its own rules to
  local pages, particularly for storage.
- **Hosts other than a local static server.** nginx, S3, Netlify and the like
  should work — the folder has no server-side requirements — but none was tried.
