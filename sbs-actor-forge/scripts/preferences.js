import {ID,clone,stable} from './core.js';
import {MODES,CATEGORIES} from './updates.js';
import {normalizeOwnership} from './permissions.js';
import {folderSegments} from './folders.js';
import {destinationOf} from './destinations.js';
import {privateJournalData,journalRecord,setJournalRecord} from './privacy.js';
import {parseSourceBundle,sourceIdentity} from './sources.js';

export const SOURCE_KINDS=['monster','spell','race','background','class','subclass','classFeature','subclassFeature','feat','item','baseitem'];
const flagFor=kind=>kind==='presets'?'presetStore':kind==='libraries'?'sourceLibraryStore':null;
export function readPreferences(env,kind) {
  if(!env.isGM)throw Error('GM required');
  const flag=flagFor(kind);if(!flag)throw Error('Unknown preference store');
  const journal=env.list('JournalEntry').find(j=>j.flags?.[ID]?.[flag]);
  const data=journal ? journalRecord(journal) : {version:1,revision:0,entries:[]};
  if(data.version!==1 || !Array.isArray(data.entries))throw Error('Unsupported Actor Forge saved settings. Keep the journal and use a compatible module version.');
  return {...clone(data),journalId:journal?.id};
}
export async function writePreferences(env,kind,entries,expectedRevision) {
  const current=readPreferences(env,kind);
  if(current.revision!==expectedRevision)throw Error('These saved settings changed in another window. Reopen this list before saving.');
  const data={version:1,revision:current.revision+1,entries:clone(entries)};
  if(current.journalId)await setJournalRecord(env.get('JournalEntry',current.journalId),data);
  else await env.create('JournalEntry',privateJournalData(kind==='presets'?'Actor Forge · Presets':'Actor Forge · Source Libraries',data,{[flagFor(kind)]:true}));
  return data;
}
function nameOf(name){const n=String(name ?? '').trim();if(!n || n.length>100)throw Error('Use a name between 1 and 100 characters');return n;}
export function presetSettings(value={}) {
  if(!Object.hasOwn(MODES,value.mode ?? 'merge'))throw Error('Unknown preset update mode');
  const categories=value.categories ?? CATEGORIES;
  if(!Array.isArray(categories) || categories.some(c=>!CATEGORIES.includes(c)))throw Error('Unknown preset content category');
  const folderPath=String(value.folderPath ?? '').trim();if(folderPath)folderSegments(folderPath,20);
  return {mode:value.mode ?? 'merge',categories:[...new Set(categories)],advance:!!value.advance,folderPath,
    ownership:normalizeOwnership(value.ownership ?? {}),destination:destinationOf(value.destination),
    libraryIds:[...new Set((value.libraryIds ?? []).map(String))]};
}
export async function savePreset(env,name,settings,{id,revision}={}) {
  const store=readPreferences(env,'presets'),n=nameOf(name);
  if(revision!==undefined && revision!==store.revision)throw Error('Preset list changed. Reopen it before saving.');
  if(store.entries.some(p=>p.name.toLowerCase()===n.toLowerCase() && p.id!==id))throw Error('A preset with this name already exists. Use another name or edit the existing preset.');
  if(id && !store.entries.some(p=>p.id===id))throw Error('This preset was deleted. Reopen the list.');
  const entry={id:id || env.randomID(),name:n,settings:presetSettings(settings),updatedAt:new Date().toISOString()};
  await writePreferences(env,'presets',[...store.entries.filter(p=>p.id!==entry.id),entry],store.revision);return entry;
}
export function applyPreset(plans,preset,users=[]) {
  const s=presetSettings(preset.settings),known=new Set([...users].map(u=>u.id));
  const ownership=Object.fromEntries(Object.entries(s.ownership).filter(([id])=>id==='default' || known.has(id)));
  const missing=Object.keys(s.ownership).filter(id=>id!=='default' && !known.has(id));
  for(const p of plans){p.mode=s.mode;p.categories=[...s.categories];p.advance=s.advance;p.folderPath=s.folderPath;p.folder='';p.data.folder=null;p.ownership=JSON.stringify(ownership);p.data.ownership=clone(ownership);
    if(missing.length)p.warnings.push('Preset account choices for deleted accounts were omitted. Review the current account list.');
  }
  return plans;
}
export function combineSources(bundles) {
  const combined={};
  for(const kind of SOURCE_KINDS){const map=new Map();
    for(const [filename,bundle]of bundles)for(const row of bundle[kind] ?? []){
      const key=sourceIdentity(kind,row),old=map.get(key);
      if(old && stable(old.row)!==stable(row))throw Error(`Conflicting ${kind} source ${row.name}: ${old.filename} and ${filename}. Clear loaded sources or choose matching versions.`);
      map.set(key,{row,filename});
    }
    combined[kind]=[...map.values()].map(r=>clone(r.row));
  }
  return Object.values(combined).some(rows=>rows.length) ? parseSourceBundle(combined) : {records:[],warnings:[]};
}
export function validateBundle(bundle,filename) {
  if(!bundle || !SOURCE_KINDS.some(k=>Array.isArray(bundle[k])))throw Error(`${filename}: no supported 5e.tools content arrays`);
  for(const k of SOURCE_KINDS)if(bundle[k]!==undefined && !Array.isArray(bundle[k]))throw Error(`${filename}: ${k} must be a list`);
}
export async function saveSourceLibrary(env,name,bundles,{id,revision}={}) {
  const store=readPreferences(env,'libraries'),n=nameOf(name);
  if(!bundles.size)throw Error('Load source files before saving a library');
  for(const [filename,bundle]of bundles)validateBundle(bundle,filename);
  const parsed=combineSources(bundles);
  if(!parsed.records.length)throw Error('The loaded source files contain no importable records');
  if(revision!==undefined && revision!==store.revision)throw Error('Source library list changed. Reopen it before saving.');
  if(store.entries.some(p=>p.name.toLowerCase()===n.toLowerCase() && p.id!==id))throw Error('A source library with this name already exists');
  if(id && !store.entries.some(p=>p.id===id))throw Error('This source library was deleted. Reopen the list.');
  const entry={id:id || env.randomID(),name:n,files:[...bundles].map(([name,bundle])=>({name,bundle:clone(bundle)})),recordCount:parsed.records.length,updatedAt:new Date().toISOString()};
  await writePreferences(env,'libraries',[...store.entries.filter(p=>p.id!==entry.id),entry],store.revision);return entry;
}
export function loadSourceLibraries(store,ids,current=new Map()) {
  const merged=new Map(current);
  for(const id of ids){const library=store.entries.find(l=>l.id===id);if(!library)throw Error('A selected source library is missing. Choose an available library.');
    for(const file of library.files){validateBundle(file.bundle,file.name);merged.set(`Library ${library.name} / ${file.name}`,clone(file.bundle));}
  }
  const parsed=combineSources(merged);return {bundles:merged,...parsed};
}
export async function deletePreference(env,kind,id,revision) {
  const store=readPreferences(env,kind);if(store.revision!==revision)throw Error('This list changed. Reopen it before deleting.');
  await writePreferences(env,kind,store.entries.filter(p=>p.id!==id),revision);
}
