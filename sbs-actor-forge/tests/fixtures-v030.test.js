import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {parseRows,workbookRows,ID} from '../scripts/core.js';import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';import {world} from './mock-world.js';import {parseSourceBundle,catalogRows} from '../scripts/sources.js';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),ctx);const X=ctx.XLSX;
const load=name=>parseRows(workbookRows(X,X.read(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_'+name+'_v0.3.0.xlsx',import.meta.url)),{type:'buffer'})));
test('v0.3 Main has distinct test keys, long notes, correct metadata and five native folder destinations',async()=>{
 const rawRows=workbookRows(X,X.read(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.3.0.xlsx',import.meta.url)),{type:'buffer'}));assert.equal(rawRows.Meta[0]['Module Version'],'0.3.0');
 const plans=load('Main_Test'),env=world();await preparePlans(plans,env);assert.ok(plans.every(p=>!p.errors.length && p.key.startsWith('TEST030-')));
 const result=await importPlans(plans,env);assert.equal(result.imported.size,5);assert.equal(env.list('Folder').length,5);
 const mage=result.imported.get('TEST030-MAGE');assert.ok(mage.flags[ID].details.some(d=>d.label==='End of scroll test'));assert.ok(mage.flags[ID].details.some(d=>d.value.length>3000));
 assert.ok(!JSON.stringify(mage.toObject()).includes('END OF PRIVATE SCROLL TEST'));
 await undoImport(env);assert.equal(env.list('Actor').length,0);assert.equal(env.list('Folder').length,0);
});
test('v0.3 Update resolves test keys and applies an individual chosen conflict with exact undo',async()=>{
 const env=world(),plans=load('Main_Test');await preparePlans(plans,env);const first=await importPlans(plans,env),mage=first.imported.get('TEST030-MAGE');
 await mage.update({name:'Local name','system.attributes.hp.value':7});const before=mage.toObject();const update=load('Update_Test');await preparePlans(update,env);assert.ok(update.every(p=>!p.errors.length));
 update.find(p=>p.key==='TEST030-MAGE').conflictChoices={'field:name':'incoming'};await importPlans(update,env);
 assert.equal(mage.name,'TEST 030 — Ivo Kindlewick');assert.equal(mage.system.attributes.hp.value,7);assert.equal(mage.system.abilities.int.value,17);
 await undoImport(env);assert.deepEqual(mage.toObject(),before);
});
test('source workbook resolves seven native items and Catalog-backed level-3 subclass grants',async()=>{
 const bundle=JSON.parse(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_5etools_Test_v0.3.0.json',import.meta.url))),sources=parseSourceBundle(bundle);
 assert.deepEqual(sources.warnings,[]);const npc=sources.records.find(r=>r.name==='Northern Parcel Scout');assert.equal(npc.data.system.attributes.hp.value,22);assert.equal(npc.data.system.attributes.ac.flat,13);
 const plans=load('Source_Test'),env=world();plans[0].catalog=catalogRows(sources.records);await preparePlans(plans,env,sources.records);assert.deepEqual(plans[0].errors,[]);assert.deepEqual(plans[0].warnings,['Kiln Sealsmith: Verify subclass level and class association','Parcel Sling: Choose the ammunition source in the native weapon activity']);
 const result=await importPlans(plans,env),actor=result.imported.get('TEST030-SOURCE-PC');assert.equal(actor.items.size,7);
 const subclass=actor.items.find(i=>i.type==='subclass'),grant=subclass.system.advancement.find(a=>a.level===3);assert.ok(grant.configuration.items[0].uuid.startsWith('Item.'));
 assert.ok(actor.items.find(i=>i.name==='Dispatch Pike').system.activities.sbsSourceAct0001.damage.includeBase);assert.equal(actor.items.find(i=>i.type==='class').system.levels,3);
 await undoImport(env);assert.equal(env.list('Actor').length,0);assert.equal(env.list('Item').length,0);assert.equal(env.list('Folder').length,0);
});
