import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseRows,ID,exportRows} from '../scripts/core.js';
import {preparePlans,previewUpdate,importPlans,undoImport} from '../scripts/engine.js';
import {folderSegments,folderLabel,findActorFolder,planFolders} from '../scripts/folders.js';
import {world} from './mock-world.js';
const rows=()=>({Meta:[{'Schema Version':2}],Actors:[{Name:'Folder one',Type:'npc','Actor Key':'one',Folder:'SBS Test / Couriers'},{Name:'Folder two',Type:'npc','Actor Key':'two',Folder:'SBS Test / Couriers'}]});
test('new nested folders are shared by the batch and undo removes only its empty created folders',async()=>{
  const env=world(),plans=parseRows(rows());await preparePlans(plans,env);const before=previewUpdate(plans[0],env);assert.ok(before.changes.some(c=>c.path==='Folder' && c.after.includes('Couriers')));assert.equal(env.list('Folder').length,0);
  const result=await importPlans(plans,env);assert.equal(env.list('Folder').length,2);
  const destination=result.imported.get('one').folder;assert.equal(result.imported.get('two').folder,destination);
  assert.equal(folderLabel(env.get('Folder',destination),env.list('Folder')),'SBS Test / Couriers');
  await undoImport(env);assert.equal(env.list('Folder').length,0);assert.equal(env.list('Actor').length,0);
});
test('existing folders are reused and never deleted by batch undo',async()=>{
  const env=world(),root=await env.create('Folder',{name:'SBS Test',type:'Actor',folder:null}),child=await env.create('Folder',{name:'Couriers',type:'Actor',folder:root.id});
  assert.equal(findActorFolder('SBS Test / Couriers',env).id,child.id);
  const plans=parseRows(rows());await preparePlans(plans,env);await importPlans(plans,env);await undoImport(env);assert.equal(env.list('Folder').length,2);
});
test('retained edited actors and unrelated contents protect their containing folders from undo',async()=>{
  const env=world(),plans=parseRows(rows());await preparePlans(plans,env);const result=await importPlans(plans,env);const actor=result.imported.get('one');await actor.update({name:'Keep me'});
  await undoImport(env);assert.ok(env.get('Actor',actor.id));assert.equal(env.list('Folder').length,2);
});
test('invalid paths, depth overflow and same-parent ambiguity fail before world writes',async()=>{
  for(const path of ['SBS // Couriers','SBS/../Couriers','SBS/','a/b/c/d/e'])assert.throws(()=>folderSegments(path));
  const env=world();await env.create('Folder',{name:'Same',type:'Actor'});await env.create('Folder',{name:'Same',type:'Actor'});
  const plans=parseRows({Meta:[{'Schema Version':2}],Actors:[{Name:'No write',Type:'npc','Actor Key':'bad',Folder:'Same'}]});await preparePlans(plans,env);
  await assert.rejects(importPlans(plans,env),/Ambiguous/);assert.equal(env.list('Actor').length,0);
});
test('category exclusions prevent update folder creation and move',async()=>{
  const env=world(),actor=await env.create('Actor',{name:'Existing',type:'npc',folder:null,items:[]}),plans=parseRows(rows());plans.splice(1);await preparePlans(plans,env);
  plans[0].target=actor.id;plans[0].categories=['items'];await importPlans(plans,env);assert.equal(env.list('Folder').length,0);assert.equal(actor.folder,null);
});
test('export preserves native nested folder paths',()=>{
  const root={id:'root',name:'SBS Test',folder:null},child={id:'child',name:'Couriers',folder:root};
  const actor={folder:child,toObject:()=>({_id:'actor',name:'Export',type:'npc',items:[],system:{},flags:{[ID]:{key:'one'}}})};
  assert.equal(exportRows([actor]).Actors[0].Folder,'SBS Test / Couriers');
});
test('a local folder move can be kept or deliberately overridden by a new path',async()=>{
 const env=world(),plans=parseRows(rows());plans.splice(1);await preparePlans(plans,env);const first=await importPlans(plans,env),actor=first.imported.get('one');
 const local=await env.create('Folder',{name:'Player chosen folder',type:'Actor',folder:null});await actor.update({folder:local.id});
 plans[0].target=actor.id;plans[0].folder='SBS Test / New destination';
 let review=previewUpdate(plans[0],env);assert.equal(review.decisions.find(c=>c.key==='field:folder').resolution,'keep');
 await importPlans(plans,env);assert.equal(actor.folder,local.id);assert.ok(!env.list('Folder').some(f=>f.name==='New destination'));
 plans[0].conflictChoices={'field:folder':'incoming'};review=previewUpdate(plans[0],env);assert.equal(review.decisions.find(c=>c.key==='field:folder').resolution,'incoming');
 await importPlans(plans,env);assert.equal(env.get('Folder',actor.folder).name,'New destination');await undoImport(env);assert.equal(actor.folder,local.id);
});
