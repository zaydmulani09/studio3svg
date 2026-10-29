// Exploration: structural walk of the object list.
import { readFileSync } from 'node:fs';
const f = readFileSync(process.argv[2]);
const doc = f.subarray(0x400, 0x400 + Number(f.readBigUInt64LE(0x10)));
const blk = (p) => (doc[p] === 1 ? { start: p, body: p + 5, end: p + 1 + doc.readUInt32LE(p + 1) } : null);

function children(b) {
  const out = []; let q = b.body;
  while (q < b.end) { const c = blk(q); if (!c || c.end > b.end) break; out.push(c); q = c.end; }
  return { out, stop: q };
}
const root = blk(13);
// object list: a root child whose body is u32 lastIndex followed by blocks
let list = null;
for (let q = root.body; q < root.end;) {
  const c = blk(q); if (!c) break;
  const last = doc.readUInt32LE(c.body);
  if (last < 100000 && blk(c.body + 4)) { list = c; break; }
  q = c.end;
}
const last = doc.readUInt32LE(list.body);
let q = list.body + 4;
for (let i = 0; i <= last; i++) {
  const o = blk(q); if (!o) { console.log('not a block at', q); break; }
  const kind = doc[o.body];
  const a = blk(o.body + 1);
  let info = `obj ${i} @${o.start} size=${o.end - o.start} kind=${kind}`;
  if (a) {
    const m = a.end;
    const fl = (k) => doc.readFloatLE(m + 4 * k);
    const mat = [...Array(9)].map((_, k) => fl(k).toFixed(3));
    const ctr = [fl(9), fl(10)].map((v) => v.toFixed(2));
    const ext = [fl(11), fl(12), fl(13), fl(14)].map((v) => v.toFixed(2));
    const after = m + 60; const u32 = doc.readUInt32LE(after); const u8 = doc[after + 4];
    const pb = blk(after + 5);
    info += ` A=${a.end - a.start} mat=[${mat}] ctr=${ctr} ext=${ext} u32=${u32} u8=${u8} pathBlock=${pb ? pb.end - pb.start : 'none'}`;
    if (pb) {
      const s = doc[pb.end]; const serial = doc.readBigUInt64LE(pb.end + 1); const c = blk(pb.end + 9);
      if (c) { const nl = doc.readUInt32LE(c.end); info += ` serial=${serial} name=${JSON.stringify(doc.subarray(c.end + 4, c.end + 4 + nl).toString('utf8'))} [s=${s}]`; }
    }
  }
  console.log(info);
  q = o.end;
}
