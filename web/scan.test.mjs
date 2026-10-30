import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintKey, readFingerprint, scanLimited, fingerprintCache } from './scan.js';
const file = (size=8, modified=10) => ({name:'Game.gba',size,lastModified:modified});
test('fingerprints invalidate on name, size, modification, system or header changes',()=>{
 const base=file();const key=fingerprintKey(base,'GBA/Game',[1,2]);
 for(const [f,n,h] of [[file(9),'GBA/Game',[1,2]],[file(8,11),'GBA/Game',[1,2]],[base,'GB/Game',[1,2]],[base,'GBA/Game',[1,3]]])assert.notEqual(fingerprintKey(f,n,h),key);
});
test('unchanged games skip all ROM bytes; first reads hash the complete stream',async()=>{
 let reads=0,freed=0;const values=[new Uint8Array([1,2]),new Uint8Array([3,4])];
 const f={...file(4),stream(){reads++;return new ReadableStream({start(c){values.forEach(v=>c.enqueue(v));c.close();}})}};
 const cache=fingerprintCache(null);let sum=0;
 const make=()=>({update(v){for(const n of v)sum+=n},finish(){return sum},free(){freed++}});
 const key=fingerprintKey(f);const progress=[];
 assert.deepEqual(await readFingerprint(f,make,cache,key,n=>progress.push(n)),{crc:10,cached:false});
 assert.deepEqual(progress,[2,4]);assert.equal(freed,0,'finish consumes the WASM hasher');
 assert.deepEqual(await readFingerprint(f,make,cache,key),{crc:10,cached:true});assert.equal(reads,1);
});
test('a replaced card cancels a running stream and is not cached',async()=>{
 let active=true,cancelled=false,saved=false;
 const f={...file(),stream:()=>new ReadableStream({pull(c){active=false;c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true}})};
 const result=await readFingerprint(f,()=>({update(){},finish(){throw Error('must not finish')},free(){}}),{get:async()=>undefined,set:async()=>saved=true},'key',()=>{},()=>active);
 assert.equal(result,null);assert.equal(cancelled,true);assert.equal(saved,false);
});
test('bounded scans overlap two reads and stop queuing after cancellation',async()=>{
 let running=0,peak=0,active=true;const seen=[];
 await scanLimited([0,1,2,3],2,async n=>{running++;peak=Math.max(peak,running);seen.push(n);await new Promise(r=>setImmediate(r));active=false;running--;},()=>active);
 assert.equal(peak,2);assert.deepEqual(seen,[0,1]);
});
test('blocked persistent storage falls back to a usable memory cache',async()=>{
 const cache=fingerprintCache({open(){throw Error('blocked')}});
 assert.equal(await cache.get('a'),undefined);await cache.set('a',0);assert.equal(await cache.get('a'),0);
});
