import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {ID,BUILD} from '../scripts/core.js';import {world} from './mock-world.js';import {probeRows} from '../scripts/selftest.js';import {parseRows} from '../scripts/core.js';import {preparePlans,importPlans} from '../scripts/engine.js';
import {parseHTML} from 'linkedom';import {buildUpdate} from '../scripts/updates.js';
import {packedWorld} from './mock-packs.js';
import {savePreset,readPreferences,saveSourceLibrary} from '../scripts/preferences.js';
const e=packedWorld(),callbacks=new Map(),captures=[];let answers=new Map();
globalThis.Hooks={once:(k,f)=>{const a=callbacks.get(k)||[];a.push(f);callbacks.set(k,a);},on:(k,f)=>{const a=callbacks.get(k)||[];a.push(f);callbacks.set(k,a);return f;},off:()=>{},call:()=>true};
class Dialog{static async wait(o){captures.push(o);const a=answers.get(o.window.title);return typeof a==='function'?a(o):a;}static async confirm(o){captures.push(o);const a=answers.get(o.window.title);if(a===undefined)throw Error('Unexpected confirmation');return typeof a==='function'?a(o):a;}}
const schemaContexts=[];
class ActorDoc{constructor(d,context){this.d=d;schemaContexts.push({kind:'Actor',context});}validate(){e.validateActor(this.d);}static create(d,context){return context?.pack?e.createInPack('Actor',d,context.pack):e.create('Actor',d);}}class ItemDoc{constructor(d,context){this.d=d;schemaContexts.push({kind:'Item',context});}validate(){e.validateItem(this.d);}static create(d,context){return context?.pack?e.createInPack('Item',d,context.pack):e.create('Item',d);}}
globalThis.CONFIG={Folder:{documentClass:class{constructor(d){this.d=d;}validate(){}static create(d,context){return context?.pack?e.createInPack('Folder',d,context.pack):e.create('Folder',d);}}},Actor:{documentClass:ActorDoc},Item:{documentClass:ItemDoc},JournalEntry:{documentClass:{create:d=>e.create('JournalEntry',d)}}};globalThis.Actor=ActorDoc;
globalThis.foundry={applications:{api:{DialogV2:Dialog}},appv1:{api:{FormApplication:class{}}},utils:{randomID:e.randomID}};
const users=new e.db.Actor.constructor([['gm',{id:'gm',name:'SaltyBananaSlug GM',isGM:true}],['p1',{id:'p1',name:'Test Player',isGM:false}],['p2',{id:'p2',name:'Offline Player',isGM:false}]]);users.activeGM=users.get('gm');
globalThis.game={user:users.get('gm'),users,actors:e.db.Actor,items:e.db.Item,journal:e.db.JournalEntry,packs:[],folders:e.db.Folder,macros:[],modules:new Map([[ID,{}]]),system:{id:'dnd5e'},settings:{get:(_m,k)=>e.getSetting(k),set:(_m,k,v)=>e.setSetting(k,v),register:()=>{},registerMenu:()=>{}}};
globalThis.Macro={create:async d=>{const m={...d,id:'macro',update:async()=>{}};game.macros.push(m);return m;}};globalThis.ui={notifications:{warn:()=>{},info:()=>{}},settings:{}};globalThis.canvas={tokens:{controlled:[]}};globalThis.fromUuid=e.fromUuid;
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),ctx);globalThis.XLSX=ctx.XLSX;
await import('../scripts/main.js');for(const f of callbacks.get('init'))await f();for(const f of callbacks.get('ready'))await f();const api=game.modules.get(ID).api;
test('launcher renders the seven available module actions and current version',async()=>{captures.length=0;answers=new Map();await api.open();const menu=captures[0];assert.equal(menu.buttons.length,7);assert.ok(menu.buttons.some(b=>b.action==='sources'));assert.ok(menu.buttons.some(b=>b.action==='test'));assert.ok(menu.content.includes(BUILD));});
test('preview renders five destinations, account lists, three modes and category controls without writing actors',async()=>{captures.length=0;const bytes=fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.3.0.xlsx',import.meta.url));answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',{file:{name:'test.xlsx',arrayBuffer:async()=>bytes},sources:[]}],['Actor Forge — Preview',[]]]);await api.open();const p=captures.find(c=>c.window.title==='Actor Forge — Preview');assert.ok(p);assert.equal((p.content.match(/data-row=/g)||[]).length,5);assert.ok(p.content.includes('Test Player')&&p.content.includes('Offline Player'));assert.ok(p.content.includes('Replace whole actor'));assert.ok(p.content.includes('data-category="permissions"'));assert.ok(p.content.includes('data-category="relationships"'));assert.ok(p.content.includes('data-pick-portrait')&&p.content.includes('name="folderPath"'));assert.equal(e.list('Actor').length,0);});
test('Biography action opens the native sheet instead of a separate note dialog',async()=>{
 const pc=await e.create('Actor',{name:'Sheet test',type:'character',ownership:{default:2}}),calls=[];
 pc.sheet={tabGroups:{primary:'details'},render:async options=>calls.push(['render',options]),changeTab:(...args)=>calls.push(['tab',...args])};
 captures.length=0;await api.details(pc);assert.equal(captures.length,0);assert.deepEqual(calls,[['render',{force:true,tab:'biography'}],['tab','biography','primary']]);
});
function dialogDOM(options){
 const {document,window}=parseHTML('<html><body><form>'+options.content+'</form></body></html>');
 // Linkedom does not implement these two browser form setters.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.querySelectorAll('option')].find(o=>o.hasAttribute('selected'))?.getAttribute('value') ?? [...this.querySelectorAll('option')].find(o=>o.hasAttribute('selected'))?.textContent ?? this.querySelector('option')?.getAttribute('value') ?? this.querySelector('option')?.textContent ?? '';},set(value){for(const o of this.querySelectorAll('option')){if((o.getAttribute('value') ?? o.textContent)===String(value))o.setAttribute('selected','');else o.removeAttribute('selected');}}});
 Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){if(value)this.setAttribute('checked','');else this.removeAttribute('checked');}});
 const app={element:document.querySelector('form')};options.render?.(null,app);return {app,window};
}
test('individual conflict controls survive redraw and the final review uses the selected choice without writing',async()=>{
 const incoming={name:'Workbook name',type:'npc',system:{attributes:{hp:{value:12,max:12}}},items:[],flags:{[ID]:{key:'UI-CONFLICT'}}};
 const actor=await e.create('Actor',buildUpdate(null,incoming).data);await actor.update({name:'Local name','system.attributes.hp.value':4});
 const book=XLSX.utils.book_new();for(const [title,rows]of Object.entries({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'UI-CONFLICT',Name:'Workbook name',Type:'npc','Match Actor Key':'Yes','Raw JSON':JSON.stringify(incoming)}]}))XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),title);
 const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});let selected;
 captures.length=0;answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',{file:{name:'ui.xlsx',arrayBuffer:async()=>bytes},sources:[]}],['Actor Forge — Preview',options=>{
  const {app,window}=dialogDOM(options),name=app.element.querySelector('[data-conflict-choice="field:name"]');assert.equal(name.value,'keep');name.value='incoming';name.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(app.element.querySelector('[data-conflict-choice="field:name"]').value,'incoming');
  selected=options.buttons.find(b=>b.action==='review').callback(null,null,app);return selected;
 }],['Actor Forge — Confirm Changes',false]]);
 await api.open();assert.equal(selected[0].conflictChoices['field:name'],'incoming');assert.equal(selected[0].conflictChoices['field:system.attributes.hp.value'],'keep');
 const review=captures.find(c=>c.window.title==='Actor Forge — Confirm Changes');assert.ok(review.content.includes('Use workbook value')&&review.content.includes('Keep current value'));assert.equal(actor.name,'Local name');assert.equal(actor.system.attributes.hp.value,4);
});
test('portrait browsing and new folder paths flow through the real preview event handlers',async()=>{
 const bytes=fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.3.0.xlsx',import.meta.url));let chosen;
 CONFIG.ux={FilePicker:class{constructor(o){this.options=o;}async browse(){this.options.callback('art/courier.webp');}}};
 answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',{file:{name:'main.xlsx',arrayBuffer:async()=>bytes},sources:[]}],['Actor Forge — Preview',async options=>{
  const {app,window}=dialogDOM(options),tr=app.element.querySelector('[data-row="0"]');const priorEvent=globalThis.Event;globalThis.Event=window.Event;
  try{tr.querySelector('[data-pick-portrait]').click();await new Promise(r=>setTimeout(r,0));}finally{globalThis.Event=priorEvent;}
  assert.equal(tr.querySelector('[name=image]').value,'art/courier.webp');assert.equal(tr.querySelector('[data-portrait-preview]').getAttribute('src'),'art/courier.webp');
  const path=tr.querySelector('[name=folderPath]');path.value='SBS UI Test / Couriers';path.dispatchEvent(new window.Event('change',{bubbles:true}));
  chosen=options.buttons.find(b=>b.action==='review').callback(null,null,app);return [];
 }]]);
 const before=e.list('Folder').length;await api.open();assert.equal(chosen[0].folderPath,'SBS UI Test / Couriers');assert.equal(e.list('Folder').length,before);
});
test('saved preset choices populate collections and libraries, then apply only the chosen update categories',async()=>{
 const ap=e.addPack('world.ui-actors'),ip=e.addPack('world.ui-items','Item');game.packs.push(ap,ip);
 const lib=await saveSourceLibrary(e,'UI library',new Map([['ui.json',{spell:[{name:'UI spark',source:'SBS050',level:0,entries:['A decorative spark.']}]}]]));
 const preset=await savePreset(e,'UI templates',{destination:{actorPack:ap.collection,itemPack:ip.collection},libraryIds:[lib.id],folderPath:'SBS UI / Templates',categories:['fields','items'],ownership:{default:0,p1:2}});
 const bytes=fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.4.1.xlsx',import.meta.url));let selection;
 captures.length=0;answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',options=>{
  const {app,window}=dialogDOM(options),select=app.element.querySelector('[name=preset]');select.value=preset.id;select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(app.element.querySelector('[name=actorPack]').value,ap.collection);assert.equal(app.element.querySelector('[name=itemPack]').value,ip.collection);assert.equal(app.element.querySelector(`[data-library="${lib.id}"]`).checked,true);
  Object.defineProperty(app.element.querySelector('[name=file]'),'files',{value:[{name:'main.xlsx',arrayBuffer:async()=>bytes}]});Object.defineProperty(app.element.querySelector('[name=sources]'),'files',{value:[]});return options.buttons[0].callback(null,null,app);
 }],['Actor Forge — Preview',options=>{const {app}=dialogDOM(options);assert.ok(options.content.includes(ap.title));const first=app.element.querySelector('[data-row]');assert.equal(first.querySelector('[name=advance]').disabled,true);assert.equal(first.querySelector('[name=folderPath]').value,'SBS UI / Templates');assert.equal(first.querySelector('[data-category=permissions]').checked,false);assert.equal(first.querySelector('[data-access-user=p1]').value,'2');selection=options.buttons[0].callback(null,null,app);return [];}]]);
 await api.open();assert.equal(selection.length,3);assert.deepEqual(selection[0].categories,['fields','items']);assert.equal(ap.backend.list('Actor').length,0);
});
test('real import screen creates compendium documents and real Undo screen reloads that destination',async()=>{
 const ap=e.getPack('world.ui-actors'),ip=e.getPack('world.ui-items'),worldCount=e.list('Actor').length,bytes=fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.4.1.xlsx',import.meta.url));
 captures.length=0;schemaContexts.length=0;answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',{file:{name:'main.xlsx',arrayBuffer:async()=>bytes},sources:[],destination:{actorPack:ap.collection,itemPack:ip.collection}}],['Actor Forge — Preview',options=>{const {app}=dialogDOM(options);return options.buttons[0].callback(null,null,app);}],['Actor Forge — Confirm Changes',true]]);
 await api.open();const result=captures.find(o=>o.window.title==='Actor Forge — Results');assert.ok(result,result?.content);assert.ok(!result.content.includes('FAILED:'));assert.equal(ap.backend.list('Actor').length,3);assert.ok(ip.backend.list('Item').length>0);assert.equal(e.list('Actor').length,worldCount);assert.ok(schemaContexts.filter(c=>c.kind==='Actor').every(c=>c.context.pack===ap.collection));assert.ok(schemaContexts.filter(c=>c.kind==='Item').every(c=>c.context.pack===ip.collection));
 ap.cache.clear();ip.cache.clear();answers=new Map([['SaltyBananaSlug’s Actor Forge','undo'],['Undo last import?',true]]);await api.open();assert.equal(ap.backend.list('Actor').length,0);assert.equal(ip.backend.list('Item').length,0);assert.equal(e.list('Actor').length,worldCount);
});
test('source library UI saves uploaded originals, clears the session and reloads the saved library',async()=>{
 const bundle={spell:[{name:'Persistent UI spark',source:'SBS050',level:0,entries:['Utility spark.']}]};
 answers=new Map([['SaltyBananaSlug’s Actor Forge','sources'],['Actor Forge — Load 5e.tools Sources',{action:'clear'}]]);await api.open();
 answers=new Map([['SaltyBananaSlug’s Actor Forge','sources'],['Actor Forge — Load 5e.tools Sources',options=>{const {app}=dialogDOM(options);Object.defineProperty(app.element.querySelector('[name=files]'),'files',{value:[{name:'persistent.json',text:async()=>JSON.stringify(bundle)}]});app.element.querySelector('[name=libraryName]').value='UI persistent library';return options.buttons.find(b=>b.action==='save').callback(null,null,app);}]]);await api.open();
 const library=readPreferences(e,'libraries').entries.find(l=>l.name==='UI persistent library');assert.ok(library);assert.equal(library.files[0].bundle.spell[0].name,'Persistent UI spark');
 answers=new Map([['SaltyBananaSlug’s Actor Forge','sources'],['Actor Forge — Load 5e.tools Sources',{action:'clear'}]]);await api.open();captures.length=0;
 answers=new Map([['SaltyBananaSlug’s Actor Forge','sources'],['Actor Forge — Load 5e.tools Sources',{action:'load',files:[],library:library.id}],['Actor Forge — Source Library',undefined]]);await api.open();const picker=captures.find(o=>o.window.title==='Actor Forge — Source Library');assert.ok(picker.content.includes('Persistent UI spark'));assert.ok(!picker.content.includes('<strong>UI spark</strong>'));
});
test('preset manager exposes create, edit, rename and delete, and saves UI account choices',async()=>{
 answers=new Map([['SaltyBananaSlug’s Actor Forge','presets'],['Actor Forge — Presets',options=>{assert.ok(options.buttons.some(b=>b.action==='delete'));return {action:'edit'};}],['Actor Forge — Edit Preset',options=>{const {app}=dialogDOM(options);app.element.querySelector('[name=name]').value='UI managed';app.element.querySelector('[name=folderPath]').value='UI / Managed';app.element.querySelector('[data-access-user=p1]').value='3';return options.buttons[0].callback(null,null,app); }]]);await api.open();const preset=readPreferences(e,'presets').entries.find(p=>p.name==='UI managed');assert.ok(preset);assert.equal(preset.settings.ownership.p1,3);assert.equal(preset.settings.folderPath,'UI / Managed');
});
test('saving a preview preset retains an existing selected folder as a reusable path',async()=>{
 const folder=await e.create('Folder',{name:'SBS Existing',type:'Actor',folder:null}),bytes=fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.4.1.xlsx',import.meta.url));
 answers=new Map([['SaltyBananaSlug’s Actor Forge','import'],['Actor Forge — Import',{file:{name:'main.xlsx',arrayBuffer:async()=>bytes},sources:[]}],['Actor Forge — Save Preset','Existing folder profile'],['Actor Forge — Preview',async options=>{const {app}=dialogDOM(options),tr=app.element.querySelector('[data-row]');tr.querySelector('[name=folderPath]').value='';tr.querySelector('[name=folder]').value=folder.id;tr.querySelector('[data-save-preset]').click();await new Promise(r=>setTimeout(r,0));return [];}]]);
 await api.open();assert.equal(readPreferences(e,'presets').entries.find(p=>p.name==='Existing folder profile').settings.folderPath,'SBS Existing');
});
