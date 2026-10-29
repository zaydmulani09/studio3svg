// Corpus check for SPEC 4.1: every record tail (P end, 0x01, u64 serial, block C, u32 len, name)
// must belong to a record the shape rule accepts (empty outlines included), and vice versa.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseStudio3, readPath } from '../src/studio3.js';
function* walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) yield* walk(p); else if (p.endsWith('.studio3')) yield p; } }
const names = {}, per = {};
let files = 0, tails = 0, accepted = 0, missed = 0, bad = 0;
for (const root of process.argv.slice(2)) for (const f of walk(root)) {
  const buf = readFileSync(f);
  let doc;
  try { doc = parseStudio3(buf); } catch (e) { console.log('PARSE FAIL', f, e.message); bad++; continue; }
  files++;
  const b = buf.subarray(doc.sections[0].offset, doc.sections[0].offset + doc.sections[0].size);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // accepted records, empty outlines included
  const acc = new Set();
  for (let a = 1; a + 5 < b.length; a++) {
    if (b[a] !== 1 || b[a - 1] !== 0) continue;
    const aEnd = a + 1 + v.getUint32(a + 1, true), p = aEnd + 65;
    if (p + 5 > b.length || b[p] !== 1) continue;
    const pEnd = p + 1 + v.getUint32(p + 1, true);
    if (pEnd > b.length) continue;
    try { readPath(b, v, p + 5, pEnd); acc.add(pEnd); } catch {}
  }
  accepted += acc.size;
  // tails: 0x01 u64 serial, 0x01 u32 csize, then u32 len + printable name
  for (let t = 0; t + 18 < b.length; t++) {
    if (b[t] !== 1 || b[t + 9] !== 1) continue;
    const c = v.getUint32(t + 10, true);
    if (c < 4 || c > 64) continue;
    const n = t + 10 + c;
    if (n + 4 > b.length) continue;
    const len = v.getUint32(n, true);
    if (len < 3 || len > 64 || n + 4 + len > b.length) continue;
    const s = b.subarray(n + 4, n + 4 + len).toString('latin1');
    if (!/^[A-Z][A-Za-z0-9 _-]+$/.test(s)) continue;
    tails++;
    if (!acc.has(t)) { missed++; names[s] = (names[s] ?? 0) + 1; if (s === 'Polygon') { const k = f.split(/[/\\]/).pop(); per[k] = (per[k] ?? 0) + 1; } }
  }
}
console.log({ files, bad, tails, accepted, missed }, names, per);
