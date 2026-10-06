import {folderLabel} from './folders.js';
export const ID = 'sbs-actor-forge';
export const VERSION = 2;
export const BUILD = '1.0.0';
export const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
export const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const equal = (a,b) => stable(a) === stable(b);
export function stable(x) {
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k)+':'+stable(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export function setPath(obj,path,value) {
  const keys = path.split('.');
  if (keys.some(k => ['__proto__','prototype','constructor'].includes(k))) throw Error('Unsafe field path');
  let cur=obj;
  for (const k of keys.slice(0,-1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k]={}; cur=cur[k]; }
  cur[keys.at(-1)]=clone(value);
}
export function getPath(obj,path) { return path.split('.').reduce((o,k)=>o?.[k],obj); }
export function flatten(obj,prefix='',out={}) {
  for (const [k,v] of Object.entries(obj ?? {})) {
    const p=prefix ? prefix+'.'+k : k;
    if (v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length) flatten(v,p,out);
    else out[p]=clone(v);
  }
  return out;
}
export function json(value,fallback) { return value==null || value==='' ? clone(fallback) : typeof value==='string' ? JSON.parse(value) : clone(value); }
export function enabled(v) { return !['no','false','0'].includes(String(v ?? '').trim().toLowerCase()); }
export function sanitize(data) {
  const d=clone(data);
  for (const k of ['_id','_stats','sort','folder','ownership','pack']) delete d[k];
  return d;
}
export function itemKey(item) { return item.flags?.[ID]?.itemKey || item.flags?.core?.sourceId || `${item.type}:${item.system?.identifier || item.name}`; }
export function markItems(data) {
  for (const i of data.items ?? []) { i.flags ??={}; i.flags[ID] ??={}; i.flags[ID].itemKey=itemKey(i); }
  for (const e of data.effects ?? []) { e.flags ??={}; e.flags[ID] ??={}; e.flags[ID].itemKey=itemKey({...e,type:'effect'}); }
  return data;
}
export function workbookRows(XLSX,book) {
  return Object.fromEntries(book.SheetNames.map(n=>[n,XLSX.utils.sheet_to_json(book.Sheets[n],{defval:''})]));
}
function rawValue(rows,key,cell) {
  if (cell) return json(cell,{});
  const chunks=(rows.JSON ?? []).filter(r=>String(r['Actor Key'])===key).sort((a,b)=>Number(a.Part)-Number(b.Part));
  if (!chunks.length) return {};
  if (chunks.some((r,i)=>Number(r.Part)!==i+1)) throw Error('Actor JSON chunks must be numbered consecutively from 1');
  return JSON.parse(chunks.map(r=>r.Value).join(''));
}
export function parseRows(rows) {
  const version=Number(rows.Meta?.[0]?.['Schema Version']);
  if (![1,2].includes(version)) throw Error('Unsupported or missing schema version. Use the included workbook.');
  const seen=new Set(), result=[];
  for (const [i,r] of (rows.Actors ?? []).entries()) {
    if (!enabled(r['Import?']) || !Object.values(r).some(v=>v!=='')) continue;
    const key=String(r['Actor Key'] || '').trim(), errors=[], warnings=[];
    if (!key) errors.push('Actor Key is required');
    if (seen.has(key)) errors.push('Duplicate Actor Key');
    seen.add(key);
    const type=String(r.Type || 'npc').trim();
    if (!['character','npc','vehicle','group'].includes(type)) errors.push(`Unsupported actor type: ${type}`);
    let data, gmDetails=[], detailsSupplied=false, gmDetailsSupplied=false, sourceActorId='';
    try {
      const raw=rawValue(rows,key,r['Raw JSON']);sourceActorId=r['Source Actor ID'] || raw._id || '';
      data=sanitize(raw); data.type=type;
      data.name=String(r.Name || data.name || '').trim(); if (!data.name) errors.push('Name is required');
      if (r['Image Path'] || !data.img) data.img=r['Image Path'] || 'icons/svg/mystery-man.svg';
      data.system ??={};
      const map={HP:'attributes.hp.value','Max HP':'attributes.hp.max',AC:'attributes.ac.flat',Walk:'attributes.movement.walk',CR:'details.cr',STR:'abilities.str.value',DEX:'abilities.dex.value',CON:'abilities.con.value',INT:'abilities.int.value',WIS:'abilities.wis.value',CHA:'abilities.cha.value'};
      for (const [col,path] of Object.entries(map)) if (r[col]!=='' && r[col]!=null) {
        const n=Number(r[col]); if (!Number.isFinite(n)) errors.push(`${col} must be numeric`); else setPath(data.system,path,n);
      }
      if (r.AC!=='' && r.AC!=null) setPath(data.system,'attributes.ac.calc','flat');
      if (r.Biography) setPath(data.system,'details.biography.value',r.Biography);
      if (r['Token JSON']) data.prototypeToken=json(r['Token JSON'],{});
      data.flags ??={}; data.flags[ID] ??={}; data.flags[ID].key=key;
      const old=data.flags[ID].details ??=[];
      gmDetails=old.filter(d=>String(d.visibility).toLowerCase()==='gm');
      gmDetailsSupplied=gmDetails.length>0;
      data.flags[ID].details=old.filter(d=>String(d.visibility).toLowerCase()!=='gm');
      for (const f of rows.Fields ?? []) if (String(f['Actor Key'])===key) {
        let val=f.Value;
        if (f['Value Type']==='json') val=json(val,null);
        else if (f['Value Type']==='number') { val=Number(val); if (!Number.isFinite(val)) throw Error(`Invalid number at ${f.Path}`); }
        else if (f['Value Type']==='boolean') val=['true','yes','1'].includes(String(val).toLowerCase());
        if (!/^(system|prototypeToken|flags)\./.test(f.Path)) throw Error(`Field must start system., prototypeToken. or flags.: ${f.Path}`);
        if (String(f.Path).startsWith(`flags.${ID}.private`)) throw Error('GM notes belong in Details with Visibility GM');
        setPath(data,f.Path,val);
      }
      const detailRows=(rows.Details ?? []).filter(d=>String(d['Actor Key'])===key);
      if (detailRows.length) { data.flags[ID].details=[]; gmDetails=[]; detailsSupplied=true; }
      for (const d of detailRows) {
        const entry={section:String(d.Section || 'Notes'),label:String(d.Label || ''),value:String(d.Value ?? '')};
        const visibility=String(d.Visibility || 'Public').trim().toLowerCase();
        if (!['public','gm'].includes(visibility)) throw Error('Details Visibility must be Public or GM');
        (visibility==='gm' ? gmDetails : data.flags[ID].details).push(entry);if(visibility==='gm')gmDetailsSupplied=true;
      }
      if(['clear','replace'].includes(String(r['GM Notes Action'] || '').toLowerCase())){gmDetailsSupplied=true;if(String(r['GM Notes Action']).toLowerCase()==='clear')gmDetails=[];}
      // Typed/raw authoring follows the same visibility rule as the Details sheet.
      const finalDetails=data.flags[ID].details ?? [];
      if(!Array.isArray(finalDetails))throw Error('SBS Details must be a list of entries');
      for(const entry of finalDetails.filter(d=>String(d.visibility).toLowerCase()==='gm')){gmDetails.push({section:entry.section || 'GM Notes',label:entry.label || '',value:String(entry.value ?? '')});gmDetailsSupplied=true;}
      data.flags[ID].details=finalDetails.filter(d=>String(d.visibility).toLowerCase()!=='gm');
      for(const key of ['gmDetails','privateDetails','privateNotes'])if(data.flags[ID][key]!==undefined){const value=data.flags[ID][key];gmDetails.push(...(Array.isArray(value)?value:[{section:'GM Notes',label:key,value:typeof value==='string'?value:JSON.stringify(value)}]));gmDetailsSupplied=true;delete data.flags[ID][key];}
      detailsSupplied ||= Boolean(r['Raw JSON']) || Boolean((rows.JSON ?? []).some(d=>String(d['Actor Key'])===key));
      delete data.flags[ID].baseline; delete data.flags[ID].privatePage;
      markItems(data);
    } catch(e) { errors.push(e.message); data={name:r.Name || `Row ${i+2}`,type,system:{}}; }
    const relations=(rows.Relationships ?? []).filter(x=>String(x['Actor Key'])===key && enabled(x['Import?']));
    const advancements=(rows.Advancements ?? []).filter(x=>String(x['Actor Key'])===key && enabled(x['Import?']));
    result.push({key,row:i+2,data,sourceActorId,errors,warnings,gmDetails,gmDetailsSupplied,gmNotesAction:String(r['GM Notes Action'] || 'keep').toLowerCase(),detailsSupplied,relations,advancements,
      itemRows:(rows.Items ?? []).filter(x=>String(x['Actor Key'])===key && enabled(x['Import?'])),
      catalog:rows.Catalog ?? [],template:r['Template UUID'] || '',folder:r.Folder || '',ownership:r['Ownership JSON'] || '',
      target:r['Update Actor ID'] || '',matchExisting:['yes','true','1'].includes(String(r['Match Actor Key'] || '').toLowerCase()),mode:String(r['Update Mode'] || 'merge').toLowerCase(),
      advance:['yes','true','1'].includes(String(r['Apply Advancements'] || '').toLowerCase()),selected:!errors.length});
  }
  if (!result.length) throw Error('No enabled actors found.');
  return result;
}
export function exportRows(actors,{privateDetails={},folders=[]}={}) {
  const rows={Meta:[{'Schema Version':VERSION,'Module Version':BUILD,Author:'SaltyBananaSlug'}],Actors:[],Fields:[],Items:[],Details:[],Relationships:[],Advancements:[],Catalog:[],JSON:[]};
  const list=actors.map(a=>({actor:a,data:a.toObject ? a.toObject() : clone(a)}));
  const keys=new Map(),used=new Set();
  for(const {data:d}of list){const base=d.flags?.[ID]?.key || d._id || d.name;let key=base,index=2;while(used.has(key))key=base+'-'+index++;used.add(key);keys.set(d._id,key);}
  for (const {actor,data:d} of list) {
    const key=keys.get(d._id) || d.name, details=d.flags?.[ID]?.details ?? [];
    const clean=sanitize(d); if (clean.flags?.[ID]) { delete clean.flags[ID].baseline; delete clean.flags[ID].privatePage; }
    const rel=[];
    const add=(kind,id,quantity=1)=>rel.push({'Import?':'Yes','Actor Key':key,Relation:kind,'Target Key':keys.get(id) || '', 'Target UUID':keys.has(id) ? '' : `Actor.${id}`,Quantity:quantity});
    if (d.type==='group') {
      for (const m of d.system?.members ?? []) add('member',m.actor);
      if (d.system?.primaryVehicle) add('primaryVehicle',d.system.primaryVehicle);
      delete clean.system.members; delete clean.system.primaryVehicle;
    } else if (d.type==='vehicle') for (const kind of ['crew','passenger','draft']) {
      const field=kind==='passenger' ? 'passengers' : kind;
      const counts=new Map(); for (const u of d.system?.[field]?.value ?? []) counts.set(u,(counts.get(u) || 0)+1);
      for (const [u,n] of counts) add(kind,u.replace(/^Actor\./,''),n);
      if (clean.system[field]) delete clean.system[field].value;
    }
    rows.Relationships.push(...rel);
    const raw=JSON.stringify(clean), chunks=raw.length>30000;
    if (chunks) for (let n=0;n<raw.length;n+=30000) rows.JSON.push({'Actor Key':key,Part:n/30000+1,Value:raw.slice(n,n+30000)});
    rows.Actors.push({'Import?':'Yes','Actor Key':key,Name:d.name,Type:d.type,'Image Path':d.img,Folder:folderLabel(actor.folder,folders) || '',
      'Source Actor ID':d._id || '', 'Update Actor ID':d._id || '', 'Update Mode':'merge','Apply Advancements':'No','Ownership JSON':JSON.stringify(d.ownership ?? {}),'Raw JSON':chunks ? '' : raw});
    for (const entry of details) rows.Details.push({'Actor Key':key,Section:entry.section,Label:entry.label,Value:entry.value,Visibility:'Public'});
    for (const entry of privateDetails[d._id] ?? []) rows.Details.push({'Actor Key':key,Section:entry.section,Label:entry.label,Value:entry.value,Visibility:'GM'});
  }
  return rows;
}
export function makeBook(XLSX,rows) {
  const book=XLSX.utils.book_new();
  for (const data of Object.values(rows)) for (const row of data) for (const value of Object.values(row))
    if (typeof value==='string' && value.length>32767) throw Error('A worksheet value exceeds the Excel cell limit. Shorten that value or use JSON.');
  for (const [name,data] of Object.entries(rows)) XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(data),name);
  return book;
}
