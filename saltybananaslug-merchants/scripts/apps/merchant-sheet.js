import {MODULE_ID} from "../constants.js";
import {addGMItem, buyFromMerchant, importJournalToMerchant, importTableToMerchant, merchantSnapshot, quotePlayerItem, removeMerchantStock, restockMerchant, sellToMerchant, setMerchantItemIdentified, setStockOptions} from "../merchant-service.js";
import {dropDataFromEvent, resolveDropDocument} from "../importers.js";
import {currencyOf, formatCopper, getMerchantData, isMerchant, itemIdentification, notifyError, preferredActor, quantityOf, userOwnsActor} from "../utils.js";
import {effectiveRates, stockSettings} from "../pricing.js";
import {requestGM} from "../socket.js";
import {playMerchantSound} from "../sound.js";
import {MerchantWizard} from "./wizard.js";

const AppBase=foundry.appv1.api.Application;
const openSheets=new Map();

export async function openMerchant(tokenDoc){
  if(!tokenDoc||!isMerchant(tokenDoc))return;const actor=preferredActor();
  try{
    const existing=openSheets.get(tokenDoc.uuid);
    let snapshot=null;
    if(!game.user.isGM){
      if(!actor)throw new Error("Assign or select a character you own before shopping.");
      snapshot=await requestGM("snapshot",{tokenUuid:tokenDoc.uuid,actorUuid:actor.uuid,playGreeting:!existing});
    }
    if(existing){existing.selectedActorId=actor?.id??existing.selectedActorId;existing.remoteSnapshot=snapshot;existing.render(true);existing.bringToTop?.();if(game.user.isGM)await existing._maybePlaySound();return existing;}
    const app=new MerchantSheet(tokenDoc);app.selectedActorId=actor?.id??"";app.remoteSnapshot=snapshot;openSheets.set(tokenDoc.uuid,app);app.render(true);
    // Player greetings are delivered explicitly by the GM-validated socket snapshot.
    // GM/all-audience greetings remain local.
    if(game.user.isGM)queueMicrotask(()=>app._maybePlaySound());
    return app;
  }catch(err){notifyError(err,"Could not open merchant");}
}

export class MerchantSheet extends AppBase{
  constructor(tokenDoc,options={}){super({...options,id:`sbs-merchant-sheet-${tokenDoc.id}`});this.tokenDoc=tokenDoc;this.selectedActorId="";this.remoteSnapshot=null;this.buyCart=new Map();this.sellCart=new Map();this.activeTab="buy";this._soundPlayed=false;}
  static get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{id:"sbs-merchant-sheet",title:"Merchant",template:`modules/${MODULE_ID}/templates/merchant-sheet.html`,width:Math.min(840,Math.max(520,window.innerWidth-360)),height:Math.min(680,Math.max(460,window.innerHeight-120)),resizable:true,minimizable:true,classes:["sbs-merchants","sbs-merchant-sheet"],scrollY:[".sbsm-sheet-scroll"]});}
  async close(options={}){openSheets.delete(this.tokenDoc?.uuid);return super.close(options);}
  async _maybePlaySound(){if(this._soundPlayed)return true;const d=game.user.isGM?getMerchantData(this.tokenDoc):this.remoteSnapshot;const played=await playMerchantSound(d,game.user);if(played)this._soundPlayed=true;return Boolean(played);}
  _actor(){return game.actors.get(this.selectedActorId)??preferredActor();}

  getData(){
    const data=getMerchantData(this.tokenDoc),inv=game.user.isGM?game.actors.get(data?.inventoryActorId):null,actor=this._actor();const actors=game.actors.filter(a=>a.type==="character"&&userOwnsActor(game.user,a)&&!a.getFlag(MODULE_ID,"isInventory")&&!a.getFlag(MODULE_ID,"isShell")).map(a=>({id:a.id,name:a.name,selected:a.id===actor?.id}));
    if(!this.selectedActorId&&actor)this.selectedActorId=actor.id;
    let view=this.remoteSnapshot;if(game.user.isGM&&actor){try{view=merchantSnapshot(this.tokenDoc,game.user,actor);}catch(_){view=null;}}
    const gmItems=(inv?.items?.contents??[]).map(i=>{const s=stockSettings(i),ident=itemIdentification(i);return{id:i.id,name:i.name,img:i.img,type:i.type,quantity:s.infinite?"X":quantityOf(i),infinite:s.infinite,visible:s.visible,allowZero:s.allowZero,zero:(i.system?.price?.value??0)==0,customSell:s.customSellCp==null?"":(s.customSellCp/100),identifiable:ident.supported,identified:ident.identified};});
    const buyItems=(view?.items??[]).map(i=>({...i,cartQty:this.buyCart.get(i.id)??0}));const buyTotal=buyItems.reduce((sum,i)=>sum+(Number(i.priceCp)||0)*(this.buyCart.get(i.id)||0),0);
    const sellItems=[...this.sellCart.values()];const sellTotal=sellItems.reduce((sum,i)=>sum+(Number(i.offerCp)||0),0);
    const rates=view?.rates??(actor?effectiveRates(data,actor):{sellRate:data?.pricing?.sellRate??100,buyRate:data?.pricing?.buyRate??60,favorName:"GM"});
    return{isGM:game.user.isGM,data,actors,selectedActorId:this.selectedActorId,gmItems,buyItems,sellItems,buyTotalText:formatCopper(buyTotal),sellTotalText:formatCopper(sellTotal),hasBuy:buyTotal>0||[...this.buyCart.values()].some(Boolean),hasSell:sellItems.some(x=>x.ok),activeBuy:this.activeTab==="buy",activeSell:this.activeTab==="sell",rates,treasury:inv?Object.entries(currencyOf(inv)).filter(([,v])=>v).map(([k,v])=>`${v} ${k}`).join(", ")||"None":"",journalId:data?.journalId,logo:`modules/${MODULE_ID}/assets/logo.png`};
  }

  activateListeners(html){super.activateListeners(html);const root=html[0]??html;
    root.querySelector("[name='actor']")?.addEventListener("change",async e=>{this.selectedActorId=e.target.value;this.buyCart.clear();this.sellCart.clear();this._soundPlayed=true;try{if(!game.user.isGM)this.remoteSnapshot=await requestGM("snapshot",{tokenUuid:this.tokenDoc.uuid,actorUuid:this._actor()?.uuid,playGreeting:false});}catch(err){notifyError(err);}this.render(true);});
    root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{this.activeTab=b.dataset.tab;this.render(true);}));
    root.querySelector("[data-action='edit']")?.addEventListener("click",()=>new MerchantWizard(this.tokenDoc).render(true));
    root.querySelector("[data-action='journal']")?.addEventListener("click",()=>game.journal.get(getMerchantData(this.tokenDoc)?.journalId)?.sheet?.render(true));
    root.querySelector("[data-action='restock']")?.addEventListener("click",async()=>{try{await restockMerchant(this.tokenDoc);ui.notifications.info("Merchant restocked.");this.render(true);}catch(e){notifyError(e);}});
    root.querySelectorAll("[data-buy-add]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.buyAdd;const item=(this.remoteSnapshot?.items??[]).find(i=>i.id===id);const current=this.buyCart.get(id)||0;const max=item?.infinite?9999:Number(item?.quantity??0);if(current<max)this.buyCart.set(id,current+1);this.render(true);}));
    root.querySelectorAll("[data-buy-sub]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.buySub;const n=Math.max(0,(this.buyCart.get(id)||0)-1);n?this.buyCart.set(id,n):this.buyCart.delete(id);this.render(true);}));
    root.querySelector("[data-action='checkout-buy']")?.addEventListener("click",()=>this._checkoutBuy());
    root.querySelectorAll("[data-sell-remove]").forEach(b=>b.addEventListener("click",()=>{this.sellCart.delete(b.dataset.sellRemove);this.render(true);}));
    root.querySelectorAll("[data-sell-minus]").forEach(b=>b.addEventListener("click",()=>this._changeSellQty(b.dataset.sellMinus,-1)));
    root.querySelectorAll("[data-sell-plus]").forEach(b=>b.addEventListener("click",()=>this._changeSellQty(b.dataset.sellPlus,1)));
    root.querySelector("[data-action='checkout-sell']")?.addEventListener("click",()=>this._checkoutSell());
    root.querySelectorAll("[data-stock-settings]").forEach(b=>b.addEventListener("click",()=>this._stockDialog(b.dataset.stockSettings)));
    root.querySelectorAll("[data-identify]").forEach(b=>b.addEventListener("click",async()=>{try{await setMerchantItemIdentified(this.tokenDoc,b.dataset.identify,b.dataset.identified==="true");this.render(true);}catch(e){notifyError(e);}}));
    root.querySelectorAll("[data-remove-stock]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Remove this stock item from the merchant?"))return;try{await removeMerchantStock(this.tokenDoc,b.dataset.removeStock);this.render(true);}catch(e){notifyError(e);}}));
    const drop=root.querySelector(".sbsm-dropzone");if(drop){drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("dragover");});drop.addEventListener("dragleave",()=>drop.classList.remove("dragover"));drop.addEventListener("drop",e=>this._onDrop(e));}
  }

  async _refreshPlayer(){if(game.user.isGM){this.render(true);return;}this.remoteSnapshot=await requestGM("snapshot",{tokenUuid:this.tokenDoc.uuid,actorUuid:this._actor()?.uuid,playGreeting:false});this.render(true);}
  async _checkoutBuy(){const actor=this._actor();if(!actor)return ui.notifications.warn("Choose a character.");const lines=[...this.buyCart].filter(([,q])=>q>0).map(([itemId,quantity])=>({itemId,quantity}));if(!lines.length)return;try{const result=game.user.isGM?await buyFromMerchant({tokenDoc:this.tokenDoc,user:game.user,actor,lines}):await requestGM("buy",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor.uuid,lines});ui.notifications.info(`Purchase complete: ${result.totalText}.`);this.buyCart.clear();await this._refreshPlayer();}catch(e){notifyError(e,"Purchase failed");}}
  async _checkoutSell(){const actor=this._actor();if(!actor)return ui.notifications.warn("Choose a character.");const lines=[...this.sellCart.values()].filter(x=>x.ok).map(x=>({itemId:x.itemId,quantity:x.quantity}));if(!lines.length)return;try{const result=game.user.isGM?await sellToMerchant({tokenDoc:this.tokenDoc,user:game.user,actor,lines}):await requestGM("sell",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor.uuid,lines});ui.notifications.info(`Sale complete: ${result.totalText}.`);this.sellCart.clear();await this._refreshPlayer();}catch(e){notifyError(e,"Sale failed");}}
  async _changeSellQty(itemId,delta){const row=this.sellCart.get(itemId);if(!row)return;const qty=Math.max(1,Math.min(row.maxQuantity??9999,row.quantity+delta));try{const actor=this._actor();const quote=game.user.isGM?quotePlayerItem(this.tokenDoc,actor,actor.items.get(itemId),qty,game.user):await requestGM("quoteSell",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor.uuid,itemId,quantity:qty});this.sellCart.set(itemId,quote);this.render(true);}catch(e){notifyError(e);}}

  async _onDrop(event){event.preventDefault();event.stopPropagation();event.currentTarget?.classList.remove("dragover");try{const data=dropDataFromEvent(event);if(!data)throw new Error("Could not read that Foundry drag.");const doc=await resolveDropDocument(data);if(!doc)throw new Error("Could not resolve that Foundry document.");
    if(game.user.isGM){if(doc.documentName==="Item"){await addGMItem(this.tokenDoc,doc,quantityOf(doc),{source:"GM drag"});ui.notifications.info(`Added ${doc.name}.`);}else if(["JournalEntry","JournalEntryPage"].includes(doc.documentName)){await importJournalToMerchant(this.tokenDoc,doc);ui.notifications.info(`Imported Journal loot from ${doc.parent?.name??doc.name}.`);}else if(doc.documentName==="RollTable"){await this._tableDialog(doc);}else throw new Error("Drop an Item, Journal, Journal Page, or RollTable here.");this.render(true);return;}
    if(this.activeTab!=="sell")throw new Error("Switch to the Sell tab before dragging an item from your character.");if(doc.documentName!=="Item"||doc.parent?.documentName!=="Actor")throw new Error("Drag an item from the selected character sheet into the Sell area.");const actor=this._actor();if(doc.parent.id!==actor?.id)throw new Error("That item is not on the selected character.");const quote=await requestGM("quoteSell",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor.uuid,itemId:doc.id,quantity:1});this.sellCart.set(doc.id,quote);this.render(true);
  }catch(e){notifyError(e,"Could not add dropped merchant item");}}

  async _tableDialog(table){new Dialog({title:`Import RollTable — ${table.name}`,content:`<div class="sbsm-dialog"><p>How should this table add stock?</p><label>Mode<select name="mode"><option value="draw">Draw results</option><option value="all">Add every linked Item result</option></select></label><label>Number of draws<input name="count" type="number" min="1" max="100" value="5"></label><p><small>Table rolls use <code>roll()</code>, so the source table is not marked as depleted by the import.</small></p></div>`,buttons:{cancel:{label:"Cancel"},go:{label:"Import Stock",callback:async h=>{try{const r=h[0]??h;await importTableToMerchant(this.tokenDoc,table,{mode:r.querySelector("[name='mode']").value,count:Number(r.querySelector("[name='count']").value)||1});ui.notifications.info(`Imported stock from ${table.name}.`);this.render(true);}catch(e){notifyError(e);}}}},default:"go"},{classes:["sbs-merchants","sbsm-dialog-app"],width:520,resizable:true}).render(true);}

  async _stockDialog(itemId){const data=getMerchantData(this.tokenDoc),inv=game.actors.get(data.inventoryActorId),item=inv?.items.get(itemId);if(!item)return;const s=stockSettings(item),q=s.infinite?"X":quantityOf(item);const levels=(data.favor?.levels??[]).map(l=>`<option value="${l.id}" ${s.favorRequired===l.id?"selected":""}>${l.name}</option>`).join("");
    new Dialog({title:`Stock Settings — ${item.name}`,content:`<div class="sbsm-dialog sbsm-stock-dialog"><label>Quantity <input name="quantity" type="text" value="${q}"><small>Enter <strong>X</strong> for infinite stock. Infinite stock never decreases when purchased.</small></label><label class="check"><input name="visible" type="checkbox" ${s.visible?"checked":""}> Visible to players</label><label class="check"><input name="allowZero" type="checkbox" ${s.allowZero?"checked":""}> Allow sale when base value is 0</label><label>Custom customer price (gp)<input name="sell" type="number" min="0" step="0.01" value="${s.customSellCp==null?"":s.customSellCp/100}"></label><label class="check"><input name="ignoreFavor" type="checkbox" ${s.ignoreFavor?"checked":""}> Ignore favor rates for this item</label><label>Minimum favor to see item<select name="favor"><option value="">No minimum</option>${levels}</select></label><label>Maximum per purchase<input name="max" type="number" min="0" value="${s.maxPerCustomer}"><small>0 = no limit</small></label></div>`,buttons:{cancel:{label:"Cancel"},save:{label:"Save Stock Settings",callback:async h=>{const r=h[0]??h,raw=r.querySelector("[name='quantity']").value.trim();await setStockOptions(this.tokenDoc,itemId,{infinite:/^x$/i.test(raw),quantity:/^x$/i.test(raw)?undefined:Math.max(0,Number(raw)||0),visible:r.querySelector("[name='visible']").checked,allowZero:r.querySelector("[name='allowZero']").checked,customSellCp:r.querySelector("[name='sell']").value===""?null:Math.round(Number(r.querySelector("[name='sell']").value)*100),ignoreFavor:r.querySelector("[name='ignoreFavor']").checked,favorRequired:r.querySelector("[name='favor']").value,maxPerCustomer:Number(r.querySelector("[name='max']").value)||0});this.render(true);}}},default:"save"},{classes:["sbs-merchants","sbsm-dialog-app"],width:560,resizable:true}).render(true);}
}
