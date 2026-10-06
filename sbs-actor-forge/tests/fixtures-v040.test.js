import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseRows,workbookRows,ID,exportRows} from '../scripts/core.js';
import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';
import {world} from './mock-world.js';
import {parseSourceBundle,catalogRows} from '../scripts/sources.js';
import {mechanicsProbeRecords} from '../scripts/selftest.js';
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);const X=context.XLSX;
const rows=name=>workbookRows(X,X.read(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_'+name+'_v0.4.0.xlsx',import.meta.url)),{type:'buffer'}));
const load=name=>parseRows(rows(name));

test('v0.4 self-contained Main creates three complete origins and each cantrip tier with portable sources',async()=>{
 const raw=rows('Main_Test');assert.equal(raw.Meta[0]['Module Version'],'0.4.0');assert.equal(raw['Test Plan'].length,22);
 const plans=load('Main_Test'),env=world();await preparePlans(plans,env);assert.ok(plans.every(p=>p.errors.length===0 && p.key.startsWith('TEST040-')),JSON.stringify(plans.map(p=>p.errors)));
 const result=await importPlans(plans,env);assert.equal(result.imported.size,3);
 const pip=result.imported.get('TEST040-COURIER');assert.equal(pip.items.size,11);const tiers=[5,11,17];
 for(const [index,actor] of [...result.imported.values()].entries()) {
  assert.equal(actor.items.find(i=>i.type==='class').system.levels,tiers[index]);assert.ok(actor.system.details.race && actor.system.details.background);const a=Object.values(actor.items.find(i=>i.name==='Courier Spark').system.activities)[0];assert.equal(a.damage.parts[0].scaling.mode,'whole');
 }
 const wand=pip.items.find(i=>i.name==='Dispatch Wand');assert.equal(wand.system.attuned,false);assert.equal(wand.system.uses.max,'6');const cast=Object.values(wand.system.activities)[0];assert.equal(cast.type,'cast');assert.equal(env.get('Item',cast.spell.uuid.split('.')[1]).name,'Dispatch Burst');assert.equal(cast.consumption.targets[0].value,'2');
 assert.equal(pip.items.find(i=>i.name==='Courier Broth').system.quantity,2);assert.ok(pip.items.find(i=>i.name==='Sorting Coat').system.equipped);assert.ok(!JSON.stringify(pip.toObject()).includes('Fictional GM-only depot'));
 await undoImport(env);assert.equal(env.list('Actor').length,0);assert.equal(env.list('Item').length,0);assert.equal(env.list('Folder').length,0);
});
test('v0.4 merge preserves spent charges, attunement, notes and configured choices; Undo restores the exact pre-update state',async()=>{
 const plans=load('Main_Test'),env=world();await preparePlans(plans,env);const first=await importPlans(plans,env),actor=first.imported.get('TEST040-COURIER');
 const wand=actor.items.find(i=>i.name==='Dispatch Wand'),spark=actor.items.find(i=>i.name==='Courier Spark'),background=actor.items.find(i=>i.type==='background');
 const configured=structuredClone(background.system.advancement);for(const a of configured)a.value=a.type==='Trait'?{chosen:a.configuration.grants}:{added:{'selected-spell':'Item.source'}};
 await actor.updateEmbeddedDocuments('Item',[{_id:wand.id,'system.uses.spent':4,'system.attuned':true},{_id:spark.id,'system.prepared':0},{_id:background.id,'system.advancement':configured}]);
 await actor.update({'system.attributes.hp.value':7,[`flags.${ID}.details`]:[{section:'Local',label:'Keep me',value:'Local public note'}]});
 const before=actor.toObject(),update=load('Update_Test');await preparePlans(update,env);assert.deepEqual(update[0].errors,[]);assert.equal(update[0].target,actor.id);assert.equal(update[0].advance,false);
 await importPlans(update,env);assert.equal(actor.system.abilities.int.value,17);assert.equal(actor.system.attributes.hp.value,7);assert.equal(actor.items.get(wand.id).system.uses.spent,4);assert.equal(actor.items.get(wand.id).system.attuned,true);assert.equal(actor.items.get(spark.id).system.prepared,0);assert.deepEqual(actor.items.get(background.id).system.advancement.map(a=>a.value),configured.map(a=>a.value));assert.equal(actor.flags[ID].details[0].value,'Local public note');
 await undoImport(env);assert.deepEqual(actor.toObject(),before);
});
test('source workbook converter matches Main item mechanics and resolves all native origin grants',async()=>{
 const bundle=JSON.parse(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_5etools_Test_v0.4.0.json',import.meta.url))),source=parseSourceBundle(bundle),plans=load('Source_Test'),main=load('Main_Test'),env=world();
 assert.deepEqual(source.warnings,[]);plans[0].catalog=catalogRows(source.records);await preparePlans(plans,env,source.records);await preparePlans(main,env);assert.deepEqual(plans[0].errors,[]);assert.deepEqual(plans[0].warnings,[]);assert.equal(plans[0].data.items.length,11);
 for(const item of plans[0].data.items){const native=main[0].data.items.find(i=>i.name===item.name);assert.deepEqual(item.system,native.system,item.name);}
 const first=await importPlans(plans,env),actor=first.imported.get('TEST040-SOURCE');for(const origin of actor.items.filter(i=>['class','race','background'].includes(i.type)))for(const adv of origin.system.advancement) {
  assert.match(adv._id,/^[A-Za-z0-9]{16}$/);for(const ref of [...(adv.configuration.items ?? []),...(adv.configuration.pool ?? [])])assert.ok(env.get('Item',ref.uuid.split('.')[1]),ref.uuid);
 }
 await undoImport(env);assert.equal(env.list('Actor').length,0);assert.equal(env.list('Item').length,0);
});
test('export retains new native mechanics and excludes protected GM notes',async()=>{
 const env=world(),plans=load('Main_Test');await preparePlans(plans,env);const first=await importPlans(plans,env),actor=first.imported.get('TEST040-COURIER');
 const exported=exportRows([actor]),roundtrip=parseRows(exported);assert.deepEqual(roundtrip[0].errors,[]);assert.equal(roundtrip[0].gmDetails.length,0);assert.ok(!JSON.stringify(exported).includes('Fictional GM-only depot'));
 for(const name of ['Courier Spark','Patchwork Mend','Sorting Coat','Courier Broth','Dispatch Wand'])assert.deepEqual(roundtrip[0].data.items.find(i=>i.name===name).system,actor.items.find(i=>i.name===name).system,name);
});
test('installed-system compatibility probe covers all new models and spell-choice configurations',()=>{
 const records=mechanicsProbeRecords();assert.ok(records.some(r=>r.data.type==='spell'));assert.ok(records.some(r=>r.data.type==='equipment'));assert.ok(records.some(r=>r.data.type==='consumable' && r.data.system.uses.autoDestroy));assert.ok(records.some(r=>r.kind==='class' && r.data.system.advancement.some(a=>a.classRestriction==='secondary')));assert.ok(records.some(r=>r.kind==='background' && r.data.system.advancement.some(a=>a.type==='ItemChoice' && a.configuration.spell)));
 assert.ok(records.every(r=>r.warnings.length===0),JSON.stringify(records.map(r=>({name:r.name,warnings:r.warnings}))));
});
