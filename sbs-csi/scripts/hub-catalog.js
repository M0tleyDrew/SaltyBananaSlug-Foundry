export const registry=new Map();
export function register(entry){if(!entry?.id||!entry?.moduleId||!entry?.label||typeof entry.open!=='function')throw Error('SBS Hub: register requires id, moduleId, label and open().');registry.set(entry.id,{gmOnly:true,...entry});}
export function isSBS(mod){return /^(sbs-|saltybananaslug)/i.test(mod.id)||mod.id==='party-viewer'||/saltybananaslug/i.test(mod.title??'')||[...(mod.authors??[])].some(a=>/saltybananaslug/i.test(a.name??a));}
export function sortEntries(entries,mode='csi-first',order=[]){const list=[...entries],rank=new Map(order.map((id,i)=>[id,i]));return list.sort((a,b)=>{if(mode==='csi-first'&&a.id!==b.id&&(a.id==='sbs-csi'||b.id==='sbs-csi'))return a.id==='sbs-csi'?-1:1;if(mode==='custom'){const d=(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity);if(d)return d;}return (a.label??a.title).localeCompare(b.label??b.title);});}
const globals={
  'saltybananaslug-merchants':['sbsMerchants','manager'],
  'saltybananaslug-containers':['sbsContainers','manager'],
  'saltybananaslug-item-uploader':['saltyBananaSlugItemUploader','open'],
  'saltybananaslugs-factions':['sbsFactions','open'],
  'saltybananaslugs-lore-module':['saltyBananaSlugLore','openManager']
};
// These modules provide player-facing entry points and enforce their own access.
const publicLaunchers={
  'party-viewer':['open','Open party viewer'],
  'saltybananaslug-quests-objectives':['openBoard','Open quest board'],
  'saltybananaslugs-message-cantrip':['openDialog','Cast Message'],
  'saltybananaslug-card-games':['launch','Open card games']
};
export function catalog(game){
  const result=[];
  for(const mod of game.modules){
    if(!mod.active||mod.id==='sbs-hub'||(!isSBS(mod)&&![...registry.values()].some(e=>e.moduleId===mod.id)))continue;
    const tools=[...registry.values()].filter(e=>e.moduleId===mod.id&&(game.user.isGM||!e.gmOnly));
    if(mod.id==='sbs-csi'&&game.user.isGM){for(const [id,label,method]of [['sbs-csi:import','Import scenes','open'],['sbs-csi:blank','Download blank worksheet','blankWorksheet']])if(!tools.some(t=>t.id===id))tools.push({id,label,open:()=>{const api=game.modules.get?.('sbs-csi')?.api??mod.api;if(typeof api?.[method]!=='function')throw Error('CSI is still initializing. Reload Foundry and try again.');return api[method]();}});}
    const publicTool=publicLaunchers[mod.id];
    const publicApi=mod.id==='party-viewer'?globalThis.PartyViewer:mod.api;
    if(!tools.length&&publicTool&&typeof publicApi?.[publicTool[0]]==='function')tools.push({id:mod.id+':public',label:publicTool[1],open:()=>publicApi[publicTool[0]]()});
    // Legacy methods below are management launchers; expose them only to GMs.
    if(!tools.length&&game.user.isGM){
      const alias=globals[mod.id],api=mod.id==='party-viewer'?globalThis.PartyViewer:alias?game[alias[0]]:mod.api;
      const method=alias?.[1]??['openManager','open','manager','openBoard','openDialog','launch'].find(k=>typeof api?.[k]==='function');
      if(typeof api?.[method]==='function')tools.push({id:mod.id+':legacy',label:mod.id==='saltybananaslugs-npc-memories'?'Open selected actor memories':'Open',open:()=>{if(mod.id==='saltybananaslugs-npc-memories'){const actor=globalThis.canvas?.tokens?.controlled?.[0]?.actor;if(!actor)throw Error('Select an NPC token, then open its memories from the slug tab.');return api[method](actor);}return api[method]();}});
      for(const [id,menu]of game.settings.menus){if((menu.namespace===mod.id||id.startsWith(mod.id+'.'))&&(!menu.restricted||game.user.isGM))tools.push({id:mod.id+':menu:'+id,label:game.i18n.localize(menu.label||menu.name||'Settings'),open:()=>new menu.type().render(true)});}
    }
    const macros=[...game.macros].filter(m=>m.canExecute&&(m.flags?.[mod.id]?.launcher||String(m.command??'').includes(mod.id)));
    if(!tools.length)for(const m of macros)tools.push({id:mod.id+':macro:'+m.id,label:m.name,open:()=>m.execute()});
    if(tools.length||game.user.isGM)result.push({id:mod.id,title:mod.title,label:mod.id==='sbs-csi'?'Complete Scene Importer (CSI)':mod.title.replace(/^SaltyBananaSlug['’]?s?\s*/i,'').trim(),version:mod.version,tools,macros});
  }
  return sortEntries(result);
}
