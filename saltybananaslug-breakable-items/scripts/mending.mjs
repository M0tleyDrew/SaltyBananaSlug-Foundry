import {ID,numeric,normal,stateFor,tracked} from './core.mjs';
export function isMendingSource(item,activity){return [item?.name,item?.system?.identifier,activity?.name,activity?.identifier].some(s=>normal(s)==='mending');}
export function mendingSources(actor){
 const found=[];for(const item of actor?.items??[])for(const activity of item.system?.activities??[])if(isMendingSource(item,activity)&&typeof activity.use==='function')found.push({item,activity,actor});return found;
}
export function mendingReasons(item,cfg){
 const s=stateFor(item,cfg.profiles,cfg.durability),reasons=[];
 if(!cfg.rules.mendingEnabled)reasons.push('Mending repairs are disabled by the GM.');
 if(!tracked(item,cfg.rules))reasons.push('This item is not tracked.');
 if(s.destroyed)reasons.push('Destroyed items cannot be repaired, including with Mending.');
 if(s.hp>=s.max)reasons.push('This item is already at full HP.');
 if(s.hp===0&&!cfg.rules.mendingBroken)reasons.push('The GM requires ordinary repairs for broken items.');
 if(s.config.mendingAllowed===false)reasons.push('The GM has excluded this item from Mending.');
 if(numeric(item.system?.quantity,1)>1)reasons.push('Split a single object out of this stack before Mending.');
 if(numeric(item.system?.quantity,1)<1)reasons.push('No physical item remains in this entry.');
 return reasons;
}
