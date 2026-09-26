# Evaluation methodology

What is measured, how, and what the numbers do not mean.

## The pipeline

For every (photograph, transformation sample) pair, each requested condition
goes through an identical path:

```
base photograph
  → composite the condition's texture into the placement-transformed quad
  → apply the SAME camera degradations sampled for this example
  → apply the SAME occlusion rectangle
  → hand the canvas to the model adapter
```

The `original` condition skips only the compositing step. Everything after it is
treated identically, and there is exactly one resize and normalisation path —
inside the adapter. Using a different resize for one condition would produce a
difference that has nothing to do with the pattern.

## Conditions

Four conditions, measured together, because three of them exist to rule things
out:

| Condition | What it isolates |
|---|---|
| Original photograph | The baseline every other condition is compared against. |
| Solid-colour garment overlay | Separates "the garment was covered" from "this pattern did something". |
| Random control pattern | Same palette, same colour histogram, same stitch dimensions, random arrangement. Separates a pattern-specific effect from any busy texture. |
| Chart-derived pattern | The actual knitted motif, rendered without chart decorations. |

If the chart-derived pattern and the random control move the numbers by the same
amount, the pattern did nothing that noise in the same colours would not do.
That is the comparison the control exists to make possible, and it is why the
controls are on by default.

## What the detector actually sees

Chart gridlines, row numbers and palette symbols are reading aids for a knitter.
They are not part of a knitted motif, and feeding them to a detector would
measure the wrong thing entirely.

The evaluation pipeline therefore uses a dedicated renderer
(`src/features/evaluation/texture.ts`) whose options type cannot express chart
decorations: `RenderParams.decorations` is typed as the literal `false`. The
texture is the palette colours at gauge-correct proportions, optionally with a
stockinette illustration, and nothing else.

## Two different questions

This application asks the detector two questions, and keeps them apart because
they are not the same question.

### 1. What does the model make of the pattern itself?

The **pattern probe** in the Generate tab renders the chart as fabric at
several stitch scales and hands it to the detector with nothing else in the
frame. It reports every class the model claims to see.

This is fast, needs no photograph, and measures something real. Run against
COCO-SSD `lite_mobilenet_v2` on 2026-09-26, the bundled presets produced:

| Pattern | 24 sts across | 48 sts | 96 sts |
|---|---|---|---|
| Lichen camouflage | cake 0.55 | traffic light 0.33 x2 | scissors 0.31, traffic light 0.23 |
| Offset checks | nothing | nothing | train 0.64 |
| Contour network | nothing | nothing | bear 0.41 |

Those are phantoms: there is no cake, train or bear, and no person. The
detector is reporting objects in a flat piece of knitting.

**What this does not show.** It is not evidence that any of these patterns
hides a person. That is a different question about a different image, and the
relationship between "provokes phantom objects" and "hides a person" is not
established here or anywhere else in this project. The interface says so next
to the button.

Scale matters and is reported separately: a detector resolves detail at a fixed
input size, so the same fabric at 24 and at 96 stitches across is effectively
two images.

### 2. Does the pattern change whether a person is detected?

That is the rest of this document: a photograph of a person, a garment region,
paired controls, and the metrics below. Nothing else can answer it.

## Detection matching

Applied in this order:

1. Keep detections whose class label is `person`.
2. Keep detections at or above the reporting threshold.
3. Compute IoU against the user-annotated target box.
4. Keep detections at or above the match IoU threshold.
5. Take the highest IoU. Ties break on the higher score.

Step 4 is what prevents a second person in the frame being credited to the
target. A detection that overlaps the target slightly is not the target.

Every target-class detection above the reporting threshold is stored in the
record as a candidate, so the matching decision can be audited afterwards.

## Metrics

**Detection retention** — matched detections divided by eligible examples, per
condition. "Eligible" means inference succeeded in *every* condition of that
example.

**Conditional miss rate** — of the target instances the baseline detected, the
share this condition does not detect:

```
(baseline-detected instances that become undetected) / (baseline-detected instances)
```

When the denominator is zero the value is `null` and the interface shows
**N/A**. It is never shown as 0% or 100%. A photograph where the baseline
detector never found the person cannot tell you whether a pattern hid them.

**Mean matched score** — averaged only over examples where this condition
produced a matched detection.

**Mean score delta** — averaged only over examples where *both* the baseline and
this condition produced a matched detection, so the difference is actually
observable. The count of such examples is displayed next to it.

### Censoring, and what is not done about it

A target that falls below the reporting threshold is recorded as **not detected
at threshold**. It is not recorded as zero confidence, because the model did not
report zero — it reported nothing above the threshold. Such an example
contributes to the miss rate and contributes *nothing* to the score averages.

Silently substituting 0 for a censored detection would drag the mean confidence
down and make every pattern look effective.

### Failures are not misses

If inference throws, the measurement is marked `inferenceOk: false` with the
reason. The whole example is excluded from the aggregates, and the excluded
count is displayed next to the eligible count. A WebGL context loss is not
evidence of evasion.

In the CSV export, the `detected` column is left **blank** for a failed run, not
`false`.

### Results are never pooled across models

Scores from different model families are not commensurable and are never
averaged together. Each evaluation record carries one model identifier.

There is no aggregate "AI confusion score" anywhere in this application.

## Data splits

Photographs are assigned to an **optimisation** split or a **holdout** split.
The candidate search only ever sees the optimisation split. The holdout is
evaluated once, afterwards.

A holdout is only meaningful while you have not chosen anything with it. If you
start picking candidates by looking at holdout numbers, tick the box that says
so: the record then carries `holdoutUsedForSelection: true`, and the split is a
selection set from that point on.

Re-running a search against the holdout until something wins is how a
measurement becomes meaningless.

## Transformation probes

Two groups, kept distinct because they mean different things:

- **Placement** — scale, rotation, perspective of the garment region. Models how
  the motif sits.
- **Camera** — brightness, contrast, blur, JPEG compression over the whole
  photograph. Models the capture path.

Every sample is derived from `(transform seed, image id, sample index)`, so the
same parameters are applied to the baseline and to every patterned condition of
the same example. Sampling independently per condition would destroy the pairing
and make the differences noise.

Seeds are stored in the record. Results are reported per transformation as well
as in aggregate.

These are robustness probes under digital transformations. A knitted garment on
a moving body is not a rotated, blurred, JPEG-compressed rectangle.

## Candidate search

Seeded random search over the generator's parameter space, scored by real
inference. The objective, in order:

1. Hard knitting constraints must hold. A candidate that violates them is never
   selected, whatever it scores.
2. Lower detection retention for the chart condition on the optimisation split.
3. Lower mean matched confidence, as a tie-break only.

Every candidate is converted to the actual knitting representation and rendered
without decorations before it is measured, so the search scores what a knitter
could make.

The starting chart is measured first under identical settings, so "improved" is
a comparison rather than an assertion. When nothing beats it, the interface says
so — that is a result, not a failure to report.

This is a heuristic. It is not a reproduction of a gradient-based attack.
Neither a TensorFlow.js inference wrapper nor an ONNX inference session exposes
a differentiable detector training pipeline; inference and optimisation are
different things.

The inference budget is shown before you start:

```
candidates × images × transformations × models
```

## Staleness

Every evaluation record stores the content hash of the chart it measured. The
hash covers the stitches, the palette colours, the gauge, the working method and
the repeat.

A record whose hash differs from the live chart is **stale**. It stays in the
project history and can be exported, but it is never shown as a current result
and never appears in the PDF as evidence about the current chart. Editing a
single stitch is enough.

## Model provenance

Each record stores the model family and variant, artifact URL, licence, input
resolution, channel order, normalisation, resize behaviour, output layout, class
mapping, NMS behaviour, the backend that ran it, and the user agent.

COCO-SSD's preprocessing and decoding happen inside
`@tensorflow-models/coco-ssd`: the image is fed at its native size, the graph
resizes to 300×300 internally without preserving aspect ratio, and the package
applies NMS and maps class indices to labels. None of that is reimplemented, and
the descriptor says so rather than claiming knowledge we do not have.

The `artifactHash` field is `null` for these weights. They are served by a
third-party CDN and we have not published a checksum we verified ourselves;
recording a hash we did not check would be worse than recording none.

## What a result means

A result describes:

- this chart, at this content hash,
- rendered with these parameters,
- on this model, on this backend,
- on these photographs,
- under these thresholds and transformation seeds.

It says nothing about other detectors. It says nothing about face detection or
face recognition, which are different tasks. And a digital overlay result says
nothing about knitted fabric in the physical world.

"Evaluated" means measurements exist. It does not mean the pattern works.
