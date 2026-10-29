# Changelog

## 0.1.0 (2026-10-28)

First release.

- Reads Silhouette Studio 5 `.studio3` documents (`silhouette05;`): page size, every cut outline
  (shapes, freehand lines, text letters, shapes in groups), effect parameters and the stored preview.
- Tolerates Studio 4.0 files whose last section is declared a few bytes too long.
- `studio3svg` command: SVG in millimetres, `--fit page|content`, `--json`, `--thumbnail`.
- Browser converter (`index.html`), nothing uploaded.
- Tests: card-template ground truth, preview differential, path grammar, malformed input and fuzzing, CLI.
