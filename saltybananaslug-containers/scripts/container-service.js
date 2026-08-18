import {DEFAULT_CONFIG, MODULE_ID, TYPES, defaultImages} from "./constants.js";
import {actorTokenOnScene, currencyOf, distanceBetweenTokens, getContainerData, inventoryFolder, shellFolder, mergeConfig, quantityOf, stackKey, userOwnsActor, worldPointAtViewportCenter} from "./utils.js";
import {configureLock, disableLock, isLocked, setLocked} from "./lock.js";
import {createJournal, renameJournalForContainer, syncJournal, syncJournalOwnership} from "./journal.js";


async function createContainerShell({name, containerId, inventoryActorId, img}) {
  const folder = await shellFolder();
  return Actor.create({
    name: `[Container Shell] ${name}`,
    type: "npc",
    img: img || "icons/svg/chest.svg",
    folder: folder.id,
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
    flags: {[MODULE_ID]: {isShell: true, containerId, inventoryActorId}}
  });
}

export async function ensureContainerShell(tokenDoc, data=getContainerData(tokenDoc)) {
  if (!game.user.isGM) return null;
  if (!tokenDoc || !data?.isContainer) return null;
  let shell = data.shellActorId ? game.actors.get(data.shellActorId) : null;
  if (!shell && tokenDoc.actorId) {
    const candidate = game.actors.get(tokenDoc.actorId);
    if (candidate?.getFlag?.(MODULE_ID, "isShell")) shell = candidate;
  }
  if (!shell) {
    shell = await createContainerShell({
      name: tokenDoc.name || data.name || "Container",
      containerId: data.containerId,
      inventoryActorId: data.inventoryActorId,
      img: data.images?.closed || tokenDoc.texture?.src
    });
  } else {
    const updates = {};
    if (shell.name !== `[Container Shell] ${tokenDoc.name}`) updates.name = `[Container Shell] ${tokenDoc.name}`;
    if (Number(shell.ownership?.default) !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE || Object.keys(shell.ownership ?? {}).some(k=>k !== "default")) updates.ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
    const desiredImg = data.images?.closed || tokenDoc.texture?.src;
    if (desiredImg && shell.img !== desiredImg) updates.img = desiredImg;
    if (Object.keys(updates).length) await shell.update(updates);
    await shell.setFlag(MODULE_ID, "isShell", true);
    await shell.setFlag(MODULE_ID, "containerId", data.containerId);
    await shell.setFlag(MODULE_ID, "inventoryActorId", data.inventoryActorId);
  }
  const next = foundry.utils.deepClone(data);
  next.shellActorId = shell.id;
  const tokenUpdates = {};
  if (tokenDoc.actorId !== shell.id) tokenUpdates.actorId = shell.id;
  if (tokenDoc.actorLink !== false) tokenUpdates.actorLink = false;
  if (data.shellActorId !== shell.id) tokenUpdates[`flags.${MODULE_ID}.container`] = next;
  if (Object.keys(tokenUpdates).length) await tokenDoc.update(tokenUpdates);
  await shell.setFlag(MODULE_ID, "tokenRef", {sceneId: tokenDoc.parent?.id, tokenId: tokenDoc.id});
  return shell;
}

function initialSnapshot(items=[]) {
  return items.map(i => ({name:i.name, type:i.type, img:i.img, quantity:Number(foundry.utils.getProperty(i,"system.quantity") ?? 1)}));
}

function privateContainerData(actor) {
  return foundry.utils.deepClone(actor?.getFlag?.(MODULE_ID, "private") ?? {originalContents:[], history:[]});
}

async function appendHistory(actor, text) {
  if (!actor) return;
  const priv = privateContainerData(actor);
  priv.history ??= [];
  priv.history.push({when:new Date().toLocaleString(), text});
  if (priv.history.length > 500) priv.history = priv.history.slice(-500);
  await actor.setFlag(MODULE_ID, "private", priv);
}

const operationTails = new Map();
async function withContainerOperation(tokenDoc, fn) {
  const key = tokenDoc?.uuid ?? tokenDoc?.id;
  if (!key) return fn();
  const previous = operationTails.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const tail = previous.catch(()=>{}).then(() => gate);
  operationTails.set(key, tail);
  await previous.catch(()=>{});
  try { return await fn(); }
  finally {
    release();
    if (operationTails.get(key) === tail) operationTails.delete(key);
  }
}

export async function createContainer(config={}, {scene=canvas.scene, x=null, y=null, creatorUserId=game.user.id}={}) {
  if (!game.user.isGM) throw new Error("Only the GM client can create container documents.");
  if (!scene) throw new Error("No active scene.");
  const cfg = mergeConfig(DEFAULT_CONFIG, config);
  cfg.isContainer = true;
  cfg.images = {...defaultImages(cfg.type), ...(cfg.images ?? {})};
  cfg.containerId = foundry.utils.randomID();
  cfg.createdAt = new Date().toISOString();
  cfg.createdBy = creatorUserId;
  cfg.sceneName = scene.name;
  cfg.typeLabel = cfg.type === "other" ? (cfg.customType || "Other") : TYPES[cfg.type];
  const stagedItems = foundry.utils.deepClone(cfg.initialItems ?? []);
  const originalContents = cfg.journal?.originalSnapshot ? initialSnapshot(stagedItems) : [];
  delete cfg.initialItems;
  delete cfg.originalContents;
  delete cfg.history;

  const folder = await inventoryFolder();
  const actor = await Actor.create({
    name: `[Container] ${cfg.name}`,
    type: "npc",
    img: cfg.images.closed,
    folder: folder.id,
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
    flags: {[MODULE_ID]: {containerId: cfg.containerId, isInventory: true, private:{originalContents, history:[], lockConfig:foundry.utils.deepClone(cfg.lock ?? {})}}}
  });

  if (stagedItems.length) {
    const itemData = stagedItems.map(i => {
      const d = foundry.utils.deepClone(i);
      delete d._id;
      return d;
    });
    await actor.createEmbeddedDocuments("Item", itemData);
  }
  if (cfg.currency) {
    const updates = {};
    for (const [coin,val] of Object.entries(cfg.currency)) updates[`system.currency.${coin}`] = Math.max(0, Number(val)||0);
    await actor.update(updates);
  }

  const shell = await createContainerShell({name:cfg.name, containerId:cfg.containerId, inventoryActorId:actor.id, img:cfg.images.closed});

  const point = (x == null || y == null) ? worldPointAtViewportCenter() : {x,y};
  const initialTexture = cfg.state === "open" ? cfg.images.open : (cfg.state === "locked" ? cfg.images.locked : cfg.images.closed);
  const [token] = await scene.createEmbeddedDocuments("Token", [{
    name: cfg.name,
    // The visible token uses a GM-only, empty shell Actor. Loot remains on the
    // separate private inventory Actor referenced by SBS flags. This satisfies
    // Foundry's Token actor requirement without granting players ownership of
    // the loot Actor (or Lock & Key's always-open-owned exception).
    actorId: shell.id,
    actorLink: false,
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
    texture: {src: initialTexture, scaleX: 1, scaleY: 1},
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    lockRotation: true,
    flags: {[MODULE_ID]: {container: {...cfg, lock:{enabled:Boolean(cfg.lock?.enabled || cfg.state === "locked"), lockOnClose:Boolean(cfg.lock?.lockOnClose)}, inventoryActorId: actor.id, shellActorId: shell.id, journalId: null}}}
  }]);

  try {
    if (cfg.lock?.enabled || cfg.state === "locked") {
      cfg.lock.enabled = true;
      cfg.lock.startLocked = cfg.state === "locked" || cfg.lock.startLocked;
      await configureLock(token, cfg.lock);
    }
    if (cfg.state === "locked") cfg.state = "closed";
    const actorPrivate = privateContainerData(actor);
    actorPrivate.lockConfig = foundry.utils.deepClone(cfg.lock ?? {});
    await actor.setFlag(MODULE_ID, "private", actorPrivate);
    const publicConfig = {...cfg, shellActorId:shell.id, lock:{enabled:Boolean(cfg.lock?.enabled), lockOnClose:Boolean(cfg.lock?.lockOnClose)}};
    const journal = await createJournal(token, actor, {...publicConfig, inventoryActorId: actor.id});
    const finalData = {...publicConfig, inventoryActorId: actor.id, journalId: journal.id};
    await token.setFlag(MODULE_ID, "container", finalData);
    await actor.setFlag(MODULE_ID, "tokenRef", {sceneId: scene.id, tokenId: token.id, journalId: journal.id});
    await shell.setFlag(MODULE_ID, "tokenRef", {sceneId: scene.id, tokenId: token.id});
    await applyAppearance(token);
    await syncJournal(token);
    return token;
  } catch (err) {
    console.error(`${MODULE_ID} | Creation partially failed`, err);
    ui.notifications.warn("Container was created, but part of its setup failed. The inventory Actor was preserved for recovery.");
    throw err;
  }
}

export async function applyAppearance(tokenDoc) {
  const data = getContainerData(tokenDoc);
  if (!data) return;
  let src;
  if (isLocked(tokenDoc)) src = data.images?.locked || data.images?.closed;
  else if (data.state === "open") src = data.images?.open || data.images?.closed;
  else src = data.images?.closed;
  if (src && tokenDoc.texture?.src !== src) await tokenDoc.update({"texture.src": src});
}

export function canUser(data, user, action) {
  if (user?.isGM) return true;
  const mode = data?.permissions?.[action];
  if (action === "inspect" && mode === "open") return data.state === "open";
  if (mode === "all") return true;
  if (mode === "selected") return (data.permissions?.selectedUserIds ?? []).includes(user.id);
  if (mode === "creator") return data.createdBy === user.id;
  return false;
}

export function validateInteraction(tokenDoc, user, actor, action) {
  const data = getContainerData(tokenDoc);
  if (!data) throw new Error("This token is not an SBS Container.");
  // GM override is intentionally absolute for container administration: inspect,
  // transfer, edit, open, and close without changing or defeating the lock first.
  if (user?.isGM) return data;
  if (!canUser(data, user, action)) throw new Error(`You do not have permission to ${action} this container.`);
  if (["deposit","withdraw"].includes(action) && data.state !== "open") throw new Error("The container is closed.");
  if (action === "inspect" && data.state !== "open" && data.permissions?.inspect !== "all") throw new Error("The container is closed.");
  if (isLocked(tokenDoc)) throw new Error("The container is locked.");
  const max = Number(data.distance ?? 0);
  if (max > 0 && !user.isGM) {
    if (!actor) throw new Error("Choose an Actor to interact with this container.");
    if (!userOwnsActor(user, actor)) throw new Error("You do not own that character.");
    const userToken = actorTokenOnScene(actor, tokenDoc.parent);
    if (!userToken) throw new Error("Your character must have a token on this scene to interact with this container.");
    const dist = distanceBetweenTokens(userToken, tokenDoc);
    if (dist > max + 0.01) throw new Error(`You are too far away (${Math.round(dist*10)/10} ft; maximum ${max} ft).`);
  }
  return data;
}

export async function setContainerLocked(tokenDoc, locked, {user=game.user}={}) {
  if (!game.user?.isGM) throw new Error("Only a GM can manually lock or unlock a container.");
  const data = getContainerData(tokenDoc);
  if (!data) throw new Error("Not a container.");
  const next = foundry.utils.deepClone(data);
  next.lock ??= {};
  // A manual GM lock also makes a previously non-lockable container lockable.
  // Unlocking preserves lockability/key configuration for later use.
  next.lock.enabled = true;
  if (locked && next.state === "open") next.state = "closed";
  await tokenDoc.setFlag(MODULE_ID, "container", next);
  await setLocked(tokenDoc, Boolean(locked));
  const inv = game.actors.get(next.inventoryActorId);
  await appendHistory(inv, `${user?.name ?? "GM"} manually ${locked ? "locked" : "unlocked"} the container.`);
  await applyAppearance(tokenDoc);
  await syncJournal(tokenDoc);
  return Boolean(locked);
}

export async function setOpenState(tokenDoc, open, {user=game.user, actor=null}={}) {
  const action = open ? "open" : "close";
  const data = getContainerData(tokenDoc);
  if (!data) throw new Error("Not a container.");
  validateInteraction(tokenDoc, user, actor, action);
  data.state = open ? "open" : "closed";
  await tokenDoc.setFlag(MODULE_ID, "container", data);
  await appendHistory(game.actors.get(data.inventoryActorId), `${user.name} ${open ? "opened" : "closed"} the container.`);
  if (!open && data.lock?.enabled && data.lock?.lockOnClose) await setLocked(tokenDoc, true);
  await applyAppearance(tokenDoc);
  await syncJournal(tokenDoc);
}

async function addItemToActor(actor, itemData, qty) {
  const key = stackKey(itemData);
  const existing = actor.items.find(i => stackKey(i) === key);
  if (existing) {
    const oldQ = quantityOf(existing);
    await existing.update({"system.quantity": oldQ + qty});
    return existing;
  }
  const d = foundry.utils.deepClone(itemData.toObject ? itemData.toObject() : itemData);
  delete d._id;
  foundry.utils.setProperty(d, "system.quantity", qty);
  const [created] = await actor.createEmbeddedDocuments("Item", [d]);
  return created;
}

async function removeItemFromActor(actor, item, qty) {
  const oldQ = quantityOf(item);
  if (qty >= oldQ) await actor.deleteEmbeddedDocuments("Item", [item.id]);
  else await item.update({"system.quantity": oldQ - qty});
}

export async function transferItem({tokenDoc, sourceActor, targetActor, item, quantity, user, direction}) {
  return withContainerOperation(tokenDoc, async () => {
    const data = validateInteraction(tokenDoc, user, direction === "take" ? targetActor : sourceActor, direction === "take" ? "withdraw" : "deposit");
    if (!user.isGM) {
      const playerActor = direction === "take" ? targetActor : sourceActor;
      if (!userOwnsActor(user, playerActor)) throw new Error("You do not own that character.");
    }
    const containerActor = game.actors.get(data.inventoryActorId);
    if (!containerActor) throw new Error("Container inventory Actor is missing.");
    if (direction === "take" && sourceActor.id !== containerActor.id) throw new Error("Invalid source inventory.");
    if (direction === "deposit" && targetActor.id !== containerActor.id) throw new Error("Invalid target inventory.");

    const liveItem = (direction === "take" ? containerActor : sourceActor).items.get(item.id);
    if (!liveItem) throw new Error("Item no longer exists.");
    const available = quantityOf(liveItem);
    if (available <= 0) throw new Error("That item has no quantity available.");
    const qty = Math.min(available, Math.max(1, Number(quantity)||1));
    const itemName = liveItem.name;
    await addItemToActor(direction === "take" ? targetActor : containerActor, liveItem, qty);
    await removeItemFromActor(direction === "take" ? containerActor : sourceActor, liveItem, qty);
    await appendHistory(containerActor, `${user.name} ${direction === "take" ? "removed" : "deposited"} ${itemName} × ${qty}.`);
    await handleEmptyBehavior(tokenDoc);
    await syncJournal(tokenDoc);
  });
}
export async function copyItemIntoContainer({tokenDoc, item, quantity=1, user=game.user, requesterActor=null}) {
  return withContainerOperation(tokenDoc, async () => {
    const data = validateInteraction(tokenDoc, user, requesterActor, "deposit");
    const actor = game.actors.get(data?.inventoryActorId);
    if (!actor) throw new Error("Container inventory is missing.");
    await addItemToActor(actor, item, Math.max(1, Number(quantity)||1));
    await appendHistory(actor, `${user.name} added ${item.name}${user.isGM ? "" : " from a visible Item template"}.`);
    await syncJournal(tokenDoc);
  });
}
export async function transferCurrency({tokenDoc, actor, coin, quantity, user, direction}) {
  return withContainerOperation(tokenDoc, async () => {
    const action = direction === "take" ? "withdraw" : "deposit";
    const data = validateInteraction(tokenDoc, user, actor, action);
    if (!user.isGM && !userOwnsActor(user, actor)) throw new Error("You do not own that character.");
    if (!["cp","sp","ep","gp","pp"].includes(coin)) throw new Error("Invalid currency type.");
    const containerActor = game.actors.get(data.inventoryActorId);
    if (!containerActor) throw new Error("Container inventory is missing.");
    const source = direction === "take" ? containerActor : actor;
    const target = direction === "take" ? actor : containerActor;
    const sourceC = currencyOf(source); const targetC = currencyOf(target);
    const available = Math.max(0, Number(sourceC[coin] ?? 0));
    if (available <= 0) throw new Error(`No ${coin} available.`);
    const qty = Math.min(available, Math.max(1, Number(quantity)||1));
    await source.update({[`system.currency.${coin}`]: sourceC[coin] - qty});
    await target.update({[`system.currency.${coin}`]: targetC[coin] + qty});
    await appendHistory(containerActor, `${user.name} ${direction === "take" ? "removed" : "deposited"} ${qty} ${coin}.`);
    await handleEmptyBehavior(tokenDoc);
    await syncJournal(tokenDoc);
  });
}

export function identificationState(item) {
  const value = foundry.utils.getProperty(item, "system.identified");
  return {
    supported: typeof value === "boolean",
    identified: value !== false
  };
}

function playerSafeItemSummary(item) {
  const ident = identificationState(item);
  if (!ident.supported || ident.identified) {
    return {id:item.id, name:item.name, img:item.img, type:item.type, quantity:quantityOf(item), identified:true};
  }
  const unidentifiedName = String(foundry.utils.getProperty(item, "system.unidentified.name") ?? "").trim();
  const unidentifiedImg = String(foundry.utils.getProperty(item, "system.unidentified.img") ?? "").trim();
  return {
    id:item.id,
    name:unidentifiedName || "Unidentified Item",
    img:unidentifiedImg || "icons/svg/mystery-man.svg",
    type:"unidentified",
    quantity:quantityOf(item),
    identified:false
  };
}

export async function setContainerItemIdentified(tokenDoc, itemId, identified) {
  if (!game.user.isGM) throw new Error("Only a GM can change item identification.");
  const data = getContainerData(tokenDoc);
  if (!data) throw new Error("This token is not an SBS Container.");
  const actor = game.actors.get(data.inventoryActorId);
  const item = actor?.items?.get(itemId);
  if (!item) throw new Error("Container item not found.");
  const state = identificationState(item);
  if (!state.supported) throw new Error(`${item.name} does not support D&D5e identification.`);
  await item.update({"system.identified": Boolean(identified)});
  await appendHistory(actor, `${item.name} was marked ${identified ? "identified" : "unidentified"} by the GM.`);
  await syncJournal(tokenDoc);
  return Boolean(identified);
}

export function containerSnapshot(tokenDoc, user, actor) {
  const data = validateInteraction(tokenDoc, user, actor, "inspect");
  const containerActor = game.actors.get(data.inventoryActorId);
  if (!containerActor) throw new Error("Container inventory is missing.");
  const {recipients} = activeCurrencyRecipients();
  return {
    items: containerActor.items.contents.map(i => playerSafeItemSummary(i)),
    currency: currencyOf(containerActor),
    activeRecipientCount: recipients.length
  };
}

export function currencySplitPreviewForUser(tokenDoc, user, requesterActor=null) {
  requesterActor ??= user?.character ?? null;
  validateInteraction(tokenDoc, user, requesterActor, "withdraw");
  if (!user.isGM && !game.settings.get(MODULE_ID, "allowPlayerCurrencySplit")) throw new Error("Only a GM can split container currency in this world.");
  return previewCurrencySplit(tokenDoc);
}

export function activeCurrencyRecipients() {
  const recipients = [];
  const skipped = [];
  const seen = new Set();
  for (const user of game.users ?? []) {
    if (!user.active || user.isGM) continue;
    const actor = user.character;
    if (!actor) {
      skipped.push({userId:user.id, userName:user.name, reason:"No assigned character"});
      continue;
    }
    if (actor.getFlag?.(MODULE_ID, "isInventory")) {
      skipped.push({userId:user.id, userName:user.name, reason:"Assigned character is a container inventory"});
      continue;
    }
    if (seen.has(actor.id)) {
      skipped.push({userId:user.id, userName:user.name, actorId:actor.id, actorName:actor.name, reason:"Character already represented"});
      continue;
    }
    seen.add(actor.id);
    recipients.push({userId:user.id, userName:user.name, actorId:actor.id, actorName:actor.name});
  }
  return {recipients, skipped};
}

export function previewCurrencySplit(tokenDoc) {
  const data = getContainerData(tokenDoc);
  const actor = game.actors.get(data?.inventoryActorId);
  const currency = currencyOf(actor);
  const {recipients, skipped} = activeCurrencyRecipients();
  const count = recipients.length;
  const shares = {};
  const remainder = {};
  for (const [coin, amount] of Object.entries(currency)) {
    shares[coin] = count ? Math.floor(amount / count) : 0;
    remainder[coin] = count ? amount % count : amount;
  }
  return {recipients, skipped, currency, shares, remainder};
}

export async function splitCurrencyEvenly({tokenDoc, user, requesterActor=null}) {
  return withContainerOperation(tokenDoc, async () => {
    const data = getContainerData(tokenDoc);
    if (!data) throw new Error("This token is not an SBS Container.");
    requesterActor ??= user?.character ?? null;
    validateInteraction(tokenDoc, user, requesterActor, "withdraw");
    if (!user.isGM && !game.settings.get(MODULE_ID, "allowPlayerCurrencySplit")) throw new Error("Only a GM can split container currency in this world.");

    const containerActor = game.actors.get(data.inventoryActorId);
    if (!containerActor) throw new Error("Container inventory is missing.");
    const plan = previewCurrencySplit(tokenDoc);
    if (!plan.recipients.length) throw new Error("No active non-GM players have an assigned character.");
    if (!Object.values(plan.currency).some(v => v > 0)) throw new Error("There is no currency to split.");

    const updates = [];
    for (const recipient of plan.recipients) {
      const actor = game.actors.get(recipient.actorId);
      if (!actor) continue;
      const current = currencyOf(actor);
      const update = {_id:actor.id};
      for (const coin of ["cp","sp","ep","gp","pp"]) {
        const share = Number(plan.shares[coin] ?? 0);
        if (share > 0) update[`system.currency.${coin}`] = Number(current[coin] ?? 0) + share;
      }
      if (Object.keys(update).length > 1) updates.push(update);
    }
    const containerUpdate = {_id:containerActor.id};
    for (const coin of ["cp","sp","ep","gp","pp"]) containerUpdate[`system.currency.${coin}`] = Number(plan.remainder[coin] ?? 0);
    updates.push(containerUpdate);
    await Actor.implementation.updateDocuments(updates);

    const each = ["cp","sp","ep","gp","pp"].filter(c => plan.shares[c] > 0).map(c => `${plan.shares[c]} ${c}`).join(", ") || "no coins";
    const left = ["cp","sp","ep","gp","pp"].filter(c => plan.remainder[c] > 0).map(c => `${plan.remainder[c]} ${c}`).join(", ") || "nothing";
    await appendHistory(containerActor, `${user.name} split the container currency among ${plan.recipients.length} active character${plan.recipients.length === 1 ? "" : "s"}. Each received ${each}; ${left} remained.`);
    await handleEmptyBehavior(tokenDoc);
    await syncJournal(tokenDoc);
    return plan;
  });
}
export async function handleEmptyBehavior(tokenDoc) {
  const data = getContainerData(tokenDoc);
  const actor = game.actors.get(data?.inventoryActorId);
  if (!actor) return;
  const c = currencyOf(actor);
  const empty = actor.items.size === 0 && Object.values(c).every(v => !v);
  if (!empty) return;
  if (data.emptyBehavior === "notify") ui.notifications.info(`${tokenDoc.name} is now empty.`);
  if (data.emptyBehavior === "close" && data.state === "open") await setOpenState(tokenDoc, false, {user:game.user});
}

export async function updateContainer(tokenDoc, changes) {
  if (!game.user.isGM) throw new Error("GM only.");
  const current = getContainerData(tokenDoc);
  const next = mergeConfig(current, changes);
  next.isContainer = true;
  if (next.state === "locked") {
    next.state = "closed";
    next.lock = {...next.lock, enabled:true, startLocked:true};
  } else {
    next.lock = {...next.lock, startLocked:false};
  }

  const actor = game.actors.get(next.inventoryActorId);
  if (!actor) throw new Error("Container inventory Actor is missing.");
  const fullLockConfig = foundry.utils.deepClone(next.lock ?? {});
  if (fullLockConfig.enabled) await configureLock(tokenDoc, fullLockConfig);
  else await disableLock(tokenDoc);

  const actorPrivate = privateContainerData(actor);
  actorPrivate.lockConfig = foundry.utils.deepClone(fullLockConfig);
  await actor.setFlag(MODULE_ID, "private", actorPrivate);

  next.lock = {enabled:Boolean(fullLockConfig.enabled), lockOnClose:Boolean(fullLockConfig.lockOnClose)};
  delete next.history; delete next.originalContents; delete next.initialItems;
  await tokenDoc.update({name: next.name, [`flags.${MODULE_ID}.container`]: next});
  await actor.update({name:`[Container] ${next.name}`, img:next.images?.closed ?? actor.img});
  await applyAppearance(tokenDoc);
  await renameJournalForContainer(tokenDoc);
  await syncJournalOwnership(tokenDoc);
  await syncJournal(tokenDoc);
}
export function dropDataFromEvent(event) {
  if (!event) return null;
  // Prefer Foundry's own drag-data parser when present. v13 still exposes drag
  // data through Document workflows, but sheet implementations/browsers differ
  // in which DataTransfer MIME type they populate.
  for (const parser of [
    globalThis.TextEditor?.getDragEventData,
    foundry?.applications?.ux?.TextEditor?.getDragEventData
  ]) {
    if (typeof parser === "function") {
      try {
        const parsed = parser.call(globalThis.TextEditor ?? foundry?.applications?.ux?.TextEditor, event);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length) return parsed;
      } catch (_) {}
    }
  }
  const dt = event.dataTransfer;
  if (!dt) return null;
  const types = ["application/json", "text/plain", "text"];
  for (const type of types) {
    try {
      const raw = dt.getData(type);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {}
  }
  return null;
}

export function safeDropReference(data) {
  if (!data || typeof data !== "object") return null;
  const out = {};
  for (const key of ["type","uuid","id","_id","pack","documentName"]) {
    if (data[key] != null) out[key] = data[key];
  }
  // Some system sheets nest a UUID/reference in data.
  if (data.data?.uuid) out.uuid ??= data.data.uuid;
  if (data.data?._id) out.id ??= data.data._id;
  return out;
}

export async function resolveDropDocument(data) {
  if (!data) return null;
  try {
    const type = data.type ?? data.documentName;
    const cls = type ? CONFIG?.[type]?.documentClass : null;
    if (cls?.fromDropData) {
      try {
        const doc = await cls.fromDropData(data);
        if (doc) return doc;
      } catch (_) {}
    }
    if (data.uuid) {
      const doc = await fromUuid(data.uuid);
      if (doc) return doc;
    }
    const id = data.id ?? data._id;
    if (data.pack && id) {
      const doc = await game.packs.get(data.pack)?.getDocument(id);
      if (doc) return doc;
    }
    if (type === "Item" && id) return game.items.get(id) ?? null;
    if (type === "JournalEntry" && id) return game.journal.get(id) ?? null;
    if (type === "JournalEntryPage" && id && data.parentUuid) {
      const parent = await fromUuid(data.parentUuid);
      return parent?.pages?.get(id) ?? null;
    }
  } catch (e) { console.warn(`${MODULE_ID} | Could not resolve drop`, data, e); }
  return null;
}

export async function resolveDropItem(data) {
  const doc = await resolveDropDocument(data);
  return doc?.documentName === "Item" ? doc : null;
}

function journalEntryFor(doc) {
  if (doc?.documentName === "JournalEntry") return doc;
  if (doc?.documentName === "JournalEntryPage") return doc.parent ?? null;
  return null;
}

function journalPagesFor(doc) {
  if (doc?.documentName === "JournalEntryPage") return [doc];
  if (doc?.documentName === "JournalEntry") return doc.pages?.contents ?? [];
  return [];
}

function canReadJournalDocument(doc, user) {
  if (user?.isGM) return true;
  const entry = journalEntryFor(doc);
  return Boolean(entry?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
}

function quantityNearJournalLink(anchor) {
  const row = anchor.closest?.("tr");
  if (row) {
    const cells = [...row.querySelectorAll("th,td")];
    const cell = anchor.closest?.("th,td");
    const start = Math.max(0, cells.indexOf(cell) + 1);
    for (const candidate of cells.slice(start)) {
      const text = String(candidate.textContent ?? "").trim();
      const m = text.match(/^(?:qty(?:uantity)?\s*[:=]?\s*)?(?:[x×]\s*)?(\d+)$/i);
      if (m) return Math.max(1, Number(m[1]) || 1);
    }
  }
  const context = anchor.closest?.("li,p,div")?.textContent ?? "";
  for (const re of [
    /(?:qty|quantity)\s*[:=]?\s*(\d+)/i,
    /(?:×|\bx)\s*(\d+)\b/i,
    /\b(\d+)\s*(?:×|x)\b/i
  ]) {
    const m = String(context).match(re);
    if (m) return Math.max(1, Number(m[1]) || 1);
  }
  return 1;
}

function currencyFromJournalRoot(root) {
  const currency = {cp:0,sp:0,ep:0,gp:0,pp:0};
  let inCurrencySection = false;
  const elements = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,li,p,tr")];
  for (const el of elements) {
    const tag = el.tagName?.toLowerCase?.() ?? "";
    const text = String(el.textContent ?? "").replace(/\s+/g," ").trim();
    if (!text) continue;
    if (/^h[1-6]$/.test(tag)) {
      inCurrencySection = /\b(currency|coins?|money)\b/i.test(text);
      continue;
    }
    // Avoid counting nested paragraphs twice when their parent LI/TR is also scanned.
    if (tag === "p" && el.closest("li,tr")) continue;
    const explicitLabel = /^\s*(?:currency|coins?|money)\s*[:\-–—]/i.test(text);
    if (!inCurrencySection && !explicitLabel) continue;
    const matches = [...text.matchAll(/\b([\d,]+)\s*(cp|sp|ep|gp|pp)\b/gi)];
    if (!matches.length) continue;
    // A line like "Gem worth 25 gp" inside a Currency / Valuables section is a
    // valuation, not loose currency. Accept explicit currency labels, multi-coin
    // lines, or lines that are essentially only a coin amount/list.
    const stripped = text
      .replace(/^\s*(?:currency|coins?|money)\s*[:\-–—]?\s*/i,"")
      .replace(/\b[\d,]+\s*(?:cp|sp|ep|gp|pp)\b/gi,"")
      .replace(/[,&+;:\-–—()]/g," ")
      .replace(/\band\b/gi," ")
      .replace(/\s+/g," ")
      .trim();
    if (!explicitLabel && matches.length < 2 && stripped) continue;
    for (const m of matches) currency[m[2].toLowerCase()] += Number(String(m[1]).replace(/,/g,"")) || 0;
  }
  return currency;
}

async function parseJournalImport(doc, user=game.user) {
  if (!journalEntryFor(doc)) throw new Error("Drop a Foundry Journal Entry or Journal Page.");
  if (!canReadJournalDocument(doc, user)) throw new Error("You do not have permission to read that Journal.");
  const refs = new Map();
  const currency = {cp:0,sp:0,ep:0,gp:0,pp:0};
  for (const page of journalPagesFor(doc)) {
    if (page.type && page.type !== "text") continue;
    const html = String(page.text?.content ?? "");
    if (!html) continue;
    const root = new DOMParser().parseFromString(html, "text/html").body;
    const anchors = [...root.querySelectorAll('a[data-uuid],a[data-type="Item"][data-id]')];
    for (const anchor of anchors) {
      let uuid = String(anchor.dataset?.uuid ?? "").trim();
      if (!uuid && anchor.dataset?.type === "Item" && anchor.dataset?.id) uuid = `Item.${anchor.dataset.id}`;
      if (!uuid) continue;
      const qty = quantityNearJournalLink(anchor);
      refs.set(uuid, (refs.get(uuid) ?? 0) + qty);
    }
    // Also support un-enriched Foundry @UUID[...] journal syntax.
    for (const m of html.matchAll(/@UUID\[([^\]]+)\](?:\{[^}]*\})?/g)) {
      const uuid = String(m[1] ?? "").trim();
      if (uuid && !refs.has(uuid)) refs.set(uuid, 1);
    }
    const pageCurrency = currencyFromJournalRoot(root);
    for (const coin of Object.keys(currency)) currency[coin] += Number(pageCurrency[coin] ?? 0);
  }

  const items = [];
  const skipped = [];
  for (const [uuid, quantity] of refs) {
    try {
      const item = await fromUuid(uuid);
      if (!item || item.documentName !== "Item") {
        skipped.push({uuid, reason:"Item link could not be resolved"});
        continue;
      }
      if (!user?.isGM && !item.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) {
        skipped.push({uuid, name:item.name, reason:"No permission to use linked Item"});
        continue;
      }
      items.push({item, uuid, quantity:Math.max(1, Number(quantity)||1)});
    } catch (_) { skipped.push({uuid, reason:"Item link could not be resolved"}); }
  }
  return {items, currency, skipped};
}

export async function previewJournalImport(journalDoc, user=game.user) {
  const parsed = await parseJournalImport(journalDoc, user);
  return {
    journalName: journalEntryFor(journalDoc)?.name ?? journalDoc?.name ?? "Journal",
    pageName: journalDoc?.documentName === "JournalEntryPage" ? journalDoc.name : null,
    items: parsed.items.map(x => ({name:x.item.name, img:x.item.img, type:x.item.type, quantity:x.quantity, uuid:x.uuid})),
    currency: parsed.currency,
    skipped: parsed.skipped
  };
}

/**
 * Convert a Journal's linked loot into creation-safe staged Item data.
 * This is intentionally copy-only: the Journal and the linked world Items are
 * never modified. Used by the Container Maker before a token/Actor exists.
 */
export async function stageJournalForCreation(journalDoc, user=game.user) {
  const parsed = await parseJournalImport(journalDoc, user);
  const items = parsed.items.map(entry => {
    const data = foundry.utils.deepClone(entry.item.toObject());
    delete data._id;
    foundry.utils.setProperty(data, "system.quantity", Math.max(1, Number(entry.quantity) || 1));
    return data;
  });
  return {
    journalName: journalEntryFor(journalDoc)?.name ?? journalDoc?.name ?? "Journal",
    pageName: journalDoc?.documentName === "JournalEntryPage" ? journalDoc.name : null,
    items,
    currency: foundry.utils.deepClone(parsed.currency),
    skipped: foundry.utils.deepClone(parsed.skipped)
  };
}

export async function importJournalIntoContainer({tokenDoc, journalDoc, user=game.user, requesterActor=null}) {
  return withContainerOperation(tokenDoc, async () => {
    const data = validateInteraction(tokenDoc, user, requesterActor, "deposit");
    const actor = game.actors.get(data?.inventoryActorId);
    if (!actor) throw new Error("Container inventory is missing.");
    const parsed = await parseJournalImport(journalDoc, user);
    if (!parsed.items.length && !Object.values(parsed.currency).some(v => Number(v) > 0)) {
      throw new Error("No importable linked Items or currency were found in that Journal.");
    }
    for (const entry of parsed.items) await addItemToActor(actor, entry.item, entry.quantity);
    const current = currencyOf(actor);
    const updates = {};
    for (const coin of ["cp","sp","ep","gp","pp"]) {
      const amount = Number(parsed.currency[coin] ?? 0);
      if (amount > 0) updates[`system.currency.${coin}`] = Number(current[coin] ?? 0) + amount;
    }
    if (Object.keys(updates).length) await actor.update(updates);
    const itemCount = parsed.items.reduce((n,x)=>n+x.quantity,0);
    const money = ["cp","sp","ep","gp","pp"].filter(c=>parsed.currency[c]>0).map(c=>`${parsed.currency[c]} ${c}`).join(", ");
    const sourceName = journalEntryFor(journalDoc)?.name ?? journalDoc?.name ?? "Journal";
    const details = [itemCount ? `${itemCount} item${itemCount===1?"":"s"}` : "", money].filter(Boolean).join(" and ");
    await appendHistory(actor, `${user.name} imported ${details} from journal “${sourceName}”.`);
    await syncJournal(tokenDoc);
    return {items:parsed.items.length, itemQuantity:itemCount, currency:parsed.currency, skipped:parsed.skipped};
  });
}

export async function forkDuplicatedContainer(tokenDoc) {
  if (!game.user.isGM) return;
  const data = getContainerData(tokenDoc);
  if (!data?.inventoryActorId) return;
  const source = game.actors.get(data.inventoryActorId);
  if (!source) return;
  const ref = source.getFlag(MODULE_ID, "tokenRef");
  if (!ref?.tokenId || (ref.tokenId === tokenDoc.id && ref.sceneId === tokenDoc.parent?.id)) return;

  const folder = await inventoryFolder();
  const cloneData = source.toObject();
  delete cloneData._id;
  cloneData.name = `[Container] ${tokenDoc.name}`;
  cloneData.folder = folder.id;
  cloneData.ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
  cloneData.flags ??= {};
  const sourcePrivate = privateContainerData(source);
  cloneData.flags[MODULE_ID] = {...(cloneData.flags[MODULE_ID] ?? {}), containerId: foundry.utils.randomID(), isInventory:true, private:sourcePrivate};
  const clone = await Actor.create(cloneData);
  const next = foundry.utils.deepClone(data);
  next.isContainer = true;
  next.containerId = clone.getFlag(MODULE_ID,"containerId");
  next.inventoryActorId = clone.id;
  next.journalId = null;
  next.createdAt = new Date().toISOString();
  delete next.history; delete next.originalContents; delete next.initialItems;
  const clonePrivate = privateContainerData(clone);
  clonePrivate.originalContents = initialSnapshot(clone.items.contents);
  clonePrivate.history = [{when:new Date().toLocaleString(), text:"Container was safely duplicated with an independent inventory."}];
  await clone.setFlag(MODULE_ID, "private", clonePrivate);
  const shell = await createContainerShell({name:tokenDoc.name, containerId:next.containerId, inventoryActorId:clone.id, img:next.images?.closed});
  next.shellActorId = shell.id;
  await tokenDoc.update({actorId:shell.id, actorLink:false, [`flags.${MODULE_ID}.container`]:next});
  const journal = await createJournal(tokenDoc, clone, next);
  next.journalId = journal.id;
  await tokenDoc.setFlag(MODULE_ID,"container",next);
  await clone.setFlag(MODULE_ID,"tokenRef",{sceneId:tokenDoc.parent.id,tokenId:tokenDoc.id,journalId:journal.id});
  await shell.setFlag(MODULE_ID,"tokenRef",{sceneId:tokenDoc.parent.id,tokenId:tokenDoc.id});
  await syncJournal(tokenDoc);
  ui.notifications.info(`${tokenDoc.name} was duplicated with its own inventory and journal.`);
}
