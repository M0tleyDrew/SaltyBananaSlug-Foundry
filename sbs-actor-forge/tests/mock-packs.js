import {world} from './mock-world.js';
import {destinationEnvironment} from '../scripts/destinations.js';
export function packedWorld(){
  const base=world(),packs=new Map(),calls=[];base.calls=calls;
  base.addPack=(collection,kind='Actor',options={})=>{
    const backend=world(),pack={collection,documentName:kind,title:options.title ?? collection,locked:options.locked ?? false,maxFolderDepth:4,
      metadata:{packageType:options.packageType ?? 'world'},folders:backend.db.Folder,backend,cache:new Map(),loads:0,
      testUserPermission:()=>options.owner!==false,
      getUuid:id=>`Compendium.${collection}.${kind}.${id}`,
      getDocuments:async()=>{pack.loads++;if(pack.unavailable)throw Error('Pack unavailable');const docs=backend.list(kind);for(const d of docs)pack.cache.set(d.id,d);return docs;},
      get:id=>pack.cache.get(id),getDocument:async id=>backend.get(kind,id),getIndex:async()=>backend.list(kind).map(d=>({_id:d.id,name:d.name,type:d.type}))};
    pack.create=async(k,data)=>{const d=await backend.create(k,data);d.pack=collection;d.compendium=pack;d.inCompendium=true;Object.defineProperty(d,'uuid',{get:()=>`Compendium.${collection}.${k}.${d.id}`});return d;};
    packs.set(collection,pack);return pack;
  };
  base.listPacks=()=>[...packs.values()];base.getPack=id=>packs.get(id);
  base.createInPack=async(k,data,collection)=>{calls.push({k,data,collection});return packs.get(collection).create(k,data);};
  const fromWorld=base.fromUuid;base.fromUuid=async uuid=>{for(const p of packs.values())for(const k of [p.documentName,'Folder']){const d=p.backend.list(k).find(d=>d.uuid===uuid);if(d)return d;}return fromWorld(uuid);};
  base.openDestination=value=>destinationEnvironment(base,value);return base;
}
