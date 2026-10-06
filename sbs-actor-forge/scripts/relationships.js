import {clone,equal} from './core.js';
const rules={group:new Set(['member','primaryVehicle']),vehicle:new Set(['crew','passenger','draft'])};
export function validateRelations(plan) {
  const primary=plan.relations.filter(r=>r.Relation==='primaryVehicle');
  if (primary.length>1) throw Error('A group can have only one primary vehicle');
  for (const r of plan.relations) {
    if (!rules[plan.data.type]?.has(r.Relation)) throw Error(`Relation ${r.Relation} is invalid for ${plan.data.type}`);
    if (!r['Target Key'] && !r['Target UUID']) throw Error('Relationship needs a Target Key or Target UUID');
    const n=Number(r.Quantity || 1); if (!Number.isInteger(n) || n<1 || n>100) throw Error('Relationship Quantity must be 1–100');
    if (r['Target Key']===plan.key) throw Error('An actor cannot be its own member, crew or passenger');
  }
}
export function relationshipPatch(actor,rows,resolved,{mode='merge',baseline={}}={}) {
  const groups=new Map(), warnings=[],patch={};
  for (const r of rows) {
    const ref=r['Target Key'] || r['Target UUID'], target=resolved.get(ref);
    if (!target) { warnings.push(`Relationship ${r.Relation}: ${ref} was not imported or could not be resolved; skipped`); continue; }
    if (target.id===actor.id) { warnings.push('Self relationship skipped'); continue; }
    if (r.Relation==='primaryVehicle' && target.type!=='vehicle') { warnings.push(`Primary vehicle ${target.name} is not a vehicle; skipped`); continue; }
    const path=r.Relation==='member' ? 'system.members' : r.Relation==='primaryVehicle' ? 'system.primaryVehicle' : `system.${r.Relation==='passenger' ? 'passengers' : r.Relation}.value`;
    if (!groups.has(path)) groups.set(path,[]);
    const value=r.Relation==='member' ? {actor:target.id} : r.Relation==='primaryVehicle' ? target.id : target.uuid;
    const count=['member','primaryVehicle'].includes(r.Relation) ? 1 : Number(r.Quantity || 1);
    groups.get(path).push(...Array.from({length:count},()=>clone(value)));
  }
  const raw=actor.toObject();
  for (const [path,list] of groups) {
    const old=path.split('.').reduce((o,k)=>o?.[k],raw);
    let val=path==='system.primaryVehicle' ? list[0] : path==='system.members' ? list.filter((m,i)=>list.findIndex(n=>n.actor===m.actor)===i) : list;
    if (mode==='merge' && baseline[path] && !equal(old,baseline[path])) { warnings.push(`${path}: kept locally edited relationships`); continue; }
    if (mode==='merge' && Array.isArray(old)) {
      // Retain manually added entries; replace only previously imported roster entries.
      const prior=baseline[path] ?? [], retained=old.filter(v=>!prior.some(p=>equal(p,v)));
      if (path==='system.members') val=[...retained,...val].filter((m,i,a)=>a.findIndex(n=>n.actor===m.actor)===i);
      else if (!prior.length) { const counts=new Map(); for (const v of retained) counts.set(v,(counts.get(v)||0)+1); const append=[];for(const v of val){if(counts.get(v))counts.set(v,counts.get(v)-1);else append.push(v);} val=[...retained,...append]; }
      else val=[...retained,...val];
    }
    patch[path]=val;
  }
  return {patch,warnings};
}
