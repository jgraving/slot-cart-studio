import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDetails, detailsEntries, detailsPath, readDetails } from './game-details.js';
test('missing optional data produces no files and does not alter cartridge identity', () => {
  const c = { platform: 'GBA', stem: 'Same' };
  assert.deepEqual(detailsEntries(c), []);
  assert.deepEqual(c, { platform: 'GBA', stem: 'Same' });
});
test('exports bounded text and image sidecars keyed by original platform and filename', () => {
  const c = { platform: 'GB', stem: 'Pokemon (USA)', details: { title: ' Pokémon ', description: 'line1\r\nline2', developer: '<script>', unsupported: 'ignored' }, boxBytes: new Uint8Array([1, 2]) };
  const entries = detailsEntries(c);
  assert.equal(entries[0].path, 'Metadata/GB/Pokemon (USA).json');
  const json = JSON.parse(new TextDecoder().decode(entries[0].bytes));
  assert.equal(json.version, 1);
  assert.equal(json.title, 'Pokémon');
  assert.equal(json.description, 'line1\nline2');
  assert.equal(json.box_art, 'Artwork/GB/Pokemon (USA).png');
  assert.equal(json.unsupported, undefined);
  assert.equal(normalizeDetails({description: 'x'.repeat(9000)}).description.length, 8192);
});
test('rejects paths that escape the optional folders', () => {
  for (const stem of ['../game', '.', '..', 'folder/game', 'a\\b', 'a\0b']) assert.throws(() => detailsPath('GBA', stem));
  assert.throws(() => detailsPath('SNES', 'game'));
});
test('optional readers tolerate absent files and reject malformed versions without altering ROMs', async () => {
  const cart = { platform: 'GBA', stem: 'Game' };
  await readDetails({readOptional: async () => null}, cart);
  assert.equal(cart.details, undefined);
  await assert.rejects(readDetails({readOptional: async () => ({size: 10, text: async () => '{"version":99}'})}, cart));
  assert.equal(cart.stem, 'Game');
});
