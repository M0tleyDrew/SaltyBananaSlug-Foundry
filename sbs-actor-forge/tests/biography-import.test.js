import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRows,exportRows} from '../scripts/core.js';
import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';
import {world} from './mock-world.js';

const lore='<h3>Appearance and Behavior</h3><p>A root-covered field hand.</p>';
const rows=()=>({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'bio-npc',Name:'Biography NPC',Type:'npc',Biography:lore}]});

test('NPC biography survives parse, import, export and Undo',async()=>{
  const env=world(),plans=parseRows(rows());await preparePlans(plans,env);
  const result=await importPlans(plans,env),actor=result.imported.get('bio-npc');
  assert.equal(actor.system.details.biography.value,lore);
  assert.equal(actor.system.details.biography.public,undefined);
  assert.equal(parseRows(exportRows([actor]))[0].data.system.details.biography.value,lore);
  await undoImport(env);assert.equal(env.list('Actor').length,0);
});

test('a native creation hook dropping biography is repaired with an explicit document update',async()=>{
  const env=world(),create=env.create;
  env.create=async(kind,data)=>{
    const actor=await create(kind,data);
    if(kind==='Actor')delete actor.raw.system.details.biography;
    return actor;
  };
  const plans=parseRows(rows());await preparePlans(plans,env);
  const result=await importPlans(plans,env);
  assert.equal(result.imported.get('bio-npc').system.details.biography.value,lore);
  await undoImport(env);assert.equal(env.list('Actor').length,0);
});

test('persistent rejection of biography is reported as FAILED and remains undoable',async()=>{
  const env=world(),create=env.create;
  env.create=async(kind,data)=>{
    const actor=await create(kind,data);
    if(kind==='Actor'){delete actor.raw.system.details.biography;actor.update=async()=>actor;}
    return actor;
  };
  const plans=parseRows(rows());await preparePlans(plans,env);
  const result=await importPlans(plans,env);
  assert.equal(result.imported.size,0);
  assert.ok(result.lines.some(line=>line.includes('FAILED:') && line.includes('Biography import failed')));
  await undoImport(env);assert.equal(env.list('Actor').length,0);
});
