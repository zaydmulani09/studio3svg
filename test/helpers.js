import { inflateSync } from 'node:zlib';

/** Points along every segment of a parsed path (cubic segments sampled n times). */
export function flatten(path, n = 16) {
  const out = [];
  for (const sp of path.subpaths) {
    const pts = sp.points;
    const segs = pts.slice(1).map((b, i) => [pts[i], b]);
    if (sp.closed && pts.length > 1) segs.push([pts[pts.length - 1], pts[0]]);
    for (const [a, b] of segs) {
      const c1 = a.out ? [a.x + a.out[0], a.y + a.out[1]] : [a.x, a.y];
      const c2 = b.in ? [b.x + b.in[0], b.y + b.in[1]] : [b.x, b.y];
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push([
          u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x,
          u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y,
        ]);
      }
    }
  }
  return out;
}

/** Minimal PNG decoder: 8-bit RGB/RGBA/grey(+alpha), non-interlaced. Returns {width,height,ink(x,y)}. */
export function decodePng(buf) {
  let p = 8, width, height, depth, type, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced'); }
    if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`bit depth ${depth}`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  const raw = inflateSync(Buffer.concat(idat)), stride = width * ch, img = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? img[y * stride + x - ch] : 0, b = y ? img[(y - 1) * stride + x] : 0, c = x >= ch && y ? img[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[y * stride + x] = v & 255;
    }
  }
  // "ink": any drawn pixel; faint guide lines (Font Template) render in very light grey
  const ink = (x, y) => {
    const i = y * stride + x * ch;
    const alpha = ch === 4 ? img[i + 3] : ch === 2 ? img[i + 1] : 255;
    const grey = ch >= 3 ? Math.min(img[i], img[i + 1], img[i + 2]) : img[i];
    return alpha > 64 && grey < 250;
  };
  return { width, height, ink };
}
