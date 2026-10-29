#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, extname, join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { parseStudio3, Studio3Error } from '../src/studio3.js';
import { toSvg } from '../src/svg.js';

const HELP = `studio3svg: convert Silhouette Studio .studio3 files to SVG

Usage: studio3svg [options] <file.studio3>...

Options:
  -o, --out <path>     output file (one input) or directory (several inputs)
      --fit <mode>     page (default): SVG covers the document page
                       content: SVG is cropped to the shapes
      --stroke <color> outline colour (default #e00)
      --json           print the parsed document as JSON instead of writing SVG
      --thumbnail      also write the embedded preview as <name>.png
  -h, --help           show this help
  -v, --version        show the version
`;

let opts;
try {
  opts = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      fit: { type: 'string', default: 'page' },
      stroke: { type: 'string' },
      json: { type: 'boolean' },
      thumbnail: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
} catch (e) {
  fail(`${e.message}\n\n${HELP}`);
}
const { values: o, positionals: files } = opts;
if (o.version) {
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
  process.exit(0);
}
if (o.help || !files.length) {
  process.stdout.write(HELP);
  process.exit(o.help ? 0 : 2);
}
if (!['page', 'content'].includes(o.fit)) fail(`--fit must be "page" or "content", got "${o.fit}"`);

const outIsDir = files.length > 1 || (o.out && isDir(o.out));
let failed = 0;
for (const file of files) {
  try {
    const doc = parseStudio3(readFileSync(file));
    if (o.json) {
      const { thumbnail, ...rest } = doc;
      console.log(JSON.stringify({ file, ...rest, thumbnailBytes: thumbnail?.length ?? 0 }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
      continue;
    }
    const stem = basename(file, extname(file));
    const target = o.out ? (outIsDir ? join(o.out, `${stem}.svg`) : o.out) : join(dirname(file), `${stem}.svg`);
    writeFileSync(target, toSvg(doc, { fit: o.fit, stroke: o.stroke }));
    let note = `${doc.shapes.length} shapes`;
    if (o.thumbnail && doc.thumbnail) {
      writeFileSync(/\.svg$/i.test(target) ? target.replace(/\.svg$/i, '.png') : `${target}.png`, doc.thumbnail);
      note += ', thumbnail';
    }
    const fx = [...new Set(doc.shapes.flatMap((s) => s.effects.map((e) => e.effect)))];
    if (fx.length) note += `; effects not drawn: ${fx.join(', ')}`;
    for (const w of doc.warnings) note += `; warning: ${w}`;
    console.error(`${file} -> ${target} (${note})`);
  } catch (e) {
    failed++;
    console.error(`${file}: ${e instanceof Studio3Error ? e.message : e.code === 'ENOENT' ? 'file not found' : e.stack}`);
  }
}
process.exit(failed ? 1 : 0);

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function fail(msg) {
  console.error(msg);
  process.exit(2);
}
