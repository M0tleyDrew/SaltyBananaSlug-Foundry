import {ID,equal} from './core.js';

const parentId=f=>typeof f.folder==='string' ? f.folder : f.folder?.id ?? f.toObject?.().folder ?? null;
export function folderSegments(path,maxDepth=4) {
  const parts=String(path).trim().split('/').map(s=>s.trim());
  if(!parts.length || parts.some(s=>!s || s==='.' || s==='..' || /[\u0000-\u001f]/.test(s)))throw Error('Folder path needs nonempty names separated by /');
  if(parts.length>maxDepth)throw Error(`Folder path exceeds Foundry’s ${maxDepth}-level limit`);
  return parts;
}
export function folderLabel(folder,folders=[]) {
  const parts=[],seen=new Set();let f=typeof folder==='string' ? folders.find(x=>x.id===folder) : folder;
  while(f && !seen.has(f.id)){seen.add(f.id);parts.unshift(f.name);const id=parentId(f);f=typeof f.folder==='object' && f.folder ? f.folder : folders.find(x=>x.id===id);}
  return parts.join(' / ');
}
export function findActorFolder(value,env) {
  if(!value)return null;
  const all=env.list('Folder').filter(f=>f.type==='Actor');
  const direct=all.find(f=>f.id===value);if(direct)return direct;
  const normalized=String(value).split('/').map(s=>s.trim()).join(' / ');
  const matches=all.filter(f=>folderLabel(f,all)===normalized || !value.includes('/') && f.name===value);
  if(matches.length>1)throw Error(`Ambiguous Actor folder ${value}; use its full path or select it in Preview`);
  return matches[0] ?? null;
}
export function folderRequest(plan,env) {
  if(plan.target && !(plan.categories ?? ['fields']).includes('fields'))return {id:plan.data.folder ?? null,path:''};
  if(plan.folderPath!==undefined) {
    if(plan.folderPath.trim())return {id:null,path:folderSegments(plan.folderPath,env.maxFolderDepth).join(' / ')};
    const id=plan.data.folder;
    if(id && env.get('Folder',id)?.type!=='Actor')throw Error('Selected folder is no longer an Actor folder');
    return {id:id || null,path:''};
  }
  const value=plan.folder || plan.data.folder || '',found=findActorFolder(value,env);
  return found ? {id:found.id,path:''} : value ? {id:null,path:folderSegments(value,env.maxFolderDepth).join(' / ')} : {id:null,path:''};
}
export function planFolders(plans,env) {
  const all=[...env.list('Folder')].filter(f=>f.type==='Actor'),creates=[],destinations=new Map(),preserved=new Set();
  for(const plan of plans){
    const request=folderRequest(plan,env);let id=request.id;
    if(pendingFolderConflict(plan,env,request)?.resolution==='keep'){id=env.get('Actor',plan.target).toObject().folder ?? null;destinations.set(plan.key,id);preserved.add(plan.key);continue;}
    if(request.path){
      let parent=null;
      for(const name of folderSegments(request.path,env.maxFolderDepth)){
        const matches=all.filter(f=>f.name===name && parentId(f)===parent);
        if(matches.length>1)throw Error(`Ambiguous folder path ${request.path}`);
        let folder=matches[0];
        if(!folder){folder={id:env.randomID(),name,type:'Actor',folder:parent};all.push(folder);creates.push({_id:folder.id,name,type:'Actor',folder:parent,color:'#c99b4b',flags:{[ID]:{managedFolder:true}}});}
        parent=folder.id;
      }
      id=parent;
    }
    destinations.set(plan.key,id);
  }
  return {creates,destinations,preserved};
}
export function pendingFolderConflict(plan,env,request=folderRequest(plan,env)) {
  if(!request.path || !plan.target || plan.mode==='replace' || findActorFolder(request.path,env))return null;
  const old=env.get('Actor',plan.target)?.toObject(),base=old?.flags?.[ID]?.baseline?.fields;
  if(!base || !Object.hasOwn(base,'folder') || equal(old.folder,base.folder))return null;
  const resolution=plan.conflictChoices?.['field:folder'] ?? 'keep';
  if(!['keep','incoming'].includes(resolution))throw Error('Invalid conflict choice for Folder');
  return {key:'field:folder',path:'Folder',before:folderLabel(env.get('Folder',old.folder),env.list('Folder')) || '(none)',after:request.path+' (create)',baseline:base.folder,resolution};
}
export function folderInUse(id,env) {
  return env.list('Actor').some(a=>parentId(a)===id) || env.list('Folder').some(f=>parentId(f)===id);
}
