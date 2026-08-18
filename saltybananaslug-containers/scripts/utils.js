import {MODULE_ID, INVENTORY_FOLDER, SHELL_FOLDER, JOURNAL_ROOT_FOLDER} from "./constants.js";

export function deepClone(obj) {
  return foundry.utils.deepClone(obj);
}

export function mergeConfig(base, extra) {
  return foundry.utils.mergeObject(foundry.utils.deepClone(base), extra ?? {}, {inplace: false, recursive: true});
}

export function isContainer(doc) {
  return Boolean(doc?.getFlag?.(MODULE_ID, "container")?.isContainer);
}

export function getContainerData(doc) {
  return doc?.getFlag?.(MODULE_ID, "container") ?? null;
}

export function activeGM() {
  return game.users?.find(u => u.active && u.isGM) ?? null;
}

export function userOwnsActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  return actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

export async function ensureFolder(name, type, parentId=null) {
  const existing = game.folders.find(f => f.type === type && f.name === name && (f.folder?.id ?? f.folder ?? null) === parentId);
  if (existing) return existing;
  return Folder.create({name, type, folder: parentId});
}

export async function inventoryFolder() {
  return ensureFolder(INVENTORY_FOLDER, "Actor");
}

export async function shellFolder() {
  return ensureFolder(SHELL_FOLDER, "Actor");
}

export async function journalSceneFolder(sceneName) {
  const root = await ensureFolder(JOURNAL_ROOT_FOLDER, "JournalEntry");
  return ensureFolder(sceneName || "Unknown Scene", "JournalEntry", root.id);
}

export function uniqueJournalName(base) {
  const names = new Set(game.journal.map(j => j.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function tokenCenter(tokenDoc) {
  const size = canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100;
  return {
    x: Number(tokenDoc.x ?? 0) + Number(tokenDoc.width ?? 1) * size / 2,
    y: Number(tokenDoc.y ?? 0) + Number(tokenDoc.height ?? 1) * size / 2
  };
}

export function distanceBetweenTokens(a, b) {
  if (!a || !b || a.parent?.id !== b.parent?.id) return Infinity;
  const ca = tokenCenter(a); const cb = tokenCenter(b);
  const pixels = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  const gridSize = canvas?.grid?.size ?? a.parent?.grid?.size ?? 100;
  const gridDistance = a.parent?.grid?.distance ?? 5;
  return (pixels / gridSize) * gridDistance;
}

export function actorTokenOnScene(actor, scene) {
  if (!actor || !scene) return null;
  const controlled = canvas?.tokens?.controlled?.find(t => t.actor?.id === actor.id)?.document;
  if (controlled) return controlled;
  return scene.tokens.find(t => t.actorId === actor.id) ?? null;
}

export function worldPointAtViewportCenter() {
  const w = window.innerWidth / 2;
  const h = window.innerHeight / 2;
  try {
    const p = canvas.stage.worldTransform.applyInverse({x:w, y:h});
    const snapped = canvas.grid.getSnappedPoint ? canvas.grid.getSnappedPoint({x:p.x, y:p.y}, {mode: CONST.GRID_SNAPPING_MODES?.CENTER ?? 0x0000}) : p;
    return {x: Math.round(snapped.x), y: Math.round(snapped.y)};
  } catch (_) {
    return {x: 0, y: 0};
  }
}

export function quantityOf(item) {
  const q = Number(foundry.utils.getProperty(item, "system.quantity"));
  return Number.isFinite(q) && q >= 0 ? q : 1;
}

export function stackKey(item) {
  const data = foundry.utils.deepClone(item?.toObject ? item.toObject() : item ?? {});
  delete data._id; delete data.folder; delete data.sort; delete data.ownership;
  if (data._stats) { delete data._stats.modifiedTime; delete data._stats.lastModifiedBy; }
  if (data.system && Object.prototype.hasOwnProperty.call(data.system, "quantity")) data.system.quantity = 1;
  return JSON.stringify(data);
}

export function currencyOf(actor) {
  const c = actor?.system?.currency ?? {};
  return {cp:Number(c.cp??0), sp:Number(c.sp??0), ep:Number(c.ep??0), gp:Number(c.gp??0), pp:Number(c.pp??0)};
}

export function escapeHtml(value="") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));
}

export function notifyError(err, prefix="Container error") {
  console.error(`${MODULE_ID} | ${prefix}`, err);
  ui.notifications.error(`${prefix}: ${err?.message ?? err}`);
}
