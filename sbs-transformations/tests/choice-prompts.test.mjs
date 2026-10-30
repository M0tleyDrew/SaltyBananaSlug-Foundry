import test from 'node:test';
import assert from 'node:assert/strict';
import {actor,globals,catalog,answers,context} from './helpers.mjs';
import {fresh,eligible,acceptStage} from '../scripts/engine.mjs';
globals();const {testAdapter:api}=await import('../scripts/main.mjs');
function dialogs(){
 const windows=[];
 const empty={on:()=>{},toArray:()=>[],each:()=>{},val:()=>undefined,html:()=>{},prop:()=>{}};
 globalThis.Dialog=class{
  constructor(data){this.data=data;windows.push(this);}
  render(){this.rendered=true;this.data.render?.({find:()=>empty});return this;}
  close(){this.rendered=false;}
 };
 return windows;
}
async function grant(type,{chooser='player',stage=1}={}){const a=actor();game.actors.push(a);const id=await api.execute('add',a,{type,stage,chooser},game.users.activeGM);return{a,id,r:api.read(a).records[0]};}
test('pending Lycanthrope controls list Wolf, Bear, Rat and the required Hunt flaw',async()=>{
 globals();api.load(catalog);const windows=dialogs();const {a,id}=await grant('lycanthrope');api.recordPanel(a,id);const html=windows.at(-1).data.content;for(const name of ['Hybrid Wolf Form','Hybrid Bear Form','Hybrid Rat Form','Lust for the Hunt','choices pending','DM: Set boons & flaws'])assert.ok(html.includes(name),name);assert.ok(!html.includes('No eligible choices'));for(const w of windows)w.close();
});
test('offline player owner falls back to an automatic DM choice dialog',async()=>{
 const {player}=globals();player.active=false;api.load(catalog);const windows=dialogs();const {a}=await grant('lycanthrope');api.pendingPrompts(a);assert.equal(windows.length,1);assert.match(windows[0].data.title,/Stage 1/);assert.match(windows[0].data.content,/You are setting these choices for the player/);assert.equal((windows[0].data.content.match(/name="boon"/g)||[]).length,3);windows[0].close();
});
test('online player receives the automatic prompt; DM can still open it explicitly',async()=>{
 const {player}=globals();api.load(catalog);const windows=dialogs();const {a,id}=await grant('lycanthrope');api.pendingPrompts(a);assert.equal(windows.length,0);api.promptChoice(a,id,{gm:true});assert.equal(windows.length,1);windows[0].close();game.user=player;api.pendingPrompts(a);assert.equal(windows.length,2);assert.match(windows[1].data.content,/Choose your boons/);windows[1].close();
});
test('DM assignment overrides an online player and can accept the choices through the actual dialog',async()=>{
 globals();api.load(catalog);const windows=dialogs();const {a,id}=await grant('lycanthrope',{chooser:'gm'});api.pendingPrompts(a);assert.equal(windows.length,1);await windows[0].data.buttons.accept.callback({find:selector=>selector==='[name=boon]:checked'?{toArray:()=>[{value:'lycanthrope:hybrid-wolf-form'}]}:{val:()=>''}});const r=api.read(a).records[0];assert.deepEqual(r.stages[1].boons,['lycanthrope:hybrid-wolf-form']);assert.ok(a.items.some(item=>item.getFlag('sbs-transformations','feature')==='lycanthrope:lust-for-the-hunt'));windows[0].close();
});
test('every transformation pending screen contains its actual stage-one grants, boons and flaws',async()=>{
 globals();api.load(catalog);const windows=dialogs();for(const t of catalog){const {a,id}=await grant(t.id,{chooser:'gm'});api.promptChoice(a,id,{gm:true});const html=windows.at(-1).data.content;const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));for(const fid of [...t.stages[0].grants,...t.stages[0].boons,...t.stages[0].flaws]){assert.ok(html.includes(escape(t.features.find(f=>f.id===fid).name)),fid);}assert.ok(!html.includes('vampire:fanged-bite')||t.id==='vampire');windows.at(-1).close();}
});
test('granting later stages preserves pending choices and routes them to the DM when requested',async()=>{
 globals();api.load(catalog);const windows=dialogs();const {a,id}=await grant('lycanthrope');await api.execute('choose',a,{record:id,stage:1,boons:['lycanthrope:hybrid-wolf-form'],answers:{}},game.user);await api.execute('grant',a,{record:id,stage:2,chooser:'gm'},game.user);api.pendingPrompts(a);assert.match(windows.at(-1).data.title,/Stage 2/);assert.match(windows.at(-1).data.content,/Iron Pelt/);assert.match(windows.at(-1).data.content,/Silver Sensitivity/);windows.at(-1).close();
});
test('players cannot reassign who chooses, while the DM can prompt the player again',async()=>{
 const {player}=globals();api.load(catalog);const {a,id}=await grant('lycanthrope',{chooser:'gm'});await assert.rejects(()=>api.execute('assign-chooser',a,{record:id,chooser:'player'},player),/Only the GM/);await api.execute('assign-chooser',a,{record:id,chooser:'player'},game.user);assert.equal(api.choiceRecipient(a,api.read(a).records[0]).id,player.id);
});
