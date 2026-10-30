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

test('live color inputs form one undo step per gesture', () => {
  const a = cart('auto 123456 solid'); const gesture = {};
  applyBulkStyle([a], { colour: '#223344' }, resolve, gesture);
  applyBulkStyle([a], { colour: '#334455' }, resolve, gesture);
  assert.equal(a.history.undo.length, 1);
  assert.ok(undo(a)); assert.equal(a.shell, 'auto 123456 solid');
});

test('bulk artwork preserves unavailable labels and does not substitute logos', async () => {
  const { applyBulkArtwork } = await import('./bulk-style.js');
  const a=cart(''), b=cart('');
  const updates=[];
  const result=await applyBulkArtwork([a,b], 'real', async c=>c===a, ()=>true, c=>updates.push(c));
  assert.equal(a.choice,'real');assert.equal(a.byHand,true);
  assert.equal(b.choice,'customLabel');assert.deepEqual(result.missing,[b]);assert.deepEqual(updates,[a]);
  assert.ok(undo(a));assert.equal(a.choice,'customLabel');
});

test('an older label request cannot overwrite a newer logo choice', async () => {
  const { applyBulkArtwork } = await import('./bulk-style.js');
  const a=cart('');let release;let version=1;
  const first=applyBulkArtwork([a], 'real', ()=>new Promise(r=>release=r), ()=>version===1);
  version=2;await applyBulkArtwork([a], 'logo', async()=>true, ()=>version===2);
  release(true);await first;assert.equal(a.choice,'logo');
});

test('each available cart updates while slower artwork is still loading', async () => {
  const { applyBulkArtwork } = await import('./bulk-style.js');
  const a=cart(''),b=cart('');let release;
  let painted;
  const firstPaint=new Promise(r=>painted=r);
  const pending=applyBulkArtwork([a,b], 'real', c=>c===a?Promise.resolve(true):new Promise(r=>release=r), ()=>true, painted);
  assert.equal(await firstPaint,a);assert.equal(a.choice,'real');assert.equal(b.choice,'customLabel');
  release(true);await pending;assert.equal(b.choice,'real');
});
