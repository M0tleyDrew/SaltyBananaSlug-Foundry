import test from 'node:test';import assert from 'node:assert/strict';
import {actor,globals,catalog,Doc} from './helpers.mjs';
const registered=globals();const {testAdapter:api}=await import('../scripts/main.mjs');
function dialogs(){const windows=[];globalThis.Dialog=class{constructor(data){this.data=data;windows.push(this);}render(){this.rendered=true;return this;}close(){this.rendered=false;}};return windows;}
async function setup(){const env=globals();api.load(catalog);const windows=dialogs(),a=actor();game.actors.push(a);canvas.tokens.controlled=[{actor:a}];const id=await api.execute('add',a,{type:'lycanthrope',chooser:'gm'},env.gm);return{...env,a,id,windows};}
test('sheet-adjacent actor updates do not open pending setup on any actor',async()=>{
 const {a,gm,windows}=await setup();const unrelated=actor();game.actors.push(unrelated);
 for(const hook of registered.hooks.get('updateActor')??[]){hook(a,{'flags.sbs-transformations.data':api.read(a)},{},gm.id);hook(a,{'ownership.player':3},{},gm.id);hook(unrelated,{'flags.sheet.lastTab':'features'},{},gm.id);}
 await Promise.resolve();assert.equal(windows.length,0);assert.equal(api.read(a).records[0].stages[1],undefined);
 assert.equal(registered.hooks.has('renderActorSheet'),false);assert.equal(registered.hooks.has('renderActorSheetV2'),false);
});
test('user and connection updates have no automatic launch hooks',()=>{assert.equal(registered.hooks.has('updateUser'),false);assert.equal(registered.hooks.has('userConnected'),false);});
test('startup keeps pending choices saved without opening UI; explicit macro launch opens the editor',async()=>{
 const {a,windows}=await setup();globalThis.FormApplication=class{};game.settings.register=()=>{};game.settings.registerMenu=()=>{};game.modules.set('sbs-transformations',{});globalThis.Macro={create:async row=>{const m=new Doc(row);game.macros.push(m);return m;}};const previousFetch=globalThis.fetch;globalThis.fetch=async path=>({ok:true,json:async()=>path.endsWith('catalog.json')?structuredClone(catalog):[]});
 try{registered.callbacks.get('init')();await registered.callbacks.get('ready')();assert.equal(windows.length,0);assert.equal(api.read(a).records[0].stages[1],undefined);game.modules.get('sbs-transformations').api.open();assert.equal(windows.length,1);assert.match(windows[0].data.title,/Stage editor/);assert.match(windows[0].data.content,/Finish Stage 1/);}finally{globalThis.fetch=previousFetch;}
});
