import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Hooks={once(){},on(){}};
const {hideFloatingChat}=await import('../scripts/chat-visibility.js');
test('GM setting overrides player preference in both directions',()=>{assert.equal(hideFloatingChat({isGM:false,personal:false,playerPolicy:'hide'}),true);assert.equal(hideFloatingChat({isGM:false,personal:true,playerPolicy:'show'}),false);});
test('let each player choose respects their local preference',()=>{for(const personal of [false,true])assert.equal(hideFloatingChat({isGM:false,personal,playerPolicy:'personal'}),personal);});
test('player policy never overrides GM local preference',()=>{for(const personal of [false,true])for(const playerPolicy of ['hide','show','personal'])assert.equal(hideFloatingChat({isGM:true,personal,playerPolicy}),personal);});
