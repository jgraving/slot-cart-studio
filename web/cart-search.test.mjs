import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cartMatches} from './cart-search.js';
test('search finds filenames, matched names and pending suggestions across systems',()=>{
 const c={stem:'BPEE',game:'Pokémon Emerald (USA)',platform:'GBA',suggestion:'Pocket Adventure'};
 for(const q of ['pokemon','EMERALD usa','bpee','pocket gba',''])assert.equal(cartMatches(c,q),true,q);
 assert.equal(cartMatches(c,'emerald gbc'),false);
 assert.equal(cartMatches({stem:'Unknown'},'pokemon'),false);
});
test('search accepts accents, punctuation and multiple terms in any order',()=>{
 assert.equal(cartMatches({stem:'Pokemon - FireRed (Europe)'},'europe pokémon'),true);
 assert.equal(cartMatches({stem:'Mega-Man'},'mega man'),true);
});
test('a full 990-game library can be searched without altering its order or state',()=>{
 const carts=Array.from({length:990},(_,i)=>({stem:`Game ${i}`,platform:i%2?'GB':'GBA',choice:'card'}));
 assert.deepEqual(carts.filter(c=>cartMatches(c,'Game 989')).map(c=>c.stem),['Game 989']);
 assert.equal(carts[0].stem,'Game 0');assert.equal(carts[989].choice,'card');
});
