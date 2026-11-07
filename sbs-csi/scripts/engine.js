import {ID,VERSION,clone,project,assertUnchanged,offsetElements,equal} from './core.js';
export const categories=['scene','walls','lights','keys'];
const embedded={walls:'Wall',lights:'AmbientLight'};
function unique(documents,predicate,label){const found=[...documents].filter(predicate);if(found.length>1)throw Error(`Multiple CSI records match ${label}. Resolve duplicates before importing.`);return found[0];}
export function findScene(env,key){return unique(env.scenes,d=>d.flags?.[ID]?.key===key,key);}
function findKey(env,scene,key){return unique(env.items,d=>d.flags?.[ID]?.scene===scene&&d.flags?.[ID]?.key===key,`${scene}/${key}`);}
function shape(data){const d=clone(data);delete d._id;delete d.flags?.[ID];if(d.flags&&!Object.keys(d.flags).length)delete d.flags;return d;}
function baseline(doc,data){return project(doc.toObject(),shape(data));}
function checkManaged(doc,label,force){if(!force)assertUnchanged(doc.toObject(),doc.flags?.[ID]?.baseline,label);}
function canRescaleTokens(old,next){
  return old.padding===next.padding&&old.width>0&&old.height>0&&Math.abs(next.width/old.width-next.height/old.height)<.002;
}
export function reprojectTokens(tokens,old,next,from,to){
  return tokens.map(t=>{
    const halfX=(t.width??1)*old.grid.size/2,halfY=(t.height??1)*old.grid.size/2;
    return {_id:t._id,x:to.sceneX+(t.x+halfX-from.sceneX)/old.width*next.width-(t.width??1)*next.grid.size/2,
      y:to.sceneY+(t.y+halfY-from.sceneY)/old.height*next.height-(t.height??1)*next.grid.size/2};
  });
}
export function preflight(c,env,options){
  const target=findScene(env,c.key);if(target?.active)throw Error(`${c.scene.name}: switch to a different active scene before updating this one.`);
  if(!target){for(const k of c.keys){const doc=findKey(env,c.key,k.key);if(doc)checkManaged(doc,`Key ${k.data.name}`,options.force);}return null;}
  const cats=options.categories;
  if(cats.includes('scene'))checkManaged(target,`${c.scene.name}: scene settings`,options.force);
  const tracked=target.flags?.[ID]?.members??{};
  for(const cat of ['walls','lights'])if(cats.includes(cat)){
    const list=[...target[cat]],present=list.filter(d=>d.flags?.[ID]?.key);
    const dup=new Set();for(const d of present){const key=d.flags[ID].key;if(dup.has(key))throw Error(`${cat}: duplicate CSI ID ${key}`);dup.add(key);checkManaged(d,`${cat} ${key}`,options.force);}
    for(const id of tracked[cat]??[])if(!present.some(d=>d.flags[ID].key===id)&&!options.force)throw Error(`${cat} ${id} was deleted after import. Enable overwrite to recreate it.`);
  }
  if(cats.includes('keys'))for(const k of c.keys){const doc=findKey(env,c.key,k.key);if(doc)checkManaged(doc,`Key ${k.data.name}`,options.force);}
  // Geometry changes move every embedded object relative to the background.
  if(cats.includes('scene')){
    const actual=target.toObject(),geo=['width','height','padding','grid.size'];
    const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
    if(geo.some(k=>!equal(get(actual,k),get(c.scene,k)))){
      if(!cats.includes('walls')||!cats.includes('lights'))throw Error('Scale/padding changes require both Walls and Lights updates.');
      if((target.tokens?.size&&!canRescaleTokens(actual,c.scene))||target.tiles?.size||target.drawings?.size||target.notes?.size||target.sounds?.size||target.regions?.size||[...target.walls,...target.lights].some(d=>!d.flags?.[ID]?.key))throw Error('This scene contains placed or manual content. Keep its dimensions/padding unchanged, or import it under a new scene_id.');
    }
  }
  // Partial updates must not leave keys and locks disagreeing.
  if(cats.includes('walls')!==cats.includes('keys')&&(c.keys.length||[...target.walls].some(d=>d.flags?.LocknKey?.IDKeysFlag)))throw Error('Update Walls and Keys together for scenes with linked keys.');
  return target;
}
async function folder(env,type,path){
  let parent=null;const names=path.split('/').map(x=>x.trim()).filter(Boolean);
  if(names.length>(env.maxFolderDepth??3))throw Error(`Folder path is too deep: ${path}`);
  for(const name of names){let f=[...env.folders].find(f=>f.type===type&&f.name===name&&(f.folder?.id??f.folder??null)===parent);if(!f)f=await env.createFolder({name,type,folder:parent,color:'#367348'});parent=f.id;}return parent;
}
async function stamp(doc,data,extra={}){await doc.setFlag(ID,'baseline',baseline(doc,data));for(const [k,v]of Object.entries(extra))await doc.setFlag(ID,k,v);}
async function syncEmbedded(target,cat,entries){
  const type=embedded[cat],existing=[...target[cat]].filter(d=>d.flags?.[ID]?.key),wanted=new Set(entries.map(x=>x.key));
  const remove=existing.filter(d=>!wanted.has(d.flags[ID].key));if(remove.length)await target.deleteEmbeddedDocuments(type,remove.map(d=>d.id));
  for(const entry of entries){let doc=existing.find(d=>d.flags[ID].key===entry.key);if(doc){const data=clone(entry.data);if(cat==='walls'&&!data.door&&doc.flags?.LocknKey)data['flags.-=LocknKey']=null;await doc.update(data,{diff:false,recursive:true});}else{[doc]=await target.createEmbeddedDocuments(type,[entry.data]);}await stamp(doc,entry.data);}
}
export async function importScene(c,env,options){
  const target=preflight(c,env,options),cats=target?options.categories:categories;
  // All schema/file checks and edit checks happen before any world mutation.
  env.validate(c,target,cats);
  const oldScene=target?.toObject(),oldDimensions=target?.getDimensions(),oldKeys=[],createdKeys=[];
  for(const k of c.keys){const d=findKey(env,c.key,k.key);if(d)oldKeys.push({doc:d,data:d.toObject()});}
  let scene=target;
  try{
    const sceneData=clone(c.scene);
    if(cats.includes('scene')){sceneData.background.src=await env.upload(c.image,c.key,'background');sceneData.folder=await folder(env,'Scene',c.folder);}
    if(!scene)scene=await env.createScene({...sceneData,flags:{[ID]:{key:c.key,version:VERSION}}});
    else if(cats.includes('scene'))await scene.update(sceneData,{diff:false,recursive:true});
    const positioned=offsetElements(c,scene.getDimensions());
    if(oldScene&&cats.includes('scene')&&target.tokens?.size&&canRescaleTokens(oldScene,c.scene)&&
      (oldScene.width!==c.scene.width||oldScene.height!==c.scene.height||oldScene.grid.size!==c.scene.grid.size)){
      const updates=reprojectTokens([...target.tokens].map(t=>t.toObject()),oldScene,c.scene,oldDimensions,scene.getDimensions());
      await scene.updateEmbeddedDocuments('Token',updates);
    }
    if(cats.includes('keys')){
      const keyFolder=c.keys.length?await folder(env,'Item',`${c.scene.name.replaceAll('/','-')}/Keys`):null;
      for(const k of c.keys){const data=clone(k.data);data.folder=keyFolder;if(k.imageFile)data.img=await env.upload(k.imageFile,c.key,`key-${k.key}`);let doc=findKey(env,c.key,k.key);if(doc)await doc.update(data,{diff:false,recursive:true});else{doc=await env.createItem(data);createdKeys.push(doc);}await stamp(doc,data);}
    }
    for(const cat of ['walls','lights'])if(cats.includes(cat))await syncEmbedded(scene,cat,positioned[cat]);
    const members=clone(scene.flags?.[ID]?.members??{});for(const cat of ['walls','lights'])if(cats.includes(cat))members[cat]=c[cat].map(e=>e.key);
    await scene.setFlag(ID,'members',members);
    if(cats.includes('scene'))await stamp(scene,sceneData);
    if(env.verifyLinks&&cats.includes('walls')&&cats.includes('keys'))await env.verifyLinks(scene,c);
    const warnings=[...c.warnings];
    try{await env.thumbnail?.(scene);}catch{warnings.push('Scene imported; thumbnail could not be generated.');}
    return {scene,warnings};
  }catch(error){
    const failures=[];
    try{if(oldScene)await env.restoreScene(scene,oldScene);else if(scene)await scene.delete();}catch(e){failures.push(`Scene restore: ${e.message}`);}
    for(const {doc,data}of oldKeys)try{await env.restoreItem(doc,data);}catch(e){failures.push(`Key restore: ${e.message}`);}
    for(const doc of createdKeys)try{await doc.delete();}catch(e){failures.push(`New key removal: ${e.message}`);}
    throw Error(`${error.message}\n${failures.length?'ROLLBACK NEEDS ATTENTION: '+failures.join('; '):'Scene and key changes rolled back.'} Uploaded files and newly created empty folders may remain.`);
  }
}
