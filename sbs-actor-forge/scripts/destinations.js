import {clone} from './core.js';

export const destinationOf=value=>({actorPack:String(value?.actorPack ?? ''),itemPack:String(value?.itemPack ?? '')});
export function writablePack(pack,kind,user) {
  return !!(user?.isGM && pack?.documentName===kind && !pack.locked &&
    (pack.metadata?.packageType ? pack.metadata.packageType==='world' : pack.metadata?.packageName==='world' || pack.collection?.startsWith('world.')) &&
    (!pack.testUserPermission || pack.testUserPermission(user,'OWNER')));
}
export function destinationChoices(env,kind) {
  return (env.listPacks?.() ?? []).filter(p=>writablePack(p,kind,env.user)).sort((a,b)=>a.title.localeCompare(b.title));
}
export async function destinationEnvironment(base,value={}) {
  const destination=destinationOf(value),packs={},cache={};
  function assertDestination(){
    for(const [kind,key]of [['Actor','actorPack'],['Item','itemPack']]){
      if(!destination[key])continue;
      const pack=base.getPack?.(destination[key]);
      if(!pack)throw Error(`Compendium ${destination[key]} is missing. Restore it or select another destination.`);
      if(!writablePack(pack,kind,base.user))throw Error(`Compendium ${pack.title} must be an unlocked ${kind} world compendium with GM Owner access.`);
      packs[kind]=pack;
    }
  }
  assertDestination();
  async function refresh(){
    assertDestination();
    for(const [kind,pack]of Object.entries(packs)){
      const docs=await pack.getDocuments();cache[kind]=new Map(docs.map(d=>[d.id,d]));
    }
    if(packs.Actor){
      if(!packs.Actor.folders?.[Symbol.iterator])throw Error('This Actor compendium does not expose its folders. Update Foundry before importing into it.');
      cache.Folder=new Map([...packs.Actor.folders].map(d=>[d.id,d]));
    }
  }
  await refresh();
  const packFor=k=>packs[k==='Folder'?'Actor':k];
  const scope={...base,destination:clone(destination),assertDestination,refresh,
    destinationLabel:`Actors: ${packs.Actor?.title ?? 'World'} · Grant sources: ${packs.Item?.title ?? 'World Items'}`,
    maxFolderDepth:packs.Actor?.maxFolderDepth ?? base.maxFolderDepth,
    get:(k,id)=>cache[k] ? cache[k].get(id) : base.get(k,id),
    list:k=>cache[k] ? [...cache[k].values()] : base.list(k),
    uuidFor:(k,id)=>packFor(k)?.getUuid(id) ?? `${k}.${id}`,
    validateActor:d=>base.validateActor(d,packs.Actor?.collection),
    validateItem:d=>base.validateItem?.(d,packs.Item?.collection),
    validateFolder:d=>base.validateFolder?.(d,packs.Actor?.collection),
    create:async(k,data)=>{
      assertDestination();const pack=packFor(k);
      const doc=pack ? await base.createInPack(k,data,pack.collection) : await base.create(k,data);
      cache[k]?.set(doc.id,doc);return doc;
    },
    restore:async(k,doc,data)=>{assertDestination();const result=await base.restore(k,doc,data);cache[k]?.set(result.id,result);return result;},
    delete:async(k,doc)=>{assertDestination();await doc.delete();cache[k]?.delete(doc.id);},
    openDestination:value=>destinationEnvironment(base,value),
    referenceDocuments:async()=>{
      const docs=[...base.list('Actor'),...base.list('Item')];let incomplete=false;
      for(const pack of base.listPacks?.() ?? []){
        if(!['Actor','Item'].includes(pack.documentName))continue;
        try{docs.push(...await pack.getDocuments());}catch{incomplete=true;}
      }
      return {docs,incomplete};
    }
  };
  return scope;
}
export function validateDestinationPlan(plan,env) {
  if(!env.destination?.actorPack)return;
  const s=plan.data.system ?? {};
  if(plan.relations?.length || (s.members ?? []).length || s.primaryVehicle || ['crew','passengers','draft'].some(k=>(s[k]?.value ?? []).length))
    throw Error('Group and vehicle actor links need World actors. Select World for this linked batch; compendium templates must have empty actor links.');
  if(plan.advance)throw Error('Apply advancements after bringing this template into the World. Disable Apply unconfigured advancements for compendium imports.');
}
