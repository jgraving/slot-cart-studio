import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBulkStyle } from './bulk-style.js';
import { undo } from './history.js';

const cart = (shell) => ({ shell, looking: false, error: null, choice: 'customLabel', customLabelBytes: new Uint8Array([1, 2]) });
const resolve = (c) => {
  const [outline, colour, finish] = (c.shell || 'auto abcdef solid').split(' ');
  return { outline, colour, finish };
};
test('a mixed selection preserves shapes and labels, with one undo per cart', () => {
  const a = cart('rounded 123456 solid'), b = cart('notched aabbcc glitter'), other = cart('auto ffffff clear');
  const before = a.customLabelBytes;
  assert.deepEqual(applyBulkStyle([a, b], { colour: '#C2332E', finish: 'clear' }, resolve), [a, b]);
  assert.deepEqual([a.shell, b.shell, other.shell], ['rounded c2332e clear', 'notched c2332e clear', 'auto ffffff clear']);
  assert.equal(a.customLabelBytes, before);
  assert.equal(a.choice, 'customLabel');
  assert.ok(undo(a));
  assert.equal(a.shell, 'rounded 123456 solid');
});
test('color and finish can be changed independently, including automatic shells', () => {
  const a = cart('');
  applyBulkStyle([a], { finish: 'glitter' }, resolve);
  assert.equal(a.shell, 'auto abcdef glitter');
  applyBulkStyle([a], { colour: '#112233' }, resolve);
  assert.equal(a.shell, 'auto 112233 glitter');
});
test('a loading or invalid selection makes no partial changes', () => {
  const a = cart('auto 123456 solid'), b = cart(''); b.looking = true;
  assert.throws(() => applyBulkStyle([a, b], { finish: 'clear' }, resolve));
  assert.equal(a.shell, 'auto 123456 solid');
  assert.throws(() => applyBulkStyle([a], { colour: 'oops' }, resolve));
  assert.deepEqual(applyBulkStyle([a], {}, resolve), []);
});
