// Find every "Polygon"/name-like record tail and report whether readShapes accepted it.
import { readFileSync } from 'node:fs';
import { parseStudio3 } from '../src/studio3.js';
const buf = readFileSync(process.argv[2]);
const doc = parseStudio3(buf);
const d = buf.subarray(doc.sections[0].offset, doc.sections[0].offset + doc.sections[0].size);
const got = new Set(doc.shapes.map((s) => s.recordOffset));
const name = Buffer.from(process.argv[3] ?? 'Polygon');
let i = -1, n = 0;
while ((i = d.indexOf(name, i + 1)) >= 0) {
  if (d.readUInt32LE(i - 4) !== name.length) continue;
  n++;
  console.log('name at', i, 'ctx', d.subarray(i - 40, i - 4).toString('hex'));
}
console.log('names', n, 'shapes', doc.shapes.length, [...got].slice(0, 20));
// block-level diagnosis for each record tail: which enclosing blocks were indexed
const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
i = -1;
while ((i = d.indexOf(name, i + 1)) >= 0) {
  if (d.readUInt32LE(i - 4) !== name.length) continue;
  const pEnd = i - 4 - 13 - 9;
  // walk back: find a 0x01 + u32 size whose end is pEnd
  let pStart = -1;
  for (let q = pEnd - 5; q > pEnd - 200000 && q >= 0; q--) if (d[q] === 1 && q + 1 + v.getUint32(q + 1, true) === pEnd) { pStart = q; break; }
  console.log(i, 'pStart', pStart, 'size', pEnd - pStart, 'byte before A?', pStart >= 0 ? d.subarray(pStart - 70, pStart - 60).toString('hex') : '');
}
function indexBlocks(b, v) {
  const map = new Map(); const stack = [[13, b.length]];
  while (stack.length) { const [from, to] = stack.pop(); let q = from;
    while (q + 5 <= to) { if (b[q] === 1) { const size = v.getUint32(q + 1, true); const end = q + 1 + size;
        if (size >= 4 && end <= to) { map.set(q, end); stack.push([q + 5, end]); q = end; continue; } } q++; } }
  return map;
}
const blocks = indexBlocks(d, v);
i = -1;
while ((i = d.indexOf(name, i + 1)) >= 0) {
  if (d.readUInt32LE(i - 4) !== name.length) continue;
  const pEnd = i - 26;
  let pStart = -1;
  for (let q = pEnd - 5; q >= 0; q--) if (d[q] === 1 && q + 1 + v.getUint32(q + 1, true) === pEnd) { pStart = q; break; }
  const aEnd = pStart - 65;
  const aStarts = [...blocks].filter(([s, e]) => e === aEnd).map(([s]) => [s, d[s - 1]]);
  const cover = [...blocks].filter(([s, e]) => s < pStart && e > pStart && e < pEnd + 50).map(([s, e]) => [s, e]);
  console.log(i, 'P indexed', blocks.has(pStart), 'A cands', JSON.stringify(aStarts), 'false covers', JSON.stringify(cover));
}
