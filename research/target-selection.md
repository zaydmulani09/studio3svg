# Target selection log (2026-10-28)

## Chosen: Silhouette Studio `.studio3` documents

- Mainstream: Silhouette America says it has 5M+ users (https://www.silhouetteamerica.com/about-us, a vendor figure). The Cameo, Portrait and Curio cutters all use Silhouette Studio.
- Gap: the free Basic edition saves only `.studio3`. Opening SVG requires Designer Edition and saving SVG requires Business Edition (about $100).
  - Silhouette software page, fetched 2026-10-28: https://www.silhouetteamerica.com/software
  - Silhouette School, 2026-07-06: https://www.silhouetteschoolblog.com/2026/07/how-to-save-silhouette-file-as-svg-for.html
  - Common workaround is screenshot then trace in Inkscape: https://www.silhouetteschoolblog.com/2016/03/converting-silhouette-studio-files-to.html, https://cuttingforbusiness.com/?p=3224
- Existing work audit:
  - Ideas R Us web converter: closed source, 10 conversions a day.
  - innerscene studio3 viewer: closed source, paths only.
  - spuder/shadow-garage `src/lib/studio3.ts` (MIT, pushed 2026-10-27, 7 stars): reads and moves "sticker" objects (artwork plus cut outline) inside a sticker editor. Rotated or mirrored shapes, text and other object kinds are skipped. Not a general converter.
  - GitHub repo search for `studio3` and `silhouette studio file`: no general reader.
- Encryption: none observed. Header magic is `silhouette05;`, entropy is 3.88 bits per byte over the whole file, and coordinates are plain float32 (`a4-standard-v5.studio3`).
- Samples: Alan-Cha/silhouette-card-maker (MIT) has 197 `.studio3` files made by Silhouette Studio, plus `assets/layouts.json` with the intended card geometry (ground truth).

## Rejected

| Candidate | Reason |
|---|---|
| Paint.NET `.pdn` | Format unchanged in 5.1.12. OpenPDN (Rust, pushed 2026-10-27) reads and writes 5.1.12 files. |
| Windows 11 Paint `.paint` | Many free image editors exist, and setiri/mspaintlib (MIT, 2026-09-27) already reads and writes layers. |
| Notepad TabState | notepad_parser and others already cover it. |
| Figma `.fig` | fig2sketch is maintained (pushed 2026-10-28). |
| OneNote `.one` | onenote.rs and pyOneNote cover it. |
| Brother `.fcm` | fcmlib and open-fcm cover it. |
| LightBurn `.lbrn2` | Plain XML; lbrn2-to-svg exists. |
| xTool `.xcs` | Plain JSON; the free app exports SVG; xcsReader exists. |
| MediBang/FireAlpaca `.mdp` | The free app exports PSD, so lock-in is weak. |
| Affinity `.af` | Free app exports SVG/PDF/PSD; Inkscape extension exists for .afdesign. |
| CapCut/JianYing drafts | JianYing 6+ drafts are encrypted with a vendor key. Out of scope. |
| Cricut Design Space | Account-bound, projects are not local files. |
| Logitech G HUB | SQLite + JSON, extractors exist. |
| Photos Legacy `.vpb` | Viable, but the stack is .NET Native AOT and user evidence is soft. Runner-up. |
| Filmora `.wfp` | ZIP + JSON, lower lock-in severity. Runner-up. |
