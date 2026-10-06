import {ID,clone,esc,equal} from './core.js';

export function encodeRecord(value) { return `<pre data-sbs-record="1">${esc(JSON.stringify(value))}</pre>`; }
export function decodeRecord(text) {
  const s=String(text ?? '').replace(/^<pre[^>]*>/,'').replace(/<\/pre>$/,'').replace(/&(amp|lt|gt|quot|#39);/g,(_m,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
  return JSON.parse(s || '{}');
}
export function privateJournalData(name,record,flags={}) {
  return {name,ownership:{default:0},flags:{[ID]:flags},pages:[{name:'Actor Forge Records',type:'text',ownership:{default:-1},text:{format:1,content:encodeRecord(record)}}]};
}
export function journalRecord(journal) { return journal ? decodeRecord([...journal.pages][0]?.text?.content) : {}; }
export async function setJournalRecord(journal,record) {
  const page=[...journal.pages][0]; if (!page) throw Error('Actor Forge private journal is missing its page');
  await page.update({'text.content':encodeRecord(record)});
}
export function notesJournal(env,actorId) { return env.list('JournalEntry').find(j=>j.flags?.[ID]?.notesForActor===actorId); }
export const actorRecordKey=actor=>actor.pack || actor.inCompendium ? actor.uuid : actor.id;
export function readPrivateDetails(env,actorId) { return env.isGM ? clone(journalRecord(notesJournal(env,actorId)).details ?? []) : []; }
export async function saveDetails(env,actor,publicDetails,privateDetails) {
  if(actor.compendium?.locked)throw Error('Unlock this compendium before editing its SBS Details');
  if (!env.isGM && !actor.testUserPermission(env.user,'OWNER')) throw Error('Only an actor owner can edit public SBS Details');
  if (env.isGM && privateDetails!==undefined) {
    let j=notesJournal(env,actorRecordKey(actor));
    if (j) { const value=journalRecord(j); await setJournalRecord(j,{...value,details:clone(privateDetails)}); }
    else if (privateDetails.length) j=await env.create('JournalEntry',privateJournalData(`SBS Notes · ${actor.name}`,{details:clone(privateDetails),baseline:[]},{notesForActor:actorRecordKey(actor)}));
    if (j) await actor.update({[`flags.${ID}.privatePage`]:{journalId:j.id,pageId:[...j.pages][0].id}});
  }
  await actor.update({[`flags.${ID}.details`]:clone(publicDetails)});
}
export async function importPrivateDetails(env,actor,details,mode,track) {
  if (!env.isGM) throw Error('GM required for importing private notes');
  let j=notesJournal(env,actorRecordKey(actor)); const previous=journalRecord(j);
  if (mode==='merge' && previous.baseline && !equal(previous.details ?? [],previous.baseline) && !equal(previous.details ?? [],details)) return ['GM Details: kept local edits'];
  if (!j && !details.length) return [];
  if (!j) {
    const id=env.randomID(), entry=await track('JournalEntry',id,null,{notesForActor:actor.id});
    j=await env.create('JournalEntry',{...privateJournalData(`SBS Notes · ${actor.name}`,{details:clone(details),baseline:clone(details)},{notesForActor:actorRecordKey(actor)}),_id:id});
    await entry.finish(j);
  } else {
    const entry=await track('JournalEntry',j.id,j.toObject(),{notesForActor:actor.id});
    await setJournalRecord(j,{details:clone(details),baseline:clone(details)}); await entry.finish(j);
  }
  await actor.update({[`flags.${ID}.privatePage`]:{journalId:j.id,pageId:[...j.pages][0].id}});
  return [];
}
export async function undoStore(env,create=false) {
  const ptr=env.getSetting('undo'), found=ptr?.journalId && env.get('JournalEntry',ptr.journalId);
  if (found?.flags?.[ID]?.undoStore) return found;
  const old=env.list('JournalEntry').find(j=>j.flags?.[ID]?.undoStore);
  if (old || !create) return old;
  return env.create('JournalEntry',privateJournalData('Actor Forge · Undo',{entries:[]},{undoStore:true}));
}
export async function readUndo(env) {
  if (!env.isGM) throw Error('GM required');
  const j=await undoStore(env); return j ? journalRecord(j) : env.getSetting('undo');
}
export async function writeUndo(env,log) {
  const j=await undoStore(env,true); await setJournalRecord(j,log);
  // The world setting contains no character snapshots or private notes.
  await env.setSetting('undo',{journalId:j.id,at:log.at,count:log.entries.length});
}
