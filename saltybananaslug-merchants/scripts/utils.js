import {COINS, COIN_CP, INVENTORY_FOLDER, JOURNAL_ROOT_FOLDER, MODULE_ID, SHELL_FOLDER} from "./constants.js";

export function deepClone(v){return foundry.utils.deepClone(v);}
export function mergeConfig(base,extra){return foundry.utils.mergeObject(deepClone(base),extra??{},{inplace:false,recursive:true});}
export function isMerchant(doc){return Boolean(doc?.getFlag?.(MODULE_ID,"merchant")?.isMerchant);}
export function getMerchantPublicData(doc){return doc?.getFlag?.(MODULE_ID,"merchant")??null;}
export function getMerchantData(doc){
  const pub=getMerchantPublicData(doc);if(!pub)return null;
  if(!globalThis.game?.user?.isGM)return pub;
  const inv=globalThis.game?.actors?.get?.(pub.inventoryActorId);
  const privateCfg=inv?.getFlag?.(MODULE_ID,"config");
  if(!privateCfg)return pub;
  return foundry.utils.mergeObject(deepClone(privateCfg),deepClone(pub),{inplace:false,recursive:true});
}
export function activeGM(){return game.users?.activeGM ?? game.users?.find(u=>u.active&&u.isGM) ?? null;}
export function escapeHtml(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));}
export function notifyError(err,prefix="Merchant error"){console.error(`${MODULE_ID} | ${prefix}`,err);ui.notifications.error(`${prefix}: ${err?.message??err}`);}
export function quantityOf(item){const q=Number(foundry.utils.getProperty(item,"system.quantity"));return Number.isFinite(q)&&q>=0?q:1;}
export function setQuantity(data,q){foundry.utils.setProperty(data,"system.quantity",Math.max(0,Number(q)||0));return data;}
export function isInventoryActor(actor){return Boolean(actor?.getFlag?.(MODULE_ID,"isInventory"));}
export function isShellActor(actor){return Boolean(actor?.getFlag?.(MODULE_ID,"isShell"));}
export function userOwnsActor(user,actor){if(!user||!actor)return false;if(user.isGM)return true;return actor.testUserPermission(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);}

export async function ensureFolder(name,type,parentId=null){
  const existing=game.folders.find(f=>f.type===type&&f.name===name&&(f.folder?.id??f.folder??null)===parentId);
  if(existing)return existing;
  return Folder.create({name,type,folder:parentId});
}
export const inventoryFolder=()=>ensureFolder(INVENTORY_FOLDER,"Actor");
export const shellFolder=()=>ensureFolder(SHELL_FOLDER,"Actor");
export async function journalSceneFolder(sceneName){const root=await ensureFolder(JOURNAL_ROOT_FOLDER,"JournalEntry");return ensureFolder(sceneName||"Unknown Scene","JournalEntry",root.id);}
export function uniqueJournalName(base,excludeId=null){const names=new Set(game.journal.filter(j=>j.id!==excludeId).map(j=>j.name));if(!names.has(base))return base;let n=2;while(names.has(`${base} ${n}`))n++;return `${base} ${n}`;}

export function currencyOf(actor){const c=actor?.system?.currency??{};return Object.fromEntries(COINS.map(k=>[k,Math.max(0,Number(c[k]??0)||0)]));}
export function currencyToCopper(currency={}){return COINS.reduce((sum,k)=>sum+(Math.max(0,Number(currency[k]??0)||0)*COIN_CP[k]),0);}
export function copperToCurrency(cp){
  let n=Math.max(0,Math.floor(Number(cp)||0)); const out={cp:0,sp:0,ep:0,gp:0,pp:0};
  for(const k of ["pp","gp","sp","cp"]){out[k]=Math.floor(n/COIN_CP[k]);n-=out[k]*COIN_CP[k];}
  return out;
}
export async function setActorCurrency(actor,currency={}){const next=Object.fromEntries(COINS.map(k=>[k,Math.max(0,Math.floor(Number(currency[k]??0)||0))]));await actor.update(Object.fromEntries(COINS.map(k=>[`system.currency.${k}`,next[k]])));return next;}
export async function setActorCopper(actor,totalCp){return setActorCurrency(actor,copperToCurrency(totalCp));}

/**
 * Add value without touching any coins the Actor already owns.
 * Only the newly-added value is broken into normal denominations.
 */
export async function addActorCopper(actor,amountCp){
  const add=Math.max(0,Math.floor(Number(amountCp)||0));if(!add)return currencyOf(actor);
  const current=currencyOf(actor),delta=copperToCurrency(add),next={...current};
  for(const k of COINS)next[k]=(next[k]??0)+(delta[k]??0);
  return setActorCurrency(actor,next);
}

/**
 * Spend value while preserving the Actor's existing denominations whenever possible.
 * Exact coins are removed first. A higher-value coin is only broken when change is required.
 */
export async function spendActorCopper(actor,amountCp){
  const amount=Math.max(0,Math.floor(Number(amountCp)||0));const current=currencyOf(actor);
  const total=currencyToCopper(current);if(total<amount)throw new Error(`Not enough currency: need ${formatCopper(amount)}, have ${formatCopper(total)}.`);
  if(!amount)return current;
  const next={...current};let remaining=amount;
  for(const k of ["pp","gp","ep","sp","cp"]){
    const value=COIN_CP[k];if(value>remaining)continue;
    const use=Math.min(next[k]??0,Math.floor(remaining/value));if(!use)continue;
    next[k]-=use;remaining-=use*value;
  }
  if(remaining>0){
    const breakCoin=["sp","ep","gp","pp"].find(k=>(next[k]??0)>0&&COIN_CP[k]>remaining);
    if(!breakCoin)throw new Error(`Could not make exact change for ${formatCopper(amount)}.`);
    next[breakCoin]-=1;
    const change=copperToCurrency(COIN_CP[breakCoin]-remaining);
    for(const k of COINS)next[k]=(next[k]??0)+(change[k]??0);
    remaining=0;
  }
  return setActorCurrency(actor,next);
}
export function formatCopper(cp){const c=copperToCurrency(cp);const parts=["pp","gp","ep","sp","cp"].filter(k=>c[k]).map(k=>`${c[k]} ${k}`);return parts.join(", ")||"0 cp";}

export function tokenCenter(tokenDoc){const size=canvas?.grid?.size??tokenDoc.parent?.grid?.size??100;return{x:Number(tokenDoc.x??0)+Number(tokenDoc.width??1)*size/2,y:Number(tokenDoc.y??0)+Number(tokenDoc.height??1)*size/2};}
export function distanceBetweenTokens(a,b){if(!a||!b||a.parent?.id!==b.parent?.id)return Infinity;const ca=tokenCenter(a),cb=tokenCenter(b);const pixels=Math.hypot(ca.x-cb.x,ca.y-cb.y);const gridSize=canvas?.grid?.size??a.parent?.grid?.size??100;const gridDistance=a.parent?.grid?.distance??5;return(pixels/gridSize)*gridDistance;}
export function actorTokenOnScene(actor,scene){if(!actor||!scene)return null;const controlled=canvas?.tokens?.controlled?.find(t=>t.actor?.id===actor.id)?.document;if(controlled)return controlled;return scene.tokens.find(t=>t.actorId===actor.id)??null;}

export function preferredActor(){
  const controlled=canvas?.tokens?.controlled?.map(t=>t.actor).find(a=>a&&a.type==="character"&&userOwnsActor(game.user,a)&&!isInventoryActor(a)&&!isShellActor(a));
  if(controlled)return controlled;
  if(game.user.character&&userOwnsActor(game.user,game.user.character))return game.user.character;
  return game.actors.find(a=>a.type==="character"&&userOwnsActor(game.user,a)&&!isInventoryActor(a)&&!isShellActor(a))??null;
}

export function stackKey(item){
  const data=deepClone(item?.toObject?item.toObject():item??{});delete data._id;delete data.folder;delete data.sort;delete data.ownership;
  if(data._stats){delete data._stats.modifiedTime;delete data._stats.lastModifiedBy;}
  if(data.flags?.[MODULE_ID]) delete data.flags[MODULE_ID];
  if(data.system&&Object.prototype.hasOwnProperty.call(data.system,"quantity"))data.system.quantity=1;
  return JSON.stringify(data);
}

export function getItemPrice(item){
  const p=foundry.utils.getProperty(item,"system.price")??{};
  if(typeof p==="number")return Math.max(0,p*100);
  const value=Math.max(0,Number(p.value??0)||0);const denomination=String(p.denomination??"gp").toLowerCase();return Math.round(value*(COIN_CP[denomination]??100));
}

export function itemIdentification(item){const v=foundry.utils.getProperty(item,"system.identified");return{supported:v!==undefined&&v!==null,identified:v!==false};}
export function publicItemName(item){const ident=itemIdentification(item);if(!ident.supported||ident.identified)return item.name;return String(foundry.utils.getProperty(item,"system.unidentified.name")??"").trim()||"Unidentified Item";}
export function publicItemImage(item){const ident=itemIdentification(item);if(!ident.supported||ident.identified)return item.img??"icons/svg/item-bag.svg";return String(foundry.utils.getProperty(item,"system.unidentified.img")??"").trim()||"icons/svg/mystery-man.svg";}
