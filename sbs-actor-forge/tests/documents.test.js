import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItemDocument} from '../scripts/documents.js';
import {parseSourceBundle} from '../scripts/sources.js';
import {parseRows,ID} from '../scripts/core.js';
import {preparePlans,importPlans} from '../scripts/engine.js';
import {world} from './mock-world.js';
const legacy='sbsSourceAct00001',fixed='sbsSourceAct0001';
const spell=id=>({name:'ID regression spell',type:'spell',system:{activities:{[id]:{_id:id,type:'attack'}}}});
const plan=item=>parseRows({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'ID-REGRESSION',Name:'ID regression actor',Type:'character','Raw JSON':JSON.stringify({items:[item]})}]})[0];

test('the strict independent native fixture reproduces the screenshot failure',()=>{
 const env=world();assert.equal(legacy.length,17);assert.throws(()=>env.validateItem(spell(legacy)),/16 alphanumeric/);assert.throws(()=>env.validateActor({name:'Broken',type:'character',items:[spell(legacy)]}),/16 alphanumeric/);
});
test('source attack, save, heal, utility and equipment activities use legal native IDs',()=>{
 const {records}=parseSourceBundle({spell:[{name:'Attack',spellAttack:['R'],entries:['{@damage 1d6}']},{name:'Save',savingThrow:['dexterity'],entries:['{@damage 1d6}']},{name:'Heal',entries:['Regain {@dice 1d4} hit points.']},{name:'Utility',entries:['A decorative light.']}],item:[{name:'Blade',type:'M',dmg1:'1d6'},{name:'Potion',type:'P',entries:['Regain {@dice 1d4} hit points.']}]});
 const env=world();assert.equal(records.length,6);for(const record of records){env.validateItem(record.data);for(const [key,a]of Object.entries(record.data.system.activities ?? {})){assert.match(key,/^[A-Za-z0-9]{16}$/);assert.equal(a._id,key);}}
});
test('legacy map IDs and intra-item references repair together without replacing descriptive text',()=>{
 const item=spell(legacy);item.system.activities.ForwardTest00001={_id:'ForwardTest00001',type:'forward',activity:{id:legacy}};
 item.flags={link:'Item.SourceItem000001.Activity.'+legacy};item.system.description={value:'Keep the text '+legacy+' in this sentence.'};const warnings=[];
 assert.equal(normalizeItemDocument(item,warnings),true);assert.equal(item.system.activities[legacy],undefined);assert.equal(item.system.activities[fixed]._id,fixed);assert.equal(item.system.activities.ForwardTest00001.activity.id,fixed);assert.equal(item.flags.link,'Item.SourceItem000001.Activity.'+fixed);assert.ok(item.system.description.value.includes(legacy));assert.equal(warnings.length,1);assert.equal(normalizeItemDocument(item,warnings),false);assert.equal(warnings.length,1);
});
test('legacy repair refuses collisions and unrelated invalid or mismatched IDs',()=>{
 const collision=spell(legacy);collision.system.activities[fixed]={_id:fixed,type:'utility'};assert.throws(()=>normalizeItemDocument(collision),/collide/);assert.ok(collision.system.activities[legacy]);assert.throws(()=>normalizeItemDocument(spell('UnrelatedBadID')),/exactly 16/);const mismatch=spell(fixed);mismatch.system.activities[fixed]._id='OtherActivity001';assert.throws(()=>normalizeItemDocument(mismatch),/must match/);
});
test('legacy embedded spell imports through the strict fixture after repair',async()=>{
 const env=world(),p=plan(spell(legacy));await preparePlans([p],env);assert.deepEqual(p.errors,[]);assert.ok(p.warnings.some(w=>w.includes('repaired')));const result=await importPlans([p],env);assert.equal(result.imported.size,1);assert.equal(result.imported.get(p.key).items.values().next().value.system.activities[fixed]._id,fixed);
});
test('legacy Catalog spell is repaired before native source creation',async()=>{
 const env=world(),p=plan({name:'Origin',type:'race',system:{advancement:[{_id:'GrantFeature0001',type:'ItemGrant',configuration:{items:[{uuid:'@forge:spell'}]}}]}});p.catalog=[{'Source Key':'spell','Raw JSON':JSON.stringify(spell(legacy))}];await preparePlans([p],env);assert.deepEqual(p.errors,[]);const result=await importPlans([p],env);assert.equal(result.imported.size,1);assert.equal(env.list('Item')[0].system.activities[fixed]._id,fixed);assert.equal(p.data.items[0].system.advancement[0].configuration.items[0].uuid,'@forge:spell');
});
test('invalid embedded activities fail before any document or Undo writes',async()=>{
 const env=world(),p=plan(spell('UnexpectedBadID'));const before=structuredClone(env.settings.undo);await preparePlans([p],env);assert.ok(p.errors.some(e=>e.includes('exactly 16')));await assert.rejects(()=>importPlans([p],env),/validation errors/);for(const kind of Object.keys(env.db))assert.equal(env.list(kind).length,0);assert.deepEqual(env.settings.undo,before);
});
test('invalid Catalog activities fail before any document or Undo writes',async()=>{
 const env=world(),p=plan({name:'Origin',type:'race',system:{advancement:[{_id:'GrantFeature0001',type:'ItemGrant',configuration:{items:[{uuid:'@forge:spell'}]}}]}});p.catalog=[{'Source Key':'spell','Raw JSON':JSON.stringify(spell('UnexpectedBadID'))}];await preparePlans([p],env);const before=structuredClone(env.settings.undo);await assert.rejects(()=>importPlans([p],env),/exactly 16/);for(const kind of Object.keys(env.db))assert.equal(env.list(kind).length,0);assert.deepEqual(env.settings.undo,before);
});
test('provided source artwork survives conversion on origins and their generated features',()=>{
 const root='modules/'+ID+'/assets/art/';const records=parseSourceBundle({race:[{name:'Art Slug',img:root+'species.webp',entries:[{name:'Bright Trail',img:root+'trail.webp',entries:['A glowing trail.']}]}]}).records;assert.equal(records[0].data.img,root+'species.webp');assert.equal(records[1].data.img,root+'trail.webp');
});
