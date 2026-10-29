// Exploration: find byte ranges that parse as a Bezier path (per the hypothesis in research notes).
import { readFileSync } from 'node:fs';
const f = readFileSync(process.argv[2]);
const doc = f.subarray(0x400, 0x400 + Number(f.readBigUInt64LE(0x10)));

function tryPath(b, p) {
  const start = p;
  if (p + 4 > b.length) return null;
  const last = b.readUInt32LE(p); p += 4;
  if (last > 200) return null;
  const subs = [];
  for (let i = 0; i <= last; i++) {
    if (p + 9 > b.length) return null;
    const size = b.readUInt32LE(p); const sp = p; p += 4;
    const closed = b[p++]; if (closed > 1) return null;
    const lastPt = b.readUInt32LE(p); p += 4; if (lastPt > 100000) return null;
    const pts = [];
    for (let j = 0; j <= lastPt; j++) {
      if (p + 10 > b.length) return null;
      const x = b.readFloatLE(p), y = b.readFloatLE(p + 4); p += 8;
      if (!(Math.abs(x) < 1e5 && Math.abs(y) < 1e5)) return null;
      const hs = [];
      for (let k = 0; k < 2; k++) {
        const fl = b[p++]; if (fl > 1) return null;
        if (fl) { hs.push([b.readFloatLE(p), b.readFloatLE(p + 4)]); p += 8; } else hs.push(null);
      }
      pts.push({ x, y, in: hs[0], out: hs[1] });
    }
    if (p - sp !== size) return null;
    subs.push({ closed, pts });
  }
  return { start, end: p, subs };
}
const found = [];
for (let p = 0; p < doc.length - 13; p++) {
  const r = tryPath(doc, p);
  if (r && r.subs.some((s) => s.pts.length > 1)) { found.push(r); p = r.end - 1; }
}
for (const r of found) {
  const xs = r.subs.flatMap((s) => s.pts.map((q) => q.x)), ys = r.subs.flatMap((s) => s.pts.map((q) => q.y));
  console.log(`path @${r.start}-${r.end} subs=${r.subs.length} pts=${xs.length} x[${Math.min(...xs).toFixed(2)},${Math.max(...xs).toFixed(2)}] y[${Math.min(...ys).toFixed(2)},${Math.max(...ys).toFixed(2)}] closed=${r.subs.map((s) => s.closed).join('')}`);
}
