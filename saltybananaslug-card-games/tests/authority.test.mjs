import test from 'node:test';
import assert from 'node:assert/strict';
import {copper,WALLET_FLAG} from '../scripts/wallet.js';
const callbacks=new Map(), handlers=new Map(), views=[];
globalThis.Hooks={once:(n,f)=>callbacks.set(n,f),on(){}};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
let serial=0;globalThis.foundry={utils:{randomID:()=>`test${++serial}`}};
const users=new Map([['gm',{id:'gm',isGM:true,active:true}],['u0',{id:'u0',name:'Alice',active:true}],['u1',{id:'u1',name:'Bob',active:true}],['out',{id:'out',name:'Outsider',active:true}]]);users.filter=fn=>[...users.values()].filter(fn);users.activeGM=users.get('gm');
function actor(id,owner){return {id,name:id,img:'',owner,system:{currency:{gp:1000}},flags:{},updates:0,getFlag(ns,k){return this.flags[k]},testUserPermission(u){return u.isGM||u.id===this.owner},async update(p){if(this.fail){this.fail=false;throw new Error('Simulated actor write failure');}this.updates++;this.system.currency=p['system.currency'];this.flags.wallet=p[`flags.${WALLET_FLAG}.wallet`];}};}
const actors=new Map([['a',actor('a','u0')],['b',actor('b','u1')]]);Object.defineProperty(actors,'contents',{get(){return [...this.values()]}});
globalThis.game={user:users.get('gm'),userId:'gm',users,actors,world:{id:'test'},modules:new Map([['socketlib',{active:true}]])};
globalThis.socketlib={registerModule:()=>({register:(n,f)=>handlers.set(n,f),executeForUsers:async(n,ids,event)=>views.push({ids,event})})};
const {authorityRequest,authority}=await import('../scripts/main.js');callbacks.get('socketlib.ready')();
const rpc=(user,action,data={})=>authorityRequest.call({socketdata:{userId:user}},action,{requesterId:user,...data});
const settings={startingChips:100,minBet:1,maxBet:100,moneyMode:'currency'};
const seat=(id,owner)=>({actorId:id,ownerUserId:owner,name:id,startingChips:100});
function clear(){authority.games.clear();authority.lobbies.clear();views.length=0;for(const a of actors.values()){a.system.currency={gp:1000};a.flags={};a.updates=0;a.fail=false;}}
test('actual SocketLib caller context, real bets and payouts, revision replay protection, privacy, and wallet release',async()=>{
 clear();await rpc('u0','createLobby',{type:'video',invitedUserIds:['u0'],settings,hostSeats:[seat('a','u0')]});
 let s=[...authority.games.values()][0];assert(s);assert.equal(actors.get('a').flags.wallet.tableId,s.id);assert.equal(copper(actors.get('a').system.currency),100000);
 const id=s.seats[0].id,revision=s.revision;
 const responses=await Promise.allSettled([rpc('u0','gameAction',{tableId:s.id,seatId:id,kind:'extra',action:'bet',amount:10,revision}),rpc('u0','gameAction',{tableId:s.id,seatId:id,kind:'extra',action:'bet',amount:10,revision})]);
 assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);assert.equal(copper(actors.get('a').system.currency),99000);
 s=authority.games.get(s.id);await rpc('u0','gameAction',{tableId:s.id,seatId:id,kind:'extra',action:'draw',value:[0,1,2,3,4],revision:s.revision});
 s=authority.games.get(s.id);assert.equal(copper(actors.get('a').system.currency),100000+(s.seats[0].chips-100)*100);
 const seen=views.length;await rpc('out','requestView',{tableId:s.id});assert.equal(views.length,seen);
 await assert.rejects(()=>rpc('out','gameAction',{tableId:s.id,seatId:id,kind:'extra',action:'bet',amount:1,revision:s.revision}));
 await rpc('u0','endGame',{tableId:s.id});assert.equal(actors.get('a').flags.wallet.tableId,null);assert.equal(authority.games.size,0);
 await assert.rejects(()=>authorityRequest.call({socketdata:{userId:'out'}},'resumeTables',{requesterId:'u0'}),/mismatch/);
});
test('ending a real-money video hand refunds its uncompleted stake and cannot double refund',async()=>{
 clear();await rpc('u0','createLobby',{type:'video',invitedUserIds:['u0'],settings,hostSeats:[seat('a','u0')]});let s=[...authority.games.values()][0];
 await rpc('u0','gameAction',{tableId:s.id,seatId:s.seats[0].id,kind:'extra',action:'bet',amount:10,revision:s.revision});
 await rpc('u0','endGame',{tableId:s.id});assert.equal(copper(actors.get('a').system.currency),100000);await rpc('u0','endGame',{tableId:s.id});assert.equal(copper(actors.get('a').system.currency),100000);
});
test('ownership, bankroll, free-chip injection and currency overdraft checks',async()=>{
 clear();await assert.rejects(()=>rpc('u0','createLobby',{type:'slots',invitedUserIds:['u0'],settings,hostSeats:[seat('b','u0')]}),/own/);
 await rpc('u0','createLobby',{type:'video',invitedUserIds:['u0'],settings,hostSeats:[seat('a','u0')]});let s=[...authority.games.values()][0];
 await assert.rejects(()=>rpc('u0','gameAction',{tableId:s.id,seatId:s.seats[0].id,kind:'add-chips',amount:100,revision:s.revision}),/disabled/);
 actors.get('a').system.currency={gp:1};await assert.rejects(()=>rpc('u0','gameAction',{tableId:s.id,seatId:s.seats[0].id,kind:'extra',action:'bet',amount:10,revision:s.revision}),/Insufficient/);
 assert.equal(authority.games.get(s.id).seats[0].chips,100);assert.equal(copper(actors.get('a').system.currency),100);
});
test('partial actor-write failure leaves a durable pending journal; retry recovers without charging the first actor twice',async()=>{
 clear();const id=await rpc('u0','createLobby',{type:'holdem',invitedUserIds:['u0','u1'],settings:{...settings,smallBlind:5,bigBlind:10},hostSeats:[seat('a','u0')]});
 actors.get('b').fail=true;
 await assert.rejects(()=>rpc('u1','respondInvite',{lobbyId:id,accepted:true,seats:[seat('b','u1')]}),/Simulated/);
 const pending=[...authority.games.values()][0];assert(pending.pendingWallet);const first=copper(actors.get('a').system.currency),writes=actors.get('a').updates;
 await rpc('u0','resumeTables');const s=authority.games.get(pending.id);assert(!s.pendingWallet);assert.equal(copper(actors.get('a').system.currency),first);assert.equal(actors.get('a').updates,writes);assert.equal(copper(actors.get('b').system.currency),99000);
 await rpc('u0','endGame',{tableId:s.id});assert.equal(copper(actors.get('a').system.currency),100000);assert.equal(copper(actors.get('b').system.currency),100000);
});
test('fun mode makes no actor writes',async()=>{
 clear();await rpc('u0','createLobby',{type:'slots',invitedUserIds:['u0'],settings:{...settings,moneyMode:'fun',startingChips:500},hostSeats:[{name:'Alice'}]});const s=[...authority.games.values()][0];assert.equal(s.seats[0].chips,500);
 await rpc('u0','gameAction',{tableId:s.id,seatId:s.seats[0].id,kind:'extra',action:'bet',amount:10,revision:s.revision});assert.equal(actors.get('a').updates,0);
});
