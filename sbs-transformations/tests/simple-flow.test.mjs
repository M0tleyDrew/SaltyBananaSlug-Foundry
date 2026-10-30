import test from 'node:test';import assert from 'node:assert/strict';
import {actor,globals,catalog,answers} from './helpers.mjs';
globals();const {testAdapter:api}=await import('../scripts/main.mjs');
function ui(){
 const windows=[];
 globalThis.Dialog=class{
  constructor(data){this.data=data;this.fields={};this.handlers={};this.fragments={};windows.push(this);}
  html(){const win=this;return{find(selector){return{on:(name,fn)=>{win.handlers[selector]=fn;},val:()=>win.fields[selector]??'',html:value=>{win.fragments[selector]=value;},prop:()=>{},each:()=>{},toArray:()=>selector==='[name=boon]:checked'?(win.fields.boons??[]).map(value=>({value})):[]};}};}
  render(){this.rendered=true;this.data.render?.(this.html());return this;}close(){this.rendered=false;}
  async click(action,extra={}){await this.handlers['[data-action]']({currentTarget:{dataset:{action,...extra},disabled:false}});}
  static async confirm(){return true;}
 };
 return windows;
}
async function base(){const env=globals();api.load(catalog);const windows=ui(),a=actor();game.actors.push(a);canvas.tokens.controlled=[{actor:a}];return{...env,windows,a};}
async function applyWolf(a,chooser='gm'){const id=await api.execute('add',a,{type:'lycanthrope',chooser},game.users.activeGM);await api.execute('choose',a,{record:id,stage:1,boons:['lycanthrope:hybrid-wolf-form'],answers:{}},game.users.activeGM);return id;}
test('first run is a Stage 1 picker with descriptions; second run is the existing transformation editor',async()=>{
 const {a,windows}=await base();api.open();const setup=windows.at(-1);assert.match(setup.data.title,/Setup/);assert.doesNotMatch(setup.data.content,/Granted stage|newStage|Browse all characters/);setup.fields['[name=newType]']='lycanthrope';setup.handlers['[name=newType]']();assert.match(setup.fragments['[data-setup-preview]'],/wolf, bear, or rat/);await setup.click('apply-dm');const prompt=windows.at(-1);assert.match(prompt.data.title,/Stage 1/);assert.match(prompt.data.content,/Your Strength|Strength|strength/);assert.match(prompt.data.content,/Lust for the Hunt/);prompt.fields.boons=['lycanthrope:hybrid-wolf-form'];await prompt.data.buttons.accept.callback(prompt.html());assert.equal(api.read(a).records[0].granted,1);assert.ok(a.items.some(i=>i.getFlag('sbs-transformations','feature')==='lycanthrope:lust-for-the-hunt'));api.open();const editor=windows.at(-1);assert.match(editor.data.title,/Stage editor/);assert.match(editor.data.content,/Add Stage 2/);assert.doesNotMatch(editor.data.content,/newType/);await setup.click('apply-dm');assert.equal(api.read(a).records.length,1);prompt.close();
});
test('DM applies Stage 1 and sends the remaining setup to the online player',async()=>{
 const {a,windows,player}=await base();api.open();const setup=windows.at(-1);setup.fields['[name=newType]']='lycanthrope';await setup.click('apply-player');assert.equal(api.read(a).records[0].chooser,'player');assert.equal(api.read(a).records[0].stages[1],undefined);assert.match(windows.at(-1).data.content,/Finish Stage 1/);game.user=player;api.pendingPrompts(a);assert.match(windows.at(-1).data.title,/Stage 1/);assert.match(windows.at(-1).data.content,/Hybrid Wolf Form/);windows.at(-1).close();
});
test('offline owner leaves first-time setup with the DM and no unusable send button',async()=>{
 const {a,windows,player}=await base();player.active=false;api.open();assert.match(windows.at(-1).data.content,/No player owner is online/);assert.doesNotMatch(windows.at(-1).data.content,/data-action="apply-player"/);windows.at(-1).fields['[name=newType]']='lycanthrope';await windows.at(-1).click('apply-dm');assert.match(windows.at(-1).data.title,/Stage 1/);windows.at(-1).close();
});
test('level-up sends only the next stage choices to the player',async()=>{
 const {a,windows,player}=await base();await applyWolf(a);api.open();await windows.at(-1).click('level-player');const r=api.read(a).records[0];assert.equal(r.granted,2);assert.equal(r.stages[1].boons[0],'lycanthrope:hybrid-wolf-form');assert.equal(r.stages[2],undefined);game.user=player;api.pendingPrompts(a);const prompt=windows.at(-1);assert.match(prompt.data.title,/Stage 2/);assert.match(prompt.data.content,/Iron Pelt/);assert.match(prompt.data.content,/Silver Sensitivity/);assert.doesNotMatch(prompt.data.content,/vampire:fanged-bite/);prompt.close();
});
test('each stage keeps its own temporary form art and downgrading restores the earlier selection',async()=>{
 const {a,gm}=await base();const id=await applyWolf(a);await api.execute('images',a,{record:id,stage:1,images:{hybrid:'wolf-stage-1.webp'}},gm);await api.execute('grant',a,{record:id,stage:2,chooser:'gm'},gm);await api.execute('choose',a,{record:id,stage:2,boons:['lycanthrope:iron-pelt'],answers:{},images:{hybrid:'wolf-stage-2.webp'}},gm);await api.changeForm(a,id,'hybrid');assert.equal(a.prototypeToken.texture.src,'wolf-stage-2.webp');assert.equal(a.img,'portrait.webp');await api.changeForm(a,id,'normal');assert.equal(a.prototypeToken.texture.src,'base.webp');await api.execute('grant',a,{record:id,stage:1},gm);await api.changeForm(a,id,'hybrid');assert.equal(a.prototypeToken.texture.src,'wolf-stage-1.webp');assert.equal(api.read(a).records[0].stageImages[2].hybrid,'wolf-stage-2.webp');await api.changeForm(a,id,'normal');assert.equal(a.prototypeToken.texture.src,'base.webp');
});
test('transformations without a hybrid form can set temporary stage appearance without changing portraits',async()=>{
 const {a,gm}=await base(),t=catalog.find(t=>t.id==='fey'),id=await api.execute('add',a,{type:'fey'},gm),r=api.read(a).records[0],boons=[t.stages[0].boons[0]],ids=[...t.stages[0].grants,...boons,...t.stages[0].flaws];await api.execute('choose',a,{record:id,stage:1,boons,answers:answers(t,r,ids),images:{revealed:'fey-stage-1.webp'}},gm);await api.changeForm(a,id,'revealed');assert.equal(a.prototypeToken.texture.src,'fey-stage-1.webp');assert.equal(a.img,'portrait.webp');await api.changeForm(a,id,'normal');assert.equal(a.prototypeToken.texture.src,'base.webp');
});
test('handoff closes a DM setup prompt and allows the player to continue',async()=>{
 const {a,windows,gm,player}=await base(),id=await api.execute('add',a,{type:'lycanthrope',chooser:'gm'},gm);api.pendingPrompts(a);const dmPrompt=windows.at(-1);await api.execute('assign-chooser',a,{record:id,chooser:'player'},gm);api.pendingPrompts(a);assert.equal(dmPrompt.rendered,false);game.user=player;api.pendingPrompts(a);assert.notEqual(windows.at(-1),dmPrompt);assert.match(windows.at(-1).data.title,/Stage 1/);windows.at(-1).close();
});
test('failed dialog rendering does not permanently suppress pending choices',async()=>{
 const {a,windows,gm}=await base(),id=await api.execute('add',a,{type:'lycanthrope',chooser:'gm'},gm),GoodDialog=globalThis.Dialog;globalThis.Dialog=class{render(){throw Error('render failed');}};assert.throws(()=>api.promptChoice(a,id,{gm:true}),/render failed/);globalThis.Dialog=GoodDialog;api.promptChoice(a,id,{gm:true});assert.match(windows.at(-1).data.title,/Stage 1/);windows.at(-1).close();
});
