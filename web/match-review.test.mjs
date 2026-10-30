import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestName, reviewRank} from './match-review.js';
test('filename suggestions ignore region, punctuation and accents',()=>{
 assert.equal(suggestName('Pokémon - Emerald (Europe) [patched]', ['Pokemon Emerald (USA)']), 'Pokemon Emerald (USA)');
 assert.equal(suggestName('Metroid Fusion', ['Metroid Fusion (USA)', 'Metroid Fusion (Europe)']), 'Metroid Fusion (Europe)');
});
test('unrelated titles and sequels are not guessed',()=>{
 assert.equal(suggestName('Golden Sun 2', ['Golden Sun (USA)']),null);
 assert.equal(suggestName('Unknown Adventure', ['Pokemon Emerald (USA)']),null);
 assert.equal(suggestName('', ['Pokemon Emerald (USA)']),null);
});
test('ambiguous titles need manual search rather than an arbitrary guess',()=>{
 assert.equal(suggestName('The Great Adventure of Hero', ['The Great Adventure of Hero One', 'The Great Adventure of Hero Two']),null);
});
test('unmatched labels precede suggestions and matched or existing labels, stably',()=>{
 const carts=[{id:1,hasMatchedLabel:true},{id:2,suggestion:'Game'},{id:3},{id:4,existingPng:new Uint8Array()},{id:5}];
 assert.deepEqual(carts.sort((a,b)=>reviewRank(a)-reviewRank(b)).map(c=>c.id),[3,5,2,1,4]);
});
