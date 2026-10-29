// Malformed input: every failure must be a Studio3Error (or a clean parse), never a crash or hang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStudio3, Studio3Error } from '../src/studio3.js';
import { toSvg } from '../src/svg.js';

const good = readFileSync(new URL('./fixtures/card-templates/a4-poker-v3.studio3', import.meta.url));
const tryParse = (bytes) => {
  try {
    const doc = parseStudio3(bytes);
    toSvg(doc);
    return 'ok';
  } catch (e) {
    if (e instanceof Studio3Error) return 'rejected';
    throw e;
  }
};

test('rejects non-studio3 input', () => {
  assert.throws(() => parseStudio3(Buffer.from('hello')), Studio3Error);
  assert.throws(() => parseStudio3(Buffer.alloc(0)), Studio3Error);
  assert.throws(() => parseStudio3(Buffer.from('silhouette04;' + '\0'.repeat(2000))), /only "silhouette05;"/);
});

test('rejects truncation at every section boundary and in the header', () => {
  for (const n of [13, 0x3e8, 0x3ff, 0x400, 0x401, 5000]) assert.equal(tryParse(good.subarray(0, n)), 'rejected', `length ${n}`);
});

test('every truncation length is handled', () => {
  for (let n = 0; n < good.length; n += 97) tryParse(good.subarray(0, n));
});

test('seeded byte flips never crash', () => {
  let seed = 0x5eed;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const docEnd = 0x400 + Number(good.readBigUInt64LE(0x10));
  const outcomes = { ok: 0, rejected: 0 };
  for (let i = 0; i < 2000; i++) {
    const b = Buffer.from(good);
    for (let k = 1 + Math.floor(rand() * 8); k > 0; k--) b[Math.floor(rand() * docEnd)] = Math.floor(rand() * 256);
    outcomes[tryParse(b)]++;
  }
  assert.equal(outcomes.ok + outcomes.rejected, 2000);
});

test('huge declared sizes are rejected without allocation', () => {
  const b = Buffer.from(good);
  b.writeBigUInt64LE(2n ** 62n, 0x10);
  assert.equal(tryParse(b), 'rejected');
});
