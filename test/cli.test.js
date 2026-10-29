import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/studio3svg.js', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/card-templates/a4-poker-v3.studio3', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

test('writes an SVG and the preview', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio3svg-'));
  const out = join(dir, 'cards.svg');
  const r = run('--thumbnail', '-o', out, fixture);
  assert.equal(r.status, 0, r.stderr);
  const svg = readFileSync(out, 'utf8');
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /width="296.926mm" height="210.058mm"/); // landscape A4 as stored
  assert.equal(svg.match(/<path /g).length, 8);
  assert.ok(readFileSync(join(dir, 'cards.png')).subarray(1, 4).equals(Buffer.from('PNG')));
});

test('--json prints the parsed document', () => {
  const r = run('--json', fixture);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.shapes.length, 8);
  assert.ok(Math.abs(j.page.widthMm - 297) < 0.1 && Math.abs(j.page.heightMm - 210) < 0.1);
});

test('bad input exits 1 with a message, bad usage exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio3svg-'));
  const junk = join(dir, 'junk.studio3');
  writeFileSync(junk, 'not a studio file');
  const r = run('-o', join(dir, 'x.svg'), junk);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a Silhouette Studio 5 document/);
  assert.ok(!existsSync(join(dir, 'x.svg')));
  assert.equal(run().status, 2);
  assert.equal(run('--fit', 'nope', fixture).status, 2);
});
