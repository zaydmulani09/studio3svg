// Exploration: blocks whose body is exactly one Bezier path, with their enclosing block chain.
import { readFileSync } from 'node:fs';
const f = readFileSync(process.argv[2]);
const d = f.subarray(0x400, 0x400 + Number(f.readBigUInt64LE(0x10)));
function parsePath(b, p, end) {
  const last = b.readUInt32LE(p); p += 4; if (last > 5000) return -1;
  for (let i = 0; i <= last; i++) {
    if (p + 9 > end) return -1;
    const size = b.readUInt32LE(p), sp = p; p += 4;
    if (b[p++] > 1) return -1;
    const lp = b.readUInt32LE(p); p += 4; if (lp > 1e6) return -1;
    for (let j = 0; j <= lp; j++) {
      p += 8; if (p > end) return -1;
      for (let k = 0; k < 2; k++) { const fl = b[p++]; if (fl > 1) return -1; if (fl) p += 8; }
    }
    if (p - sp !== size || p > end) return -1;
  }
  return p;
}
const hits = [];
function walk(p, end, chain) {
  let q = p;
  while (q + 5 <= end) {
    if (d[q] === 1) {
      const s = d.readUInt32LE(q + 1), be = q + 1 + s;
      if (s >= 4 && be <= end) {
        const body = q + 5;
        if (be - body >= 13 && parsePath(d, body, be) === be) hits.push({ at: q, chain: [...chain] });
        walk(body, be, [...chain, q]);
        q = be; continue;
      }
    }
    q++;
  }
}
walk(13, d.length, []);
for (const h of hits) console.log(`pathblock @${h.at} depth=${h.chain.length} chain=${h.chain.join('>')}`);
// rule check: page path block preceded by [0x00][block A][60 bytes transform][u32][u8]
let ok = 0, bad = 0;
const blockEnds = new Map();
(function idx(p, end) { let q = p; while (q + 5 <= end) { if (d[q] === 1) { const s = d.readUInt32LE(q + 1), be = q + 1 + s; if (s >= 4 && be <= end) { blockEnds.set(be, q); idx(q + 5, be); q = be; continue; } } q++; } })(13, d.length);
for (const h of hits) { const a = blockEnds.get(h.at - 65); if (a !== undefined && d[a - 1] === 0) ok++; else { bad++; if (process.env.V) console.log('rule miss @', h.at); } }
console.log(`RULE ok=${ok} bad=${bad}`);
