import {MODULE_ID} from "../constants.js";
import {applyAppearance, canUser, copyItemIntoContainer, dropDataFromEvent, identificationState, importJournalIntoContainer, previewCurrencySplit, previewJournalImport, resolveDropDocument, safeDropReference, setContainerItemIdentified, setContainerLocked, setOpenState, splitCurrencyEvenly, transferCurrency, transferItem} from "../container-service.js";
import {getContainerData, notifyError, quantityOf, userOwnsActor} from "../utils.js";
import {createKeyForContainer, currentKeyIds, isLocked, lockSummary, setLocked} from "../lock.js";
import {requestGM} from "../socket.js";
import {ContainerWizard} from "./wizard.js";

const AppBase = foundry.appv1.api.Application;
const openSheets = new Map();
const COINS = ["cp","sp","ep","gp","pp"];

/**
 * Called on every client when Lock & Key changes a container's token flags.
 * A player window that was open before the lock engaged must be destroyed
 * immediately so its cached inventory cannot remain visible or interactive.
 */
export async function handleContainerLockChanged(tokenDoc) {
  if (game.user.isGM || !tokenDoc || !isLocked(tokenDoc)) return;
  const app = openSheets.get(tokenDoc.uuid);
  if (!app) return;
  app.remoteSnapshot = null;
  try { await app.close(); } catch (_) { openSheets.delete(tokenDoc.uuid); }
  ui.notifications.info(`${tokenDoc.name} is locked. Its contents were closed.`);
}

export function preferredActor() {
  const controlled = canvas?.tokens?.controlled?.map(t=>t.actor).find(a => a && userOwnsActor(game.user,a));
  if (controlled) return controlled;
  if (game.user.character && userOwnsActor(game.user,game.user.character)) return game.user.character;
  return game.actors.find(a => userOwnsActor(game.user,a) && !a.getFlag(MODULE_ID,"isInventory")) ?? null;
}

export async function openContainer(tokenDoc) {
  if (!tokenDoc) return;
  const data = getContainerData(tokenDoc);
  if (!data) return;
  const locked = isLocked(tokenDoc);
  if (locked && !game.user.isGM) {
    const stale = openSheets.get(tokenDoc.uuid);
    if (stale) { stale.remoteSnapshot = null; try { await stale.close(); } catch (_) { openSheets.delete(tokenDoc.uuid); } }
    return showLockedDialog(tokenDoc);
  }
  const actor = preferredActor();
  try {
    // A GM opening a locked container enters an administrative view without
    // altering the lock or the open/closed state.
    if (data.state !== "open" && !(game.user.isGM && locked)) {
      if (canUser(data, game.user, "open")) {
        if (game.user.isGM) await setOpenState(tokenDoc,true,{user:game.user,actor});
        else await requestGM("setOpen", {tokenUuid:tokenDoc.uuid, actorUuid:actor?.uuid, open:true});
      } else if (data.permissions?.inspect !== "all") {
        throw new Error("You do not have permission to open or inspect this container.");
      }
    }
    // Re-check locally after the open request and again after receiving the
    // snapshot. This closes a race where Lock & Key can engage while an async
    // request is in flight. Never construct the player inventory window while
    // the local token says locked.
    if (!game.user.isGM && isLocked(tokenDoc)) return showLockedDialog(tokenDoc);
    const snapshot = game.user.isGM ? null : await requestGM("snapshot", {tokenUuid:tokenDoc.uuid, actorUuid:actor?.uuid});
    if (!game.user.isGM && isLocked(tokenDoc)) return showLockedDialog(tokenDoc);
    const existing = openSheets.get(tokenDoc.uuid);
    if (existing) {
      existing.remoteSnapshot = snapshot;
      existing.render(true);
      existing.bringToTop?.();
      return existing;
    }
    const app = new ContainerSheet(tokenDoc);
    app.remoteSnapshot = snapshot;
    openSheets.set(tokenDoc.uuid, app);
    app.render(true);
    return app;
  } catch (err) { notifyError(err,"Could not open container"); }
}

async function showLockedDialog(tokenDoc) {
  const buttons = {
    close: {icon:'<i class="fas fa-times"></i>', label:"Close"}
  };
  if (game.user.isGM) buttons.gmUnlock = {
    icon:'<i class="fas fa-unlock"></i>',
    label:"GM Unlock",
    callback:async()=>{await setLocked(tokenDoc,false); await applyAppearance(tokenDoc);}
  };
  new Dialog({
    title:`${tokenDoc.name} — Locked`,
    content:`<div class="sbs-dialog-scroll sbs-locked-dialog"><img src="${getContainerData(tokenDoc)?.images?.locked}"><p><strong>${tokenDoc.name}</strong> is locked.</p><p><strong>Right-click the container token</strong> to use Lock & Key's normal key, password, lockpick, break, and other configured lock actions.</p><p>SBS Containers deliberately leaves those checks to Lock & Key instead of duplicating its lock rules.</p></div>`,
    buttons,
    default:"close"
  }, {width:Math.max(420,Math.min(560,window.innerWidth-80)), height:"auto", resizable:true, classes:["sbs-containers","sbs-dialog"]}).render(true);
}

export class ContainerSheet extends AppBase {
  constructor(tokenDoc, options={}) {
    super({...options, id:`sbs-container-sheet-${tokenDoc?.id ?? foundry.utils.randomID()}`});
    this.tokenDoc=tokenDoc;
    this.selectedActorId=preferredActor()?.id ?? "";
    this.remoteSnapshot=null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:"sbs-container-sheet",
      title:"Container",
      template:`modules/${MODULE_ID}/templates/container-sheet.html`,
      width:Math.max(420,Math.min(760,window.innerWidth-60)),
      height:Math.max(420,Math.min(680,window.innerHeight-80)),
      resizable:true,
      minimizable:true,
      classes:["sbs-containers","sbs-container-sheet"],
      scrollY:[".sbs-sheet-scroll"]
    });
  }

  render(force=false, options={}) {
    if (!game.user.isGM && isLocked(this.tokenDoc)) {
      this.remoteSnapshot = null;
      queueMicrotask(async () => { try { await this.close(); } catch (_) {} });
      return this;
    }
    return super.render(force, options);
  }

  async _assertPlayerUnlocked() {
    if (game.user.isGM) return true;
    if (!isLocked(this.tokenDoc)) return true;
    this.remoteSnapshot = null;
    try { await this.close(); } catch (_) {}
    showLockedDialog(this.tokenDoc);
    throw new Error("The container is locked.");
  }

  getData() {
    const data=getContainerData(this.tokenDoc);
    const inv=game.user.isGM ? game.actors.get(data?.inventoryActorId) : null;
    const actors=game.actors
      .filter(a=>userOwnsActor(game.user,a)&&!a.getFlag(MODULE_ID,"isInventory"))
      .map(a=>({id:a.id,name:a.name,selected:a.id===this.selectedActorId}));
    if (!this.selectedActorId && actors[0]) this.selectedActorId=actors[0].id;
    const locked=isLocked(this.tokenDoc);
    const safeRemote=(!game.user.isGM && locked) ? null : this.remoteSnapshot;
    const items=game.user.isGM
      ? (inv?.items?.contents??[]).map(i=>{
          const ident=identificationState(i);
          return {id:i.id,name:i.name,img:i.img,quantity:quantityOf(i),type:i.type,identifiable:ident.supported,identified:ident.identified,identificationLabel:ident.supported?(ident.identified?"Identified":"Unidentified"):"Not applicable"};
        })
      : (safeRemote?.items ?? []);
    const c=game.user.isGM ? (inv?.system?.currency??{}) : (safeRemote?.currency ?? {});
    const currency={cp:c.cp??0,sp:c.sp??0,ep:c.ep??0,gp:c.gp??0,pp:c.pp??0};
    const isOpen=data?.state === "open";
    const gmOverride=Boolean(game.user.isGM && (locked || !isOpen));
    const canWithdraw=game.user.isGM || (isOpen && !locked && canUser(data,game.user,"withdraw"));
    const canDeposit=game.user.isGM || (isOpen && !locked && canUser(data,game.user,"deposit"));
    const splitRecipientCount=game.user.isGM ? previewCurrencySplit(this.tokenDoc).recipients.length : Number(safeRemote?.activeRecipientCount ?? 0);
    const hasCurrency=Object.values(currency).some(v=>Number(v)>0);
    const allowPlayerSplit=game.user.isGM || game.settings.get(MODULE_ID,"allowPlayerCurrencySplit");
    const journal=game.journal.get(data?.journalId);
    const canOpenJournal=Boolean(journal && journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
    return {
      name:this.tokenDoc.name,
      img:this.tokenDoc.texture?.src,
      data,
      items,
      actors,
      currency,
      isGM:game.user.isGM,
      locked,
      lockActionLabel:locked ? "Unlock" : "Lock",
      isOpen,
      gmOverride,
      stateLabel:isOpen ? "open" : "closed",
      canDeposit,
      canWithdraw,
      canSplitCurrency:canWithdraw && allowPlayerSplit && hasCurrency && splitRecipientCount>0,
      splitRecipientCount,
      canOpenJournal,
      showHeaderActions:game.user.isGM || canOpenJournal,
      lock:lockSummary(this.tokenDoc),
      logo:`modules/${MODULE_ID}/assets/logo.svg`
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root=html[0]??html;
    root.querySelector("[name='actor']")?.addEventListener("change",e=>{this.selectedActorId=e.target.value;});
    root.querySelectorAll("[data-identify-item]").forEach(b=>b.addEventListener("click",e=>this._setIdentification(e.currentTarget.dataset.identifyItem, e.currentTarget.dataset.identified === "true")));
    root.querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",e=>this._take(e.currentTarget.dataset.take, Number(e.currentTarget.dataset.qty)||1)));
    root.querySelectorAll("[data-take-all]").forEach(b=>b.addEventListener("click",e=>this._take(e.currentTarget.dataset.takeAll, "all")));
    root.querySelector("[data-action='close-container']")?.addEventListener("click",()=>this._closeContainer());
    root.querySelector("[data-action='dismiss']")?.addEventListener("click",()=>this.close());
    root.querySelector("[data-action='create-key']")?.addEventListener("click",()=>this._createKeyDialog());
    root.querySelector("[data-action='toggle-lock']")?.addEventListener("click",()=>this._toggleLock());
    root.querySelector("[data-action='edit']")?.addEventListener("click",()=>new ContainerWizard(this.tokenDoc).render(true));
    root.querySelector("[data-action='journal']")?.addEventListener("click",()=>game.journal.get(getContainerData(this.tokenDoc)?.journalId)?.sheet?.render(true));
    root.querySelector("[data-action='split-currency']")?.addEventListener("click",()=>this._confirmSplitCurrency());
    root.querySelectorAll("[data-currency-action]").forEach(b=>b.addEventListener("click",e=>this._currency(e.currentTarget)));
    const drop=root.querySelector(".sbs-container-dropzone");
    const scroll=root.querySelector(".sbs-sheet-scroll");
    if(drop && scroll){
      scroll.addEventListener("dragenter",e=>{e.preventDefault();scroll.classList.add("sbs-drag-active");drop.classList.add("dragover");});
      scroll.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";});
      scroll.addEventListener("dragleave",e=>{if(!scroll.contains(e.relatedTarget)){scroll.classList.remove("sbs-drag-active");drop.classList.remove("dragover");}});
      scroll.addEventListener("drop",e=>this._drop(e,drop,scroll));
    }
  }

  async _toggleLock() {
    if (!game.user.isGM) return;
    const next = !isLocked(this.tokenDoc);
    try {
      await setContainerLocked(this.tokenDoc, next, {user:game.user});
      ui.notifications.info(`${this.tokenDoc.name} ${next ? "locked" : "unlocked"}.`);
      this.render(true);
    } catch (err) { notifyError(err, `Could not ${next ? "lock" : "unlock"} container`); }
  }

  async _setIdentification(itemId, identified) {
    if (!game.user.isGM) return;
    try {
      await setContainerItemIdentified(this.tokenDoc, itemId, identified);
      this.render(true);
    } catch (err) { notifyError(err, "Could not change item identification"); }
  }

  async _take(itemId, qty) {
    try { await this._assertPlayerUnlocked(); } catch (_) { return; }
    const actor=game.actors.get(this.selectedActorId);
    if(!actor) return ui.notifications.warn("Choose one of your Actors first.");
    try{
      if(game.user.isGM) {
        const data=getContainerData(this.tokenDoc);
        const inv=game.actors.get(data.inventoryActorId);
        const item=inv?.items.get(itemId);
        if(!item) throw new Error("Item no longer exists.");
        const quantity=qty==="all"?quantityOf(item):qty;
        await transferItem({tokenDoc:this.tokenDoc,sourceActor:inv,targetActor:actor,item,quantity,user:game.user,direction:"take"});
      } else {
        const snapshotItem=this.remoteSnapshot?.items?.find(i=>i.id===itemId);
        if(!snapshotItem) throw new Error("Item no longer exists.");
        const quantity=qty==="all"?Number(snapshotItem.quantity||1):qty;
        await requestGM("transferItem",{tokenUuid:this.tokenDoc.uuid,targetActorUuid:actor.uuid,itemId,quantity,direction:"take"});
        const refreshed=await this.refreshSnapshot();
        if (refreshed === false) return;
      }
      this.render(true);
    }catch(err){notifyError(err,"Could not take item");}
  }
  async _drop(event,drop,scroll=null) {
    event.preventDefault();
    event.stopPropagation();
    drop?.classList.remove("dragover");
    scroll?.classList.remove("sbs-drag-active");
    try{
      await this._assertPlayerUnlocked();
      const data=dropDataFromEvent(event);
      if(!data) throw new Error("Foundry did not provide readable drag data for that drop.");
      const dropped=await resolveDropDocument(data);
      if(!dropped) throw new Error("Could not resolve that Foundry document.");
      if(["JournalEntry","JournalEntryPage"].includes(dropped.documentName)) {
        await this._confirmJournalImport(dropped,data);
        return;
      }
      const item=dropped;
      if(item.documentName!=="Item")throw new Error("Drop a Foundry Item, Journal Entry, or Journal Page here.");
      const cdata=getContainerData(this.tokenDoc);
      const inv=game.user.isGM ? game.actors.get(cdata.inventoryActorId) : null;
      const requesterActor=game.actors.get(this.selectedActorId) ?? preferredActor();
      if(item.parent?.documentName==="Actor"){
        const source=item.parent;
        if(!game.user.isGM&&!userOwnsActor(game.user,source))throw new Error("You can only deposit items from an Actor you own.");
        const qty=quantityOf(item);
        if(game.user.isGM)await transferItem({tokenDoc:this.tokenDoc,sourceActor:source,targetActor:inv,item,quantity:qty,user:game.user,direction:"deposit"});
        else {
          await requestGM("transferItem",{tokenUuid:this.tokenDoc.uuid,sourceActorUuid:source.uuid,itemId:item.id,quantity:qty,direction:"deposit"});
          const refreshed=await this.refreshSnapshot();
          if (refreshed === false) return;
        }
      }else{
        if(game.user.isGM) {
          await copyItemIntoContainer({tokenDoc:this.tokenDoc,item,quantity:quantityOf(item),user:game.user,requesterActor});
        } else {
          const ref=safeDropReference(data);
          if(!ref) throw new Error("Could not identify that Item for the GM.");
          await requestGM("copyItem",{tokenUuid:this.tokenDoc.uuid,actorUuid:requesterActor?.uuid,dropData:ref});
          const refreshed=await this.refreshSnapshot();
          if (refreshed === false) return;
        }
      }
      this.render(true);
    }catch(err){notifyError(err,"Could not deposit item");}
  }

  async _confirmJournalImport(journalDoc, dropData) {
    try { await this._assertPlayerUnlocked(); } catch (_) { return; }
    const requesterActor=game.actors.get(this.selectedActorId) ?? preferredActor();
    const ref=safeDropReference(dropData);
    if(!ref) throw new Error("Could not identify that Journal for the GM.");
    let plan;
    if(game.user.isGM) plan=await previewJournalImport(journalDoc,game.user);
    else plan=await requestGM("journalPreview",{tokenUuid:this.tokenDoc.uuid,actorUuid:requesterActor?.uuid,dropData:ref});
    const hasItems=Boolean(plan.items?.length);
    const hasCurrency=Object.values(plan.currency??{}).some(v=>Number(v)>0);
    if(!hasItems&&!hasCurrency) throw new Error("No importable linked Items or currency were found in that Journal.");
    const itemRows=(plan.items??[]).map(i=>`<tr><td><img src="${foundry.utils.escapeHTML(i.img??"icons/svg/item-bag.svg")}" width="28" height="28"></td><td>${foundry.utils.escapeHTML(i.name)}</td><td>× ${Number(i.quantity)||1}</td></tr>`).join("") || `<tr><td colspan="3"><em>No linked Items found.</em></td></tr>`;
    const money=COINS.filter(c=>Number(plan.currency?.[c])>0).map(c=>`${Number(plan.currency[c])} ${c}`).join(", ")||"None";
    const skipped=(plan.skipped??[]).length?`<details><summary>Skipped links (${plan.skipped.length})</summary><ul>${plan.skipped.map(x=>`<li>${foundry.utils.escapeHTML(x.name||x.uuid||"Unknown")}: ${foundry.utils.escapeHTML(x.reason||"Could not import")}</li>`).join("")}</ul></details>`:"";
    const pageText=plan.pageName?` / ${foundry.utils.escapeHTML(plan.pageName)}`:"";
    const content=`<div class="sbs-dialog-scroll sbs-journal-import-dialog">
      <p>Import the loot represented by <strong>${foundry.utils.escapeHTML(plan.journalName)}${pageText}</strong> into <strong>${foundry.utils.escapeHTML(this.tokenDoc.name)}</strong>?</p>
      <table><thead><tr><th></th><th>Item</th><th>Qty</th></tr></thead><tbody>${itemRows}</tbody></table>
      <p><strong>Currency found:</strong> ${foundry.utils.escapeHTML(money)}</p>
      ${skipped}
      <p><small>The source Journal is not changed or deleted. Linked Items are copied into the container and recognized loose currency is added.</small></p>
    </div>`;
    new Dialog({
      title:`Import Journal Loot — ${this.tokenDoc.name}`,content,
      buttons:{
        cancel:{icon:'<i class="fas fa-times"></i>',label:"Cancel"},
        import:{icon:'<i class="fas fa-book-arrow-right"></i>',label:"Import Loot",callback:()=>this._executeJournalImport(journalDoc,ref,requesterActor)}
      },
      default:"import"
    },{width:Math.max(500,Math.min(720,window.innerWidth-80)),height:"auto",resizable:true,classes:["sbs-containers","sbs-dialog"]}).render(true);
  }

  async _executeJournalImport(journalDoc,ref,requesterActor) {
    try {
      let result;
      if(game.user.isGM) result=await importJournalIntoContainer({tokenDoc:this.tokenDoc,journalDoc,user:game.user,requesterActor});
      else {
        result=await requestGM("journalImport",{tokenUuid:this.tokenDoc.uuid,actorUuid:requesterActor?.uuid,dropData:ref});
        const refreshed=await this.refreshSnapshot();
        if(refreshed===false)return;
      }
      const money=COINS.filter(c=>Number(result?.currency?.[c])>0).map(c=>`${Number(result.currency[c])} ${c}`).join(", ");
      const parts=[];
      if(Number(result?.itemQuantity)>0) parts.push(`${result.itemQuantity} item${result.itemQuantity===1?"":"s"}`);
      if(money) parts.push(money);
      ui.notifications.info(`Imported ${parts.join(" and ")||"journal loot"} into ${this.tokenDoc.name}.`);
      this.render(true);
    } catch(err) { notifyError(err,"Could not import Journal loot"); }
  }

  async _createKeyDialog() {
    if (!game.user.isGM) return;
    const existingId=currentKeyIds(this.tokenDoc)[0] ?? "";
    const content=`<div class="sbs-containers sbs-dialog-scroll">
      <p>Create a Lock & Key item linked to <strong>${foundry.utils.escapeHTML(this.tokenDoc.name)}</strong>. The key name is used exactly as entered.</p>
      <label>Key Item Name<input type="text" name="sbs-key-name" placeholder="Basement Master Key"></label>
      <label>Key ID<input type="text" name="sbs-key-id" value="${foundry.utils.escapeHTML(existingId)}" placeholder="Leave blank to use/create this lock's ID"><small>Use the same ID on multiple locks if one key should open all of them.</small></label>
    </div>`;
    new Dialog({
      title:`Create Key — ${this.tokenDoc.name}`,
      content,
      buttons:{
        cancel:{icon:'<i class="fas fa-times"></i>',label:"Cancel"},
        create:{icon:'<i class="fas fa-key"></i>',label:"Create Key",callback:async html=>{
          try{
            const root=html[0]??html;
            const keyName=root.querySelector?.("[name='sbs-key-name']")?.value ?? html.find?.("[name='sbs-key-name']")?.val?.() ?? "";
            const keyId=root.querySelector?.("[name='sbs-key-id']")?.value ?? html.find?.("[name='sbs-key-id']")?.val?.() ?? "";
            const created=await createKeyForContainer(this.tokenDoc,{keyName,keyId});
            ui.notifications.info(`Created key “${created.keyName}”.`);
            this.render(true);
          }catch(err){notifyError(err,"Could not create key");}
        }}
      },
      default:"create"
    },{width:Math.max(430,Math.min(600,window.innerWidth-80)),height:"auto",resizable:true,classes:["sbs-containers","sbs-dialog"]}).render(true);
  }

  async _currency(button){
    try { await this._assertPlayerUnlocked(); } catch (_) { return; }
    const actor=game.actors.get(this.selectedActorId);
    if(!actor)return ui.notifications.warn("Choose one of your Actors first.");
    const direction=button.dataset.currencyAction;
    const coin=button.dataset.coin;
    const input=button.closest(".sbs-currency-row")?.querySelector("input");
    const quantity=Math.max(1,Number(input?.value)||1);
    try{
      if(game.user.isGM)await transferCurrency({tokenDoc:this.tokenDoc,actor,coin,quantity,user:game.user,direction});
      else {
        await requestGM("currency",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor.uuid,coin,quantity,direction});
        const refreshed=await this.refreshSnapshot();
        if (refreshed === false) return;
      }
      this.render(true);
    }catch(err){notifyError(err,"Could not transfer currency");}
  }

  async _confirmSplitCurrency() {
    try { await this._assertPlayerUnlocked(); } catch (_) { return; }
    const actor=game.actors.get(this.selectedActorId) ?? preferredActor();
    let plan;
    try {
      plan = game.user.isGM
        ? previewCurrencySplit(this.tokenDoc)
        : await requestGM("splitPreview", {tokenUuid:this.tokenDoc.uuid, actorUuid:actor?.uuid});
    } catch (err) { return notifyError(err,"Could not preview currency split"); }
    if(!plan.recipients.length) return ui.notifications.warn("No active non-GM players have an assigned character.");
    if(!Object.values(plan.currency).some(v=>v>0)) return ui.notifications.warn("There is no currency to split.");

    const money = obj => COINS.filter(c=>Number(obj[c])>0).map(c=>`${Number(obj[c])} ${c}`).join(", ") || "None";
    const recipientRows=plan.recipients.map(r=>`<tr><td>${foundry.utils.escapeHTML(r.userName)}</td><td>${foundry.utils.escapeHTML(r.actorName)}</td><td>${foundry.utils.escapeHTML(money(plan.shares))}</td></tr>`).join("");
    const skipped=plan.skipped.length ? `<details><summary>Skipped active users (${plan.skipped.length})</summary><ul>${plan.skipped.map(s=>`<li>${foundry.utils.escapeHTML(s.userName)} — ${foundry.utils.escapeHTML(s.reason)}</li>`).join("")}</ul></details>` : "";
    const content=`<div class="sbs-dialog-scroll sbs-split-dialog">
      <p>This splits <strong>all currency currently in ${foundry.utils.escapeHTML(this.tokenDoc.name)}</strong> among active non-GM users with assigned characters. Each denomination is divided separately.</p>
      <table><thead><tr><th>Player</th><th>Character</th><th>Each Receives</th></tr></thead><tbody>${recipientRows}</tbody></table>
      <p><strong>Container now:</strong> ${foundry.utils.escapeHTML(money(plan.currency))}<br><strong>Remainder left in container:</strong> ${foundry.utils.escapeHTML(money(plan.remainder))}</p>
      ${skipped}
    </div>`;

    new Dialog({
      title:`Split Currency — ${this.tokenDoc.name}`,
      content,
      buttons:{
        cancel:{icon:'<i class="fas fa-times"></i>',label:"Cancel"},
        split:{icon:'<i class="fas fa-people-arrows"></i>',label:`Split Among ${plan.recipients.length}`,callback:()=>this._executeSplitCurrency()}
      },
      default:"split"
    },{width:660,height:"auto",resizable:true,classes:["sbs-containers","sbs-dialog"]}).render(true);
  }

  async _executeSplitCurrency() {
    try { await this._assertPlayerUnlocked(); } catch (_) { return; }
    const actor=game.actors.get(this.selectedActorId) ?? preferredActor();
    try {
      if(game.user.isGM) await splitCurrencyEvenly({tokenDoc:this.tokenDoc,user:game.user,requesterActor:actor});
      else {
        await requestGM("splitCurrency",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor?.uuid});
        const refreshed=await this.refreshSnapshot();
        if (refreshed === false) { ui.notifications.info(`${this.tokenDoc.name}: currency split among active players.`); return; }
      }
      ui.notifications.info(`${this.tokenDoc.name}: currency split among active players.`);
      this.render(true);
    } catch(err) { notifyError(err,"Could not split currency"); }
  }

  async refreshSnapshot() {
    if (game.user.isGM) return this.remoteSnapshot;
    try { await this._assertPlayerUnlocked(); } catch (_) { return false; }
    const actor=game.actors.get(this.selectedActorId) ?? preferredActor();
    try {
      this.remoteSnapshot=await requestGM("snapshot",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor?.uuid});
      return this.remoteSnapshot;
    } catch (err) {
      const state=getContainerData(this.tokenDoc)?.state;
      if (state !== "open" || /closed|locked/i.test(String(err?.message ?? ""))) {
        ui.notifications.info(isLocked(this.tokenDoc) ? `${this.tokenDoc.name} is locked.` : `${this.tokenDoc.name} is now closed.`);
        await this.close();
        return false;
      }
      throw err;
    }
  }
  async _closeContainer(){
    const actor=game.actors.get(this.selectedActorId);
    try{
      if(game.user.isGM)await setOpenState(this.tokenDoc,false,{user:game.user,actor});
      else await requestGM("setOpen",{tokenUuid:this.tokenDoc.uuid,actorUuid:actor?.uuid,open:false});
      await this.close();
    }catch(err){notifyError(err,"Could not close container");}
  }

  async close(options){
    openSheets.delete(this.tokenDoc.uuid);
    return super.close(options);
  }
}
