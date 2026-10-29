# The `.studio3` format (Silhouette Studio 5)

This is a clean-room description of the parts of the `.studio3` document format that studio3svg reads.
It was written from observation of files saved by Silhouette Studio, checked against ground truth
and the preview image each file carries. RESEARCH.md describes how it was produced. Nothing here
is copied from Silhouette Studio code.

All integers are little endian. `f32` is an IEEE 754 single. Lengths are in bytes. Coordinates
are millimetres with the origin at the top left of the page and y pointing down.

Confidence labels:

- **Verified**: holds for every file in the test corpus and is checked by a test with independent ground truth.
- **Observed**: holds for every file in the corpus, no independent ground truth.
- **Inferred**: a reading that fits the data but has not been tested against an alternative.
- **Unknown**: present in files, not decoded.

## 1. Corpus

| Set | Files | Saved by | Source |
|---|---|---|---|
| Card templates | 192 | Studio 5.0.x | `cutting_templates/` of Alan-Cha/silhouette-card-maker, MIT, commit `0da09b7` |
| Vendor samples | 39 | Studio 4.0 to 5.0 | `Resources` folder of the Silhouette Studio 5.0.539 installer (not redistributed) |

Seven card templates ship in `test/fixtures/card-templates` together with the generator's
`layouts.json`, which gives the intended card size, corner radius and grid for each template.

## 2. Container

### 2.1 Header (Observed)

| Offset | Size | Meaning |
|---|---|---|
| `0x000` | 13 | ASCII `silhouette05;` |
| `0x00d` | 3 | padding |
| `0x010` | 8 × n | u64 section sizes, until `0x3e8` |
| `0x3e8` | 8 | u64 version that saved the file |
| `0x3f0` | 8 | u64 version (oldest reader?) (Inferred) |
| `0x3f8` | 8 | u64 version (Inferred) |
| `0x400` | | section 0, then each following section end to end |

Versions are decimal-packed: `500000402` is 5.0.402, `400010156` is 4.0.10156
(`major × 10^8 + minor × 10^6 + build`).

Files saved by Studio 4.0 can declare a last section that runs a few bytes past the end of the
file (all four PixScan calibration files: section 9 is 4 bytes short). Readers should keep
the sections that fit and ignore the rest.

### 2.2 Sections (Observed)

| # | Content |
|---|---|
| 0 | Document: page and shape tree (section 3) |
| 1 | Image store. 17 bytes when the document has no raster images |
| 2 | PNG preview, rendered by Silhouette Studio when saving (512 × 512 for 5.x, smaller for 4.x) |
| 3 | 42 656 bytes of `0xFF` in most files, 0 bytes in some (Unknown) |
| 4 to 6 | Cached cut job. 5 and 6 are obfuscated text (Unknown) |
| 7, 8 | 4 bytes each (Unknown) |
| 9 | `studio_condition` CSV text |
| 10 to 13 | u64 length, then base64 JSON such as `{"root_uuid": ...}` |

Whole-file entropy is about 3.9 bits per byte, and every coordinate is a plain `f32`.
No compression or encryption is applied to section 0.

## 3. Document section

### 3.1 Blocks (Observed)

Section 0 starts with the magic again, then a tree of blocks:

```
block := 0x01, u32 size, body[size - 4]
```

`size` counts its own 4 bytes plus the body, so a block occupies `1 + size` bytes. The root
block starts at offset 13. Blocks nest, but bodies also contain raw values between blocks, and
those raw bytes can look like a block header. A greedy left-to-right walk therefore loses
blocks (the transform in 4.2 often contains `0x01` followed by a plausible size). studio3svg
indexes every offset that could start a block and lets the shape rule (4.1) select real ones.

### 3.2 Page size (Verified)

The root's first child block is followed directly by a second block. In that second block's body,
at offset `0x29`, are two `f32`: page width and page height in mm.

Checked: every card template's page holds all its cards, and the stored sizes match the paper
named in the file name (A3, A4, Letter, Legal, Arch B; landscape when the layout is landscape).

## 4. Shapes

### 4.1 Shape record (Verified)

```
0x00
block A      properties and the shape's local outline
65 bytes     transform (4.2)
block P      outline in page coordinates (5)
0x01, u64    serial number
block C      (Unknown, 12 bytes in most records)
u32 len, len bytes UTF-8   name, for example "Polygon", "Layer 1", "Linear Freehand"
```

A record is accepted only if all of these hold: the byte before A is `0x00`, a block starts
exactly 65 bytes after A ends, and that block parses as a path (5) consuming every byte.

Checked with `research/rulecheck.mjs` over all 231 corpus files: of 7 968 record tails (serial, block C,
name), every `Polygon`, `Linear Freehand`, `Tile`, `Content`, `Template` and layer record is
accepted. The 76 tails it does not accept are containers (`Group` 64, `Text` 10,
`Font Creation Sheet` 2), which use a different layout around their children. Their children
are ordinary records and are accepted.

Records nest: groups and text objects contain the records of their parts, and the letters of a
text object sit in a list named `cutunion`. Block P of a record always holds that record's
outline already placed on the page, so studio3svg draws leaves and skips containers by
dropping records whose P outline is empty.

### 4.2 Transform (Observed)

| Offset | Type | Meaning |
|---|---|---|
| 0 | 9 × f32 | 3 × 3 matrix, row major, last row `0 0 1` |
| 36 | 2 × f32 | centre (Inferred) |
| 44 | 4 × f32 | half extents (Inferred) |
| 60 | u32 | (Unknown) |
| 64 | u8 | (Unknown) |

The matrix maps the local outline in block A to the page. studio3svg does not need it because
block P already holds page coordinates.

### 4.3 Layers (Observed)

Layers are records named `Layer N` (or `Default Layer`) with an empty P outline. Which shapes
belong to which layer, and layer visibility, are not decoded.

### 4.4 Effects (Observed)

Block A carries effects as `key=value;` text, ending with `effect=<name>`:

```
requires_emboss=false;puncher_radius=1.3;puncher_gap=6.80000;puncher_style=edge;puncher_typeid=6ss;order=00;effect=puncher
```

Effect output (for example punched holes) is generated by the application and is not stored.
studio3svg reports each effect's parameters and does not draw the result.

## 5. Paths (Verified)

```
path      := i32 lastSubpath, subpath × (lastSubpath + 1)
subpath   := u32 size, u8 closed, i32 lastPoint, point × (lastPoint + 1)
point     := f32 x, f32 y, handle in, handle out
handle    := u8 0                    no handle
           | u8 1, f32 dx, f32 dy    control point at (x + dx, y + dy)
```

`size` counts the subpath's own bytes including the `size` field. `closed` is 0 or 1.
The index fields are signed: an empty subpath stores `lastPoint = -1` (`ffffffff`), seen in
150 records of each Font Template file, and an empty path stores `lastSubpath = -1`.

### 5.1 Drawing

A segment from point a to point b is a straight line when `a.out` and `b.in` are both absent,
otherwise a cubic Bézier with control points `a + a.out` and `b + b.in` (a missing handle
counts as the point itself). A closed subpath adds the segment from the last point back to the
first.

### 5.2 Why relative handles (Verified)

Card templates have 3 mm rounded corners (`layouts.json`). Reading handles as offsets from
their own point puts every sample of each corner arc 3.000 mm (±0.01) from the arc centre, on
all 7 fixtures. Reading them as absolute coordinates puts the control points near the page
origin and the shape falls apart.

## 6. Coverage matrix

| Feature | Status | Evidence |
|---|---|---|
| Magic, section table, version | Observed | 231 / 231 files parse |
| Truncated trailing section (Studio 4) | Observed | 4 PixScan files |
| Embedded PNG preview | Verified | Decoded by test helper for every file |
| Page size | Verified | `test/cards.test.js` |
| Shape record rule | Verified | All named records found; card counts match `layouts.json` |
| Path grammar, closed flag | Verified | Exact byte consumption on every record; `test/cards.test.js` |
| Bézier handles relative to point | Verified | 3 mm corner radius test |
| Outlines on page (P block) | Verified | Preview differential: 224 of 225 comparable files (TESTING.md) |
| Groups, text, `cutunion` letters | Observed | Text samples match their previews |
| Effect parameters | Observed | Parsed and reported |
| Effect output (puncher, emboss, offsets) | Not implemented | Generated by the app, not stored |
| Line and fill colours | Unknown | RGBA float quads seen in block A, offset varies |
| Line style, dash, thickness | Unknown | |
| Layer membership and visibility | Unknown | |
| Raster images (section 1) | Unknown | Not extracted |
| Text as text | Unknown | Letters are exported as outlines |
| Writing `.studio3` | Not implemented | |
| `silhouette04;` and older | Not implemented | Rejected with a clear error |
