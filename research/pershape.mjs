import { readFileSync } from 'node:fs';
import { parseStudio3 } from '../src/studio3.js';
import { bounds } from '../src/svg.js';
import { flatten, decodePng } from '../test/helpers.js';
for (const f of process.argv.slice(2)) {
  const doc = parseStudio3(readFileSync(f));
  const png = decodePng(Buffer.from(doc.thumbnail));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.ink(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const g = bounds(doc.shapes);
  console.log('##', f.split('/').pop(), 'page', doc.page, 'ink', [x0, y0, x1, y1], 'geom', [g.minX, g.minY, g.maxX, g.maxY].map((n) => +n.toFixed(1)), doc.warnings);
  for (const s of doc.shapes) {
    const b = bounds([s]);
    console.log('  ', s.name, s.serial, 'sub', s.path.subpaths.length, 'bb', [b.minX, b.minY, b.maxX, b.maxY].map((n) => +n.toFixed(1)), 'm', s.matrix.map((n) => +n.toFixed(2)).join(','), s.effects.length ? JSON.stringify(s.effects) : '');
  }
}
