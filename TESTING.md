# Testing

```bash
npm test
```

Runs every file in `test/` with the Node.js test runner (Node 22 or newer). CI runs the same
command on Node 22 and 24, on Linux and Windows.

## What the tests check

| File | Kind | What it proves |
|---|---|---|
| `cards.test.js` | Golden, independent ground truth | For 7 templates made by Silhouette Studio from layouts that the generator publishes in `layouts.json`: card count = rows × cols, each card's size within 0.02 mm, every sample of each rounded corner 3 mm (±0.01) from its centre, all cards inside the page |
| `thumbnail.test.js` | Differential against Silhouette Studio | Each file stores a preview PNG rendered by Silhouette Studio. The decoded outlines are scaled onto the preview's ink box; x and y scales must agree within 3 % and over 97 % of outline samples must fall within 2 px of drawn ink |
| `thumbnail.test.js` (control) | Negative control | The same measure must reject geometry stretched by 7 % (agreement drops below 90 %) |
| `path.test.js` | Unit | Path grammar on hand-built bytes, including the empty subpath (`-1` index) and rejection of each inconsistent field |
| `malformed.test.js` | Malformed and fuzz | Wrong magic, truncation at every 97th length and at each header boundary, 2 000 seeded random corruptions of the document section, a 2^62 section size. Each must give a parse or a `Studio3Error`; anything else fails the test |
| `cli.test.js` | Integration | SVG and preview written, `--json` output, exit codes 1 and 2, no output file on failure |

There are no round-trip tests because studio3svg does not write `.studio3`.

## Running on more files

The preview differential can run over any folder of `.studio3` files:

```bash
STUDIO3_CORPUS="/path/to/folder;/another/folder" npm test
```

Results on the full research corpus (2026-10-28):

| Corpus | Files | Pass | Skip | Fail |
|---|---|---|---|---|
| silhouette-card-maker `cutting_templates/` (MIT) | 192 | 192 | 0 | 0 |
| Samples bundled with the Silhouette Studio 5.0.539 installer (not redistributed) | 39 | 32 | 6 | 1 |

Skipped files use effects (puncher, emboss and others) whose output the app draws in the preview
but does not store, so the preview's extent differs from the stored outlines.

The failing file is `PixScan Calibration (Ledger).studio3`, saved by Studio 4.0 with a 172 × 172 px
preview. Its single shape is a grid of 4 930 registration dots of 1 mm, about 0.4 px each at
that size, and 93.6 % of samples land on ink against the 97 % bar. The A3, A4 and
Letter versions of the same file pass. The assertion is left as is.

`research/rulecheck.mjs <folders>` checks the shape record rule (SPEC 4.1) over a corpus.
