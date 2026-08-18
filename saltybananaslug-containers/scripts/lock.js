import {LNK_CONTAINER_TYPE, LNK_ID, MODULE_ID} from "./constants.js";

export function lnkModule() { return game.modules.get(LNK_ID); }
export function lnkApi() { return lnkModule()?.api; }
export function lnkFlags() { return lnkApi()?.LnKFlags; }
export function lockAvailable() { return Boolean(lnkModule()?.active && lnkApi()?.LnKFlags); }

/**
 * Register SBS Containers as a native-compatible custom token lock type.
 * Lock & Key asks these hooks when resolving what kind of lock a document is.
 */
export function registerLockTypeHooks() {
  Hooks.on(`${LNK_ID}.Locktype`, (document, info) => {
    if (document?.getFlag?.(MODULE_ID, "container")?.isContainer) info.type = LNK_CONTAINER_TYPE;
  });
  Hooks.on(`${LNK_ID}.isTokenLocktype`, (lockType, info) => {
    if (lockType === LNK_CONTAINER_TYPE) info.isTokenLocktype = true;
  });
  // Mirror Lock & Key transitions into an SBS-owned public safety flag. This is
  // not a competing lock system; it is a fail-closed cache used only to prevent
  // loot disclosure if another module's ownership/open-sheet rules differ.
  Hooks.on(`${LNK_ID}.onLock`, (_lockType, document) => {
    if (game.user?.isGM && document?.getFlag?.(MODULE_ID, "container")?.isContainer) {
      syncLockMirror(document, true).catch(err=>console.warn(`${MODULE_ID} | lock mirror sync failed`, err));
    }
  });
  Hooks.on(`${LNK_ID}.onunLock`, (_lockType, document) => {
    if (game.user?.isGM && document?.getFlag?.(MODULE_ID, "container")?.isContainer) {
      syncLockMirror(document, false).catch(err=>console.warn(`${MODULE_ID} | unlock mirror sync failed`, err));
    }
  });
}

export function rawLockState(tokenDoc) {
  const doc = tokenDoc?.document ?? tokenDoc;
  if (!doc) return {lockable:false, locked:false, mirror:false};
  const lockable = Boolean(
    doc?.getFlag?.(LNK_ID, "LockableFlag") ??
    foundry.utils.getProperty(doc, `flags.${LNK_ID}.LockableFlag`) ??
    doc?.flags?.[LNK_ID]?.LockableFlag
  );
  const locked = Boolean(
    doc?.getFlag?.(LNK_ID, "LockedFlag") ??
    foundry.utils.getProperty(doc, `flags.${LNK_ID}.LockedFlag`) ??
    doc?.flags?.[LNK_ID]?.LockedFlag
  );
  const mirror = Boolean(
    doc?.getFlag?.(MODULE_ID, "lockMirror") ??
    foundry.utils.getProperty(doc, `flags.${MODULE_ID}.lockMirror`)
  );
  return {lockable, locked, mirror};
}

/**
 * SBS deliberately does NOT use Lock & Key's UserCanopenToken result here.
 * Lock & Key 5.0.5 can allow owned tokens to open while locked when its
 * alwaysopenOwned setting is enabled. SBS containers require the lock itself
 * to be unlocked for every non-GM user, regardless of token ownership.
 */
export function isLocked(tokenDoc) {
  const doc = tokenDoc?.document ?? tokenDoc;
  const raw = rawLockState(doc);
  let apiLocked = false;
  try { apiLocked = Boolean(lnkFlags()?.isLocked(doc)); } catch (_) {}
  return Boolean(raw.mirror || (raw.lockable && raw.locked) || apiLocked);
}

export async function syncLockMirror(tokenDoc, forcedState=undefined) {
  const doc = tokenDoc?.document ?? tokenDoc;
  if (!doc || !game.user?.isGM) return false;
  let state;
  if (forcedState !== undefined) state = Boolean(forcedState);
  else {
    const raw = rawLockState(doc);
    let apiLocked = false;
    try { apiLocked = Boolean(lnkFlags()?.isLocked(doc)); } catch (_) {}
    state = Boolean((raw.lockable && raw.locked) || apiLocked);
  }
  if (Boolean(doc.getFlag?.(MODULE_ID, "lockMirror")) !== state) {
    await doc.setFlag(MODULE_ID, "lockMirror", state);
  }
  return state;
}

export function lockDebug(tokenDoc) {
  const doc = tokenDoc?.document ?? tokenDoc;
  const raw = rawLockState(doc);
  let apiLocked = null;
  let apiLockable = null;
  try { apiLocked = Boolean(lnkFlags()?.isLocked(doc)); } catch (_) {}
  try { apiLockable = Boolean(lnkFlags()?.isLockable(doc)); } catch (_) {}
  const cdata = doc?.getFlag?.(MODULE_ID, "container") ?? {};
  const shell = cdata.shellActorId ? game.actors?.get(cdata.shellActorId) : null;
  const inventory = cdata.inventoryActorId ? game.actors?.get(cdata.inventoryActorId) : null;
  return {
    tokenUuid: doc?.uuid ?? null,
    actorId: doc?.actorId ?? null,
    shellActorId: cdata.shellActorId ?? null,
    inventoryActorId: cdata.inventoryActorId ?? null,
    tokenIsOwner: doc?.isOwner ?? null,
    shellDefaultOwnership: shell?.ownership?.default ?? null,
    inventoryDefaultOwnership: inventory?.ownership?.default ?? null,
    strictLocked: isLocked(doc),
    rawLockable: raw.lockable,
    rawLocked: raw.locked,
    sbsLockMirror: raw.mirror,
    apiLockable,
    apiLocked
  };
}

export function isLockable(tokenDoc) {
  const doc = tokenDoc?.document ?? tokenDoc;
  const rawLockable = Boolean(doc?.getFlag?.(LNK_ID, "LockableFlag") ?? doc?.flags?.[LNK_ID]?.LockableFlag);
  try { return Boolean(rawLockable || lnkFlags()?.isLockable(doc)); }
  catch (_) { return rawLockable; }
}


export function currentKeyIds(tokenDoc) {
  return String(tokenDoc?.getFlag?.(LNK_ID, "IDKeysFlag") ?? "")
    .split(";").map(s=>s.trim()).filter(Boolean);
}

export async function createKeyForContainer(tokenDoc, {keyName="", keyId=""}={}) {
  if (!game.user.isGM) throw new Error("Only a GM can create Lock & Key items.");
  const api = lnkApi();
  const flags = lnkFlags();
  if (!api?.createNewcustomKey || !flags) throw new Error("Lock & Key key-creation API is unavailable.");
  const exactName = String(keyName ?? "").trim();
  if (!exactName) throw new Error("Enter a Key Item Name. It will be used exactly as typed.");

  if (!flags.isLockable(tokenDoc)) await flags.makeLockable(tokenDoc, false);
  let ids = currentKeyIds(tokenDoc);
  let id = String(keyId ?? "").trim();
  if (!id) id = ids[0] || foundry.utils.randomID();
  if (id.includes(";")) throw new Error("A single new key ID cannot contain a semicolon.");
  if (!ids.includes(id)) {
    ids.push(id);
    await tokenDoc.setFlag(LNK_ID, "IDKeysFlag", ids.join(";"));
  }
  await api.createNewcustomKey(tokenDoc, {
    KeyName: exactName,
    KeyID: id,
    KeyImage: "icons/sundries/misc/key-steel.webp",
    KeyFolder: ""
  });
  return {keyName: exactName, keyId: id};
}

export async function configureLock(tokenDoc, cfg={}) {
  if (!cfg.enabled) return;
  const flags = lnkFlags();
  if (!flags) throw new Error("Lock & Key API is unavailable.");
  await flags.makeLockable(tokenDoc, Boolean(cfg.startLocked));

  // Lock & Key 5.0.5 exposes lock-state helpers publicly, while several detailed
  // lock settings remain document flags. Keep the field names isolated here so
  // the rest of SBS Containers never depends on Lock & Key internals.
  const updates = {
    "flags.LocknKey.LockDCFlag": Number(cfg.pickDC ?? 15),
    "flags.LocknKey.LockBreakDCFlag": Number(cfg.breakDC ?? 20),
    "flags.LocknKey.LPAttemptsFlag": Number(cfg.attempts ?? -1),
    "flags.LocknKey.LPAttemptsMaxFlag": Number(cfg.attempts ?? -1),
    "flags.LocknKey.requiredLPsuccessFlag": Math.max(1, Number(cfg.requiredSuccesses ?? 1)),
    "flags.LocknKey.SpecialLPFlag": String(cfg.specialLockpick ?? ""),
    "flags.LocknKey.LockonCloseFlag": Boolean(cfg.lockOnClose),
    "flags.LocknKey.IDKeysFlag": String(cfg.keyId ?? "")
  };
  await tokenDoc.update(updates);
  await flags.setPassKey(tokenDoc, String(cfg.password ?? ""));

  await syncLockMirror(tokenDoc);

  if (cfg.createKey) {
    const created = await createKeyForContainer(tokenDoc, {keyName:cfg.keyName, keyId:cfg.keyId});
    cfg.keyId = created.keyId;
    cfg.keyName = created.keyName;
    cfg.createKey = false;
  }
}

export async function disableLock(tokenDoc) {
  if (!tokenDoc) return;
  const flags = lnkFlags();
  if (flags?.disableLock) { await flags.disableLock(tokenDoc); await syncLockMirror(tokenDoc, false); return; }
  await tokenDoc.update({
    "flags.LocknKey.LockedFlag": false,
    "flags.LocknKey.LockableFlag": false
  });
  await syncLockMirror(tokenDoc, false);
}

export async function setLocked(tokenDoc, state) {
  const flags = lnkFlags();
  if (!flags) throw new Error("Lock & Key API is unavailable.");
  if (!flags.isLockable(tokenDoc)) await flags.makeLockable(tokenDoc, Boolean(state));
  else await flags.setLockedstate(tokenDoc, Boolean(state));
  await syncLockMirror(tokenDoc, Boolean(state));
}

export function lockSummary(tokenDoc) {
  if (!isLockable(tokenDoc)) return "Not lockable";
  return isLocked(tokenDoc) ? "Locked" : "Unlocked";
}
