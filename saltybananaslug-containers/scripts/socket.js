import {MODULE_ID, SOCKET_NAME, TYPES, defaultImages} from "./constants.js";
import {activeGM, notifyError} from "./utils.js";
import {containerSnapshot, copyItemIntoContainer, createContainer, currencySplitPreviewForUser, importJournalIntoContainer, previewJournalImport, resolveDropDocument, resolveDropItem, setOpenState, splitCurrencyEvenly, transferCurrency, transferItem, validateInteraction} from "./container-service.js";
import {isLocked} from "./lock.js";

const pending = new Map();

export function setupSocket() {
  game.socket.on(SOCKET_NAME, async msg => {
    if (!msg || msg.sender === game.user.id) return;
    if (msg.type === "response") {
      if (msg.target !== game.user.id) return;
      const p = pending.get(msg.requestId);
      if (!p) return;
      pending.delete(msg.requestId);
      msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error || "Container request failed."));
      return;
    }
    if (msg.type !== "request" || !game.user.isGM) return;
    const designated = activeGM();
    if (designated?.id !== game.user.id) return;
    const sender = game.users.get(msg.sender);
    let result = null;
    try {
      result = await handleRequest(msg.action, msg.payload ?? {}, sender);
      game.socket.emit(SOCKET_NAME, {type:"response", requestId:msg.requestId, sender:game.user.id, target:msg.sender, ok:true, result});
    } catch (err) {
      console.error("SBS Containers socket request failed", err);
      game.socket.emit(SOCKET_NAME, {type:"response", requestId:msg.requestId, sender:game.user.id, target:msg.sender, ok:false, error:err.message});
    }
  });
}

async function handleRequest(action, payload, user) {
  if (!user) throw new Error("Unknown requesting user.");

  // Fail closed for all player operations that can reveal or alter loot. The
  // player's observed lock state is carried with the request as an additional
  // one-way safety signal; a client can make a request more restrictive but can
  // never use it to bypass the GM's own Lock & Key state.
  const guarded = new Set(["setOpen","snapshot","transferItem","copyItem","journalPreview","journalImport","currency","splitPreview","splitCurrency"]);
  if (!user.isGM && guarded.has(action) && payload.tokenUuid) {
    const guardToken = await fromUuid(payload.tokenUuid);
    if (!guardToken) throw new Error("Container could not be resolved.");
    if (payload.clientObservedLocked || isLocked(guardToken)) throw new Error("The container is locked.");
  }
  if (action === "setOpen") {
    const token = await fromUuid(payload.tokenUuid);
    const actor = payload.actorUuid ? await fromUuid(payload.actorUuid) : null;
    await setOpenState(token, Boolean(payload.open), {user, actor});
    return true;
  }
  if (action === "snapshot") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const actor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    return containerSnapshot(tokenDoc, user, actor);
  }
  if (action === "transferItem") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    const containerActor = game.actors.get(tokenDoc.getFlag(MODULE_ID,"container")?.inventoryActorId);
    if (!containerActor) throw new Error("Container inventory is missing.");
    let sourceActor, targetActor;
    if (payload.direction === "take") {
      sourceActor = containerActor;
      targetActor = await fromUuid(payload.targetActorUuid);
    } else if (payload.direction === "deposit") {
      sourceActor = await fromUuid(payload.sourceActorUuid);
      targetActor = containerActor;
    } else throw new Error("Invalid transfer direction.");
    if (!sourceActor || !targetActor) throw new Error("Transfer documents could not be resolved.");
    const item = sourceActor.items.get(payload.itemId);
    if (!item) throw new Error("Item not found.");
    await transferItem({tokenDoc, sourceActor, targetActor, item, quantity:payload.quantity, user, direction:payload.direction});
    return true;
  }
  if (action === "copyItem") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const requesterActor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    const item = await resolveDropItem(payload.dropData);
    if (!item || item.documentName !== "Item") throw new Error("Dropped Item could not be resolved.");
    if (item.parent?.documentName === "Actor") throw new Error("Actor Items must be moved from the owned Actor rather than copied.");
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    if (!item.testUserPermission?.(user, observer)) throw new Error("You do not have permission to use that Item template.");
    await copyItemIntoContainer({tokenDoc, item, quantity:1, user, requesterActor});
    return true;
  }
  if (action === "journalPreview") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const requesterActor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    validateInteraction(tokenDoc, user, requesterActor, "deposit");
    const journalDoc = await resolveDropDocument(payload.dropData);
    if (!journalDoc || !["JournalEntry","JournalEntryPage"].includes(journalDoc.documentName)) throw new Error("Dropped Journal could not be resolved.");
    return previewJournalImport(journalDoc, user);
  }
  if (action === "journalImport") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const requesterActor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    const journalDoc = await resolveDropDocument(payload.dropData);
    if (!journalDoc || !["JournalEntry","JournalEntryPage"].includes(journalDoc.documentName)) throw new Error("Dropped Journal could not be resolved.");
    return importJournalIntoContainer({tokenDoc, journalDoc, user, requesterActor});
  }
  if (action === "currency") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const actor = await fromUuid(payload.actorUuid);
    if (!tokenDoc || !actor) throw new Error("Currency transfer documents could not be resolved.");
    await transferCurrency({tokenDoc, actor, coin:payload.coin, quantity:payload.quantity, user, direction:payload.direction});
    return true;
  }
  if (action === "splitPreview") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const requesterActor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    return currencySplitPreviewForUser(tokenDoc, user, requesterActor);
  }
  if (action === "splitCurrency") {
    const tokenDoc = await fromUuid(payload.tokenUuid);
    const requesterActor = payload.actorUuid ? await fromUuid(payload.actorUuid) : user.character;
    if (!tokenDoc) throw new Error("Container could not be resolved.");
    await splitCurrencyEvenly({tokenDoc, user, requesterActor});
    return true;
  }
  if (action === "create") {
    if (!game.settings.get(MODULE_ID, "allowPlayerCreation")) throw new Error("Player container creation is disabled.");
    const scene = game.scenes.get(payload.sceneId);
    if (!scene) throw new Error("Scene not found.");
    const config = sanitizePlayerCreateConfig(payload.config ?? {}, user);
    const token = await createContainer(config, {scene, x:payload.x, y:payload.y, creatorUserId:user.id});
    return token.uuid;
  }
  throw new Error(`Unknown container action: ${action}`);
}

function sanitizePlayerCreateConfig(input, user) {
  const type = TYPES[input.type] ? input.type : "chest";
  const suppliedImages = input.images ?? {};
  const defaults = defaultImages(type);
  const safeMode = value => ["all","creator","none"].includes(value) ? value : "creator";
  return {
    isContainer: true,
    name: String(input.name || "Player Container").trim().slice(0, 100) || "Player Container",
    type,
    customType: type === "other" ? String(input.customType || "Other").slice(0,100) : "",
    description: String(input.description || "").slice(0, 4000),
    state: input.state === "open" ? "open" : "closed",
    images: {
      closed: String(suppliedImages.closed || defaults.closed),
      open: String(suppliedImages.open || defaults.open),
      locked: String(suppliedImages.locked || defaults.locked)
    },
    distance: Math.max(0, Math.min(100, Number(input.distance) || 5)),
    permissions: {
      open: safeMode(input.permissions?.open),
      close: safeMode(input.permissions?.close),
      inspect: input.permissions?.inspect === "all" ? "all" : "open",
      deposit: safeMode(input.permissions?.deposit),
      withdraw: safeMode(input.permissions?.withdraw),
      selectedUserIds: []
    },
    lock: {enabled:false, startLocked:false, createKey:false, lockOnClose:false},
    journal: {
      visibility: input.journal?.visibility === "all" ? "all" : "gm",
      selectedUserIds: [],
      originalSnapshot: true,
      transactionLog: Boolean(input.journal?.transactionLog ?? true)
    },
    capacity: {mode:"unlimited", maxItems:0, maxWeight:0, allowedTypes:[]},
    emptyBehavior: "stay",
    // Player-created containers intentionally start empty. Players deposit from
    // owned Actors after creation so the GM can validate and remove the source items.
    initialItems: [],
    currency: {cp:0,sp:0,ep:0,gp:0,pp:0},
    createdBy: user.id
  };
}

export function requestGM(action, payload={}) {
  if (game.user.isGM) return Promise.reject(new Error("requestGM should only be used by players."));
  payload = {...payload};
  if (payload.tokenUuid) {
    try {
      let token = globalThis.fromUuidSync?.(payload.tokenUuid) ?? null;
      if (!token) {
        const m = String(payload.tokenUuid).match(/^Scene\.([^.]+)\.Token\.([^.]+)$/);
        if (m) token = game.scenes.get(m[1])?.tokens.get(m[2]) ?? null;
      }
      payload.clientObservedLocked = Boolean(token && isLocked(token));
    } catch (_) { payload.clientObservedLocked = false; }
  }
  const gm = activeGM();
  if (!gm) return Promise.reject(new Error("No active GM is available to process the container action."));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve,reject) => {
    pending.set(requestId, {resolve,reject});
    setTimeout(() => {
      if (!pending.has(requestId)) return;
      pending.delete(requestId);
      reject(new Error("The GM did not respond to the container request."));
    }, 12000);
    game.socket.emit(SOCKET_NAME, {type:"request", requestId, sender:game.user.id, action, payload});
  }).catch(err => { notifyError(err); throw err; });
}
