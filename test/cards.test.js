// Ground truth: card templates made by Silhouette Studio from layouts the generator documents
// (fixtures/card-templates/layouts.json, MIT, Alan-Cha/silhouette-card-maker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseStudio3 } from '../src/studio3.js';
import { bounds } from '../src/svg.js';
import { flatten } from './helpers.js';

const dir = new URL('./fixtures/card-templates/', import.meta.url);
const layouts = JSON.parse(readFileSync(new URL('layouts.json', dir)));
const mm = (s) => (s.endsWith('in') ? parseFloat(s) * 25.4 : parseFloat(s));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.studio3'))) {
  const m = file.match(/^(a3|a4|letter|legal|arch_b)-(.+?)(-borderless)?-v(\d+)\.studio3$/);
  test(`card template ${file}`, () => {
    const [, paper, card, borderless, version] = m;
    const layout = layouts.layouts[paper][card][borderless ? 'borderless' : 'default'];
    assert.equal(layout.version, Number(version), 'fixture matches the layout version');
    const size = layouts.card_sizes[card];
    const [cw, ch] = [mm(size.width), mm(size.height)];

    const doc = parseStudio3(readFileSync(new URL(file, dir)));
    assert.equal(doc.shapes.length, layout.num_rows * layout.num_cols, 'one outline per card');
    const radius = mm(layouts.defaults.card_radius);
    for (const s of doc.shapes) {
      assert.equal(s.path.subpaths.length, 1);
      assert.ok(s.path.subpaths[0].closed);
      const b = bounds([s]);
      const [w, h] = [b.maxX - b.minX, b.maxY - b.minY];
      const fits = (a, c) => Math.abs(a - c) < 0.02;
      assert.ok((fits(w, cw) && fits(h, ch)) || (fits(w, ch) && fits(h, cw)), `${w}x${h} vs ${cw}x${ch}`);
      // Rounded corners: with handles read as offsets from their point, the arc passes at
      // radius r from the corner's centre (cubic approximation error < 0.1%).
      const cx = b.minX + radius, cy = b.minY + radius;
      const corner = flatten(s.path, 32).filter(([x, y]) => x < cx && y < cy);
      assert.ok(corner.length > 4, 'top-left corner sampled');
      for (const [x, y] of corner) assert.ok(Math.abs(Math.hypot(x - cx, y - cy) - radius) < 0.01, `corner radius at ${x},${y}`);
    }
    // cards sit inside the page
    const all = bounds(doc.shapes);
    assert.ok(all.minX >= 0 && all.minY >= 0 && all.maxX <= doc.page.widthMm && all.maxY <= doc.page.heightMm);
  });
}
