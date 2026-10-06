import {test} from 'node:test';import assert from 'node:assert/strict';
import {ID,clone,parseRows} from '../scripts/core.js';
import {preparePlans,importPlans,previewUpdate,undoImport} from '../scripts/engine.js';
import {destinationEnvironment,destinationChoices} from '../scripts/destinations.js';
import {saveDetails,readPrivateDetails,actorRecordKey,readUndo} from '../scripts/privacy.js';
import {packedWorld} from './mock-packs.js';
const rows=(key='PACK-A')=>({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':key,Name:'Template courier',Type:'character',Folder:'SBS / Templates','Apply Advancements':'Yes','Raw JSON':JSON.stringify({name:'Template courier',type:'character',system:{attributes:{hp:{value:20,max:20}}},items:[{name:'Test species',type:'race',flags:{[ID]:{itemKey:'species'}},system:{advancement:[{_id:'TestGrantAdv0001',type:'ItemGrant',level:0,configuration:{items:[{uuid:'@forge:grant'}]},value:{}}]}}]})}],Catalog:[{'Source Key':'grant','Raw JSON':JSON.stringify({name:'Grant feature',type:'feat',system:{}})}],Details:[{'Actor Key':key,Section:'GM',Label:'Secret',Value:'PACK_ONLY_SECRET',Visibility:'GM'}]});
async function setup(){const base=packedWorld(),ap=base.addPack('world.sbs-actors'),ip=base.addPack('world.sbs-items','Item'),scope=await destinationEnvironment(base,{actorPack:ap.collection,itemPack:ip.collection});return {base,ap,ip,scope};}
async function plans(scope,key){const p=parseRows(rows(key));await preparePlans(p,scope);assert.deepEqual(p[0].errors,[]);return p;}
test('destination choices exclude locked, package-owned, wrong type and unauthorized packs',()=>{const b=packedWorld();b.addPack('world.a');b.addPack('world.lock','Actor',{locked:true});b.addPack('module.a','Actor',{packageType:'module'});b.addPack('world.item','Item');b.addPack('world.denied','Actor',{owner:false});assert.deepEqual(destinationChoices(b,'Actor').map(p=>p.collection),['world.a']);});
test('missing, locked and mismatched packs stop before any documents or Undo writes',async()=>{const {base,ap}=await setup();ap.locked=true;await assert.rejects(destinationEnvironment(base,{actorPack:ap.collection}),/unlocked/);await assert.rejects(destinationEnvironment(base,{actorPack:'world.missing'}),/missing/);await assert.rejects(destinationEnvironment(base,{itemPack:ap.collection}),/Item/);assert.equal(base.list('JournalEntry').length,0);assert.equal(base.calls.length,0);});
test('Actor and Item compendiums receive full documents, folders, native UUIDs and private notes in the world',async()=>{
 const {base,ap,ip,scope}=await setup(),p=await plans(scope);let advanceCalls=0;scope.runAdvancements=async()=>advanceCalls++;
 assert.equal(p[0].advance,false);const r=await importPlans(p,scope),a=r.imported.get('PACK-A');assert.ok(a);assert.equal(base.list('Actor').length,0);assert.equal(base.list('Item').length,0);
 assert.equal(ap.backend.list('Actor').length,1);assert.equal(ap.folders.size,2);assert.equal(ip.backend.list('Item').length,1);assert.equal(advanceCalls,0);
 const ref=[...a.items][0].system.advancement[0].configuration.items[0].uuid;assert.equal(ref,ip.getUuid(ip.backend.list('Item')[0].id));
 assert.equal(readPrivateDetails(base,actorRecordKey(a))[0].value,'PACK_ONLY_SECRET');assert.ok(!JSON.stringify(a.toObject()).includes('PACK_ONLY_SECRET'));assert.equal((await readUndo(base)).destination.actorPack,ap.collection);
 assert.ok(base.calls.every(c=>['world.sbs-actors','world.sbs-items'].includes(c.collection)));
});
test('compendium Undo reloads full data after cache eviction and leaves colliding world IDs untouched',async()=>{
 const {base,ap,ip,scope}=await setup();const r=await importPlans(await plans(scope),scope),a=r.imported.get('PACK-A');
 const worldActor=await base.create('Actor',{_id:a.id,name:'World collision',type:'npc'});ap.cache.clear();ip.cache.clear();
 const undo=await undoImport(base);assert.equal(undo.remaining.length,0);assert.equal(ap.backend.list('Actor').length,0);assert.equal(ip.backend.list('Item').length,0);assert.equal(ap.folders.size,0);assert.equal(base.get('Actor',a.id),worldActor);assert.equal(worldActor.name,'World collision');
});
test('match-by-key updates only the selected Actor pack and Undo restores that pack',async()=>{
 const {base,ap,scope}=await setup(),r=await importPlans(await plans(scope),scope),a=r.imported.get('PACK-A');
 await base.create('Actor',{_id:a.id,name:'World original',type:'npc',flags:{[ID]:{key:'PACK-A'}}});
 const data=rows();data.Actors[0]['Match Actor Key']='Yes';data.Actors[0]['Apply Advancements']='No';data.Actors[0].Name='Updated template';const p=parseRows(data);await preparePlans(p,await destinationEnvironment(base,scope.destination));assert.equal(p[0].target,a.id);
 const current=await destinationEnvironment(base,scope.destination);await importPlans(p,current);assert.equal(a.name,'Updated template');assert.equal(base.get('Actor',a.id).name,'World original');await undoImport(base);assert.equal(a.name,'Template courier');assert.equal(ap.backend.list('Actor').length,1);
});
test('a locked destination blocks Undo before mutation and the batch can be undone after unlocking',async()=>{
 const {base,ap,scope}=await setup();await importPlans(await plans(scope),scope);const log=clone(await readUndo(base));ap.locked=true;await assert.rejects(undoImport(base),/unlocked/);assert.deepEqual(await readUndo(base),log);assert.equal(ap.backend.list('Actor').length,1);ap.locked=false;await undoImport(base);assert.equal(ap.backend.list('Actor').length,0);
});
test('edited templates retain their sources, folders and GM notes during Undo',async()=>{
 const {base,ap,ip,scope}=await setup(),r=await importPlans(await plans(scope),scope);await r.imported.get('PACK-A').update({name:'Local template edit'});
 const u=await undoImport(base);assert.ok(u.remaining.some(e=>e.kind==='Actor'));assert.equal(ip.backend.list('Item').length,1);assert.equal(ap.folders.size,2);assert.ok(readPrivateDetails(base,actorRecordKey(r.imported.get('PACK-A'))).length);
});
test('world actor references prevent deletion of newly created Item compendium sources',async()=>{
 const {base,ip,scope}=await setup();await importPlans(await plans(scope),scope);const source=ip.backend.list('Item')[0];await base.create('Actor',{name:'Independent actor',type:'npc',items:[{name:'Copy',type:'feat',flags:{core:{sourceId:source.uuid}}}]});
 const u=await undoImport(base);assert.ok(u.remaining.some(e=>e.kind==='Item'));assert.equal(ip.backend.list('Item').length,1);
});
test('another Actor pack referencing a source protects it during Undo',async()=>{
 const {base,ip,scope}=await setup();await importPlans(await plans(scope),scope);const other=base.addPack('world.other'),source=ip.backend.list('Item')[0];await other.create('Actor',{name:'Other template',type:'character',flags:{custom:{source:source.uuid}}});await undoImport(base);assert.equal(ip.backend.list('Item').length,1);
});
test('unavailable reference packs retain sources conservatively while actor Undo completes',async()=>{
 const {base,ap,ip,scope}=await setup();await importPlans(await plans(scope),scope);base.addPack('world.unavailable').unavailable=true;const u=await undoImport(base);assert.equal(ap.backend.list('Actor').length,0);assert.equal(ip.backend.list('Item').length,1);assert.ok(u.lines.some(l=>l.includes('could not be checked')));
});
test('private notes use qualified Actor UUIDs to avoid cross-pack ID collisions',async()=>{
 const {base,ap}=await setup(),other=base.addPack('world.other');const id='Collide000000001',a=await ap.create('Actor',{_id:id,name:'One',type:'character'}),b=await other.create('Actor',{_id:id,name:'Two',type:'character'});
 await saveDetails(base,a,[],[{value:'ONE'}]);await saveDetails(base,b,[],[{value:'TWO'}]);assert.equal(readPrivateDetails(base,actorRecordKey(a))[0].value,'ONE');assert.equal(readPrivateDetails(base,actorRecordKey(b))[0].value,'TWO');
});
test('world relationships and raw live links are rejected for compendium templates before writes',async()=>{
 for(const raw of [{name:'Group',type:'group',system:{members:[{actor:'World00000000001'}]}},{name:'Vehicle',type:'vehicle',system:{crew:{value:['Actor.World00000000001']}}}]){
  const {base,scope}=await setup();const p=parseRows({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'LINKED',Name:raw.name,Type:raw.type,'Raw JSON':JSON.stringify(raw)}]});await preparePlans(p,scope);assert.match(p[0].errors.join(' '),/World actors/);await assert.rejects(importPlans(p,scope),/World actors/);assert.equal(base.calls.length,0);assert.equal(base.list('JournalEntry').length,0);
 }
});
test('reviewed updates catch changes made to a compendium actor before confirmation',async()=>{
 const {scope}=await setup(),r=await importPlans(await plans(scope),scope),a=r.imported.get('PACK-A');const p=await plans(scope);p[0].target=a.id;p[0].reviewExpected=previewUpdate(p[0],scope).expected;await a.update({name:'Concurrent edit'});await assert.rejects(importPlans(p,scope),/changed after review/);
});
test('self-references to embedded items use the new compendium Actor UUID',async()=>{
 const {scope}=await setup(),p=await plans(scope);p[0].data.items[0]._id='OriginItem000001';p[0].data.flags.custom={link:'Actor.Old000000000001.Item.OriginItem000001.Activity.TestGrantAdv0001'};
 const r=await importPlans(p,scope),a=r.imported.get('PACK-A');assert.equal(a.flags.custom.link,`${a.uuid}.Item.OriginItem000001.Activity.TestGrantAdv0001`);
});
test('World actors can use Item compendium Catalog sources and Undo still clears unreferenced sources',async()=>{
 const {base,ip}=await setup(),scope=await destinationEnvironment(base,{itemPack:ip.collection}),p=parseRows(rows());p[0].advance=false;await preparePlans(p,scope);const r=await importPlans(p,scope);assert.equal(r.imported.size,1);assert.equal(base.list('Actor').length,1);assert.equal(ip.backend.list('Item').length,1);await undoImport(base);assert.equal(base.list('Actor').length,0);assert.equal(ip.backend.list('Item').length,0);
});
