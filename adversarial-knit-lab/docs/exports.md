# Export formats

## PNG

Four images, because they answer different questions. Only the last one contains
chart furniture, and it is never what the evaluation pipeline sees.

| Export | Contents |
|---|---|
| Clean pattern tile | One repeat, square pixels, no decorations. This is the pattern. |
| Repeated pattern | The pattern tiled across an area at gauge-correct proportions. |
| Gauge-correct preview | A single chart at its real physical proportions. |
| Decorated knitting chart | Gridlines, row and stitch numbers, palette symbols. |

## SVG

A vector chart with a header (title, stitch and row count, finished size,
gauge), the chart body, heavier gridlines every ten stitches and rows, repeat
outlines, row and stitch numbering, and a palette legend with symbols and yarn
notes. Colour, symbol-only and combined modes.

All user-supplied text is XML-escaped.

## PDF

A4 or US Letter.

Page 1 carries the title, project id, pattern hash, dimensions and finished
size, gauge, repeat, working method with its reading convention, the palette
legend with symbols and hex values, the knitting warnings, and the current
evidence status with the model identifiers of any current evaluation.

Chart pages follow. A chart that does not fit on one page at a readable cell
size is **tiled**, not shrunk: each sheet overlaps its neighbours by two
stitches and two rows, carries corner assembly crosses, and is labelled with the
stitch and row range it covers. The cell size is then grown back up so the
sheets fill the page rather than leaving half the paper blank.

Instruction pages list every row in working order with its direction marker.

Text is folded to WinAnsi, because the PDF standard fonts cannot encode anything
else. Typographic characters map to ASCII equivalents (`—` → `-`, `×` → `x`,
`←` → `<-`); anything outside Latin-1 becomes `?`. An export never fails because
of a character in a colour name.

## Project JSON

```json
{
  "format": "adversarial-knit-lab.project",
  "schemaVersion": 1,
  "project": {
    "id": "...", "title": "...", "createdAt": "...", "modifiedAt": "...",
    "generator": { "family": "...", "version": "...", "seed": 0, "params": {} },
    "grid": { "stitches": 64, "rows": 80, "encoding": "rle-v1", "cells": "0x12.1x3..." },
    "palette": [ { "id": "...", "hex": "#rrggbb", "symbol": ".", "name": "..." } ],
    "gauge": { "stitchesPer10cm": 20, "rowsPer10cm": 28 },
    "workingMethod": "flat-stranded",
    "repeat": { "stitches": 32, "rows": 40 },
    "analysisOptions": {},
    "evaluations": []
  }
}
```

Stitch data is run-length encoded as `value` or `valuexRun`, joined with `.`, in
internal order (row 0 first, bottom to top). A single-colour 40 × 40 chart is
`2x1600`.

Imports are validated against a schema, bounded in size, and rejected if any
cell refers to a palette colour the file does not define.

The five bundled examples in `src/examples/` are ordinary files in exactly this
format, produced by this exporter. They are imported into the bundle rather
than fetched, so they work from a `file://` page too.

Photographs are only included when explicitly requested. A photograph of a
person is personal data; it does not go into a shareable file by accident.

## Evaluation JSON and CSV

JSON carries the full record plus aggregates computed per split.

CSV has one row per (photograph, transformation sample, condition), with these
columns:

```
record_id, created_at, pattern_hash, model_id, model_variant, backend,
detection_threshold, match_iou, image_id, image_file, image_hash, split,
transform_index, transform_seed, condition, inference_ok, failure_reason,
detected, matched_score, matched_x, matched_y, matched_width, matched_height,
candidate_count
```

`detected` is blank when `inference_ok` is false. A failed run is not a miss.

## knitout

Not exported. See `docs/knitting.md`.
