export function originLinks(actorType,source,items){
 const patch={},warnings=[];if(!['character','npc'].includes(actorType))return {patch,warnings};
 const list=[...items];const fields=[['race','race'],...(actorType==='character'?[['background','background'],['originalClass','class']]:[])];
 for(const [field,type] of fields){
  const candidates=list.filter(i=>i.type===type);if(!candidates.length)continue;
  const current=source?.details?.[field];
  if(current&&candidates.some(i=>i.id===current||i._id===current))continue;
  const named=current?candidates.filter(i=>i.system?.identifier===current||i.name===current):[];
  const selected=named.length===1?named[0]:candidates.length===1?candidates[0]:null;
  if(selected)patch[`system.details.${field}`]=selected.id??selected._id;
  else warnings.push(`Multiple ${type} items: choose the active ${field} on the actor sheet.`);
 }
 return {patch,warnings};
}
export async function linkOrigins(actor){const {patch,warnings}=originLinks(actor.type,actor.toObject().system,actor.items);if(Object.keys(patch).length)await actor.update(patch);return warnings;}
