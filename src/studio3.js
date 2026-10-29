// Reader for Silhouette Studio .studio3 documents (magic "silhouette05;").
// Layout and rules are documented in SPEC.md; section numbers in comments refer to it.

const MAGIC = 'silhouette05;';
const SIZE_TABLE = 0x10; // SPEC 2.1
const SIZE_TABLE_END = 0x3e8;
const VERSIONS = 0x3e8; // SPEC 2.2
const SECTIONS = 0x400; // SPEC 2.3
const TRANSFORM_BYTES = 65; // SPEC 4.2: 9 f32 matrix, 2 f32 centre, 4 f32 extents, u32, u8
const PAGE_SIZE_AT = 0x29; // SPEC 3.2, within the body of the root's second block

export class Studio3Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'Studio3Error';
  }
}

/**
 * @param {Uint8Array} bytes
 */
export function parseStudio3(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = latin1(bytes, 0, MAGIC.length);
  if (magic !== MAGIC) {
    const hint = magic.startsWith('silhouette') ? ` (found "${magic}", only "${MAGIC}" is supported)` : '';
    throw new Studio3Error(`not a Silhouette Studio 5 document${hint}`);
  }
  if (bytes.length < SECTIONS) throw new Studio3Error('file is truncated before the section data');

  // SPEC 2.1: u64 section sizes, sections laid end to end from 0x400
  const sections = [], sectionWarnings = [];
  let offset = SECTIONS;
  for (let at = SIZE_TABLE; at < SIZE_TABLE_END; at += 8) {
    const size = u64(v, at);
    if (size === 0 && at > SIZE_TABLE + 8 * 13) break;
    if (offset + size > bytes.length) {
      // Studio 4 era files can end a few bytes short in a trailing section; only the document is required
      if (!sections.length) throw new Studio3Error('document section runs past the end of the file');
      sectionWarnings.push(`section ${sections.length} runs past the end of the file; ignored`);
      break;
    }
    sections.push({ index: sections.length, offset, size });
    offset += size;
  }
  while (sections.length && sections[sections.length - 1].size === 0) sections.pop();
  if (!sections.length) throw new Studio3Error('no sections');

  const studioVersion = u64(v, VERSIONS);
  const doc = bytes.subarray(sections[0].offset, sections[0].offset + sections[0].size);
  const dv = new DataView(doc.buffer, doc.byteOffset, doc.byteLength);
  if (latin1(doc, 0, MAGIC.length) !== MAGIC) throw new Studio3Error('document section does not start with the magic');

  const warnings = sectionWarnings;
  const blocks = indexBlocks(doc, dv);
  const root = blocks.get(MAGIC.length);
  if (!root) throw new Studio3Error('document has no root block');

  const page = readPage(doc, dv, blocks, root);
  const shapes = readShapes(doc, dv, blocks, warnings);
  const thumb = sections[2];
  const thumbnail = thumb && isPng(bytes, thumb.offset) ? bytes.subarray(thumb.offset, thumb.offset + thumb.size) : null;

  return { formatVersion: 5, studioVersion, sections, page, shapes, thumbnail, warnings };
}

// SPEC 3.1: a block is 0x01, a u32 size counting itself and the body, then the body.
// Every offset that could start a block is indexed (start -> end). A greedy walk is not enough:
// the raw transform bytes between blocks A and P can look like a block that swallows P's header.
function indexBlocks(b, v) {
  const map = new Map();
  for (let q = MAGIC.length; q + 5 <= b.length; q++) {
    if (b[q] !== 1) continue;
    const size = v.getUint32(q + 1, true);
    if (size >= 4 && q + 1 + size <= b.length) map.set(q, q + 1 + size);
  }
  return map;
}

function readPage(b, v, blocks, rootEnd) {
  const first = MAGIC.length + 5;
  const firstEnd = blocks.get(first);
  if (firstEnd === undefined || !blocks.has(firstEnd)) return null;
  const at = firstEnd + 5 + PAGE_SIZE_AT;
  if (at + 8 > rootEnd) return null;
  const widthMm = v.getFloat32(at, true), heightMm = v.getFloat32(at + 4, true);
  return widthMm > 0 && heightMm > 0 && widthMm < 1e5 && heightMm < 1e5 ? { widthMm, heightMm } : null;
}

// SPEC 4: a shape record is 0x00, block A (properties and local geometry), 65 bytes of transform,
// block P (outline on the page, mm), 0x01, u64 serial, block C, then the name.
function readShapes(b, v, blocks, warnings) {
  const shapes = [];
  // map order is ascending offset
  const seen = new Set();
  for (const aStart of blocks.keys()) {
    if (aStart === 0 || b[aStart - 1] !== 0) continue;
    const aEnd = blocks.get(aStart);
    const pStart = aEnd + TRANSFORM_BYTES;
    const pEnd = blocks.get(pStart);
    if (pEnd === undefined || seen.has(pStart)) continue;
    seen.add(pStart);
    let path;
    try {
      path = readPath(b, v, pStart + 5, pEnd);
    } catch {
      continue; // not a path block: this pattern also matches non-shape records (SPEC 4.4)
    }
    const m = [];
    for (let k = 0; k < 9; k++) m.push(v.getFloat32(aEnd + 4 * k, true));
    let name = '', serial = null;
    if (b[pEnd] === 1 && blocks.has(pEnd + 9)) {
      serial = v.getBigUint64(pEnd + 1, true);
      const nameAt = blocks.get(pEnd + 9);
      const len = nameAt + 4 <= b.length ? v.getUint32(nameAt, true) : 0;
      if (len < 4096 && nameAt + 4 + len <= b.length) name = utf8(b, nameAt + 4, len);
    }
    const effects = latin1(b, aStart, aEnd - aStart).match(/(?:[a-z_0-9]+=[^;\0]*;)*effect=[a-z_]+/g) ?? [];
    if (!path.subpaths.some((sp) => sp.points.length)) continue; // layers and empty records carry an empty outline (SPEC 4.3)
    shapes.push({ name, serial, matrix: m, path, effects: effects.map(parseParams), recordOffset: aStart - 1 });
  }
  if (!shapes.length) warnings.push('no drawable shapes found');
  return shapes;
}

// SPEC 5: i32 index of the last subpath, then subpaths: u32 size counting itself, u8 closed,
// i32 index of the last point (-1 when empty), then points: f32 x, f32 y, and two handles (in, out), each a
// flag byte followed by f32 dx, dy when the flag is 1. Handles are relative to the point.
export function readPath(b, v, p, end) {
  const fail = (why) => { throw new Studio3Error(`bad path at ${p}: ${why}`); };
  if (p + 4 > end) fail('short');
  const lastSub = v.getInt32(p, true); p += 4;
  if (lastSub < -1 || end - p < 9 * (lastSub + 1)) fail('subpath count');
  const subpaths = [];
  for (let i = 0; i <= lastSub; i++) {
    const start = p;
    const size = v.getUint32(p, true); p += 4;
    const closed = b[p++];
    if (closed > 1) fail('closed flag');
    const lastPt = v.getInt32(p, true); p += 4;
    if (lastPt < -1 || end - p < 10 * (lastPt + 1)) fail('point count');
    const points = [];
    for (let j = 0; j <= lastPt; j++) {
      const x = v.getFloat32(p, true), y = v.getFloat32(p + 4, true); p += 8;
      const handles = [null, null];
      for (let k = 0; k < 2; k++) {
        const flag = b[p++];
        if (flag > 1) fail('handle flag');
        if (flag) { handles[k] = [v.getFloat32(p, true), v.getFloat32(p + 4, true)]; p += 8; }
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) fail('coordinate');
      points.push({ x, y, in: handles[0], out: handles[1] });
    }
    if (p - start !== size) fail('subpath size');
    subpaths.push({ closed: closed === 1, points });
  }
  if (p !== end) fail('trailing bytes');
  return { subpaths };
}

function parseParams(s) {
  const out = {};
  for (const kv of s.split(';')) {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

const u64 = (v, at) => Number(v.getBigUint64(at, true));
const isPng = (b, at) => b[at] === 0x89 && b[at + 1] === 0x50 && b[at + 2] === 0x4e && b[at + 3] === 0x47;
function latin1(b, at, n) {
  let s = '';
  for (let i = at; i < at + n && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
const utf8 = (b, at, n) => new TextDecoder().decode(b.subarray(at, at + n));
