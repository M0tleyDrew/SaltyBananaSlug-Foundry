import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {ID,parseRows,workbookRows,clone} from '../scripts/core.js';
import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';
import {destinationEnvironment} from '../scripts/destinations.js';
import {saveSourceLibrary,readPreferences,loadSourceLibraries} from '../scripts/preferences.js';
import {readPrivateDetails,actorRecordKey} from '../scripts/privacy.js';
import {catalogRows} from '../scripts/sources.js';
import {world} from './mock-world.js';import {packedWorld} from './mock-packs.js';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),ctx);const X=ctx.XLSX;
const rows=name=>workbookRows(X,X.read(fs.readFileSync(new URL(`../workbooks/SaltyBananaSlug_Actor_Forge_${name}_v1.0.0.xlsx`,import.meta.url)),{type:'buffer'}));
const bundle=JSON.parse(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_5etools_Test_v1.0.0.json',import.meta.url)));
test('v1.0.0 fixture versions, stable keys, artwork and manual checks are correct',()=>{
 for(const name of ['Main_Test','Update_Test','Source_Test','Blank']){const r=rows(name);assert.equal(r.Meta[0]['Module Version'],'1.0.0');for(const a of r.Actors ?? [])assert.match(a['Actor Key'],/^TEST050-/);}
 const r=rows('Main_Test');assert.equal(r['Test Plan'].length,22);assert.ok(r['Test Plan'].every(c=>!c.Result && !c.Notes));assert.equal(r.Artwork.length,24);assert.equal(new Set(r.Actors.map(a=>a['Image Path'])).size,3);assert.equal(r.Catalog.length,20);
});
test('v1.0.0 self-contained Main imports all actors through strict validation and immediately undoes',async()=>{
 const env=world(),p=parseRows(rows('Main_Test'));await preparePlans(p,env);assert.ok(p.every(p=>!p.errors.length),JSON.stringify(p.map(p=>p.errors)));const r=await importPlans(p,env);assert.equal(r.imported.size,3);
 const pip=r.imported.get('TEST050-COURIER');assert.ok(pip.system.details.race && pip.system.details.background && pip.system.details.originalClass);assert.match(readPrivateDetails(env,pip.id)[0].value,/SECRET_SBS050_GM/);assert.ok(!JSON.stringify(pip.toObject()).includes('SECRET_SBS050_GM'));
 await undoImport(env);for(const kind of ['Actor','Item','Folder'])assert.equal(env.list(kind).length,0);
});
test('v1.0.0 actual Main builds packed templates with compendium Catalog refs and exact Undo',async()=>{
 const base=packedWorld(),ap=base.addPack('world.actors'),ip=base.addPack('world.grants','Item'),scope=await destinationEnvironment(base,{actorPack:ap.collection,itemPack:ip.collection}),p=parseRows(rows('Main_Test'));await preparePlans(p,scope);assert.ok(p.every(p=>!p.errors.length),JSON.stringify(p.map(p=>p.errors)));assert.ok(p.every(p=>!p.advance));
 const r=await importPlans(p,scope);assert.equal(r.imported.size,3);const pip=r.imported.get('TEST050-COURIER');const wand=pip.items.find(i=>i.name==='Dispatch Wand');const spellUUID=Object.values(wand.system.activities)[0].spell.uuid;assert.match(spellUUID,/^Compendium\.world\.grants\.Item\./);assert.equal((await base.fromUuid(spellUUID)).name,'Dispatch Burst');assert.match(readPrivateDetails(base,actorRecordKey(pip))[0].value,/SECRET_SBS050_GM/);
 await undoImport(base);assert.equal(ap.backend.list('Actor').length,0);assert.equal(ip.backend.list('Item').length,0);assert.equal(ap.folders.size,0);
});
test('v1.0.0 actual packed Update preserves edited HP, charge pool and public notes and restores on Undo',async()=>{
 const base=packedWorld(),ap=base.addPack('world.actors'),ip=base.addPack('world.grants','Item'),dest={actorPack:ap.collection,itemPack:ip.collection},scope=await destinationEnvironment(base,dest),main=parseRows(rows('Main_Test'));await preparePlans(main,scope);const r=await importPlans(main,scope),pip=r.imported.get('TEST050-COURIER');
 const wand=pip.items.find(i=>i.name==='Dispatch Wand');await pip.update({'system.attributes.hp.value':7});await pip.updateEmbeddedDocuments('Item',[{_id:wand.id,'system.uses.spent':4,'system.attuned':true}]);const details=clone(pip.flags[ID].details);details[0].value='Local workbook test note';await pip.update({[`flags.${ID}.details`]:details});const before=pip.toObject();
 const current=await destinationEnvironment(base,dest),update=parseRows(rows('Update_Test'));await preparePlans(update,current);assert.deepEqual(update[0].errors,[]);assert.equal(update[0].target,pip.id);const result=await importPlans(update,current);assert.equal(result.imported.size,1);assert.equal(pip.system.abilities.int.value,17);assert.equal(pip.system.attributes.hp.value,7);assert.equal(pip.items.find(i=>i.name==='Dispatch Wand').system.uses.spent,4);assert.equal(pip.flags[ID].details[0].value,'Local workbook test note');await undoImport(base);assert.deepEqual(pip.toObject(),before);
});
test('v1.0.0 Source workbook resolves through a saved library after clearing session data',async()=>{
 const env=world(),library=await saveSourceLibrary(env,'SBS 050 Library',new Map([['sbs.json',bundle]]));const loaded=loadSourceLibraries(readPreferences({...env},'libraries'),[library.id]);assert.equal(loaded.records.length,20);const p=parseRows(rows('Source_Test'));for(const plan of p)plan.catalog=catalogRows(loaded.records);await preparePlans(p,env,loaded.records);assert.deepEqual(p[0].errors,[]);const r=await importPlans(p,env);assert.equal(r.imported.size,1);assert.equal(r.imported.get('TEST050-SOURCE').items.size,11);assert.equal(r.imported.get('TEST050-SOURCE').items.find(i=>i.name==='Dispatch Wand').toObject().img,'modules/sbs-actor-forge/assets/art/dispatch-wand.webp');
});
