import test from 'node:test';
import assert from 'node:assert/strict';
import {actor,globals,catalog} from './helpers.mjs';
globals();
const {testAdapter:api}=await import('../scripts/main.mjs');
function dialogCapture(){
 const windows=[];
 globalThis.Dialog=class{
  constructor(data){this.data=data;this.handlers={};windows.push(this);}
  render(){this.rendered=true;const self=this;this.data.render?.({find:selector=>({on:(event,fn)=>{self.handlers[selector]=fn;},val:()=>'',html:()=>{},prop:()=>{}})});return this;}
  close(){this.rendered=false;}
 };
 return windows;
}
test('manager opens setup for the selected token without an actor list',()=>{
 globals();api.load(catalog);const windows=dialogCapture();const first=actor(),selected=actor();first.name='First alphabetically';selected.name='Selected slug';game.actors.push(first,selected);canvas.tokens.controlled=[{actor:selected}];api.open();const html=windows.at(-1).data.content;assert.match(html,/Managing: <b>Selected slug<\/b>/);assert.doesNotMatch(html,/Browse all characters/);assert.match(html,/Choose a transformation/);assert.match(html,/data-action="selected-token"/);assert.doesNotMatch(html,/<details open/);
});
test('Use selected token reads the current selection while the window is already open',async()=>{
 globals();api.load(catalog);const windows=dialogCapture();const first=actor(),second=actor();first.name='Original actor';second.name='New selection';game.actors.push(first,second);api.open(first);const original=windows.at(-1);canvas.tokens.controlled=[{actor:second}];await original.handlers['[data-action]']({currentTarget:{dataset:{action:'selected-token'},disabled:false}});assert.match(windows.at(-1).data.content,/Managing: <b>New selection<\/b>/);assert.equal(original.rendered,false);
});
test('selection supports unlinked actors and resolves transformed actors back to their original',()=>{
 globals();const synthetic=actor();synthetic.isToken=true;canvas.tokens.controlled=[{actor:synthetic}];assert.equal(api.selectedTokenActor(),synthetic);const original=actor(),beast=actor();game.actors.push(original,beast);beast.flags['sbs-transformations']={root:original.uuid};canvas.tokens.controlled=[{actor:beast}];assert.equal(api.selectedTokenActor(),original);
});
test('missing, multiple, unsupported and unowned selections do not silently choose another actor',()=>{
 globals();assert.throws(()=>api.selectedTokenActor(),/exactly one/);canvas.tokens.controlled=[{actor:actor()},{actor:actor()}];assert.throws(()=>api.selectedTokenActor(),/exactly one/);const vehicle=actor();vehicle.type='vehicle';canvas.tokens.controlled=[{actor:vehicle}];assert.throws(()=>api.selectedTokenActor(),/character or NPC/);const a=actor();game.user={id:'stranger',isGM:false};canvas.tokens.controlled=[{actor:a}];assert.throws(()=>api.selectedTokenActor(),/you own/);
});
