import {ID,clone,json,itemKey} from './core.js';

const TYPES=new Set(['Size','Trait','AbilityScoreImprovement','ItemGrant','ItemChoice','HitPoints','ScaleValue','Subclass','ItemModify']);
export function compileAdvancements(plan) {
  const seen=new Set();
  for (const r of plan.advancements ?? []) {
    const origin=(plan.data.items ?? []).find(i=>itemKey(i)===r['Origin Item Key'] || i.name===r['Origin Item Key']);
    if (!origin) throw Error(`Advancement origin not found: ${r['Origin Item Key']}`);
    if (!TYPES.has(r.Type)) throw Error(`Unsupported advancement type: ${r.Type}`);
    const id=String(r['Advancement Key'] || '').trim();
    if (!/^[A-Za-z0-9]{16}$/.test(id)) throw Error('Advancement Key must contain exactly 16 letters/numbers');
    if (seen.has(itemKey(origin)+':'+id)) throw Error(`Duplicate Advancement Key: ${id}`);
    seen.add(itemKey(origin)+':'+id);
    const level=Number(r.Level || 0); if (!Number.isInteger(level) || level<0 || level>20) throw Error('Advancement Level must be 0–20');
    const config=json(r['Configuration JSON'],{}), keys=String(r['Grant Item Keys'] || '').split('|').map(s=>s.trim()).filter(Boolean);
    if (r.Type==='ItemGrant' && keys.length) config.items=keys.map(k=>({uuid:`@forge:${k}`,optional:false}));
    if (r.Type==='ItemChoice' && keys.length) {
      config.pool=keys.map(k=>({uuid:`@forge:${k}`}));
      config.choices ??={}; config.choices[level]={count:Number(r['Choice Count'] || 1),replacement:false};
    }
    origin.system ??={}; origin.system.advancement ??=[];
    const adv={_id:id,type:r.Type,title:String(r.Title || ''),level,configuration:config,value:{}};
    const idx=origin.system.advancement.findIndex(a=>a._id===id);
    if (idx<0) origin.system.advancement.push(adv); else origin.system.advancement[idx]=adv;
  }
}
export function catalogReferences(data) {
  const keys=new Set();
  function walk(v) { if (typeof v==='string' && v.startsWith('@forge:')) keys.add(v.slice(7)); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v==='object') Object.values(v).forEach(walk); }
  walk(data); return [...keys];
}
export function replaceCatalogReferences(data,ids) {
  function walk(v) {
    if (typeof v==='string' && v.startsWith('@forge:')) { const id=ids.get(v.slice(7)); if (!id) throw Error(`Missing Catalog item: ${v.slice(7)}`); return id.startsWith('Compendium.') || id.startsWith('Item.') ? id : `Item.${id}`; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v==='object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));
    return v;
  }
  return walk(clone(data));
}
export function pendingAdvancements(actor,Manager) {
  const manager=new Manager(actor,{automaticApplication:true});
  for (const item of manager.clone.items) {
    if (!['class','subclass','race','background','feat'].includes(item.type)) continue;
    const level=Manager.currentLevel(item,manager.clone);
    for (let l=0;l<=level;l++) for (const flow of Manager.flowsForLevel(item,l)) {
      if (!flow.advancement.configuredForLevel(l)) manager.steps.push({type:'forward',flow});
    }
  }
  // Use the same advancement ordering as the system: sizes/traits before item grants.
  manager.steps.sort((a,b)=>(a.flow.level-b.flow.level) || (a.flow.advancement.constructor.metadata.order-b.flow.advancement.constructor.metadata.order));
  return manager;
}
export async function runNativeAdvancements(actor) {
  if (!actor.system.metadata?.supportsAdvancement) return ['Advancements are available on character actors'];
  if (game.settings.get('dnd5e','disableAdvancements')) return ['D&D5e level-up automation is disabled; advancements were retained for later'];
  const Manager=game.dnd5e?.applications?.advancement?.AdvancementManager ?? (await import('../../../systems/dnd5e/module/applications/advancement/advancement-manager.mjs')).default;
  const manager=pendingAdvancements(actor,Manager);
  if (!manager.steps.length) return [];
  const complete=await new Promise((resolve,reject)=>{
    let done=false;
    const finish=value=>{ if(done)return;done=true;for(const [name,id] of hooks)Hooks.off(name,id);resolve(value); };
    const hooks=[
      ['dnd5e.advancementManagerComplete',Hooks.on('dnd5e.advancementManagerComplete',m=>{if(m===manager)finish(true);})],
      ['closeAdvancementManager',Hooks.on('closeAdvancementManager',m=>{if(m===manager)finish(false);})],
      ['closeApplicationV2',Hooks.on('closeApplicationV2',m=>{if(m===manager)finish(false);})]
    ];
    manager.addEventListener?.('close',()=>finish(false),{once:true});
    try { const allowed=Hooks.call('sbsActorForge.beforeAdvancements',manager); if(allowed===false){finish(false);return;} Promise.resolve(manager.render(true)).catch(e=>{for(const [n,id] of hooks)Hooks.off(n,id);reject(e);}); }
    catch(e) { for(const [n,id] of hooks)Hooks.off(n,id);reject(e); }
  });
  return complete ? [] : ['Advancement choices were cancelled; unconfigured choices can be opened from SBS Details → Advancements'];
}
