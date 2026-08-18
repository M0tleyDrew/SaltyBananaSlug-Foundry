import {COINS, DEFAULT_CONFIG, MODULE_ID, SHOP_TYPES, TOKEN_TINTS, builtInMerchantImage} from "./constants.js";
import {actorTokenOnScene, addActorCopper, currencyOf, currencyToCopper, deepClone, distanceBetweenTokens, formatCopper, getItemPrice, getMerchantData, inventoryFolder, isMerchant, itemIdentification, mergeConfig, preferredActor, publicItemImage, publicItemName, quantityOf, setActorCopper, setActorCurrency, setQuantity, shellFolder, spendActorCopper, stackKey, userOwnsActor} from "./utils.js";
import {effectiveRates, itemVisibleForCustomer, merchantAcceptsItem, priceForCustomer, stockSettings} from "./pricing.js";
import {createMerchantJournal, renameMerchantJournal, syncMerchantJournal, syncMerchantJournalOwnership} from "./journal.js";
import {parseJournal, previewRollTable, stageItem, stageJournal, stageRollTable} from "./importers.js";

const operationTails=new Map();
async function withMerchantOperation(tokenDoc,fn){const key=tokenDoc?.uuid??tokenDoc?.id;if(!key)return fn();const previous=operationTails.get(key)??Promise.resolve();let release;const gate=new Promise(r=>release=r);const tail=previous.catch(()=>{}).then(()=>gate);operationTails.set(key,tail);await previous.catch(()=>{});try{return await fn();}finally{release();if(operationTails.get(key)===tail)operationTails.delete(key);}}


function merchantChangeSummary(old,next){
  const changes=[];
  const add=(label,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))changes.push(`${label}: ${String(a??"—")} → ${String(b??"—")}`);};
  add("Name",old?.name,next?.name);add("Status",old?.status,next?.status);
  add("Shop type",old?.customShopType||old?.shopType,next?.customShopType||next?.shopType);
  add("Interaction distance",old?.interactionDistance,next?.interactionDistance);
  add("Customer purchase rate",old?.pricing?.sellRate,next?.pricing?.sellRate);
  add("Merchant buyback rate",old?.pricing?.buyRate,next?.pricing?.buyRate);
  add("Rounding",old?.pricing?.rounding,next?.pricing?.rounding);
  add("Default favor",old?.favor?.defaultLevelId||"Merchant Default",next?.favor?.defaultLevelId||"Merchant Default");
  if(JSON.stringify(old?.favor?.levels??[])!==JSON.stringify(next?.favor?.levels??[]))changes.push("Favor levels changed");
  if(JSON.stringify(old?.favor?.relations??{})!==JSON.stringify(next?.favor?.relations??{}))changes.push("Character favor/pricing relationships changed");
  if(JSON.stringify(old?.buyingRules??{})!==JSON.stringify(next?.buyingRules??{}))changes.push("Merchant buying rules changed");
  add("Maximum buying funds",old?.treasury?.maxFundsCp,next?.treasury?.maxFundsCp);
  add("Unlimited buying funds",old?.treasury?.unlimited,next?.treasury?.unlimited);
  if(JSON.stringify(old?.sound??{})!==JSON.stringify(next?.sound??{}))changes.push("Greeting sound settings changed");
  if(JSON.stringify(old?.journal??{})!==JSON.stringify(next?.journal??{}))changes.push("Journal visibility settings changed");
  if(JSON.stringify(old?.restock??{})!==JSON.stringify(next?.restock??{}))changes.push("Restock settings changed");
  if(old?.tokenColor!==next?.tokenColor||old?.species!==next?.species||old?.merchantStyle!==next?.merchantStyle||old?.customImage!==next?.customImage)changes.push("Merchant token appearance changed");
  return changes;
}

function stockChangeSummary(item,before,next,patch){
  const parts=[];
  if(patch.quantity!==undefined)parts.push(`quantity ${quantityOf(item)} → ${Math.max(0,Number(patch.quantity)||0)}`);
  if(before.infinite!==next.infinite)parts.push(`infinite ${before.infinite?"on":"off"} → ${next.infinite?"on":"off"}`);
  if(before.visible!==next.visible)parts.push(`player visibility ${before.visible?"on":"off"} → ${next.visible?"on":"off"}`);
  if(before.allowZero!==next.allowZero)parts.push(`zero-value sale ${before.allowZero?"on":"off"} → ${next.allowZero?"on":"off"}`);
  if(before.customSellCp!==next.customSellCp)parts.push(`custom customer price ${before.customSellCp??"default"} → ${next.customSellCp??"default"} cp`);
  if(before.ignoreFavor!==next.ignoreFavor)parts.push(`ignore favor ${before.ignoreFavor?"on":"off"} → ${next.ignoreFavor?"on":"off"}`);
  if(before.favorRequired!==next.favorRequired)parts.push(`favor gate ${before.favorRequired||"none"} → ${next.favorRequired||"none"}`);
  if(before.maxPerCustomer!==next.maxPerCustomer)parts.push(`per-purchase max ${before.maxPerCustomer||"none"} → ${next.maxPerCustomer||"none"}`);
  return parts;
}

function privateData(actor){return deepClone(actor?.getFlag?.(MODULE_ID,"private")??{ledger:[],initialStock:[]});}
export async function appendLedger(actor,text,kind="change",meta={}){if(!actor)return;const p=privateData(actor);p.ledger??=[];p.ledger.push({when:new Date().toLocaleString(),iso:new Date().toISOString(),kind,text,meta});if(p.ledger.length>2000)p.ledger=p.ledger.slice(-2000);await actor.setFlag(MODULE_ID,"private",p);const ref=actor.getFlag(MODULE_ID,"tokenRef");const token=game.scenes.get(ref?.sceneId)?.tokens.get(ref?.tokenId);if(token&&isMerchant(token))await syncMerchantJournal(token);}

function sanitizeStagedItem(data,source="creation"){
  const d=deepClone(data);delete d._id;d.flags??={};d.flags[MODULE_ID]??={};const old=d.flags[MODULE_ID].stock??{};const zero=getItemPrice(d)===0;
  d.flags[MODULE_ID].stock={infinite:Boolean(old.infinite),visible:old.visible!==undefined?Boolean(old.visible):!zero,allowZero:Boolean(old.allowZero),customSellCp:old.customSellCp??null,customBuyCp:old.customBuyCp??null,ignoreFavor:Boolean(old.ignoreFavor),favorRequired:String(old.favorRequired??""),maxPerCustomer:Math.max(0,Number(old.maxPerCustomer??0)||0),resell:old.resell!==false,source:String(old.source??source)};
  return d;
}

function merchantPrivateConfig(cfg){const d=deepClone(cfg);delete d.inventory;return d;}
async function saveMerchantConfig(inventory,cfg){if(inventory)await inventory.setFlag(MODULE_ID,"config",merchantPrivateConfig(cfg));}

async function createInventoryActor(cfg){
  const folder=await inventoryFolder();const actor=await Actor.create({name:`[Merchant Inventory] ${cfg.name}`,type:"npc",img:cfg.tokenImage||cfg.customImage||builtInMerchantImage(cfg.species,cfg.merchantStyle,cfg.presentation),folder:folder.id,ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},flags:{[MODULE_ID]:{isInventory:true,merchantId:cfg.merchantId,config:merchantPrivateConfig(cfg),private:{ledger:[],initialStock:[]}}}});
  const staged=(cfg.inventory??[]).map(x=>sanitizeStagedItem(x));if(staged.length)await actor.createEmbeddedDocuments("Item",staged);
  const cur=cfg.treasury?.currency??{};const updates={};for(const c of COINS)updates[`system.currency.${c}`]=Math.max(0,Number(cur[c]??0)||0);await actor.update(updates);
  const p=privateData(actor);p.initialStock=(actor.items?.contents??[]).map(i=>({itemId:i.id,name:i.name,quantity:quantityOf(i),infinite:stockSettings(i).infinite}));await actor.setFlag(MODULE_ID,"private",p);
  return actor;
}

async function createShellActor(cfg,inventory){const folder=await shellFolder();const img=cfg.customImage||cfg.tokenImage||builtInMerchantImage(cfg.species,cfg.merchantStyle,cfg.presentation);return Actor.create({name:`[Merchant Shell] ${cfg.name}`,type:"npc",img,prototypeToken:{texture:{src:img,scaleX:1,scaleY:1},width:1,height:1,ring:{enabled:false}},folder:folder.id,ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},flags:{[MODULE_ID]:{isShell:true,merchantId:cfg.merchantId,inventoryActorId:inventory.id}}});}

function publicMerchantData(cfg,inventoryId,shellId=null){
  return {
    isMerchant:true,merchantId:cfg.merchantId,name:cfg.name,
    shopType:cfg.shopType,customShopType:cfg.customShopType??"",
    shopTypeLabel:cfg.shopType==="custom"?(cfg.customShopType||"Custom"):(SHOP_TYPES[cfg.shopType]??cfg.shopType),
    description:cfg.description??"",status:cfg.status??"open",tokenMode:cfg.tokenMode??"generated",
    inventoryActorId:inventoryId,shellActorId:shellId,journalId:cfg.journalId??null,createdAt:cfg.createdAt??new Date().toISOString()
  };
}

export async function createMerchant(config={},opts={}){
  if(!game.user.isGM)throw new Error("Only the GM client can create merchant documents.");
  const cfg=mergeConfig(DEFAULT_CONFIG,config);cfg.merchantId=cfg.merchantId||foundry.utils.randomID();cfg.name=String(cfg.name||"Merchant").trim()||"Merchant";
  const inventory=await createInventoryActor(cfg);let tokenDoc=null,shell=null;
  if(cfg.tokenMode==="linked"){
    tokenDoc=opts.linkToken??(cfg.linkedTokenUuid?await fromUuid(cfg.linkedTokenUuid):null);if(tokenDoc?.documentName!=="Token")throw new Error("Select an existing scene token to link as this merchant.");if(isMerchant(tokenDoc))throw new Error("That token is already an SBS Merchant.");
    const data=publicMerchantData(cfg,inventory.id,null);data.linkedOriginalActorId=tokenDoc.actorId;data.linkedOriginalName=tokenDoc.name;await tokenDoc.setFlag(MODULE_ID,"merchant",data);
  }else{
    const scene=opts.scene??canvas.scene;if(!scene)throw new Error("Open a scene before placing a merchant.");shell=await createShellActor(cfg,inventory);const img=cfg.customImage||cfg.tokenImage||builtInMerchantImage(cfg.species,cfg.merchantStyle,cfg.presentation);const tint=TOKEN_TINTS[cfg.tokenColor]??null;
    const [created]=await scene.createEmbeddedDocuments("Token",[{name:cfg.name,actorId:shell.id,actorLink:false,x:Number(opts.x??0),y:Number(opts.y??0),width:1,height:1,disposition:CONST.TOKEN_DISPOSITIONS?.NEUTRAL??0,displayName:CONST.TOKEN_DISPLAY_MODES?.HOVER??20,ring:{enabled:false},texture:{src:img,tint,scaleX:1,scaleY:1},flags:{[MODULE_ID]:{merchant:publicMerchantData(cfg,inventory.id,shell.id)}}}]);tokenDoc=created;
  }
  await inventory.setFlag(MODULE_ID,"tokenRef",{sceneId:tokenDoc.parent?.id,tokenId:tokenDoc.id});if(shell)await shell.setFlag(MODULE_ID,"tokenRef",{sceneId:tokenDoc.parent?.id,tokenId:tokenDoc.id});
  const data=getMerchantData(tokenDoc);const journal=await createMerchantJournal(tokenDoc,inventory,data);const next=deepClone(data);next.journalId=journal.id;await saveMerchantConfig(inventory,next);await tokenDoc.setFlag(MODULE_ID,"merchant",publicMerchantData(next,inventory.id,shell?.id??null));await appendLedger(inventory,`Merchant created by ${game.user.name}.`,"create");await syncMerchantJournal(tokenDoc);return tokenDoc;
}

export async function updateMerchant(tokenDoc,config={}){
  if(!game.user.isGM)throw new Error("GM only.");const old=getMerchantData(tokenDoc);if(!old)throw new Error("Not an SBS Merchant.");const next=mergeConfig(old,config);next.isMerchant=true;next.inventoryActorId=old.inventoryActorId;next.shellActorId=old.shellActorId;next.journalId=old.journalId;next.merchantId=old.merchantId;delete next.inventory;
  if(old.tokenMode==="generated"&&next.tokenMode!=="linked"){
    const img=next.customImage||next.tokenImage||builtInMerchantImage(next.species,next.merchantStyle,next.presentation);await tokenDoc.update({name:next.name,width:1,height:1,ring:{enabled:false},texture:{src:img,tint:TOKEN_TINTS[next.tokenColor]??null,scaleX:1,scaleY:1}});const shell=game.actors.get(old.shellActorId);if(shell)await shell.update({name:`[Merchant Shell] ${next.name}`,img,prototypeToken:{texture:{src:img,scaleX:1,scaleY:1},width:1,height:1,ring:{enabled:false}}});
  }else await tokenDoc.update({name:next.name});
  const inv=game.actors.get(old.inventoryActorId);if(inv){await saveMerchantConfig(inv,next);await inv.update({name:`[Merchant Inventory] ${next.name}`});}await tokenDoc.setFlag(MODULE_ID,"merchant",publicMerchantData(next,old.inventoryActorId,old.shellActorId));if(inv){const changes=merchantChangeSummary(old,next);await appendLedger(inv,`${game.user.name} updated merchant settings${changes.length?`: ${changes.join("; ")}`:"."}`,"settings");}
  await renameMerchantJournal(tokenDoc);await syncMerchantJournalOwnership(tokenDoc);await syncMerchantJournal(tokenDoc);return tokenDoc;
}

export function validateInteraction(tokenDoc,user=game.user,actor=null){const data=getMerchantData(tokenDoc);if(!data)throw new Error("This is not an SBS Merchant.");if(user.isGM)return data;if(data.status!=="open")throw new Error(`${tokenDoc.name} is currently closed.`);if(!actor||!userOwnsActor(user,actor))throw new Error("Choose a character you own to shop with.");const distance=Number(data.interactionDistance??0);if(distance>0){const at=actorTokenOnScene(actor,tokenDoc.parent);if(!at)throw new Error("Your character must have a token on this scene to use this merchant.");const d=distanceBetweenTokens(at,tokenDoc);if(d>distance)throw new Error(`Move within ${distance} ft of the merchant.`);}return data;}

export function merchantSnapshot(tokenDoc,user=game.user,actor=preferredActor()){
  const data=validateInteraction(tokenDoc,user,actor);const inv=game.actors.get(data.inventoryActorId);if(!inv)throw new Error("Merchant inventory is missing.");const rates=effectiveRates(data,actor);
  const items=(inv.items?.contents??[]).filter(i=>itemVisibleForCustomer(i,data,actor)).map(i=>{const s=stockSettings(i),q=quantityOf(i),priceCp=priceForCustomer(i,data,actor,"sell");return{id:i.id,name:publicItemName(i),img:publicItemImage(i),type:i.type,quantity:s.infinite?"X":q,infinite:s.infinite,inStock:s.infinite||q>0,priceCp,priceText:formatCopper(priceCp),basePriceCp:getItemPrice(i),favorRequired:s.favorRequired,maxPerCustomer:s.maxPerCustomer,identified:itemIdentification(i).identified};});
  return{name:tokenDoc.name,description:data.description,status:data.status,shopType:data.shopTypeLabel||data.shopType,rates,items,sound:deepClone(data.sound??{}),buyingRules:deepClone(data.buyingRules??{})};
}

async function addItemToActor(actor,itemOrData,qty=1,stockOverrides={},options={}){
  const source=itemOrData?.toObject?itemOrData.toObject():deepClone(itemOrData);delete source._id;if(options.stripMerchantFlags&&source.flags?.[MODULE_ID])delete source.flags[MODULE_ID];const existing=(actor.items?.contents??[]).find(i=>stackKey(i)===stackKey(source));
  if(existing){const newQty=quantityOf(existing)+qty;await existing.update({"system.quantity":newQty});if(Object.keys(stockOverrides).length)await existing.setFlag(MODULE_ID,"stock",{...stockSettings(existing),...stockOverrides});return existing;}
  setQuantity(source,qty);source.flags??={};source.flags[MODULE_ID]??={};const zero=getItemPrice(source)===0;source.flags[MODULE_ID].stock={infinite:false,visible:!zero,allowZero:false,customSellCp:null,customBuyCp:null,ignoreFavor:false,favorRequired:"",maxPerCustomer:0,resell:true,source:"transaction",...(source.flags[MODULE_ID].stock??{}),...stockOverrides};const [created]=await actor.createEmbeddedDocuments("Item",[source]);return created;
}

async function removeActorItem(actor,item,qty){const q=quantityOf(item),n=Math.max(0,q-qty);if(n<=0)await actor.deleteEmbeddedDocuments("Item",[item.id]);else await item.update({"system.quantity":n});}

export async function addGMItem(tokenDoc,item,qty=1,{source="GM drag"}={}){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");const added=await addItemToActor(inv,item,qty,{source});await appendLedger(inv,`${game.user.name} added ${item.name} ×${qty} (${source}).`,"stock");await syncMerchantJournal(tokenDoc);return added;}

export async function importJournalToMerchant(tokenDoc,journalDoc){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");const staged=await stageJournal(journalDoc,game.user);for(const d of staged.items)await addItemToActor(inv,d,quantityOf(d),{source:`Journal: ${staged.sourceName}`});const cp=currencyToCopper(staged.currency);if(cp>0)await addActorCopper(inv,cp);await appendLedger(inv,`${game.user.name} imported ${staged.items.length} linked item entries${cp?` and ${formatCopper(cp)}`:""} from journal “${staged.sourceName}”.`,"import");await syncMerchantJournal(tokenDoc);return staged;}

export async function importTableToMerchant(tokenDoc,table,opts={}){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");const staged=await stageRollTable(table,opts);for(const d of staged.items)await addItemToActor(inv,d,quantityOf(d),{source:`RollTable: ${table.name}`});await appendLedger(inv,`${game.user.name} imported ${staged.items.length} item result(s) from RollTable “${table.name}”.`,"import");await syncMerchantJournal(tokenDoc);return staged;}

export async function setStockOptions(tokenDoc,itemId,patch={}){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId),item=inv?.items?.get(itemId);if(!item)throw new Error("Stock item not found.");const before=stockSettings(item);const next={...before,...patch};const changes=stockChangeSummary(item,before,next,patch);await item.setFlag(MODULE_ID,"stock",next);if(patch.quantity!==undefined&&!next.infinite)await item.update({"system.quantity":Math.max(0,Number(patch.quantity)||0)});await appendLedger(inv,`${game.user.name} changed stock settings for ${item.name}${changes.length?`: ${changes.join("; ")}`:"."}`,"stock");await syncMerchantJournal(tokenDoc);}
export async function setMerchantItemIdentified(tokenDoc,itemId,identified){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId),item=inv?.items?.get(itemId);if(!item)throw new Error("Item not found.");const state=itemIdentification(item);if(!state.supported)throw new Error("That item does not support identified/unidentified state.");await item.update({"system.identified":Boolean(identified)});await appendLedger(inv,`${game.user.name} marked ${item.name} ${identified?"identified":"unidentified"}.`,"stock");await syncMerchantJournal(tokenDoc);}
export async function removeMerchantStock(tokenDoc,itemId){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId),item=inv?.items?.get(itemId);if(!item)return;const name=item.name;await inv.deleteEmbeddedDocuments("Item",[itemId]);await appendLedger(inv,`${game.user.name} removed ${name} from stock.`,"stock");}

export async function buyFromMerchant({tokenDoc,user=game.user,actor,lines=[]}){
  return withMerchantOperation(tokenDoc,async()=>{const data=validateInteraction(tokenDoc,user,actor);const inv=game.actors.get(data.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");let total=0;const prepared=[];
    for(const line of lines){const item=inv.items.get(line.itemId);if(!item||!itemVisibleForCustomer(item,data,actor))throw new Error("One of the requested items is no longer available.");const s=stockSettings(item),qty=Math.max(1,Math.floor(Number(line.quantity)||1));if(!s.infinite&&quantityOf(item)<qty)throw new Error(`${item.name} does not have enough stock.`);if(s.maxPerCustomer&&qty>s.maxPerCustomer)throw new Error(`${item.name} is limited to ${s.maxPerCustomer} per purchase.`);const unit=priceForCustomer(item,data,actor,"sell");total+=unit*qty;prepared.push({item,qty,unit,s});}
    const playerCp=currencyToCopper(currencyOf(actor));if(playerCp<total)throw new Error(`You need ${formatCopper(total)}, but only have ${formatCopper(playerCp)}.`);
    await spendActorCopper(actor,total);const merchantCp=currencyToCopper(currencyOf(inv));if(data.treasury?.addCustomerPayments!==false){let credit=total;if(data.treasury?.capAtMaximum&&!data.treasury?.unlimited){const cap=Math.max(0,Number(data.treasury?.maxFundsCp??merchantCp));credit=Math.max(0,Math.min(total,cap-merchantCp));}if(credit>0)await addActorCopper(inv,credit);}
    for(const p of prepared){await addItemToActor(actor,p.item,p.qty,{}, {stripMerchantFlags:true});if(!p.s.infinite)await p.item.update({"system.quantity":Math.max(0,quantityOf(p.item)-p.qty)});}
    const rates=effectiveRates(data,actor);const details=prepared.map(p=>`${p.item.name} ×${p.qty}`).join(", ");const memoryLines=prepared.map(p=>({itemId:p.item.id,name:p.item.name,quantity:p.qty,unitCp:p.unit}));await appendLedger(inv,`${actor.name} bought ${details} for ${formatCopper(total)} (${rates.favorName}; customer rate ${rates.sellRate}%). Treasury now ${formatCopper(currencyToCopper(currencyOf(inv)))}.`,"sale",{actorId:actor.id,actorName:actor.name,totalCp:total,rates,lines:memoryLines});await syncMerchantJournal(tokenDoc);Hooks.callAll("sbsMerchants.transactionCompleted",tokenDoc.actor,{type:"purchase",customerActor:actor,title:`${actor.name} bought from ${tokenDoc.name}`,summary:`${actor.name} bought ${details} for ${formatCopper(total)}.`,amount:total,currency:"cp",transactionId:foundry.utils.randomID(),tone:"positive",importance:"normal",metadata:{totalCp:total,totalText:formatCopper(total),rates,lines:memoryLines,merchantTokenUuid:tokenDoc.uuid}});return{totalCp:total,totalText:formatCopper(total)};});
}

export function quotePlayerItem(tokenDoc,actor,item,qty=1,user=game.user){const data=validateInteraction(tokenDoc,user,actor);if(item.parent?.id!==actor.id)throw new Error("That item is not on the selected character.");const ok=merchantAcceptsItem(item,data,actor);if(!ok.ok)return{ok:false,reason:ok.reason,itemId:item.id,name:item.name,img:item.img,quantity:Math.max(1,Math.min(quantityOf(item),Number(qty)||1)),offerCp:0,offerText:"No offer"};const q=Math.max(1,Math.min(quantityOf(item),Math.floor(Number(qty)||1)));const unit=priceForCustomer(item,data,actor,"buy");return{ok:true,itemId:item.id,name:item.name,img:item.img,quantity:q,maxQuantity:quantityOf(item),unitCp:unit,unitText:formatCopper(unit),offerCp:unit*q,offerText:formatCopper(unit*q)};}

export async function sellToMerchant({tokenDoc,user=game.user,actor,lines=[]}){
  return withMerchantOperation(tokenDoc,async()=>{const data=validateInteraction(tokenDoc,user,actor);const inv=game.actors.get(data.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");let total=0;const prepared=[];
    for(const line of lines){const item=actor.items.get(line.itemId);if(!item)throw new Error("One of the offered items is no longer on your character.");const q=Math.max(1,Math.min(quantityOf(item),Math.floor(Number(line.quantity)||1)));const ok=merchantAcceptsItem(item,data,actor);if(!ok.ok)throw new Error(`${item.name}: ${ok.reason}`);const unit=priceForCustomer(item,data,actor,"buy");total+=unit*q;prepared.push({item,q,unit});}
    const merchantCp=currencyToCopper(currencyOf(inv));const maxCp=Math.max(0,Number(data.treasury?.maxFundsCp??merchantCp));const spendableCp=data.treasury?.unlimited?Infinity:Math.min(merchantCp,maxCp);if(!data.treasury?.unlimited&&spendableCp<total)throw new Error(`${tokenDoc.name} can only spend ${formatCopper(spendableCp)} on player items right now.`);
    if(!data.treasury?.unlimited)await spendActorCopper(inv,total);await addActorCopper(actor,total);
    for(const p of prepared){const source=p.item.toObject();const resell=data.buyingRules?.resellBoughtItems??"yes";if(resell!=="no")await addItemToActor(inv,source,p.q,{visible:resell==="yes"&&getItemPrice(source)>0,resell:true,source:`Bought from ${actor.name}`});await removeActorItem(actor,p.item,p.q);}
    const rates=effectiveRates(data,actor);const details=prepared.map(p=>`${p.item.name} ×${p.q}`).join(", ");const memoryLines=prepared.map(p=>({itemId:p.item.id,name:p.item.name,quantity:p.q,unitCp:p.unit}));await appendLedger(inv,`${actor.name} sold ${details} for ${formatCopper(total)} (${rates.favorName}; merchant rate ${rates.buyRate}%). Treasury now ${data.treasury?.unlimited?"Unlimited":formatCopper(currencyToCopper(currencyOf(inv)))}.`,"purchase",{actorId:actor.id,actorName:actor.name,totalCp:total,rates,lines:memoryLines});await syncMerchantJournal(tokenDoc);Hooks.callAll("sbsMerchants.transactionCompleted",tokenDoc.actor,{type:"sale",customerActor:actor,title:`${actor.name} sold to ${tokenDoc.name}`,summary:`${actor.name} sold ${details} for ${formatCopper(total)}.`,amount:total,currency:"cp",transactionId:foundry.utils.randomID(),tone:"neutral",importance:"normal",metadata:{totalCp:total,totalText:formatCopper(total),rates,lines:memoryLines,merchantTokenUuid:tokenDoc.uuid}});return{totalCp:total,totalText:formatCopper(total)};});
}

export async function setRelation(tokenDoc,actorId,patch={}){
  if(!game.user.isGM)throw new Error("GM only.");
  const {reason="Merchant relationship settings changed.",source="sbs-merchants",emitHook=true,...relationPatch}=patch??{};
  const data=deepClone(getMerchantData(tokenDoc));data.favor??={levels:[],defaultLevelId:"",relations:{}};data.favor.relations??={};
  const prior=deepClone(data.favor.relations[actorId]??{});data.favor.relations[actorId]={...prior,...relationPatch};
  const inv=game.actors.get(data.inventoryActorId),actor=game.actors.get(actorId);
  await saveMerchantConfig(inv,data);await tokenDoc.setFlag(MODULE_ID,"merchant",publicMerchantData(data,data.inventoryActorId,data.shellActorId));
  if(inv)await appendLedger(inv,`${game.user.name} changed ${actor?.name??actorId}'s relationship: favor ${relationPatch.favorId||"Merchant Default"}; custom player rate ${relationPatch.customSellRate??"none"}; custom merchant rate ${relationPatch.customBuyRate??"none"}.`+(source!=="sbs-merchants"?` Source: ${source}.`:""),"favor");
  await syncMerchantJournal(tokenDoc);
  if(actor&&emitHook!==false)Hooks.callAll("sbsMerchants.favorChanged",tokenDoc.actor,actor,{from:prior.favorId??data.favor.defaultLevelId??"",to:data.favor.relations[actorId]?.favorId??data.favor.defaultLevelId??"",reason,source,customSellRate:data.favor.relations[actorId]?.customSellRate??null,customBuyRate:data.favor.relations[actorId]?.customBuyRate??null,metadata:{prior,next:deepClone(data.favor.relations[actorId]),merchantTokenUuid:tokenDoc.uuid,source}});
  return deepClone(data.favor.relations[actorId]);
}

export async function setTreasury(tokenDoc,{currency=null,maxFundsCp=null,unlimited=null}={}){if(!game.user.isGM)throw new Error("GM only.");const data=deepClone(getMerchantData(tokenDoc)),inv=game.actors.get(data?.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");if(currency)await setActorCurrency(inv,currency);if(maxFundsCp!==null)data.treasury.maxFundsCp=Math.max(0,Number(maxFundsCp)||0);if(unlimited!==null)data.treasury.unlimited=Boolean(unlimited);await saveMerchantConfig(inv,data);await tokenDoc.setFlag(MODULE_ID,"merchant",publicMerchantData(data,data.inventoryActorId,data.shellActorId));await appendLedger(inv,`${game.user.name} adjusted merchant treasury/settings. Current funds: ${formatCopper(currencyToCopper(currencyOf(inv)))}; max: ${data.treasury.unlimited?"Unlimited":formatCopper(data.treasury.maxFundsCp)}.`,"treasury");}

export async function restockMerchant(tokenDoc){if(!game.user.isGM)throw new Error("GM only.");const data=getMerchantData(tokenDoc),inv=game.actors.get(data?.inventoryActorId);if(!inv)throw new Error("Merchant inventory missing.");const p=privateData(inv);for(const entry of p.initialStock??[]){const item=inv.items.get(entry.itemId);if(item&&!entry.infinite)await item.update({"system.quantity":entry.quantity});}
  if(data.restock?.tableUuid){try{const table=await fromUuid(data.restock.tableUuid);if(table?.documentName==="RollTable")await importTableToMerchant(tokenDoc,table,{mode:"draw",count:1});}catch(_){ }}
  if(data.restock?.restoreTreasury&&!data.treasury?.unlimited)await setActorCopper(inv,Math.max(0,Number(data.treasury?.maxFundsCp??0)));await appendLedger(inv,`${game.user.name} restocked the merchant.`,"restock");await syncMerchantJournal(tokenDoc);}

export async function relinkMerchant(tokenDoc,newTokenDoc){if(!game.user.isGM)throw new Error("GM only.");if(!isMerchant(tokenDoc)||!newTokenDoc)throw new Error("Merchant or target token missing.");if(isMerchant(newTokenDoc))throw new Error("Target token is already a merchant.");const data=deepClone(getMerchantData(tokenDoc));data.tokenMode="linked";data.shellActorId=null;data.linkedOriginalActorId=newTokenDoc.actorId;data.linkedOriginalName=newTokenDoc.name;const inv=game.actors.get(data.inventoryActorId);await saveMerchantConfig(inv,data);await newTokenDoc.setFlag(MODULE_ID,"merchant",publicMerchantData(data,data.inventoryActorId,null));if(inv){await inv.setFlag(MODULE_ID,"tokenRef",{sceneId:newTokenDoc.parent?.id,tokenId:newTokenDoc.id});await appendLedger(inv,`${game.user.name} relinked merchant to token ${newTokenDoc.name}.`,"link");}await tokenDoc.unsetFlag(MODULE_ID,"merchant");await syncMerchantJournal(newTokenDoc);return newTokenDoc;}
