import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDeck,createGame,nextHand,extraAction,sanitizeState,legalPokerActions,pokerAction,blackjackAction,blackjackBet} from '../scripts/engine.js';
import {effectiveSuit,euchreStrength,bankerDraw,SLOT_REEL,SLOT_RETURNS,videoReturn} from '../scripts/extra-games.js';
import {copper,coins,applyWallet,walletChanges,refundUnfinished,WALLET_FLAG} from '../scripts/wallet.js';
const seats=Array.from({length:4},(_,i)=>({id:String(i),ownerUserId:`u${i}`,name:`Player ${i+1}`}));
const card=id=>makeDeck(()=>0).find(c=>c.id===id);
test('ace artwork variants change images, never deck composition; no jokers in standard decks',()=>{
 const a=makeDeck(()=>0),b=makeDeck(()=>.9999);assert.equal(new Set(a.map(c=>c.id)).size,52);assert.equal(a.length,52);
 for(const suit of ['s','h','d','c'])assert.notEqual(a.find(c=>c.id==='A'+suit).art,b.find(c=>c.id==='A'+suit).art);
 assert.equal(a.filter(c=>c.rank==="A"&&c.art).length,4);
});
test('draw deals five cards even to a player all-in from the ante',()=>{
 const s=createGame('draw','x','u0',seats.slice(0,2).map((p,i)=>({...p,startingChips:i?100:5})),{ante:5});
 assert.equal(s.seats[0].hand.length,5);assert.equal(s.seats[0].allIn,true);assert.equal(s.phase,'draw');
});
test('short all-in cannot reopen betting for a previous caller; skipped completed actors do not get extra turns',()=>{
 const s=createGame('holdem','x','u0',seats,{startingChips:100,smallBlind:5,bigBlind:10});
 // Four seats: dealer 0, SB1, BB2, opener3. 3 raises to30, 0 calls, SB all-in35, BB folds.
 pokerAction(s,'3','raise',30);pokerAction(s,'0','call');s.seats[1].chips=30;pokerAction(s,'1','all-in');pokerAction(s,'2','fold');
 assert.equal(s.seats[s.currentSeatIndex].id,'3');assert.equal(legalPokerActions(s,'3').canRaise,false);assert.equal(legalPokerActions(s,'3').canAllIn,false);
 assert.throws(()=>pokerAction(s,'3','raise',60));pokerAction(s,'3','call');pokerAction(s,'0','call');assert.equal(s.round,'flop');
});
test('heads-up all-in small blind still gives the big blind a hand and runs out the board',()=>{
 const s=createGame('holdem','x','u0',seats.slice(0,2).map((p,i)=>({...p,startingChips:i?100:5})),{smallBlind:5,bigBlind:10});
 assert.equal(s.phase,'complete');assert.equal(s.community.length,5);assert.equal(s.seats.reduce((n,p)=>n+p.chips,0),105);
});
test('blackjack late surrender preserves half of an odd wager',()=>{
 const s=createGame('blackjack','x','u0',seats.slice(0,1));s.phase='playing';s.currentSeatIndex=0;s.currentHandIndex=0;s.seats[0].chips=495;s.seats[0].betLocked=true;
 s.seats[0].bjHands=[{cards:[card('9s'),card('7s')],bet:5,status:'playing',fromSplit:false}];s.dealerCards=[card('Ts'),card('7h')];s.deck=makeDeck();
 blackjackAction(s,'0','surrender');assert.equal(s.seats[0].chips,497.5);
});
test('baccarat tableau covers all banker totals and all third-card values',()=>{
 const table=[[0,1,2,3,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,9],[2,3,4,5,6,7],[4,5,6,7],[6,7],[],[],[]];
 for(let b=0;b<10;b++){assert.equal(bankerDraw(b,null),b<=5);for(let c=0;c<10;c++)assert.equal(Boolean(bankerDraw(b,c)),table[b].includes(c),`${b}/${c}`);}
});
test('Jacks or Better exact return table and ace-low straight',()=>{
 for(const [ids,expected] of [[['As','Ks','Qs','Js','Ts'],800],[['2h','3h','4h','5h','6h'],50],[['Jh','Jd','2s','3h','9d'],1],[['Th','Td','2s','3h','9d'],0],[['As','2d','3c','4h','5d'],4],[['7s','7d','7c','2h','2c'],9]])assert.equal(videoReturn(ids.map(card)),expected);
});
test('slot probabilities sum to 8000 equally likely triples and exact published RTP',()=>{
 let returned=0;for(const a of SLOT_REEL)for(const b of SLOT_REEL)for(const c of SLOT_REEL)if(a===b&&b===c)returned+=SLOT_RETURNS[a];
 assert.equal(returned/8000,.908875);
});
test('casino games complete, next rounds reset, private video decks are never sent',()=>{
 for(const type of ['baccarat','war','video','slots']){
  const s=createGame(type,'x','u0',seats.slice(0,2),{minBet:1,maxBet:100});
  for(const p of s.seats)extraAction(s,p.id,'bet',10,type==='baccarat'?'banker':null);
  for(const p of s.seats)if(p.extra&&!p.extra.done)extraAction(s,p.id,type==='video'?'draw':'surrender',null,type==='video'?[0,2]:null);
  assert.equal(s.phase,'complete');assert(s.seats.every(p=>p.chips>=0));assert.equal(JSON.stringify(sanitizeState(s,'u1')).includes('"deck"'),false);nextHand(s);assert.equal(s.phase,'betting');
 }
});
test('Euchre left bower is trump, must follow effective suit, and cannot be played as its printed suit',()=>{
 assert.equal(effectiveSuit(card('Jh'),'d'),'d');assert(euchreStrength(card('Jh'),'d','h')>euchreStrength(card('Ad'),'d','h'));
 const s=createGame('euchre','x','u0',seats);s.phase='euchre-play';s.trump='d';s.currentSeatIndex=0;s.trick=[{index:3,card:card('9d')}];s.seats[0].hand=[card('Jh'),card('Ah')];
 assert.throws(()=>extraAction(s,'0','play',null,1),/follow suit/);extraAction(s,'0','play',null,0);
});
test('Euchre all-pass redeals with next dealer and holds match stakes only once',()=>{
 const s=createGame('euchre','x','u0',seats,{matchStake:10});for(let i=0;i<8;i++)extraAction(s,s.seats[s.currentSeatIndex].id,'pass');assert.equal(s.phase,'complete');
 const dealer=s.dealerIndex;nextHand(s);assert.equal(s.dealerIndex,(dealer+1)%4);assert.equal(s.seats[0].chips,490);
});
test('Euchre complete match simulations, legal follow suit, loner partner sits out, conserved team stakes',()=>{
 for(const alone of [false,true]){
  const s=createGame('euchre','x','u0',seats,{matchStake:10});let guard=0;
  while(!s.matchFinished&&guard++<2000){
   if(s.phase==='complete'){nextHand(s);continue;}
   const p=s.seats[s.currentSeatIndex];
   if(s.phase==='euchre-bid')extraAction(s,p.id,'trump',null,s.upcard.suit,alone);
   else if(s.phase==='euchre-discard')extraAction(s,p.id,'discard',null,0);
   else {assert.notEqual(s.currentSeatIndex,s.sittingOut);const led=s.trick.length?effectiveSuit(s.trick[0].card,s.trump):null;const n=p.hand.findIndex(c=>effectiveSuit(c,s.trump)===led);extraAction(s,p.id,'play',null,n<0?0:n);}
  }
  assert.equal(s.matchFinished,true);assert.equal(s.seats.reduce((n,p)=>n+p.chips,0),2000);assert.equal(sanitizeState(s,'stranger').seats.every(p=>p.cards===null),true);
 }
});
test('wallet makes exact coin change, retries same transaction once, and rejects overdrafts and other-table locks',async()=>{
 const a={name:'Actor',system:{currency:{gp:10,sp:2}},flags:{},getFlag(ns,k){return this.flags[k]},async update(p){this.system.currency=p['system.currency'];this.flags.wallet=p[`flags.${WALLET_FLAG}.wallet`];}};const actors=new Map([['a',a]]);
 await applyWallet([{actorId:'a',delta:-195}],'table','tx',actors);assert.equal(copper(a.system.currency),825);
 await applyWallet([{actorId:'a',delta:-195}],'table','tx',actors);assert.equal(copper(a.system.currency),825);
 await assert.rejects(()=>applyWallet([{actorId:'a',delta:-900}],'table','tx2',actors));
 await assert.rejects(()=>applyWallet([{actorId:'a',delta:10}],'other','tx2',actors));
 await applyWallet([{actorId:'a',delta:0}],'table','close',actors,true);assert.equal(a.flags.wallet.tableId,null);
 assert.equal(copper(coins(12345)),12345);
});
test('currency deltas respect fractional payouts, fun mode never changes wallets, unfinished games refund only unresolved stakes',()=>{
 for(const type of ['holdem','blackjack','euchre','war','video']){
  const count=type==='euchre'?4:type==='holdem'?2:1;
  const s=createGame(type,'x','u0',seats.slice(0,count).map(p=>({...p,actorId:p.id})),{moneyMode:'currency',minBet:1,maxBet:100});
  if(type==='war'||type==='video')extraAction(s,'0','bet',10);
  const before=structuredClone(s);refundUnfinished(s);assert(walletChanges(before,s).every(c=>c.delta>=0));
 }
 const a={settings:{moneyMode:'currency'},seats:[{id:'a',actorId:'a',chips:10}]}, b=structuredClone(a);b.seats[0].chips=10.95;assert.equal(walletChanges(a,b)[0].delta,95);b.settings.moneyMode='fun';assert.deepEqual(walletChanges(a,b),[]);
});
test('multiple short all-ins cumulatively reopen the full-raise amount',()=>{
 const s=createGame('holdem','x','u0',seats,{smallBlind:5,bigBlind:10});
 pokerAction(s,'3','raise',30);pokerAction(s,'0','call');s.seats[1].chips=30;pokerAction(s,'1','all-in');s.seats[2].chips=40;pokerAction(s,'2','all-in');
 assert.equal(legalPokerActions(s,'3').canRaise,true);assert.equal(legalPokerActions(s,'3').minTarget,70);
});

test('blackjack natural returns an exact 3:2 profit on an odd stake',()=>{
 const s=createGame('blackjack','x','u0',seats.slice(0,2),{minBet:1,maxBet:100});
 blackjackBet(s,'0',5);s.deck=['As','9s','Ks','Th','7h','9h'].map(card).reverse();blackjackBet(s,'1',5);
 blackjackAction(s,'1','stand');assert.equal(s.phase,'complete');assert.equal(s.seats[0].chips,507.5);
});
