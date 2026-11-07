import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HERO_DEMOS } from './hero.js';

test('welcome demos have local PNGs for all three platforms without a catalog', () => {
  assert.deepEqual(HERO_DEMOS.map(p => p.platform), ['GBA', 'GBC', 'GB']);
  for (const demo of HERO_DEMOS) {
    assert.match(demo.label, /^demo\/[a-z]+\.png$/);
    const png = readFileSync(new URL(demo.label, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
