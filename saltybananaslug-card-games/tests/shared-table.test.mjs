import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,extraAction,sanitizeState,makeDeck,nextHand} from '../scripts/engine.js';
import {refundUnfinished} from '../scripts/wallet.js';
const seats=[0,1,2].map(i=>({id:String(i),ownerUserId:`u${i}`,name:`P${i}`}));
const card=id=>makeDeck(()=>0).find(c=>c.id===id);
const game=type=>createGame(type,'shared','u0',seats,{minBet:1,maxBet:100,moneyMode:'currency'});
test('War locks bets, shares one dealer across users and observers, and deals unique player cards',()=>{
 const s=game('war');s.deck=['8s','9h','Th','7c'].map(card).reverse();
 extraAction(s,'0','bet',10);assert.equal(s.seats[0].hand.length,0);assert.equal(sanitizeState(s,'u1').dealerCards.length,0);
 assert.throws(()=>extraAction(s,'0','war'),/Wait/);
 extraAction(s,'1','bet',20);extraAction(s,'2','bet',30);
 assert.equal(s.phase,'complete');assert.equal(new Set([...s.dealerCards,...s.seats.flatMap(p=>p.hand)].map(c=>c.id)).size,4);
 for(const user of ['u0','u1','u2','observer'])assert.deepEqual(sanitizeState(s,user).dealerCards,[card('8s')]);
 assert(s.seats.every(p=>p.extra.dealer[0].id==='8s'));
 assert.deepEqual(s.seats.map(p=>p.chips),[510,520,470]);
 nextHand(s);assert.equal(s.dealerCards.length,0);assert(s.seats.every(p=>!p.extra));
});
test('multiple War ties lock decisions before shared second dealer, with exact payouts',()=>{
 const s=game('war');s.deck=['8s','8h','8d','7c','2s','3s','4s','Ts','Js','9s'].map(card).reverse();
 for(const p of s.seats)extraAction(s,p.id,'bet',10);
 assert.equal(s.phase,'war-choice');extraAction(s,'0','war');
 assert.equal(s.dealerCards.length,1);assert.throws(()=>extraAction(s,'0','war'),/Wait/);
 extraAction(s,'1','war');assert.equal(s.phase,'complete');
 assert.deepEqual(s.seats.map(p=>p.chips),[510,480,490]);
 for(const user of ['u0','u1','observer'])assert.deepEqual(sanitizeState(s,user).dealerCards.map(c=>c.id),['8s','Ts']);
 assert(s.seats.every(p=>p.extra.dealer[1].id==='Ts'));
});
test('pending War stakes and Baccarat bets refund on close',()=>{
 const s=game('war');s.deck=['8s','8h','8d','7c'].map(card).reverse();
 for(const p of s.seats)extraAction(s,p.id,'bet',10);extraAction(s,'0','war');
 refundUnfinished(s);assert.deepEqual(s.seats.map(p=>p.chips),[500,500,490]);
 const b=game('baccarat');extraAction(b,'0','bet',10,'banker');refundUnfinished(b);assert.equal(b.seats[0].chips,500);
});
test('Baccarat waits for bets and uses identical public hands with individual bet payouts',()=>{
 const s=game('baccarat');s.deck=['9s','8s','Ks','Qh'].map(card).reverse();
 extraAction(s,'0','bet',10,'player');assert.equal(s.sharedDeal,null);
 extraAction(s,'1','bet',10,'banker');extraAction(s,'2','bet',10,'tie');
 assert.equal(s.phase,'complete');assert.deepEqual(s.seats.map(p=>p.chips),[510,490,490]);
 for(const p of s.seats){assert.deepEqual(p.extra.player,s.sharedDeal.player);assert.deepEqual(p.extra.banker,s.sharedDeal.banker);}
 for(const user of ['u0','u1','observer']){const v=sanitizeState(s,user);assert.deepEqual(v.sharedDeal,s.sharedDeal);assert(!JSON.stringify(v).includes('"deck"'));}
});
