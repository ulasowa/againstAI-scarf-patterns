# Knitting conventions and limitations

## Coordinates

The stitch grid is the source of truth. Every other view is derived from it.

- Internal **row 0 is the bottom chart row** — the first row you work.
- Internal **column 0 is the leftmost column** as viewed from the right side of
  the fabric.
- Renderers convert this to top-origin canvas coordinates. PDF user space has
  its origin at the bottom left, so the chart needs no flip there.
- Written instructions use **working direction**, not storage order.

Stitch numbering runs right to left, matching how a right-side row is read: the
rightmost stitch is stitch 1.

## Reading direction

| Method | Convention |
|---|---|
| Flat stranded / intarsia | Row 1 is the bottom row and is a right-side row. Right-side rows read right to left; wrong-side rows read left to right. |
| Circular stranded | Every round is a right-side round and reads right to left. |
| Duplicate stitch | The chart is placement, not a knitting sequence. Rows are listed bottom to top and read left to right as you look at the fabric. |

Direction arrows appear next to every row in the interface and in the PDF (as
`<-` and `->`, because the PDF standard fonts have no arrow glyphs).

The instruction generator and the grid are round-trip tested: rebuilding the
grid from the generated instructions must reproduce it exactly, for every
working method.

## Gauge

Gauge is given per 10 cm.

```
width in cm  = stitch count × 10 / stitches per 10 cm
height in cm = row count    × 10 / rows per 10 cm
cell aspect  = rows per 10 cm / stitches per 10 cm
```

At 20 stitches and 28 rows per 10 cm, a 100 × 140 chart is 50 × 50 cm. That case
is a regression test.

Cell aspect is 1.4 at that gauge: a stitch is 1.4 times as wide as it is tall, so
a square chart knits up wider than it is high. The editor offers square cells
(easier to edit) and gauge-correct cells (the real shape). The texture previews
and the evaluation renderer are always gauge-correct.

## Colour runs and floats are different things

- A **colour run** is consecutive stitches of one colour in a row. It is a
  property of the chart alone.
- A **float** is the yarn carried behind the fabric between two stitches worked
  in the same colour, measured in stitches passed over.

A run of nine background stitches only creates a nine-stitch float for a
contrast yarn that is actually in use on that row, on both sides of the run. The
analysis reports them separately for this reason.

### Simplifications, stated

- Stitches before a colour first appears in a row, and after it last appears,
  are **not** counted as floats. In practice the yarn is introduced and dropped
  at those points, or caught at the selvedge.
- Yarn dominance is not modelled.
- Catching a float mid-span while knitting is not modelled. It changes the back
  of the fabric, not the chart.
- Steeks are out of scope.
- In circular knitting the join between the last and first stitch of a round is
  analysed as a wraparound float.

The long-float threshold is a **setting**, not a rule. Seven stitches is a
common working limit for fingering-weight stranded knitting; heavier yarn,
looser hands and a willingness to catch floats all move it. The application
warns; it does not pronounce a chart unknittable.

## Palettes

Seven presets ship with the application. Every one has been checked so that its
closest pair of colours differs by a contrast ratio of at least 1.8; two of the
original seven failed that at 1.23 and 1.09, which is invisible on screen and
obvious in fabric at two metres.

Swapping a palette recolours the chart. A preset with fewer colours remaps the
extras to their nearest surviving shade rather than dropping them, so the motif
keeps its shapes. Locked colours are preserved.

Contrast is a necessary condition, not a sufficient one: two yarns can have
plenty of luminance contrast and still muddle each other in a busy pattern.

## Colours per row

Stranded colourwork conventionally uses two colours per row. This is a *per-row*
constraint, not a limit on the chart: a four-colour chart satisfies it as long as
each individual row uses only two.

The analysis reports total colours and the maximum in any single row separately,
and flags the rows that exceed the configured limit.

The **Reduce to N colours per row** repair keeps the most-used colours in each
row and remaps the rest to the nearest of them, measured in the same perceptual
weighting the image importer uses. It changes visible stitches, so it makes
previous evaluation results stale.

For intarsia and duplicate stitch the per-row limit and float analysis are not
applied at all, and method-appropriate guidance is shown instead.

## Finished size

Sizes are entered in centimetres and converted through the gauge:

```
stitches = round(width cm x stitches per 10 cm / 10)
rows     = round(length cm x rows per 10 cm / 10)
```

The interface shows the size actually achieved after rounding to whole
stitches, which is never more than one stitch away from what was asked for.

Presets cover a gauge swatch, three scarf widths, a cowl, a headband and a
blanket panel. For a circular piece the width is the circumference, and the
preset sets the working method to match.

A long scarf exceeds the chart limits: 180 cm at 28 rows per 10 cm is 504 rows.
The application says so rather than silently shrinking the piece, and points at
the right answer — chart the repeat, not the whole scarf, and work it as many
times as the length needs.

## Repeats

Repeat dimensions are measured in stitches and rows. The analysis reports
whether the chart holds a whole number of repeats in each direction and how many
stitches or rows are left over.

Tiles generated with **seamless tile** on are periodic by construction: the tile
is generated by sampling 4D simplex noise around two circles, so sampling at `x`
and `x + tileWidth` returns the same point. The tile is then generated and
cleaned at tile size and repeated, because cleaning the whole chart would merge
regions across copies and destroy the periodicity. This is regression tested:
the produced chart must equal its own tiling, exactly.

Repeating a non-periodic image is not the same thing, and the application does
not claim it is.

## Supported chart types

- Flat swatches
- Circular swatches and motif repeats
- Rectangular scarf panels
- Motif panels for an existing garment pattern
- Duplicate-stitch motifs

## What this does not do

**It does not generate a garment pattern.** There is no garment construction, no
sizing, no shaping, no ease calculation and no grading. A chart is a motif and
its dimensions. Fitting it to a sweater is your pattern's job, not this tool's.

**It does not export machine instructions.** knitout describes needle beds,
carriers, transfers, cast-on and cast-off strategies. A pixel-to-stitch
conversion is none of those. Shipping a "machine ready" button over a colour
grid would be a lie about what the file contains, so there is no such button.

**It does not promise your yarn will look like your screen.** Screen colour, dye
lot, fibre and lighting all move the result. Check against real yarn.

**The fabric preview is an illustration.** V-shaped stitch strokes over flat
colour. There is no drape, no tension, no fibre halo and no physical simulation
of any kind.
