# UI audit

A full pass over the interface: automated accessibility scanning, a manual
review of every tab and state, and the fixes that came out of it. Run on
2026-09-25 against Chromium 1243.

Everything below is either a check that ran or a defect that was found and
fixed. Nothing here is a plan.

## Method

| Layer | How |
|---|---|
| Automated accessibility | axe-core 4.13 via `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `best-practice`, across all four tabs plus the expanded-detail, error, populated and imported-image states |
| Colour contrast | Every token pair computed against the WCAG relative-luminance formula, not eyeballed |
| Keyboard | Tab traversal of a whole tab, focus-ring computed style, canvas arrow-key operation |
| Reflow | 320 CSS px (WCAG 1.4.10), all four tabs, asserting zero horizontal overflow |
| Touch targets | Measured button heights under a coarse pointer at 412 px |
| Visual | Screenshots at 320 px and 1500 px, read rather than merely captured |

| Layout height | Page height as a multiple of the viewport, all four tabs, on a desktop and a phone |

All of it lives in `e2e/a11y.spec.ts` (17 tests) so it runs again on every
change rather than being a one-off.

## Findings and fixes

### 0. The interface was taller than any device — serious, fixed

The first thing a user said about it, and the measurements agreed. Every
control was stacked in one column, so a tab ran to several screen heights and
every adjustment became a scroll hunt.

Measured before, as multiples of the viewport height:

| Tab | Desktop 1500x1000 | Phone 390x844 |
|---|---|---|
| Generate | 2.9 screens (controls column alone 2615 px) | 4.2 screens |
| Knit | 1.8 | **5.6** |
| Evaluate | 2.0 | 3.5 |
| Export | 1.3 | 3.0 |

Controls are now grouped into sub-tabs, one group visible at a time:

- **Generate** — Presets, Pattern, Size, Shape, Image
- **Knit** — Tools, View, Gauge, Method; Palette, Analysis, Repairs; Previews,
  Colour sequence
- **Evaluate** — 1 Model, 2 Photos, 3 Settings, 4 Probes; Measure, Search,
  Results
- **Export** — Image, Vector, PDF options; Images, Documents, Project,
  Measurements

After:

| Tab | Desktop | Phone |
|---|---|---|
| Generate | **1.0** | **2.1** |
| Knit | **1.3** | **3.0** |
| Evaluate | **1.0** | **1.4** |
| Export | **1.0** | **1.3** |

The palette list also collapsed: only the selected colour shows its hex, symbol,
yarn note and controls, which took that column from 856 px to 613 px. Knit stays
the tallest because a chart canvas takes half a phone screen on its own and is
not something to shrink.

Two regression tests now assert a ceiling of 1.6 screens on desktop and 3.4 on a
phone, so this cannot creep back.

Unlike the top-level workflow navigation, these really are tabs, so they got the
full pattern: `tablist`/`tab`/`tabpanel`, roving tabindex, and Arrow, Home and
End keys. A finished evaluation switches the main group to Results rather than
leaving the user to find them.

### 1. Insufficient colour contrast — serious, fixed

axe flagged `.stat-label` and `.link`. Computing the whole palette rather than
the two flagged cases showed the problem was in the tokens:

| Token | Use | Before | After |
|---|---|---|---|
| `--ink-faint` on white | small uppercase stat labels, hints | **3.36:1 fail** | `#6b6d63`, **5.26:1** |
| `--ink-faint` on the paper ground | same | **3.01:1 fail** | **4.70:1** |
| `--accent` as text on the paper ground | `.link` buttons | **4.48:1 fail** | new `--accent-text` `#98401d`, **6.08:1** |
| `--accent` as text on its own tint | `.link` inside a selected palette row | **4.04:1 fail** | **5.48:1** |

`--accent` is kept for borders, the active-tab underline and the slider, where
it is a non-text indicator and clears the 3:1 threshold. Only text moved.

Everything else already passed and is recorded for the next change:
`--ink` 16.95:1, `--ink-soft` 7.34:1, `--blue` 5.13:1, and the three callout
tints 9.24–10.81:1.

### 2. Scrollable regions unreachable by keyboard — serious, fixed

The colour-sequence list and the results tables scroll with `overflow: auto`.
A mouse could scroll them; a keyboard could not reach them at all.

Added a `ScrollRegion` component that makes such a box focusable and named, and
applied it to both results tables and the instruction list, with a visible
focus ring.

### 3. Skipped heading level — moderate, fixed

Section titles were `h3` directly under the page `h1`, leaving a hole in the
document outline. They are now `h2`, and the result sub-headings moved `h4` →
`h3`. The visual size is unchanged; only the structure moved.

### 4. Dynamic feedback was drawn but not announced — moderate, fixed

Success and status callouts appeared silently for screen-reader users. `Callout`
now carries `role="status"` for success and feedback tones, and keeps
`role="alert"` for errors. Static explanatory callouts stay silent on purpose —
announcing them would be noise.

### 5. The document title never changed — moderate, fixed

All four tabs shared one title, so the only thing that changes the view was
invisible in the browser tab strip and in screen-reader navigation
announcements. The title now follows the tab: `Evaluate - Adversarial Knit Lab`.

### 6. Touch targets too small — moderate, fixed

Buttons were about 32 px tall: comfortable with a mouse, not with a thumb. A
`@media (pointer: coarse)` block now gives buttons, selects, text inputs and
checkboxes a 44 px minimum. Verified by measuring the rendered heights.

### 7. Tabs cut off at narrow widths — minor, fixed

At 320 px the tab strip scrolled horizontally and "Export" sat off-screen with
nothing indicating it. Tabs now share the width evenly below 380 px; all four
fit, with the last edge at 312 px of 320.

### 8. Reflow at 320 px — checked, adjusted

WCAG 1.4.10 asks for no horizontal scrolling at 320 CSS px. Three layout rules
were needed: single-column stat rows, single-column instruction rows and
palette rows, and reduced padding. All four tabs now report zero overflow.

### 9. A disabled action with no explanation — moderate, fixed

"Run evaluation" and "Run search" were simply dead until a model and
photographs existed, with nothing saying so. Both now list what is missing:
"To run: load a model, then import at least one photograph."

### 10. The baseline condition could be switched off — correctness, fixed

Every metric in this application is defined against the original photograph:
conditional miss rate, score delta, the lot. The condition list let you uncheck
it, after which every number correctly but uselessly read N/A. It is no longer
a checkbox; it is a line of text saying it is always measured.

### 11. Grouped controls, checked as a tab list — fixed

The sub-tabs added in finding 0 are verified: five tabs in the generator group,
`aria-selected` tracking, roving `tabindex="-1"` on the inactive tabs, arrow,
Home and End keys moving the selection, and each panel carrying
`role="tabpanel"` with `aria-labelledby` pointing at its tab.

## Checked and already correct

- **Form labelling.** Every input is associated with a label through
  `useId`/`htmlFor`, or carries an `aria-label` where a visible label would be
  redundant (palette fields, file inputs). No violations.
- **Landmarks.** `header`, `nav` (labelled "Workflow"), `main`, `footer`.
- **Focus visibility.** A 2 px `--blue` ring via `:focus-visible`, verified by
  computed style on a dark primary button, not only a light one.
- **No focus trap.** Tab traversal reaches the end of the document.
- **The chart canvas is operable by keyboard.** Arrow keys move the focused
  cell, Enter and Space apply the current tool, and the position is announced
  through an `aria-live="polite"` status line. The written colour sequence is
  the text equivalent of the canvas.
- **Nothing is signalled by colour alone.** The evidence badge pairs its dot
  with a text label; "not detected at threshold" and "inference failed" are
  words, not just colours.
- **Reduced motion** is respected.
- **No web fonts, no analytics.** System fonts only.

## Deliberate decisions

- **`role="application"` on the chart canvas.** This suppresses screen-reader
  browse mode, which is normally a warning sign. It is correct here: the canvas
  is a grid editor driven by arrow keys, and the instruction list provides the
  readable equivalent.
- **Tabs as a labelled `nav` with `aria-current="page"`, not a `tablist`.** They
  switch views and are reflected in the URL hash, which is navigation. A
  `tablist` would add arrow-key cycling but misdescribe what they do.
- **Light theme only.** `color-scheme: light` is declared rather than a dark
  theme half-implemented. The contrast figures above are for that one theme.

### 12. A stale test server could block the suite forever — fixed

Not user-facing, but it cost a 21-minute hang during this audit: the browser
suite deliberately never reuses an existing server, so an interrupted run that
left its preview process behind made the next run wait on an occupied port.
`scripts/free-port.mjs` now releases the port first, and falls back to doing
nothing where `lsof` is unavailable.

## Not checked

- **Screen readers.** No VoiceOver, NVDA or JAWS pass was made. Automated rules
  and semantics are not a substitute for listening to it.
- **Firefox and Safari.** Chromium only, which matters most for the `file://`
  build and for focus-ring rendering.
- **Colour-blind simulation.** The palette is user-chosen yarn, so the chart
  itself cannot be guaranteed; the interface chrome does not rely on hue, but
  this was reasoned about rather than measured.
- **Zoom above 200%** and Windows high-contrast mode.
