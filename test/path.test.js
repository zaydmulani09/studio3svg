// Path grammar (SPEC 5) on hand-built bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPath, Studio3Error } from '../src/studio3.js';

function build(subpaths) {
  const parts = [];
  const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const f32 = (n) => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; };
  parts.push(i32(subpaths.length - 1));
  for (const sp of subpaths) {
    const body = [Buffer.from([sp.closed ? 1 : 0]), i32(sp.points.length - 1)];
    for (const p of sp.points) {
      body.push(f32(p.x), f32(p.y));
      for (const h of [p.in, p.out]) body.push(h ? Buffer.concat([Buffer.from([1]), f32(h[0]), f32(h[1])]) : Buffer.from([0]));
    }
    const b = Buffer.concat(body);
    parts.push(i32(b.length + 4), b);
  }
  const bytes = Buffer.concat(parts);
  return [bytes, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)];
}
const read = ([b, v]) => readPath(b, v, 0, b.length);

test('reads points, closed flag and handles', () => {
  const pts = [{ x: 1, y: 2, in: null, out: [0.5, 0] }, { x: 3, y: 4, in: [-0.5, 0], out: null }];
  assert.deepEqual(read(build([{ closed: true, points: pts }])), { subpaths: [{ closed: true, points: pts }] });
});

test('an empty subpath stores its last point index as -1', () => {
  const r = read(build([{ closed: true, points: [{ x: 0, y: 0, in: null, out: null }] }, { closed: false, points: [] }]));
  assert.equal(r.subpaths[1].points.length, 0);
});

test('an empty path stores its last subpath index as -1', () => {
  assert.deepEqual(read(build([])), { subpaths: [] });
});

test('rejects inconsistent sizes and flags', () => {
  const [b] = build([{ closed: false, points: [{ x: 0, y: 0, in: null, out: null }] }]);
  const bad = (mutate) => { const c = Buffer.from(b); mutate(c); return () => readPath(c, new DataView(c.buffer, c.byteOffset, c.byteLength), 0, c.length); };
  assert.throws(bad((c) => c.writeInt32LE(c.readInt32LE(4) + 1, 4)), Studio3Error); // subpath size
  assert.throws(bad((c) => { c[8] = 2; }), Studio3Error); // closed flag
  assert.throws(bad((c) => c.writeInt32LE(-2, 9)), Studio3Error); // point index
  assert.throws(bad((c) => c.writeInt32LE(1e6, 9)), Studio3Error); // more points than bytes
  const long = Buffer.concat([b, Buffer.alloc(1)]);
  assert.throws(() => readPath(long, new DataView(long.buffer, long.byteOffset, long.byteLength), 0, long.length), /trailing/);
});
