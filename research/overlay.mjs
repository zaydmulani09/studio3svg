// Overlay decoded outlines (fitted like the differential test) on each file's embedded preview.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseStudio3 } from '../src/studio3.js';
import { pathData, bounds } from '../src/svg.js';
import { agreement } from '../test/thumbnail.test.js';
const out = [];
for (const f of process.argv.slice(3)) {
  const doc = parseStudio3(readFileSync(f));
  const g = bounds(doc.shapes);
  const r = agreement(doc);
  const png = Buffer.from(doc.thumbnail).toString('base64');
  const paths = doc.shapes.map((s) => `<path d="${pathData(s.path)}"/>`).join('');
  out.push(`<figure><figcaption>${f.split('/').pop()} ${(r.ratio*100).toFixed(1)}% sx=${r.sx.toFixed(3)} sy=${r.sy.toFixed(3)} n=${doc.shapes.length}</figcaption>
<div style="display:flex;gap:8px"><img width=400 src="data:image/png;base64,${png}">
<svg width=400 height=400 viewBox="${g.minX} ${g.minY} ${g.maxX-g.minX} ${g.maxY-g.minY}"><g fill=none stroke=red stroke-width="${(g.maxX-g.minX)/300}">${paths}</g></svg></div></figure>`);
}
writeFileSync(process.argv[2], `<body style="font:12px sans-serif">${out.join('')}</body>`);
