// Exploration only: dump the block tree of a .studio3 document section.
import { readFileSync } from 'node:fs';
const file = readFileSync(process.argv[2]);
const sizes = [];
for (let o = 0x10; o < 0x3e8; o += 8) sizes.push(Number(file.readBigUInt64LE(o)));
const doc = file.subarray(0x400, 0x400 + sizes[0]);
const maxDepth = Number(process.argv[3] ?? 3);

function isBlockAt(b, p, end) {
  if (b[p] !== 1 || p + 5 > end) return false;
  const s = b.readUInt32LE(p + 1);
  return s >= 4 && p + 1 + s <= end;
}
function hex(b, p, n) { return b.subarray(p, Math.min(p + n, b.length)).toString('hex'); }
function walk(b, p, end, depth, label) {
  const s = b.readUInt32LE(p + 1);
  const bodyStart = p + 5, bodyEnd = p + 1 + s;
  const txt = b.subarray(bodyStart, bodyEnd).toString('latin1').match(/[ -~]{4,}/g) ?? [];
  console.log(`${'  '.repeat(depth)}${label} @${p} size=${s} head=${hex(b, bodyStart, 20)} ${txt.slice(0, 3).join('|')}`);
  if (depth >= maxDepth) return;
  // children: scan the body for a run of consecutive blocks starting at a few candidate offsets
  let q = bodyStart, n = 0;
  while (q < bodyEnd) {
    if (isBlockAt(b, q, bodyEnd)) {
      walk(b, q, bodyEnd, depth + 1, `#${n++}`);
      q += 1 + b.readUInt32LE(q + 1);
    } else q++;
  }
}
walk(doc, 13, doc.length, 0, 'root');
