// SVG writer. Coordinates stay in millimetres; the viewBox maps them 1:1 to mm.

/** Path data for one shape outline (SPEC 5.2). */
export function pathData(path, digits = 3) {
  const f = (n) => +n.toFixed(digits);
  const parts = [];
  for (const sp of path.subpaths) {
    const pts = sp.points;
    if (!pts.length) continue;
    parts.push(`M${f(pts[0].x)} ${f(pts[0].y)}`);
    const seg = (a, b) => {
      if (!a.out && !b.in) return `L${f(b.x)} ${f(b.y)}`;
      const c1 = a.out ? [a.x + a.out[0], a.y + a.out[1]] : [a.x, a.y];
      const c2 = b.in ? [b.x + b.in[0], b.y + b.in[1]] : [b.x, b.y];
      return `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b.x)} ${f(b.y)}`;
    };
    for (let i = 1; i < pts.length; i++) parts.push(seg(pts[i - 1], pts[i]));
    if (sp.closed) {
      if (pts.length > 1 && (pts[pts.length - 1].out || pts[0].in)) parts.push(seg(pts[pts.length - 1], pts[0]));
      parts.push('Z');
    }
  }
  return parts.join('');
}

/** Exact bounding box of the outlines (curve extrema, not control points), in mm. */
export function bounds(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const s of shapes) for (const sp of s.path.subpaths) {
    const pts = sp.points;
    for (const p of pts) add(p.x, p.y);
    const segs = pts.slice(1).map((b, i) => [pts[i], b]);
    if (sp.closed && pts.length > 1) segs.push([pts[pts.length - 1], pts[0]]);
    for (const [a, b] of segs) {
      if (!a.out && !b.in) continue;
      const c1 = a.out ? [a.x + a.out[0], a.y + a.out[1]] : [a.x, a.y];
      const c2 = b.in ? [b.x + b.in[0], b.y + b.in[1]] : [b.x, b.y];
      const at = (t) => {
        const u = 1 - t;
        add(u * u * u * a.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.x,
          u * u * u * a.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.y);
      };
      // roots of the derivative, per axis: A t^2 + B t + C = 0
      for (const [p0, p1, p2, p3] of [[a.x, c1[0], c2[0], b.x], [a.y, c1[1], c2[1], b.y]]) {
        const A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), C = p1 - p0;
        if (Math.abs(A) < 1e-12) { if (B && -C / B > 0 && -C / B < 1) at(-C / B); continue; }
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        for (const t of [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)]) if (t > 0 && t < 1) at(t);
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {ReturnType<import('./studio3.js').parseStudio3>} doc
 * @param {{ fit?: 'page'|'content', stroke?: string, strokeWidth?: number }} [opts]
 */
export function toSvg(doc, opts = {}) {
  const { stroke = '#e00', strokeWidth = 0.25 } = opts;
  let box;
  if (opts.fit !== 'content' && doc.page) box = { minX: 0, minY: 0, maxX: doc.page.widthMm, maxY: doc.page.heightMm };
  else {
    box = bounds(doc.shapes) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const m = 1;
    box = { minX: box.minX - m, minY: box.minY - m, maxX: box.maxX + m, maxY: box.maxY + m };
  }
  const w = +(box.maxX - box.minX).toFixed(3), h = +(box.maxY - box.minY).toFixed(3);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${+box.minX.toFixed(3)} ${+box.minY.toFixed(3)} ${w} ${h}">`,
    `<g fill="none" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round">`,
  ];
  for (const s of doc.shapes) {
    const d = pathData(s.path);
    if (!d) continue;
    const label = s.name ? ` data-name="${esc(s.name)}"` : '';
    const fx = s.effects.length ? ` data-effects="${esc(s.effects.map((e) => e.effect).join(' '))}"` : '';
    out.push(`<path${label}${fx} d="${d}"/>`);
  }
  out.push('</g>', '</svg>', '');
  return out.join('\n');
}
