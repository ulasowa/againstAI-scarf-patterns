# Research notes

What was read, what was verified, and what this application does and does not
take from each source. Checked on 2026-09-25.

The short version: none of the work below is reproduced here, and none of its
results transfer to anything this application produces.

## R1 — Repeating adversarial clothing textures

- Paper: <https://arxiv.org/abs/2203.03373>
- Implementation: <https://github.com/WhoTHU/Adversarial_Texture> (MIT, last
  pushed 2026-06-29, 70 stars)

Verified: the repository exists, is MIT licensed, and contains PyTorch training
code rather than anything runnable in a browser.

**Taken:** the idea that a garment texture has to be *expandable* — it must
repeat over an arbitrary area rather than be a single patch scaled to fit. This
shapes the repeat-tile family and the whole repeat concept: tile dimensions are
measured in stitches and rows, the tile is generated periodically, and the
preview shows three repeats across so a seam is visible if there is one.

**Not taken:** any code, any weights, and any result. The paper's numbers belong
to its detectors, its training and its physical conditions. Nothing here is a
reproduction of it, and nothing here inherits its effectiveness.

## R2 — Deformation-aware adversarial clothing

- Paper: <https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123500647.pdf>

Used as background for why fabric deformation matters: a pattern measured flat
is not the same pattern once it is on a moving body.

This is the reason the evaluation workflow keeps three conditions strictly
apart, and labels them separately everywhere they appear:

1. **Digital garment overlay** — a texture perspective-mapped into a region of a
   photograph. No drape, no folds, no shadow, no lighting response.
2. **Physical swatch photographs** — photographs of actual knitted fabric,
   imported as ordinary photographs and measured the same way.
3. **Printed imagery** — not supported here at all, and not equivalent to either
   of the above.

The application never calls the overlay a simulation of knitted clothing.

## R3 — Adversarial patches

- Paper: <https://arxiv.org/abs/1712.09665>

Background for localised, optimised, visible patterns and for robustness across
transformations. The transformation probes in the Evaluate tab (scale, rotation,
perspective, brightness, contrast, blur, JPEG, occlusion) follow this idea of
expecting-over-transformation, at a much smaller scale and without optimisation.

They are robustness probes. They are not evidence of physical performance.

## R4 — Natural-looking adversarial camouflage

- Paper: <https://openaccess.thecvf.com/content_CVPR_2020/papers/Duan_Adversarial_Camouflage_Hiding_Physical-World_Attacks_With_Natural_Styles_CVPR_2020_paper.pdf>
- Implementation: <https://github.com/RjDuan/AdvCam-Hide-Adv-with-Natural-Styles>

Verified: the repository exists (94 stars, last pushed 2023-03-24) and
**publishes no licence file**. Its code therefore cannot be reused, and is not.

**Taken:** the aesthetic argument that a pattern which reads as an ordinary
textile is more wearable than one that reads as an attack. This is why the
pattern families are camouflage, contour networks and broken geometry rather
than high-frequency noise, and why the interface avoids "hacker" styling.

**Not taken:** the style-transfer method, any code, any result. It is not a
knitting library and is not treated as one.

## R5 — Adversarial Robustness Toolbox

- Repository: <https://github.com/Trusted-AI/adversarial-robustness-toolbox>
  (MIT, 6.2k stars, last pushed 2025-12-12)
- Attacks: <https://adversarial-robustness-toolbox.readthedocs.io/en/main/modules/attacks/evasion.html>

ART is a **Python** toolkit. It is not a browser TypeScript package and no part
of it runs in the deployed site.

Two things worth stating plainly, because both are easy to get wrong:

- ART attacks are bound to an **estimator type**. A patch attack written against
  a classifier does not optimise an object detector by being pointed at one. Any
  use of ART here would have to check the estimator contract of the specific
  attack class first.
- ART contains attacks with names resembling "adversarial texture". They are
  **not** an implementation of R1. Treating them as one would be a citation
  error with consequences.

See `research/README.md` for where ART would fit and what remains unverified.

## R6 — KnitPlot

- Repository: <https://github.com/syalr2/knitplot> (MIT, last pushed
  2026-09-01)

Inspected: `package.json`, `lib/chart.ts`, `components/instructions-view.tsx`,
and the repository tree.

It is a Next.js application, not a package. Its dependencies include
`@clerk/nextjs` (hosted auth), `@neondatabase/serverless` (hosted Postgres) and
`server-only`; it also has a `database/migrations` directory and an OpenAI
integration under `lib/openai/`. None of that can come into a static site, and
dragging it in would defeat the "no backend, no account, no API key"
requirement.

`lib/chart.ts` is framework-free, but it models *shaping* — `k2tog`, `M1L`,
`no-stitch`, `cast-on`, with a `stitchActionMath` for how many stitches each
consumes and produces. This project's grid is palette indices for colourwork,
bottom-origin, with no shaping. The structures do not map onto each other.

What was reused, reimplemented with tests rather than copied:

- Gauge arithmetic: width = stitches × measure / stitch gauge, and a physical
  cell aspect of row gauge / stitch gauge. Credited in
  `src/features/knitting/gauge.ts`.
- The row-reading rule: right-side rows are odd, read right to left; rounds are
  always read right to left. Credited in `src/features/knitting/instructions.ts`.

Both are standard chart conventions rather than inventions, but KnitPlot is
where they were confirmed, so it is credited. See `docs/reuse-audit.md`.

## R7 — Other knitting software

- Amidz <https://github.com/kikuomax/amidz> — MIT, Vue 2 + Vuex, last pushed
  2022-12-30. Its editor is built around SVG stitch symbols with a Vuex store.
  Porting it to React would cost more than the canvas editor here, and its
  model is symbols rather than colourwork. Rejected.
- knitout <https://github.com/textiles-lab/knitout-frontend-js> and the related
  examples and visualiser — MIT. knitout is a **machine-knitting instruction
  format**: needle beds, carriers, transfers, cast-on and cast-off. It is not a
  hand-knitting chart renderer, and a pixel-to-stitch conversion is not a
  machine file. Export is deliberately not shipped rather than shipped and
  labelled "machine ready". See `docs/knitting.md`.

## R8 — Supporting libraries

All verified from npm metadata and repository state on 2026-09-25; versions,
licences and decisions are in `docs/reuse-audit.md`.

One correction worth recording, because it was wrong in an early draft of this
application: the COCO-SSD weights for the `lite_mobilenet_v2` base are served
from `.../savedmodel/ssdlite_mobilenet_v2/model.json` — with no underscore
between `ssd` and `lite`. Other bases use `ssd_<base>`. This mirrors `getPrefix`
in `@tensorflow-models/coco-ssd@2.2.3`. The earlier spelling produced a 404 and,
worse, an evaluation record pointing at an artifact that does not exist.

Measured download sizes, taken by summing `model.json` and the `Content-Length`
of every weight shard it lists:

| Variant | Artifact | Total |
|---|---|---|
| `lite_mobilenet_v2` | `ssdlite_mobilenet_v2` | 18,561,843 bytes (17.7 MB), 5 shards |
| `mobilenet_v2` | `ssd_mobilenet_v2` | 67,771,262 bytes (64.6 MB), 17 shards |

These are measurements, not estimates.

## Sources that could not be fully verified

- The full texts of R1–R4 were not re-derived here; the repositories, licences
  and repository state were checked directly, and the papers are cited by their
  canonical URLs. Where this document describes what a paper argues, it
  describes the idea taken from it, and no numerical claim from any of them is
  restated as a result of this application.

## Why there is no "research-proven" pattern family

This is the most important thing in this document, so it is stated plainly.

**Every published result that fools a detector was produced by optimising a
texture against a specific model with gradients.** Brown et al. optimise a
patch; Thys and Xu optimise a printed panel; Duan optimises under a style
constraint; Hu et al. optimise an expandable texture. The deliverable of that
work is a *trained artifact*, tied to the model it was trained against and to
the conditions it was trained under.

There is no published recipe of the form "generate a pattern with these
properties and detectors will fail". A procedural generator cannot inherit
those results, and this application does not pretend it can. Any tool that
offers you "research-proven adversarial patterns" from a set of sliders is
selling camouflage as technology.

### What the families here actually do

They generate in the structural vocabulary those papers' outputs share, as
described in the papers themselves:

| Property | Reported in | Family |
|---|---|---|
| High spatial frequency, high contrast rather than smooth | Brown et al. 2017 | High-frequency disruption |
| Energy at several scales at once | detector feature pooling | Multiscale interference |
| Dense edges that form no closed object | contour-based proposals | Contour network |
| Abrupt saturated transitions, no natural gradients | Brown 2017, Duan 2020 | Chromatic shock |
| Tileable over an arbitrary area | Hu et al. 2022 ("expandable") | a parameter on all families |

Deliberately **not** included: conventional camouflage. Camouflage is designed
for low salience against a background, which is close to the opposite of the
properties above.

That makes these families plausible things to *measure*. It does not make them
effective, and the measurements so far do not support optimism.

### What the measurements actually showed

Probed against COCO-SSD `lite_mobilenet_v2` on 2026-09-26, at 24, 48 and 96
stitches across, reporting at 0.20 and above:

| Pattern | Objects reported | Total confidence |
|---|---|---|
| Octave stack | 2 (bed 0.62, umbrella 0.48) | 1.09 |
| Angular shards | 1 (cake 0.56) | 0.56 |
| Micro checks | 1 (refrigerator 0.30) | 0.30 |
| Dense contour network | **0** | 0.00 |
| Broken contours | **0** | 0.00 |

For comparison, the conventional camouflage pattern these families replaced
produced more response, not less: cake 0.55, traffic light 0.33 twice, and
scissors 0.31.

So: building to the structural properties the literature reports **did not**
produce a larger measured response on this model than ordinary camouflage did,
and the two contour families produced none at all. That is a real result and it
is reported here rather than buried. It is also exactly what the first
paragraph of this section predicts: structure is not optimisation.

## The standing claim

This application generates knitting charts and measures them against a detector
you load yourself. No pattern it produces is known to affect any
computer-vision system.

Reducing person-detection confidence on some photographs, with one model, under
one set of settings, is a measurement about that model. It is not evidence about
other detectors, and it is not evidence about face detection or face
recognition, which are different tasks with different failure modes.
