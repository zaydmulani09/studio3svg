// Exploration: for each shape record, list RGBA-looking float quads in block A, with offsets relative to A's body.
import { readFileSync } from 'node:fs';
const f = readFileSync(process.argv[2]);
const d = f.subarray(0x400, 0x400 + Number(f.readBigUInt64LE(0x10)));
const blockEnds = new Map(); const blockAt = new Map();
(function idx(p, end) { let q = p; while (q + 5 <= end) { if (d[q] === 1) { const s = d.readUInt32LE(q + 1), be = q + 1 + s; if (s >= 4 && be <= end) { blockEnds.set(be, q); blockAt.set(q, be); idx(q + 5, be); q = be; continue; } } q++; } })(13, d.length);
for (const [aStart, aEnd] of blockAt) {
  if (d[aStart - 1] !== 0) continue;
  const pb = aEnd + 65;
  if (!blockAt.has(pb)) continue;
  const pe = blockAt.get(pb);
  const nb = pe + 9; const ne = blockAt.get(nb); if (!ne) continue;
  const name = d.subarray(ne + 4, ne + 4 + d.readUInt32LE(ne)).toString('utf8');
  const quads = [];
  for (let o = aStart + 5; o + 16 <= aEnd; o++) {
    const v = [0, 1, 2, 3].map((k) => d.readFloatLE(o + 4 * k));
    if (v.every((x) => x >= 0 && x <= 1) && v[3] === 1 && v.slice(0, 3).some((x) => x > 0 && x < 1)) quads.push(`+${o - aStart - 5}:${v.slice(0, 3).map((x) => x.toFixed(3)).join(',')}`);
  }
  console.log(`${name.padEnd(16)} A=${aEnd - aStart} ${quads.join(' ')}`);
}
