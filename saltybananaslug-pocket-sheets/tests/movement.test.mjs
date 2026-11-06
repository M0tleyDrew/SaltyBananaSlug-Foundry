import test from 'node:test';
import assert from 'node:assert/strict';
import {PocketTokenDrag} from '../scripts/pocket-movement.js';

function setup() {
  globalThis.game = {user:{id:'player',isGM:false},paused:false};
  globalThis.PIXI = {FederatedPointerEvent:class {constructor() {this.client={set(){}};this.global={copyFrom(){}};}}};
  globalThis.canvas = {ready:true,scene:{id:'scene'},tokens:{controlled:[],activate(){}},app:{renderer:{events:{rootBoundary:{}}}},stage:{toGlobal:p=>p}};
  const calls=[];
  const t = {id:'t',actor:{id:'bard'},isOwner:true,visible:true,document:{x:100,y:200,elevation:0,hidden:false,canUserModify:()=>true},can:()=>true,control() {canvas.tokens.controlled=[this];return true;}};
  t.mouseInteractionManager={states:{NONE:0,GRABBED:3,DRAG:4,DROP:5},state:0,isDragging:false,interactionData:{},can:()=>true,
    reset() {this.interactionData={};this.state=0;},
    callback(action,event) {calls.push({action,origin:{...event.interactionData.origin},destination:{...event.interactionData.destination},modifiers:[event.altKey,event.ctrlKey,event.shiftKey]});return true;}};
  return {t,calls,drag:new PocketTokenDrag('bard'),event:{pointerId:1,clientX:10,clientY:20}};
}
test('native drag callbacks receive origin/destination; no custom document writes',()=>{
  const {t,calls,drag,event}=setup();
  assert.equal(drag.begin(t,{x:110,y:210},event),true);
  assert.equal(drag.move({x:170,y:240},event),true);
  assert.equal(drag.drop({x:180,y:250},event),true);
  assert.deepEqual(calls.map(c=>c.action),['dragLeftStart','dragLeftMove','dragLeftDrop']);
  assert.deepEqual(calls.at(-1).destination,{x:180,y:250});
  assert.deepEqual(calls[0].origin,{x:110,y:210});
  assert.deepEqual(calls.at(-1).modifiers,[false,false,false]);
  assert.equal(t.document.x,100);
  assert.equal(drag.active,null);
});
test('other actors, unowned tokens, hidden tokens, pause and denied permissions cannot move',()=>{
  for (const change of [t=>{t.actor.id='other';},t=>{t.isOwner=false;},t=>{t.document.hidden=true;},()=>{game.paused=true;},t=>{t.can=()=>false;},t=>{t.document.canUserModify=()=>false;}]) {
    const {t,calls,drag,event}=setup();change(t);
    assert.equal(drag.begin(t,{x:0,y:0},event),false);assert.equal(calls.length,0);
  }
});
test('cancel sends cleanup but never drop; repeated cancellation is harmless',()=>{
  const {t,calls,drag,event}=setup();drag.begin(t,{x:0,y:0},event);drag.move({x:50,y:0},event);drag.cancel();drag.cancel();
  assert.deepEqual(calls.map(c=>c.action),['dragLeftStart','dragLeftMove','dragLeftCancel']);
});
test('scene change, GM move, revoked ownership, pause or extra controlled tokens cancel before drop',()=>{
  for (const change of [()=>{canvas.scene.id='other';},t=>{t.document.x+=10;},t=>{t.isOwner=false;},()=>{game.paused=true;},()=>{canvas.tokens.controlled.push({id:'extra'});}]) {
    const {t,calls,drag,event}=setup();drag.begin(t,{x:0,y:0},event);change(t);
    assert.equal(drag.drop({x:100,y:0},event),false);
    assert.equal(calls.at(-1).action,'dragLeftCancel');
    assert.ok(!calls.some(c=>c.action==='dragLeftDrop'));
  }
});
test('a native veto or exception cleans up without falling back to direct movement',()=>{
  for (const fail of [false,new Error('native veto')]) {
    const {t,calls,drag,event}=setup();const original=t.mouseInteractionManager.callback;
    t.mouseInteractionManager.callback=function(action,e){original.call(this,action,e);if(action==='dragLeftStart') {if(fail instanceof Error) throw fail;return false;}return true;};
    if(fail instanceof Error) assert.throws(()=>drag.begin(t,{x:0,y:0},event),/native veto/);
    else assert.equal(drag.begin(t,{x:0,y:0},event),false);
    assert.equal(drag.active,null);assert.equal(calls.at(-1).action,'dragLeftCancel');
  }
});

test('native preview can hide the source display without cancelling an owned visible token',()=>{
  const {t,drag,event}=setup();drag.begin(t,{x:0,y:0},event);
  t.visible=false;t.isVisible=true;
  assert.equal(drag.move({x:100,y:0},event),true);
  drag.cancel();
});
