import {ID,clone,stable,markItems,itemKey,json,sanitize,setPath,flatten} from './core.js';
import {buildUpdate,CATEGORIES,baselineFor} from './updates.js';
import {validateRelations,relationshipPatch} from './relationships.js';
import {compileAdvancements,catalogReferences,replaceCatalogReferences} from './advancements.js';
import {importPrivateDetails,readUndo,writeUndo} from './privacy.js';
import {linkOrigins} from './origins.js';
import {findSource} from './sources.js';
import {folderRequest,findActorFolder,folderLabel,planFolders,folderInUse,pendingFolderConflict} from './folders.js';
import {normalizeActorDocuments,normalizeItemDocument} from './documents.js';
import {validateDestinationPlan} from './destinations.js';

export function merge(a,b) { const out=clone(a ?? {});for(const [p,v] of Object.entries(flatten(b ?? {})))setPath(out,p,v);return out; }
export function fingerprint(doc) {
  function clean(v) { if(Array.isArray(v))return v.map(clean);if(v && typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='_stats').map(([k,x])=>[k,clean(x)]));return v; }
  return stable(clean(doc.toObject ? doc.toObject() : doc));
}
function schemaData(data) {
  // Cast activities use a native UUID field. Validate portable Catalog references as Item UUIDs.
  const ids=new Map(catalogReferences(data).map((key,i)=>[key,'sbsSchema'+String(i).padStart(7,'0')]));
  return ids.size?replaceCatalogReferences(data,ids):data;
}
export async function preparePlans(plans,env,sourceRecords=[]) {
  const index=new Map();
  for (const p of plans) {
    p.categories ??= [...CATEGORIES];p.gmDetails ??=[];p.relations ??=[];p.advancements ??=[];p.catalog ??=[];
    if(p.errors.length)continue;
    try {
      if(p.matchExisting && !p.target){const matches=env.list('Actor').filter(a=>a.flags?.[ID]?.key===p.key);if(matches.length!==1)throw Error(matches.length?'Multiple actors have this Actor Key; choose a target explicitly':'Matching actor not found; import the main test workbook first');p.target=matches[0].id;}
      if (p.template) { const doc=await env.fromUuid(p.template);if(doc?.documentName!=='Actor')throw Error(`Cannot resolve Actor: ${p.template}`);const base=sanitize(doc.toObject());p.data={...base,...p.data,system:merge(base.system,p.data.system),flags:merge(base.flags,p.data.flags),prototypeToken:merge(base.prototypeToken,p.data.prototypeToken),items:[...(base.items ?? []),...(p.data.items ?? [])],effects:[...(base.effects ?? []),...(p.data.effects ?? [])]}; }
      const forge=p.data.flags?.[ID];
      if(forge){
        if(forge.details && !Array.isArray(forge.details))throw Error('SBS Details must be a list of entries');
        for(const d of (forge.details ?? []).filter(d=>String(d.visibility).toLowerCase()==='gm')){p.gmDetails.push({section:d.section || 'GM Notes',label:d.label || '',value:String(d.value ?? '')});p.gmDetailsSupplied=true;}
        if(forge.details)forge.details=forge.details.filter(d=>String(d.visibility).toLowerCase()!=='gm');
        for(const k of ['gmDetails','privateDetails','privateNotes'])if(forge[k]!==undefined){const v=forge[k];p.gmDetails.push(...(Array.isArray(v)?v:[{section:'GM Notes',label:k,value:typeof v==='string'?v:JSON.stringify(v)}]));p.gmDetailsSupplied=true;delete forge[k];}
        delete forge.privatePage;
        if(p.gmNotesAction==='clear')p.gmDetails=[];
      }
      p.data.items ??=[];
      for (const r of p.itemRows ?? []) {
        try {
          let item;
          if(r.UUID){const doc=await env.fromUuid(r.UUID);if(doc?.documentName!=='Item')throw Error(`Cannot resolve Item: ${r.UUID}`);item=sanitize(doc.toObject());item.flags ??={};item.flags.core ??={};item.flags.core.sourceId=r.UUID;}
          else if(r['Raw JSON'])item=sanitize(json(r['Raw JSON'],{}));
          else if(r['Source Format']==='5etools')item=findSource(sourceRecords,r.Name,r.Type,r.Source,p.warnings);
          else {
            const key=[r.Name,r.Type].join('|');
            if(!index.has(key))index.set(key,await env.findItems(r.Name,r.Type));
            const matches=index.get(key);if(matches.length!==1)throw Error(matches.length?'Ambiguous item name; provide UUID':'Item not found; load its 5e.tools source, import through Plutonium, or supply Raw JSON');
            item=sanitize(matches[0].toObject ? matches[0].toObject() : (await env.fromUuid(matches[0].uuid)).toObject());
          }
          if(r.Name)item.name=r.Name;if(r.Type)item.type=r.Type;
          if(r['Image Path'])item.img=String(r['Image Path']).trim();
          if(r['System JSON'])item.system=merge(item.system,json(r['System JSON'],{}));
          item.flags ??={};item.flags[ID] ??={};item.flags[ID].itemKey=String(r['Item Key'] || itemKey(item));
          p.data.items.push(item);
        } catch(e) {p.warnings.push(`Item ${r.Name || r.UUID || '(unnamed)'} skipped: ${e.message}`);}
      }
      markItems(p.data);compileAdvancements(p);validateRelations(p);
      if(env.destination?.actorPack && p.advance){p.advance=false;p.warnings.push('Compendium template: advancements are retained. Apply their choices after importing the template into the World.');}
      validateDestinationPlan(p,env);
      normalizeActorDocuments(p.data,p.warnings);
      const keys=(p.data.items ?? []).map(itemKey);if(new Set(keys).size!==keys.length)throw Error('Duplicate Item Key; assign unique keys to separate copies');
      catalogData([p]);
      env.validateActor(schemaData(p.data));
    } catch(e) {p.errors.push(e.message);}
    p.selected=!p.errors.length;
  }
  return plans;
}
export function previewUpdate(plan,env) {
  const old=plan.target ? env.get('Actor',plan.target) : null;
  if(plan.target && !old)throw Error(`Update target missing: ${plan.target}`);
  const data=clone(plan.data),request=folderRequest(plan,env),destination=request.path ? findActorFolder(request.path,env) : env.get('Folder',request.id);
  data.folder=destination?.id ?? (request.path ? old?.toObject().folder ?? null : request.id);
  const result=buildUpdate(old?.toObject(),data,plan);
  const folderDecision=pendingFolderConflict(plan,env,request);
  if(folderDecision){result.decisions.push(folderDecision);if(folderDecision.resolution==='keep')result.conflicts.push('Folder: kept local edit');}
  if(request.path && !destination && folderDecision?.resolution!=='keep' && (!plan.target || plan.categories.includes('fields')))result.changes.push({path:'Folder',before:folderLabel(env.get('Folder',old?.toObject().folder),env.list('Folder')) || '(none)',after:request.path+' (create)'});
  if(old && !old.flags?.[ID]?.baseline && plan.mode==='merge')result.conflicts.unshift('First tracked update: existing values have no earlier Forge baseline; supplied fields will be applied');
  result.expected=old ? fingerprint(old) : null;
  return result;
}
function catalogData(plans) {
  const rows=new Map();for(const p of plans)for(const r of p.catalog ?? []){
    const key=r['Source Key'];if(!key)continue;const d=json(r['Raw JSON'],{});if(!d.name || !d.type)throw Error(`Catalog ${key} needs a native Item name/type`);normalizeItemDocument(d,p.warnings);
    if(rows.has(key) && stable(rows.get(key))!==stable(d))throw Error(`Conflicting Catalog key: ${key}`);rows.set(key,d);
  }
  const required=new Set(plans.flatMap(p=>catalogReferences(p.data))),queue=[...required];
  for(const key of queue){const data=rows.get(key);if(!data)throw Error(`Missing Catalog item: ${key}`);for(const next of catalogReferences(data))if(!required.has(next)){required.add(next);queue.push(next);}}
  const visiting=new Set(),done=new Set();function visit(key){if(visiting.has(key))throw Error(`Catalog grant cycle at ${key}`);if(done.has(key))return;visiting.add(key);for(const ref of catalogReferences(rows.get(key)))visit(ref);visiting.delete(key);done.add(key);}for(const key of required)visit(key);
  return new Map([...required].map(k=>[k,rows.get(k)]));
}
export function validateImport(plans,env) {
  const seen=new Set(),keys=new Set();
  env.assertDestination?.();
  for(const p of plans){validateDestinationPlan(p,env);if(keys.has(p.key))throw Error('Duplicate Actor Key in selection');keys.add(p.key);if(p.errors.length)throw Error(`${p.data.name}: has validation errors (${p.errors.join('; ')})`);if(p.target){if(seen.has(p.target))throw Error('Duplicate update target in selection');seen.add(p.target);}normalizeActorDocuments(p.data,p.warnings);const incoming=normalizeActorDocuments(previewUpdate(p,env).data,p.warnings);validateDestinationPlan({...p,data:incoming},env);env.validateActor(schemaData(incoming));}
  catalogData(plans);planFolders(plans,env);
}
function remapEmbedded(data,actorId,old,sourceActorId,randomID,actorUUID=`Actor.${actorId}`) {
  const d=clone(data),map=new Map();
  for(const kind of ['items','effects'])for(const x of d[kind] ?? []){
    const candidates=(old?.[kind] ?? []).filter(i=>itemKey(i)===itemKey(x));
    const id=candidates.length===1 ? candidates[0]._id : x._id || randomID();if(x._id)map.set(x._id,id);x._id=id;
  }
  function walk(v){
    if(typeof v==='string'){
      if(map.has(v))return map.get(v);
      const m=v.match(/^(?:Actor\.[^.]+|Compendium\..+\.Actor\.[^.]+)\.Item\.([^.]+)(.*)$/);if(m && map.has(m[1]))return `${actorUUID}.Item.${map.get(m[1])}${m[2]}`;
      if(sourceActorId && v===`Actor.${sourceActorId}`)return actorUUID;
      return v;
    }
    if(Array.isArray(v))return v.map(walk);if(v && typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[map.get(k) || k,k==='_id'?x:walk(x)]));return v;
  }
  return walk(d);
}
export async function importPlans(plans,env) {
  if(!env.isGM)throw Error('Actor Forge requires a GM');
  validateImport(plans,env);
  const log={at:new Date().toISOString(),version:3,destination:clone(env.destination ?? {actorPack:'',itemPack:''}),entries:[]},lines=[],imported=new Map(),entries=new Map();
  const ids=new Map(plans.map(p=>[p.key,p.target || env.randomID()]));
  const catalog=catalogData(plans),sourceIds=new Map();
  const folders=planFolders(plans,env);
  for(const data of folders.creates)env.validateFolder?.(data);
  for(const [key,raw]of catalog){const signature=stable(sanitize(raw)),existing=env.list('Item').filter(i=>i.flags?.[ID]?.catalogKey===key && i.flags[ID].catalogSignature===signature);if(existing.length>1)throw Error(`Multiple identical world Catalog sources for ${key}`);sourceIds.set(key,existing[0]?.id || env.randomID());}
  const sourceUUIDs=new Map([...sourceIds].map(([key,id])=>[key,env.uuidFor?.('Item',id) ?? `Item.${id}`]));
  // Finish all schema checks before writing the new Undo batch or any sources.
  for(const [key,data]of catalog)env.validateItem?.(replaceCatalogReferences(sanitize(data),sourceUUIDs));
  for(const p of plans){const old=p.target ? env.get('Actor',p.target) : null;if(p.reviewExpected!==undefined && p.reviewExpected!==(old ? fingerprint(old) : null))throw Error(`${p.data.name}: changed after review; preview the changes again`);}
  await writeUndo(env,log);
  const track=async(kind,id,before,extra={})=>{
    const entry={kind,id,before:clone(before),status:'pending',...extra};log.entries.push(entry);await writeUndo(env,log);
    return {entry,finish:async doc=>{entry.after=fingerprint(doc);entry.status='complete';await writeUndo(env,log);}};
  };
  for(const data of folders.creates){
    const t=await track('Folder',data._id,null);
    try{await t.finish(await env.create('Folder',data));}
    catch(err){const doc=env.get('Folder',data._id);if(doc)await t.finish(doc);else{t.entry.status='failed';await writeUndo(env,log);}throw Error(`Could not create folder ${data.name}: ${err.message}. Undo can remove any empty folders created so far.`);}
  }
  for(const [key,raw]of catalog){
    const id=sourceIds.get(key),old=env.get('Item',id),data=replaceCatalogReferences(sanitize(raw),sourceUUIDs);data.flags ??={};data.flags[ID] ??={};data.flags[ID].catalogKey=key;data.flags[ID].catalogSignature=stable(sanitize(raw));data.ownership={default:2};
    env.validateItem?.(data);
    // Sources are immutable per supplied version; reuse them without overwriting manual edits.
    if(old)continue;
    const t=await track('Item',id,old?.toObject() ?? null,{catalogKey:key});
    const doc=old ? await env.restore('Item',old,{...data,_id:id}) : await env.create('Item',{...data,_id:id});await t.finish(doc);
  }
  for(const p of plans){
    let t,actor;
    try {
      const old=p.target ? env.get('Actor',p.target) : null;
      if(p.reviewExpected!==undefined && p.reviewExpected!==(old ? fingerprint(old) : null))throw Error('Actor changed after review; preview the changes again');
      const incoming=remapEmbedded(replaceCatalogReferences(p.data,sourceUUIDs),ids.get(p.key),old?.toObject(),p.sourceActorId,env.randomID,env.uuidFor?.('Actor',ids.get(p.key)));
      if(!old || p.categories.includes('fields'))incoming.folder=folders.destinations.get(p.key);
      const result=buildUpdate(old?.toObject(),incoming,p);normalizeActorDocuments(result.data,p.warnings);env.validateActor(result.data);
      if(folders.preserved.has(p.key))result.data.flags[ID].baseline.fields.folder=old.flags[ID].baseline.fields.folder;
      t=await track('Actor',ids.get(p.key),old?.toObject() ?? null,{key:p.key,name:p.data.name});entries.set(p.key,t);
      actor=old ? await env.restore('Actor',old,{...result.data,_id:old.id}) : await env.create('Actor',{...result.data,_id:ids.get(p.key)});
      imported.set(p.key,actor);
      p.warnings.push(...result.conflicts,...await linkOrigins(actor));
      if(p.advance){
        const beforeItems=new Set([...actor.items].map(i=>i.id));p.warnings.push(...await env.runAdvancements(actor));
        const generated=[...actor.items].filter(i=>!beforeItems.has(i.id));
        if(generated.length){
          await actor.updateEmbeddedDocuments('Item',generated.map(i=>({_id:i.id,[`flags.${ID}.generatedByAdvancement`]:true})));
          const base=actor.flags?.[ID]?.baseline ?? {},latest=baselineFor(actor.toObject());
          await actor.update({[`flags.${ID}.baseline.items`]:{...base.items,...Object.fromEntries(generated.map(i=>[itemKey(i),latest.items[itemKey(i)]]))}});
        }
      }
      if(p.categories.includes('details') && (p.gmDetailsSupplied || p.gmDetails.length))p.warnings.push(...await importPrivateDetails(env,actor,p.gmDetails,['clear','replace'].includes(p.gmNotesAction)?'managed':p.mode,track));
      lines.push(`OK: ${actor.name}`);
    }catch(e){
      imported.delete(p.key);lines.push(`FAILED: ${p.data.name}: ${e.message}`);
      if(t){const doc=env.get('Actor',t.entry.id);if(doc){t.entry.after=fingerprint(doc);t.entry.status='complete';t.entry.partial=true;}else t.entry.status='failed';await writeUndo(env,log);}
    }
  }
  // Resolve real document IDs only after all selected actors exist.
  const resolved=new Map(imported);
  for(const p of plans)for(const r of p.relations){
    const ref=r['Target Key'] || r['Target UUID'];if(resolved.has(ref))continue;
    if(r['Target Key']){if(plans.some(x=>x.key===ref))continue;const matches=env.list('Actor').filter(a=>a.flags?.[ID]?.key===ref);if(matches.length===1)resolved.set(ref,matches[0]);}
    else {const a=await env.fromUuid(ref);if(a?.documentName==='Actor' && env.get('Actor',a.id))resolved.set(ref,a);}
  }
  for(const p of plans){
    const actor=imported.get(p.key);if(!actor)continue;
    try {
      if(p.categories.includes('relationships') && p.relations.length){
        const base=actor.flags?.[ID]?.baseline?.relationships ?? {},r=relationshipPatch(actor,p.relations,resolved,{mode:p.mode,baseline:base});
        p.warnings.push(...r.warnings);if(Object.keys(r.patch).length){await actor.update(r.patch);await actor.update({[`flags.${ID}.baseline.relationships`]:{...base,...r.patch}});}
      }
      await entries.get(p.key).finish(actor);
    }catch(e){p.warnings.push(`Relationship linking failed: ${e.message}`);const t=entries.get(p.key);t.entry.after=fingerprint(actor);t.entry.status='complete';t.entry.partial=true;await writeUndo(env,log);}
  }
  for(const p of plans)for(const w of p.warnings)lines.push(`${p.data.name}: ${w}`);
  return {log,lines,imported};
}
function linkedIds(raw){return [...(raw.system?.members ?? []).map(m=>m.actor),raw.system?.primaryVehicle,...['crew','passengers','draft'].flatMap(k=>(raw.system?.[k]?.value ?? []).map(u=>u.replace(/^Actor\./,'')))].filter(Boolean);}
export async function undoImport(env) {
  if(!env.isGM)throw Error('GM required');const log=await readUndo(env),lines=[],remaining=[];
  if(!log?.entries?.length)return {lines:['No import to undo'],remaining:[]};
  if(log.destination && env.openDestination)env=await env.openDestination(log.destination);
  env.assertDestination?.();
  const protectedActors=new Set();
  for(const e of log.entries){const doc=env.get(e.kind || 'Actor',e.id);if(doc && (e.status!=='complete' || fingerprint(doc)!==e.after)){if((e.kind || 'Actor')==='Actor')protectedActors.add(e.id);if(e.notesForActor)protectedActors.add(e.notesForActor);}}
  let changed=true;while(changed){changed=false;for(const id of [...protectedActors]){const doc=env.get('Actor',id);if(!doc)continue;for(const child of linkedIds(doc.toObject()))if(log.entries.some(e=>(e.kind || 'Actor')==='Actor' && e.id===child && !e.before) && !protectedActors.has(child)){protectedActors.add(child);changed=true;}}}
  const protectedSources=new Set(),sourceUUIDs=new Map(log.entries.filter(e=>e.kind==='Item').map(e=>[env.uuidFor?.('Item',e.id) ?? `Item.${e.id}`,e.id]));
  function sourceRefs(v){if(typeof v==='string'){for(const [uuid,id]of sourceUUIDs)if(v===uuid || v.startsWith(uuid+'.'))protectedSources.add(id);}else if(Array.isArray(v))v.forEach(sourceRefs);else if(v && typeof v==='object')Object.values(v).forEach(sourceRefs);}
  const references=env.referenceDocuments ? await env.referenceDocuments() : {docs:[...env.list('Actor'),...env.list('Item')],incomplete:false};
  if(references.incomplete){for(const id of sourceUUIDs.values())protectedSources.add(id);if(sourceUUIDs.size)lines.push('Kept Catalog sources because references in an unavailable compendium could not be checked.');}
  for(const doc of references.docs){const kind=doc.documentName,uuid=doc.uuid ?? `${kind}.${doc.id}`,entry=log.entries.find(e=>e.kind===kind && (env.uuidFor?.(kind,e.id) ?? `${kind}.${e.id}`)===uuid);
    if(!entry || entry.status!=='complete' || fingerprint(doc)!==entry.after || kind==='Actor' && protectedActors.has(doc.id))sourceRefs(doc.toObject());
    if(entry?.before)sourceRefs(entry.before);
  }
  let sourcesChanged=true;while(sourcesChanged){const n=protectedSources.size;for(const id of protectedSources){const doc=env.get('Item',id);if(doc)sourceRefs(doc.toObject());}sourcesChanged=n!==protectedSources.size;}
  for(const e of [...log.entries].reverse()){
    const kind=e.kind || 'Actor',doc=env.get(kind,e.id);
    try {
      if(e.status==='failed' && !doc && !e.before)continue;
      if(protectedActors.has(kind==='Actor' ? e.id : e.notesForActor) || kind==='Item' && protectedSources.has(e.id) || kind==='Folder' && folderInUse(e.id,env) || e.status!=='complete' || doc && fingerprint(doc)!==e.after){remaining.push(e);lines.push(`Skipped ${doc?.name || e.id}: edited or still referenced by a retained actor/folder`);continue;}
      if(!doc){if(e.before){remaining.push(e);lines.push(`Missing ${kind} ${e.id}; skipped`);}continue;}
      if(e.before)await env.restore(kind,doc,e.before);else if(env.delete)await env.delete(kind,doc);else await doc.delete();lines.push(`Undone ${kind}: ${doc.name}`);
    }catch(err){remaining.push(e);lines.push(`Undo failed: ${err.message}`);}
  }
  await writeUndo(env,{...log,entries:remaining.reverse()});return {lines,remaining};
}
