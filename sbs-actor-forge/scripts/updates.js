import {ID,clone,equal,flatten,getPath,setPath,itemKey,markItems,sanitize} from './core.js';

export const CATEGORIES=['fields','items','effects','details','relationships','token','permissions'];
export const MODES={merge:'Merge — preserve local edits',managed:'Replace Forge content — keep other inventory',replace:'Replace whole actor'};
const managedPath=p=>p.startsWith(`flags.${ID}.baseline`) || p===`flags.${ID}.privatePage`;
export function publicFields(data) {
  const flat=flatten(data), out={};
  for (const [p,v] of Object.entries(flat)) {
    if (/^(items|effects|ownership|prototypeToken)(\.|$)/.test(p) || /^(_id|_stats|sort|type)(\.|$)/.test(p) || /^system\.(members|primaryVehicle|crew\.value|passengers\.value|draft\.value)(\.|$)/.test(p) || managedPath(p) || p===`flags.${ID}.details`) continue;
    out[p]=v;
  }
  return out;
}
function snapshot(item) {
  const d=clone(item); for (const k of ['_id','_stats','sort']) delete d[k];
  return d;
}
export function baselineFor(data) {
  const d=markItems(clone(data));
  return {fields:publicFields(d),token:clone(d.prototypeToken ?? {}),details:clone(d.flags?.[ID]?.details ?? []),
    items:Object.fromEntries((d.items ?? []).map(i=>[itemKey(i),snapshot(i)])),
    effects:Object.fromEntries((d.effects ?? []).map(i=>[itemKey(i),snapshot(i)]))};
}
function conflictChoice(choices,decisions,conflicts,{key,path,before,after,baseline,message}) {
  const resolution=choices[key] ?? 'keep';
  if(!['keep','incoming'].includes(resolution))throw Error(`Invalid conflict choice for ${path}`);
  decisions.push({key,path,before:clone(before),after:clone(after),baseline:clone(baseline),resolution});
  if(resolution==='keep')conflicts.push(message);
  return resolution==='incoming';
}
function mergeLeaves(old,incoming,previous,force,changes,conflicts,prefix,choices,decisions,keyPrefix) {
  const result=clone(old ?? {}), base=flatten(previous ?? {});
  for (const [p,v] of Object.entries(flatten(incoming))) {
    const current=getPath(result,p);
    if (!force && Object.hasOwn(base,p) && !equal(current,base[p]) && !equal(current,v)) {
      if(!conflictChoice(choices,decisions,conflicts,{key:keyPrefix+p,path:prefix+p,before:current,after:v,baseline:base[p],message:`${prefix}${p}: kept local edit`}))continue;
    }
    if (!equal(current,v)) { setPath(result,p,v); changes.push({path:prefix+p,before:clone(current),after:clone(v)}); }
  }
  return result;
}
function collection(oldList,newList,previous,mode,changes,conflicts,label,choices,decisions) {
  const result=clone(oldList ?? []), seen=new Set();
  for (const incoming of newList ?? []) {
    const key=itemKey(incoming); if (seen.has(key)) throw Error(`Duplicate ${label} key: ${key}`); seen.add(key);
    let candidates=result.filter(i=>i.flags?.[ID]?.itemKey===key);
    if (!candidates.length) candidates=result.filter(i=>!i.flags?.[ID]?.itemKey && (i._id && i._id===incoming._id || i.type===incoming.type && (i.system?.identifier ? i.system.identifier===incoming.system?.identifier : i.name===incoming.name)));
    if (candidates.length>1) throw Error(`Ambiguous existing ${label}: ${incoming.name}. Give it a unique Item Key.`);
    const old=candidates[0];
    if (!old) {
      if (mode==='merge' && previous?.[key] && !conflictChoice(choices,decisions,conflicts,{key:`${label}:${key}:deleted`,path:`${label} ${incoming.name}`,before:'Deleted locally',after:'Restore workbook item',baseline:previous[key],message:`${label} ${incoming.name}: kept local deletion`}))continue;
      result.push(clone(incoming)); changes.push({path:`${label}: ${incoming.name}`,before:null,after:'Add'}); continue;
    }
    const supplied=clone(incoming);
    // Native advancement choices remain valid when replacing an origin's description/configuration.
    if(supplied.system?.advancement)for(const a of supplied.system.advancement){const prior=old.system?.advancement?.find(p=>p._id===a._id);if(prior?.value)a.value=clone(prior.value);}
    let next;
    if (mode==='managed') next={...supplied,_id:old._id};
    else next=mergeLeaves(old,snapshot(supplied),previous?.[key],false,changes,conflicts,`${label} ${incoming.name} · `,choices,decisions,`${label}:${key}:`);
    next.flags ??={}; next.flags[ID] ??={}; next.flags[ID].itemKey=key;
    result[result.indexOf(old)]=next;
    if (mode==='managed' && !equal(snapshot(old),snapshot(next))) changes.push({path:`${label}: ${incoming.name}`,before:'Existing Forge content',after:'Replace'});
  }
  if (mode==='managed') return result.filter(i=>{
    if (i.flags?.[ID]?.itemKey && !i.flags[ID].generatedByAdvancement && !seen.has(i.flags[ID].itemKey)) { changes.push({path:`${label}: ${i.name}`,before:'Managed',after:'Remove'}); return false; }
    return true;
  });
  return result;
}
export function buildUpdate(existing,incoming,{mode='merge',categories=CATEGORIES,detailsSupplied=true,conflictChoices={}}={}) {
  if (!Object.hasOwn(MODES,mode)) throw Error(`Unknown update mode: ${mode}`);
  const data=markItems(clone(incoming)), changes=[], conflicts=[], decisions=[], allowed=new Set(categories);
  if (existing && existing.type!==data.type) throw Error('Changing actor type during update is not supported. Create a new actor.');
  if (!existing) {
    data.flags ??={}; data.flags[ID] ??={}; data.flags[ID].baseline=baselineFor(data);
    return {data,changes:[{path:data.name,before:null,after:'Create actor'}],conflicts,decisions};
  }
  let result=clone(existing); const prev=existing.flags?.[ID]?.baseline ?? {};
  if (mode==='replace') {
    result={...sanitize(data),_id:existing._id,type:existing.type,folder:data.folder ?? null};
    changes.push({path:'Entire actor, inventory and effects',before:existing.name,after:'Replace'});
    // Explicit category exclusions still take precedence over full replacement.
    if (!allowed.has('fields')) for (const [p,v] of Object.entries(publicFields(existing))) setPath(result,p,v);
  } else if (allowed.has('fields')) {
    for (const [p,v] of Object.entries(publicFields(data))) {
      const current=getPath(result,p);
      if (Object.hasOwn(prev.fields ?? {},p) && !equal(current,prev.fields[p]) && !equal(current,v)) {
        if(!conflictChoice(conflictChoices,decisions,conflicts,{key:`field:${p}`,path:p,before:current,after:v,baseline:prev.fields[p],message:`${p}: kept local edit`}))continue;
      }
      if (!equal(current,v)) { setPath(result,p,v); changes.push({path:p,before:clone(current),after:clone(v)}); }
    }
  }
  for (const kind of ['items','effects']) {
    if (!allowed.has(kind)) result[kind]=clone(existing[kind] ?? []);
    else if (mode!=='replace') result[kind]=collection(existing[kind],data[kind],prev[kind],mode,changes,conflicts,kind,conflictChoices,decisions);
  }
  if (!allowed.has('token')) result.prototypeToken=clone(existing.prototypeToken ?? {});
  else if (mode!=='replace' && data.prototypeToken) result.prototypeToken=mergeLeaves(existing.prototypeToken,data.prototypeToken,prev.token,mode==='managed',changes,conflicts,'prototypeToken.',conflictChoices,decisions,'token:');
  if (!allowed.has('permissions')) result.ownership=clone(existing.ownership ?? {});
  else if (data.ownership) { result.ownership=clone(data.ownership); if (!equal(existing.ownership,data.ownership)) changes.push({path:'Account permissions',before:existing.ownership,after:data.ownership}); }
  result.flags ??={}; result.flags[ID] ??={};
  for (const path of ['system.members','system.primaryVehicle','system.crew.value','system.passengers.value','system.draft.value']) {
    if (!allowed.has('relationships') && getPath(existing,path)!==undefined) setPath(result,path,getPath(existing,path));
  }
  if (!allowed.has('details') || !detailsSupplied) result.flags[ID].details=clone(existing.flags?.[ID]?.details ?? []);
  else if (mode==='merge' && prev.details && !equal(existing.flags?.[ID]?.details ?? [],prev.details) && !equal(existing.flags?.[ID]?.details ?? [],data.flags?.[ID]?.details ?? []) && !conflictChoice(conflictChoices,decisions,conflicts,{key:'details',path:'Public SBS Details',before:existing.flags?.[ID]?.details ?? [],after:data.flags?.[ID]?.details ?? [],baseline:prev.details,message:'SBS Details: kept local edits'})) {
    result.flags[ID].details=clone(existing.flags?.[ID]?.details ?? []);
  } else {result.flags[ID].details=clone(data.flags?.[ID]?.details ?? []);if(!equal(existing.flags?.[ID]?.details ?? [],result.flags[ID].details))changes.push({path:'Public SBS Details',before:existing.flags?.[ID]?.details ?? [],after:result.flags[ID].details});}
  const nextBase=baselineFor(data);
  result.flags[ID].baseline=clone(prev);
  if (allowed.has('fields')) result.flags[ID].baseline.fields={...(prev.fields ?? {}),...nextBase.fields};
  for (const k of ['items','effects','token']) if (allowed.has(k)) result.flags[ID].baseline[k]=mode==='merge' && k!=='token' ? {...prev[k],...nextBase[k]} : nextBase[k];
  if (allowed.has('details') && detailsSupplied) result.flags[ID].baseline.details=nextBase.details;
  // Private notes remain outside actor documents. Only a harmless reference survives updates.
  if (existing.flags?.[ID]?.privatePage) result.flags[ID].privatePage=existing.flags[ID].privatePage;
  return {data:result,changes,conflicts,decisions};
}
