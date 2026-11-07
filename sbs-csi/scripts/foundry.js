import {ID,clone,offsetElements} from './core.js';
export function dependencies(){
  if(!game.user.isGM)throw Error('SBS CSI requires a GM.');
  if(game.system.id!=='dnd5e')throw Error('This CSI release requires the D&D5e system.');
  if(!game.modules.get('LocknKey')?.active)throw Error('Enable Lock & Key (LocknKey) before importing. It is a required dependency.');
  const api=game.modules.get('LocknKey').api?.LnKFlags;
  if(typeof api?.matchingIDKeys!=='function'||typeof api?.KeyIDs!=='function')throw Error('Lock & Key API is unavailable or incompatible. Update/enable Lock & Key and reload Foundry.');
  if(!globalThis.XLSX||!globalThis.JSZip)throw Error('CSI workbook libraries did not load. Reinstall the complete module.');
  return api;
}
async function ensureDirectory(path){
  const Picker=foundry.applications.apps.FilePicker.implementation;
  let current='';for(const part of path.split('/').filter(Boolean)){current=current?current+'/'+part:part;try{await Picker.browse('data',current);}catch{await Picker.createDirectory('data',current);}}
}
export function environment(){
  const api=dependencies(),batch=foundry.utils.randomID();let uploadRoot;
  return {
    scenes:game.scenes,items:game.items,folders:game.folders,maxFolderDepth:CONST.FOLDER_MAX_DEPTH??3,
    createFolder:data=>Folder.create(data),createScene:data=>Scene.create(data),createItem:data=>Item.create(data),
    async upload(file,scene,label){
      if(!uploadRoot){uploadRoot=`sbs-csi/${game.world.id}/${batch}`;await ensureDirectory(uploadRoot);}
      const ext=file.name.split('.').pop().toLowerCase(),name=`${scene}-${label}.${ext}`;
      const result=await foundry.applications.apps.FilePicker.implementation.upload('data',uploadRoot,new File([file],name,{type:file.type}),{}, {notify:false});
      if(!result?.path)throw Error(`Image upload failed: ${file.name}`);return result.path;
    },
    validate(c,target,cats){
      const data=clone(c.scene);data.background.src='icons/svg/map.svg';
      const scene=new Scene(target?foundry.utils.mergeObject(target.toObject(),cats.includes('scene')?data:{},{inplace:false}):data);
      scene.validate({strict:true});const positioned=offsetElements(c,scene.getDimensions());
      for(const [cat,type]of [['walls','Wall'],['lights','AmbientLight']])if(cats.includes(cat))for(const entry of positioned[cat])new CONFIG[type].documentClass(entry.data,{parent:scene}).validate({strict:true});
      if(cats.includes('lights'))for(const l of c.lights){const type=l.data.config.animation.type;if(type&&!CONFIG.Canvas.lightAnimations[type])throw Error(`Unknown lighting animation: ${type}`);}
      if(cats.includes('keys'))for(const k of c.keys)new Item(k.data).validate({strict:true});
      const folderParts=c.folder.split('/').filter(s=>s.trim());if(folderParts.length>(CONST.FOLDER_MAX_DEPTH??3))throw Error('Scene folder path is too deep.');
    },
    async verifyLinks(scene,c){
      for(const k of c.keys){const item=game.items.find(d=>d.flags?.[ID]?.scene===c.key&&d.flags?.[ID]?.key===k.key);if(!item)throw Error(`Key was not created: ${k.data.name}`);
        for(const wall of c.walls.filter(w=>w.data.flags.LocknKey?.IDKeysFlag.split(';').includes(k.data.flags.LocknKey.IDKeysFlag))){const door=scene.walls.find(d=>d.flags?.[ID]?.key===wall.key);if(!door||!api.matchingIDKeys(item,door))throw Error(`Lock & Key verification failed: ${k.data.name} → ${wall.key}`);}}
    },
    async thumbnail(scene){const thumb=await scene.createThumbnail();if(thumb?.thumb)await scene.update({thumb:thumb.thumb});},
    async restoreScene(scene,data){await scene.importFromJSON(JSON.stringify(data));},
    async restoreItem(item,data){await item.importFromJSON(JSON.stringify(data));}
  };
}
