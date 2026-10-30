import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoadProgress, remainingText } from './load-progress.js';
test('wait for measured progress and enough time before showing an estimate',()=>{
 const progress=new LoadProgress(100);
 assert.equal(progress.remaining(1100),null);
 progress.update(0.25,2100);
 assert.equal(progress.remaining(2100),6);
 assert.equal(progress.text(2100),'About 10 sec left');
});
test('progress cannot regress, exceed completion or inherit another card timing',()=>{
 const p=new LoadProgress(0);p.update(0.5,2000);p.update(0.2,2100);
 assert.equal(p.fraction,0.5);p.update(NaN,2200);assert.equal(p.fraction,0.5);
 p.update(3,2500);assert.equal(p.fraction,1);assert.equal(p.text(2500),'Complete');
 p.reset(3000);assert.equal(p.fraction,0);assert.equal(p.remaining(3200),null);
});
test('long stalls discard a misleading countdown and new progress recovers',()=>{
 const p=new LoadProgress(0);p.update(0.5,2000);
 assert.equal(p.remaining(13000),null);p.update(0.6,14000);
 assert.ok(Number.isFinite(p.remaining(14000)));
});
test('remaining time uses rounded estimates and safe unknown values',()=>{
 assert.equal(remainingText(null),'Estimating time remaining…');
 assert.equal(remainingText(Infinity),'Estimating time remaining…');
 assert.equal(remainingText(2),'A few seconds left');
 assert.equal(remainingText(90),'About 2 min left');
 assert.equal(remainingText(4000),'About 2 hr left');
});
