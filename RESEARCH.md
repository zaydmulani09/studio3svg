# Research notes

How the target was chosen and how the format was worked out. Dates are 2026-10-28 unless noted.

## 1. Target choice

### Chosen: Silhouette Studio `.studio3`

- **Mainstream.** Silhouette America reports over 5 million users (vendor figure,
  https://www.silhouetteamerica.com/about-us). Its Cameo, Portrait and Curio cutters are driven
  by Silhouette Studio.
- **Gap.** The free Basic Edition saves only `.studio3`. Opening SVG needs Designer Edition and
  saving SVG needs Business Edition (https://www.silhouetteamerica.com/software).
- **Demonstrated need.**
  - Silhouette School, 2026-07-06, on saving a Silhouette file as SVG: https://www.silhouetteschoolblog.com/2026/07/how-to-save-silhouette-file-as-svg-for.html
  - The common workaround is a screenshot traced in Inkscape: https://www.silhouetteschoolblog.com/2016/03/converting-silhouette-studio-files-to.html and https://cuttingforbusiness.com/?p=3224
- **Existing work.**
  - Ideas R Us web converter: closed source, 10 conversions a day.
  - innerscene studio3 viewer: closed source.
  - spuder/shadow-garage `src/lib/studio3.ts` (MIT, pushed 2026-10-27): reads and moves "sticker"
    objects inside a sticker editor. It skips rotated or mirrored shapes, text and other object
    kinds, and is not a general converter.
  - GitHub search for `studio3` and "silhouette studio file": no general open reader.
- **Legal.** The files are the user's own designs. Nothing is encrypted, so no DRM, activation or
  access control is bypassed. No Silhouette code or assets are included. Vendor sample files
  were used for local testing only and are not redistributed.

### Rejected candidates

| Candidate | Reason |
|---|---|
| Paint.NET `.pdn` | Format unchanged in 5.1.12; OpenPDN already reads and writes it |
| Windows 11 Paint `.paint` | Many free image editors exist; setiri/mspaintlib already reads and writes layers |
| Notepad TabState | notepad_parser and others cover it |
| Figma `.fig` | fig2sketch is maintained |
| OneNote `.one` | onenote.rs and pyOneNote cover it |
| Brother ScanNCut `.fcm` | fcmlib and open-fcm cover it |
| LightBurn `.lbrn2` | Plain XML; lbrn2-to-svg exists |
| xTool `.xcs` | Plain JSON; the free app exports SVG |
| MediBang/FireAlpaca `.mdp` | The free app exports PSD |
| Affinity `.af` | The free app exports SVG, PDF and PSD |
| CapCut/JianYing drafts | Encrypted with a vendor key: out of scope |
| Cricut Design Space | Projects are account-bound, not local files |
| Logitech G HUB | SQLite and JSON; extractors exist |
| Photos Legacy `.vpb` | Viable but weaker user evidence (runner-up) |
| Filmora `.wfp` | ZIP and JSON, low lock-in (runner-up) |

## 2. Artifacts

| Artifact | SHA-256 | Source |
|---|---|---|
| `SS_V5.0.539.001_W6R.exe` (installer) | `19e31e4697c13af4da730aa7866a547d11b475c62fa2c792a96c15a94e907b86` | https://medias3.silhouettedesignstore.com/files/softwares/ss/SS_V5.0.539.001_W6R.exe (linked from silhouetteamerica.com/software) |
| `nested.exe` (Advanced Installer payload) | `a861671f90774ed12a8b1b0b5da0c4de268d492ba094a920a2034a6191626a0b` | extracted from the installer |
| `Silhouette Studio.exe` 5.0.539 (Xojo, x86-64, 290 MB) | `2647b38fcf97cb54a7c283d88afbdc5ed721acb27645b4ba4db0279050bde9f5` | extracted from `nested.exe` |
| silhouette-card-maker | commit `0da09b729814aa5aafde024b5a6059624fa87951` | https://github.com/Alan-Cha/silhouette-card-maker (MIT) |

### Isolation

The installer was never run on the Windows host. It was unpacked inside a dedicated WSL 2
distribution (Ubuntu 24.04) with Windows interop disabled, Windows paths removed from `PATH`
and drive automount off (`/etc/wsl.conf`: `[interop] enabled=false, appendWindowsPath=false`,
`[automount] enabled=false`). `nested.exe /extract` ran under Wine 9.0 there. Silhouette
Studio itself was never launched anywhere. Every `.studio3` file was produced by other people
with their own copies of Silhouette Studio.

## 3. Tools

- **REA 6.8.0** (`rea-agents` from npm, the official package), run as an MCP server.
  - On Windows: driven over stdio by a small client. On the WSL side: a long-lived session with
    Ghidra 12.1.4 and OpenJDK 21 as the analysis provider.
  - Used for: artifact identification and hashing (`open_binary`, `inspect_artifact`), attempted
    PE resource inspection, and Ghidra-backed string and procedure search on the Studio executable.
- Evidence IDs recorded:
  - `inspect_artifact` on `nested.exe`: `ev_253ac1193bdeddecfa96836b4d1a2414bf9ca00886636e0b6a5ea352ce5df588`
  - `inspect_pe_resources` on `nested.exe`: refused by REA's 64 MB input limit, so it was unpacked with Wine as above.
- REA's built-in provider (Kuna) does not accept PE images, so every executable query needs Ghidra.
  Ghidra's auto-analysis of the 290 MB Xojo executable was still running at release time
  (see section 5).
- Plain byte tools (`strings`, Node scripts in `research/`) for the files themselves.

## 4. Method

The format was decoded from the files, not from the executable's code.

1. **Executable strings.** The Xojo binary keeps method names. `Shape.SaveToStream`,
   `BezierPath.SaveToStream`, `BezierContour.SaveToStream`, `BezierPoint.SaveToStream` and
   `ShapeProperties.SaveToStream` showed that shapes serialise as nested objects. The property
   names (`line_colour`, `fill_colour`, `line_thickness`, `dash`, `effects`, `layer`) say what
   block A should contain. The magic `silhouette05` does not appear as a literal.
2. **Container.** The size table at `0x10` adds up exactly to the file length (all 5.x files).
   Section 2 starts with a PNG signature, and the other sections were identified by content.
3. **Blocks.** Section 0 has many `01 <u32>` pairs whose value is the distance to a later
   boundary. `research/explore.mjs` dumps the resulting tree.
4. **Coordinates.** `a4-standard-v5.studio3` has 8 cards of 63 × 88 mm. The float pairs
   inside one block repeat with those spacings, which located the path block (P).
5. **Grammar.** The path grammar (SPEC 5) was fitted on that file. `research/pathblocks.mjs` then
   checked that it consumes every candidate block exactly over the corpus.
6. **Handles.** Two readings of the handles were possible: absolute, or relative to their point.
   The published 3 mm corner radius told them apart (SPEC 5.2).
7. **Verification.** `layouts.json` from the card generator gives the true geometry. Each file's
   own preview gives a second, independent check for every file (TESTING.md).
8. **Failures drove fixes.** Every differential failure was traced to a cause before anything
   was changed:
   - A greedy block walk lost P blocks hidden behind fake headers in the transform bytes. Fixed
     by indexing every candidate offset (SPEC 3.1).
   - Bounding boxes taken from control points distorted the fit for curvy shapes. Fixed with
     exact curve extrema.
   - Empty subpaths store `-1`. Found from 150 unread records in each Font Template file.
   - Studio 4 files declare a trailing section a few bytes too long.
   - Very light guide lines in the Font Template preview fell under the ink threshold.

   None of these fixes weakened an assertion. The one remaining failure is documented in
   TESTING.md.

## 5. Open questions

- **Colours and line styles.** RGBA float quads such as `(1, 0.6, 0.6, 1)` sit in block A at
  varying offsets. Decoding them needs the field order of `ShapeProperties.SaveToStream`, which
  needs the Ghidra analysis to finish.
- **Layer membership.** Which records belong to which layer is not decoded.
- **Container records.** `Group` and `Text` records use a different layout around their children.
- **Sections 3 to 8.** Not decoded. Sections 5 and 6 hold obfuscated text belonging to a cached cut job.
