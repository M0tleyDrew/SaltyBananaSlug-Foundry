import {MODULE_ID, MODULE_TITLE, builtInMerchantImage} from "./constants.js";
import {getMerchantData, isMerchant} from "./utils.js";
import {syncMerchantJournal, renameMerchantJournal} from "./journal.js";
import {setupSocket} from "./socket.js";
import {openMerchant} from "./apps/merchant-sheet.js";
import {MerchantWizard} from "./apps/wizard.js";
import {MerchantManager} from "./apps/manager.js";
import {primeMerchantAudio} from "./sound.js";
import {setRelation, updateMerchant} from "./merchant-service.js";

Hooks.once("init",()=>{
  console.log(`${MODULE_TITLE} | Initializing`);
  game.settings.register(MODULE_ID,"doubleClickOpen",{name:"Double-click Opens Merchants",hint:"Double-click an SBS merchant token to open its storefront. GMs can Shift+double-click a linked NPC to open its normal Actor sheet.",scope:"world",config:true,type:Boolean,default:true});
  game.settings.register(MODULE_ID,"customMerchantArt",{scope:"world",config:false,type:Object,default:[]});
});

Hooks.once("ready",()=>{
  setupSocket();
  game.sbsMerchants={
    create:()=>new MerchantWizard().render(true),
    manager:()=>new MerchantManager().render(true),
    open:token=>openMerchant(token?.document??token??canvas.tokens.controlled[0]?.document),
    edit:token=>new MerchantWizard(token?.document??token??canvas.tokens.controlled[0]?.document).render(true),
    debugToken:token=>debugMerchantToken(token),
    findByActor:actor=>findMerchantTokensByActor(actor),
    getFavorLevels:token=>{const d=resolveMerchantToken(token);return d?(getMerchantData(d)?.favor?.levels??[]):[];},
    setRelation:async(token,actor,patch={})=>{
      const merchant=resolveMerchantToken(token);
      if(!merchant)throw new Error("SBS merchant not found.");
      const actorId=typeof actor==="string"?(actor.startsWith("Actor.")?actor.split(".").at(-1):actor):(actor?.actor?.id??actor?.id);
      if(!actorId)throw new Error("Customer Actor not found.");
      return setRelation(merchant,actorId,patch);
    },
    version:game.modules.get(MODULE_ID)?.version
  };
  installDoubleClick();
  installCanvasInteractionBridge();
  if(game.user.isGM){ensureLauncherMacros().catch(e=>console.warn(`${MODULE_ID} | macro creation failed`,e));hardenPrivateActors().catch(e=>console.warn(`${MODULE_ID} | ownership hardening failed`,e));migrateBundledMerchantSprites().catch(e=>console.warn(`${MODULE_ID} | sprite migration failed`,e));migrateDefaultFavorNeutral().catch(e=>console.warn(`${MODULE_ID} | default favor migration failed`,e));}
});

Hooks.on("getSceneControlButtons",controls=>{
  if(!game.user.isGM)return;const tools=controls.tokens?.tools;if(!tools)return;
  tools.sbsMerchantCreate={name:"sbsMerchantCreate",title:"Create SBS Merchant",icon:"fa-solid fa-store",order:Object.keys(tools).length,button:true,visible:true,onChange:()=>new MerchantWizard().render(true)};
  tools.sbsMerchantManager={name:"sbsMerchantManager",title:"SBS Merchant Manager",icon:"fa-solid fa-shop-lock",order:Object.keys(tools).length+1,button:true,visible:true,onChange:()=>new MerchantManager().render(true)};
});

function resolveMerchantToken(ref){
  const doc=ref?.document??ref;
  if(doc?.documentName==="Token"&&isMerchant(doc))return doc;
  if(typeof ref==="string"){
    for(const scene of game.scenes??[]){
      const byId=scene.tokens?.get?.(ref);if(byId&&isMerchant(byId))return byId;
      const byUuid=scene.tokens?.find?.(t=>t.uuid===ref);if(byUuid&&isMerchant(byUuid))return byUuid;
    }
  }
  return null;
}

function findMerchantTokensByActor(actorRef){
  const actor=actorRef?.actor??(typeof actorRef==="string"?(game.actors?.get?.(actorRef.startsWith("Actor.")?actorRef.split(".").at(-1):actorRef)??null):actorRef);
  const actorId=actor?.id??(typeof actorRef==="string"&&!actorRef.includes(".")?actorRef:null);
  if(!actorId)return [];
  const out=[];
  for(const scene of game.scenes??[])for(const token of scene.tokens??[]){
    if(!isMerchant(token))continue;
    const d=getMerchantData(token);
    if(token.actorId===actorId||d?.linkedOriginalActorId===actorId||d?.shellActorId===actorId)out.push(token);
  }
  return out;
}

async function syncInventory(actor){if(!game.user.isGM||!actor?.getFlag?.(MODULE_ID,"isInventory"))return;const ref=actor.getFlag(MODULE_ID,"tokenRef"),token=game.scenes.get(ref?.sceneId)?.tokens.get(ref?.tokenId);if(token&&isMerchant(token))await syncMerchantJournal(token);}
Hooks.on("updateActor",actor=>syncInventory(actor).catch(()=>{}));Hooks.on("createItem",item=>syncInventory(item.parent).catch(()=>{}));Hooks.on("updateItem",item=>syncInventory(item.parent).catch(()=>{}));Hooks.on("deleteItem",item=>syncInventory(item.parent).catch(()=>{}));
Hooks.on("updateToken",async(token,changes)=>{if(!game.user.isGM||!isMerchant(token))return;try{if(Object.prototype.hasOwnProperty.call(changes,"name"))await renameMerchantJournal(token);if(Object.prototype.hasOwnProperty.call(changes,"name")||foundry.utils.hasProperty(changes,`flags.${MODULE_ID}`))await syncMerchantJournal(token);}catch(e){console.warn(`${MODULE_ID} | token sync failed`,e);}});
Hooks.on("updateScene",async(scene,changes)=>{if(!game.user.isGM||!Object.prototype.hasOwnProperty.call(changes,"name"))return;for(const t of scene.tokens)if(isMerchant(t)){await renameMerchantJournal(t);await syncMerchantJournal(t);}});
Hooks.on("deleteToken",async token=>{if(!game.user.isGM||!isMerchant(token))return;const d=getMerchantData(token),inv=game.actors.get(d?.inventoryActorId);if(inv)await inv.setFlag(MODULE_ID,"orphanedFrom",{sceneId:token.parent?.id,sceneName:token.parent?.name,tokenName:token.name,deletedAt:new Date().toISOString()});ui.notifications.info(`${token.name}'s merchant inventory and ledger journal were preserved.`);});

async function ensureLauncherMacros(){let folder=game.folders.find(f=>f.type==="Macro"&&f.name==="SBS Merchants");if(!folder)folder=await Folder.create({name:"SBS Merchants",type:"Macro"});const defs=[{flag:"creator",name:"SBS Merchant Creator",command:"game.sbsMerchants.create();",img:`modules/${MODULE_ID}/assets/logo.png`},{flag:"manager",name:"SBS Merchant Manager",command:"game.sbsMerchants.manager();",img:`modules/${MODULE_ID}/assets/logo.png`}];for(const d of defs){let m=game.macros.find(x=>x.getFlag?.(MODULE_ID,"launcher")===d.flag);if(!m)m=await Macro.create({name:d.name,type:"script",command:d.command,img:d.img,folder:folder.id,flags:{[MODULE_ID]:{launcher:d.flag}}});else{const u={};if(m.name!==d.name)u.name=d.name;if(m.command!==d.command)u.command=d.command;if(m.img!==d.img)u.img=d.img;if(Object.keys(u).length)await m.update(u);}}}

async function migrateBundledMerchantSprites(){
  let changed=0;
  for(const scene of game.scenes??[]){for(const token of scene.tokens??[]){
    if(!isMerchant(token))continue;const data=getMerchantData(token);if(!data||data.tokenMode==="linked"||data.customImage)continue;
    const current=String(data.tokenImage||token.texture?.src||"");
    if(!/\/assets\/merchants\//i.test(current))continue;
    const next=foundry.utils.deepClone(data);next.presentation=next.presentation||"androgynous";next.tokenImage=builtInMerchantImage(next.species,next.merchantStyle,next.presentation);
    await updateMerchant(token,next);changed++;
  }}
  if(changed)console.log(`${MODULE_TITLE} | Migrated ${changed} generated merchant token(s) to v0.1.4 sprites.`);
}
async function hardenPrivateActors(){for(const a of game.actors){if(!a.getFlag(MODULE_ID,"isInventory")&&!a.getFlag(MODULE_ID,"isShell"))continue;const extra=Object.keys(a.ownership??{}).some(k=>k!=="default")||Number(a.ownership?.default)!==CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;if(extra)await a.update({ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE}});}}

function debugMerchantToken(token=null){
  const obj=token?.document?token:(token?canvas?.tokens?.get?.(token.id??token):null)??canvas?.tokens?.hover??canvas?.tokens?.controlled?.[0]??null;
  if(!obj||!isMerchant(obj.document)){ui.notifications.warn("Hover an SBS merchant token, then run game.sbsMerchants.debugToken().");return null;}
  const d=obj.document,mesh=obj.mesh,tex=mesh?.texture??obj.texture;
  const info={
    user:game.user?.name,userIsGM:game.user?.isGM,token:d.name,tokenId:d.id,
    document:{width:d.width,height:d.height,ringEnabled:d.ring?.enabled,scaleX:d.texture?.scaleX,scaleY:d.texture?.scaleY,src:d.texture?.src},
    placeable:{w:obj.w,h:obj.h,x:obj.x,y:obj.y},
    mesh:{width:mesh?.width,height:mesh?.height,x:mesh?.position?.x,y:mesh?.position?.y,scaleX:mesh?.scale?.x,scaleY:mesh?.scale?.y,anchorX:mesh?.anchor?.x,anchorY:mesh?.anchor?.y},
    texture:{width:tex?.width,height:tex?.height,origWidth:tex?.orig?.width,origHeight:tex?.orig?.height,baseWidth:tex?.baseTexture?.width,baseHeight:tex?.baseTexture?.height}
  };
  console.table({document:info.document,placeable:info.placeable,mesh:info.mesh,texture:info.texture});console.log(`${MODULE_TITLE} token debug`,info);
  ui.notifications.info("Merchant token debug written to the console.");return info;
}

const recentMerchantOpens=new Map();
async function openMerchantOnce(tokenDoc){
  if(!tokenDoc||!isMerchant(tokenDoc))return false;
  const key=tokenDoc.uuid??`${tokenDoc.parent?.id}.${tokenDoc.id}`;
  const now=Date.now(),last=recentMerchantOpens.get(key)??0;
  if(now-last<350)return true;
  recentMerchantOpens.set(key,now);
  try{await openMerchant(tokenDoc);return true;}
  catch(e){console.error(`${MODULE_ID} | open failed`,e);return false;}
  finally{setTimeout(()=>{if(recentMerchantOpens.get(key)===now)recentMerchantOpens.delete(key);},500);}
}

function merchantAtPointer(event){
  const hover=canvas?.tokens?.hover??canvas?.tokens?.placeables?.find?.(t=>t?.hover);
  if(hover&&isMerchant(hover.document))return hover.document;
  const view=canvas?.app?.view??canvas?.app?.canvas;
  if(!view||!canvas?.stage?.worldTransform?.applyInverse)return null;
  const rect=view.getBoundingClientRect?.();if(!rect)return null;
  const sx=Number.isFinite(event?.offsetX)?event.offsetX:(Number(event?.clientX)-rect.left);
  const sy=Number.isFinite(event?.offsetY)?event.offsetY:(Number(event?.clientY)-rect.top);
  if(!Number.isFinite(sx)||!Number.isFinite(sy))return null;
  let world;try{world=canvas.stage.worldTransform.applyInverse({x:sx,y:sy});}catch(_){return null;}
  const grid=Number(canvas?.grid?.size??canvas?.scene?.grid?.size??100)||100;
  const matches=(canvas?.tokens?.placeables??[]).filter(t=>{
    const d=t?.document;if(!isMerchant(d)||d.hidden)return false;
    const x=Number(d.x??0),y=Number(d.y??0),w=Math.max(1,Number(d.width??1))*grid,h=Math.max(1,Number(d.height??1))*grid;
    return world.x>=x&&world.x<=x+w&&world.y>=y&&world.y<=y+h;
  });
  return matches.at(-1)?.document??null;
}

function installDoubleClick(){
  if(!game.settings.get(MODULE_ID,"doubleClickOpen"))return;
  const intercept=async function(wrapped,...args){
    const doc=this?.document;if(!isMerchant(doc))return wrapped(...args);
    const evt=args[0],original=evt?.data?.originalEvent??evt;
    primeMerchantAudio();
    if(game.user.isGM&&original?.shiftKey)return wrapped(...args);
    evt?.stopPropagation?.();original?.preventDefault?.();
    await openMerchantOnce(doc);
    // SBS owns normal double-click for a merchant. Never forward into the shell
    // or linked NPC Actor sheet unless the GM explicitly Shift+double-clicks.
    return;
  };
  if(globalThis.libWrapper?.register){
    try{libWrapper.register(MODULE_ID,"Token.prototype._onClickLeft2",intercept,"MIXED");return;}
    catch(e){console.warn(`${MODULE_ID} | libWrapper token double-click failed`,e);}
  }
  const prior=Token.prototype._onClickLeft2;
  Token.prototype._onClickLeft2=async function(...args){return intercept.call(this,prior.bind(this),...args);};
}

let boundCanvasView=null;
let canvasDblClickHandler=null;
let canvasPointerHandler=null;
let lastMerchantPointer={key:null,time:0};
function installCanvasInteractionBridge(){
  if(!game.settings.get(MODULE_ID,"doubleClickOpen"))return;

  const bindDom=()=>{
    const view=canvas?.app?.view??canvas?.app?.canvas;if(!view?.addEventListener)return;
    if(boundCanvasView===view&&canvasDblClickHandler)return;
    if(boundCanvasView&&canvasDblClickHandler)boundCanvasView.removeEventListener("dblclick",canvasDblClickHandler,true);
    if(boundCanvasView&&canvasPointerHandler)boundCanvasView.removeEventListener("pointerdown",canvasPointerHandler,true);
    canvasDblClickHandler=event=>{
      const tokenDoc=merchantAtPointer(event);if(!tokenDoc)return;
      primeMerchantAudio();
      // Preserve the explicit GM escape hatch for opening an existing linked NPC.
      if(game.user.isGM&&event.shiftKey)return;
      event.preventDefault?.();event.stopPropagation?.();event.stopImmediatePropagation?.();
      openMerchantOnce(tokenDoc).catch(e=>console.error(`${MODULE_ID} | canvas merchant open failed`,e));
    };
    canvasPointerHandler=event=>{
      if(event.button!==0)return;
      const tokenDoc=merchantAtPointer(event);if(!tokenDoc)return;
      primeMerchantAudio();
      const key=tokenDoc.uuid??tokenDoc.id,now=Date.now();
      const isSecond=lastMerchantPointer.key===key&&(now-lastMerchantPointer.time)<=450;
      lastMerchantPointer={key,time:now};
      if(!isSecond)return;
      if(game.user.isGM&&event.shiftKey)return;
      event.preventDefault?.();event.stopPropagation?.();event.stopImmediatePropagation?.();
      openMerchantOnce(tokenDoc).catch(e=>console.error(`${MODULE_ID} | pointer merchant open failed`,e));
    };
    view.addEventListener("pointerdown",canvasPointerHandler,true);
    view.addEventListener("dblclick",canvasDblClickHandler,true);
    boundCanvasView=view;
  };

  // Foundry can replace the canvas element while changing scenes, so rebind each
  // time the canvas is ready. The browser-level bridge is intentional: it gives
  // unowned GM-shell tokens the same double-click UX as owned tokens.
  Hooks.on("canvasReady",bindDom);if(canvas?.ready)bindDom();

  // Secondary Foundry-layer fallback for clients/browsers that do not emit a
  // DOM dblclick to the canvas element in the expected way.
  const layerIntercept=async function(wrapped,...args){
    const event=args[0],original=event?.data?.originalEvent??event;
    const doc=merchantAtPointer(original);if(!doc)return wrapped(...args);
    if(game.user.isGM&&original?.shiftKey)return wrapped(...args);
    event?.stopPropagation?.();original?.preventDefault?.();await openMerchantOnce(doc);return;
  };
  if(globalThis.libWrapper?.register){
    try{libWrapper.register(MODULE_ID,"TokenLayer.prototype._onClickLeft2",layerIntercept,"MIXED");return;}
    catch(e){console.warn(`${MODULE_ID} | libWrapper TokenLayer double-click bridge failed`,e);}
  }
  const Layer=globalThis.TokenLayer??foundry?.canvas?.layers?.TokenLayer;
  if(Layer?.prototype?._onClickLeft2){const prior=Layer.prototype._onClickLeft2;Layer.prototype._onClickLeft2=async function(...args){return layerIntercept.call(this,prior.bind(this),...args);};}
}

async function migrateDefaultFavorNeutral(){
  let changed=0;
  for(const scene of game.scenes??[]){for(const token of scene.tokens??[]){
    if(!isMerchant(token))continue; const data=getMerchantData(token); if(!data) continue;
    const inv=game.actors.get(data.inventoryActorId); if(!inv) continue;
    const cfg=foundry.utils.deepClone(inv.getFlag(MODULE_ID,"config")??{});
    cfg.favor??={levels:[],defaultLevelId:"",relations:{}};
    if(cfg.favor.defaultLevelId) continue;
    cfg.favor.defaultLevelId="neutral";
    await inv.setFlag(MODULE_ID,"config", cfg);
    changed++;
  }}
  if(changed) console.log(`${MODULE_TITLE} | Set neutral as the default favor level for ${changed} merchant(s).`);
}
