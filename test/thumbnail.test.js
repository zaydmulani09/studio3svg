// Differential test against Silhouette Studio's own rendering: every .studio3 embeds a 512x512
// preview drawn by the app (SPEC 2.4). The decoded outlines, scaled onto the preview's ink box,
// must land on drawn pixels. Extra local corpora can be added with STUDIO3_CORPUS=dir1;dir2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStudio3 } from '../src/studio3.js';
import { bounds } from '../src/svg.js';
import { flatten, decodePng } from './helpers.js';

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.studio3')) yield p;
  }
}
const roots = [fileURLToPath(new URL('./fixtures/', import.meta.url)), ...(process.env.STUDIO3_CORPUS ?? '').split(';').filter(Boolean)];
const files = roots.flatMap((r) => [...walk(r)]);

/** Fraction of sampled outline points within `tol` px of preview ink, plus the fitted scales. */
export function agreement(doc, tol = 2) {
  const png = decodePng(Buffer.from(doc.thumbnail));
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.ink(x, y)) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const g = bounds(doc.shapes);
  const sx = (x1 - x0) / (g.maxX - g.minX), sy = (y1 - y0) / (g.maxY - g.minY);
  const s = Math.max(Math.min(sx, sy), 1e-9);
  // the preview is drawn at one scale; the longer side defines it
  const scale = (g.maxX - g.minX) * s >= (x1 - x0) - 2 ? sx : sy;
  const ox = (x0 + x1) / 2 - ((g.minX + g.maxX) / 2) * scale, oy = (y0 + y1) / 2 - ((g.minY + g.maxY) / 2) * scale;
  let hit = 0, n = 0;
  for (const shape of doc.shapes) for (const [x, y] of flatten(shape.path, 8)) {
    const px = Math.round(x * scale + ox), py = Math.round(y * scale + oy);
    n++;
    search: for (let dy = -tol; dy <= tol; dy++) for (let dx = -tol; dx <= tol; dx++) {
      const qx = px + dx, qy = py + dy;
      if (qx >= 0 && qy >= 0 && qx < png.width && qy < png.height && png.ink(qx, qy)) { hit++; break search; }
    }
  }
  return { ratio: hit / n, sx, sy };
}

for (const file of files) {
  test(`preview agreement ${file.split(/[\\/]/).slice(-2).join('/')}`, (t) => {
    const doc = parseStudio3(readFileSync(file));
    if (!doc.thumbnail) return t.skip('no preview');
    if (!doc.shapes.length) return t.skip('no outlines');
    if (doc.shapes.some((s) => s.effects.length)) return t.skip('effects change the drawn extent');
    const { ratio, sx, sy } = agreement(doc);
    assert.ok(Math.abs(sx - sy) / Math.max(sx, sy) < 0.03, `aspect: x scale ${sx}, y scale ${sy}`);
    assert.ok(ratio > 0.97, `only ${(ratio * 100).toFixed(1)}% of outline samples land on preview ink`);
  });
}

// Control: the measure must reject slightly wrong geometry. Stretching x by 7% and mirroring y
// shifts the inner card edges off the drawn grid, so agreement has to drop well below the bar.
test('preview agreement rejects distorted geometry', () => {
  const doc = parseStudio3(readFileSync(new URL('./fixtures/card-templates/a4-poker-v3.studio3', import.meta.url)));
  const g = bounds(doc.shapes);
  const flip = (p) => p && [p[0], -p[1]];
  for (const s of doc.shapes) for (const sp of s.path.subpaths) {
    sp.points = sp.points.map((p) => ({ x: p.x * 1.07, y: g.maxY + g.minY - p.y, in: flip(p.in), out: flip(p.out) }));
  }
  assert.ok(agreement(doc).ratio < 0.9);
});
