const MODULE_ID = "party-viewer";
const MODULE_VERSION = "0.3.9";
const SOCKET = `module.${MODULE_ID}`;
const TEMPLATE = `modules/${MODULE_ID}/templates/party-viewer.hbs`;
const ICON = `modules/${MODULE_ID}/assets/party-viewer.svg`;
const pendingRequests = new Map();
let pvSocketlibSocket = null;

function registerPartyViewerSocketlib() {
  if (pvSocketlibSocket) return pvSocketlibSocket;
  if (!globalThis.socketlib?.registerModule) return null;
  try {
    pvSocketlibSocket = globalThis.socketlib.registerModule(MODULE_ID);
    pvSocketlibSocket.register("mutatePartyViewerData", async (action, payload, userId) => {
      try {
        await mutatePartyData(action, payload ?? {}, userId);
        PartyViewerApp.refreshOpen();
        return { ok: true, action, message: actionSuccessMessage(action) };
      } catch (err) {
        console.error(`${MODULE_ID} | socketlib mutation failed`, { action, payload, userId }, err);
        return { ok: false, action, error: err.message || String(err) };
      }
    });
    console.log(`${MODULE_ID} ${MODULE_VERSION} | socketlib registered.`);
  } catch (err) {
    console.warn(`${MODULE_ID} | socketlib registration failed; falling back to core sockets.`, err);
    pvSocketlibSocket = null;
  }
  return pvSocketlibSocket;
}


function defaultPartyData() {
  return {
    version: 4,
    roster: [],
    containers: [],
    trades: [],
    notes: "", // legacy Party Viewer 0.1.x shared notes field
    sharedNotes: { text: "", updatedAt: null, updatedBy: null },
    privateNotes: {},
    gmNotes: [],
    settings: {
      exactHp: true,
      playersCanEditNotes: true,
      playersCanTakeUnlocked: true,
      playersCanAddUnlocked: true,
      showPassivePerception: true,
      showConditions: true,
      showInventoryValues: true
    },
    log: []
  };
}

function normalizeNote(note = {}) {
  if (typeof note === "string") return { text: note, public: false, updatedAt: null, updatedBy: null };
  return {
    text: note.text || "",
    public: Boolean(note.public),
    updatedAt: note.updatedAt ?? null,
    updatedBy: note.updatedBy ?? null
  };
}

function cloneData(data) {
  const base = defaultPartyData();
  const incoming = foundry.utils.deepClone(data ?? {});
  const merged = foundry.utils.mergeObject(base, incoming, { inplace: false, recursive: true });
  merged.roster ??= [];
  merged.containers ??= [];
  merged.trades ??= [];
  merged.log ??= [];
  merged.settings = foundry.utils.mergeObject(base.settings, merged.settings ?? {}, { inplace: false, recursive: true });

  // Migrate v0.1.x notes into the new shared notes object without nuking old data.
  if (!merged.sharedNotes?.text && typeof incoming.notes === "string" && incoming.notes.length) {
    merged.sharedNotes = { text: incoming.notes, updatedAt: incoming.notesUpdatedAt ?? null, updatedBy: incoming.notesUpdatedBy ?? null };
  }
  merged.sharedNotes = {
    text: merged.sharedNotes?.text || "",
    updatedAt: merged.sharedNotes?.updatedAt ?? null,
    updatedBy: merged.sharedNotes?.updatedBy ?? null
  };

  merged.privateNotes ??= {};
  for (const [userId, note] of Object.entries(merged.privateNotes)) merged.privateNotes[userId] = normalizeNote(note);

  merged.gmNotes ??= [];
  merged.gmNotes = merged.gmNotes.map(n => ({
    id: n.id || randomId(),
    title: n.title || "GM Note",
    text: n.text || "",
    public: Boolean(n.public),
    updatedAt: n.updatedAt ?? null,
    updatedBy: n.updatedBy ?? null,
    createdAt: n.createdAt ?? Date.now(),
    createdBy: n.createdBy ?? null
  }));

  merged.containers = (merged.containers ?? []).map(c => ({
    id: c.id || randomId(),
    name: c.name || "Shared Storage",
    type: c.type || "container",
    img: c.img || "icons/containers/chest/chest-reinforced-steel-brown.webp",
    capacity: Math.max(0, Number(c.capacity) || 0),
    locked: Boolean(c.locked),
    playersTake: c.playersTake !== false,
    playersAdd: c.playersAdd !== false,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...(c.currency ?? {}) },
    items: c.items ?? []
  }));

  return merged;
}

function randomId() {
  return foundry.utils.randomID(16);
}

function activePrimaryGM() {
  return game.users
    .filter(u => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

function isPrimaryGM() {
  return game.user.isGM && activePrimaryGM()?.id === game.user.id;
}

function getPartyData() {
  return cloneData(game.settings.get(MODULE_ID, "partyData"));
}

async function savePartyData(data) {
  if (!game.user.isGM) throw new Error("Only a GM can save Party Viewer world data.");
  data.version = 4;
  data.log = (data.log ?? []).slice(-150);
  return game.settings.set(MODULE_ID, "partyData", cloneData(data));
}

function addLog(data, message, userId = game.user.id) {
  data.log ??= [];
  data.log.unshift({ id: randomId(), time: Date.now(), userId, message });
  data.log = data.log.slice(0, 150);
}

function actorName(actorId) {
  return game.actors.get(actorId)?.name ?? "Unknown Actor";
}

function userName(userId) {
  return game.users.get(userId)?.name ?? "Unknown User";
}

function requestUser(userId = game.user.id) {
  return game.users.get(userId) ?? game.user;
}

function requesterIsGM(userId = game.user.id) {
  return Boolean(requestUser(userId)?.isGM);
}

function canUserOwnActor(actor, user = game.user) {
  if (!actor) return false;
  return user.isGM || actor.testUserPermission(user, "OWNER");
}

function ownedActorsFor(user = game.user) {
  return game.actors.contents
    .filter(a => canUserOwnActor(a, user))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isPartyActor(actorId, data = getPartyData()) {
  return data.roster.some(r => r.id === actorId && !r.hidden);
}

function isVisibleRosterActor(actorId, data = getPartyData(), user = game.user) {
  return data.roster.some(r => r.id === actorId && (user.isGM || !r.hidden));
}

function partyActorsForData(data, user = game.user) {
  return (data.roster ?? [])
    .filter(r => user.isGM || !r.hidden)
    .map(r => game.actors.get(r.id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const INVENTORY_ITEM_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "backpack", "container"]);

function itemIsInventoryItem(itemOrData) {
  if (!itemOrData) return false;
  const type = itemOrData.type ?? itemOrData.itemType ?? foundry.utils.getProperty(itemOrData, "system.type");
  return INVENTORY_ITEM_TYPES.has(String(type || "").toLowerCase());
}

function itemIsTradeable(item) {
  // Keep Party Viewer focused on actual inventory. D&D 5e sheets include spells,
  // class features, feats, species/background data, and other sheet mechanics in actor.items.
  // Those are not physical things to trade or put in the wagon unless your ranger has invented
  // a way to bottle Action Surge, which frankly sounds like a court case.
  return itemIsInventoryItem(item);
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return String(ts);
  }
}

function getPath(obj, ...paths) {
  for (const p of paths) {
    const value = foundry.utils.getProperty(obj, p);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function getItemQuantity(data) {
  const q = getPath(data, "system.quantity", "system.quantity.value");
  return Number.isFinite(Number(q)) ? Number(q) : 1;
}

function setItemQuantity(data, quantity) {
  data.system ??= {};
  if (data.system.quantity && typeof data.system.quantity === "object") data.system.quantity.value = quantity;
  else data.system.quantity = quantity;
  return data;
}

function getItemWeight(data) {
  const w = getPath(data, "system.weight.value", "system.weight");
  return Number.isFinite(Number(w)) ? Number(w) : 0;
}

function getItemValue(data) {
  const v = getPath(data, "system.price.value", "system.value.value", "system.price");
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function itemDataSnapshot(item, quantity = null) {
  const object = foundry.utils.deepClone(item.toObject ? item.toObject() : item);
  delete object._id;
  const qty = quantity ?? getItemQuantity(object);
  setItemQuantity(object, qty);
  return object;
}

function manualLootData({ name, quantity = 1, weight = 0, value = 0, img = "icons/svg/item-bag.svg", description = "" }) {
  const data = {
    name: name || "Unnamed Loot",
    type: "loot",
    img: img || "icons/svg/item-bag.svg",
    system: {
      description: { value: description || "" },
      quantity: Number(quantity) || 1,
      weight: { value: Number(weight) || 0, units: "lb" },
      price: { value: Number(value) || 0, denomination: "gp" }
    }
  };
  return data;
}

async function createItemOnActor(actor, itemData, quantity = null) {
  const data = foundry.utils.deepClone(itemData);
  if (quantity !== null) setItemQuantity(data, quantity);
  try {
    const created = await actor.createEmbeddedDocuments("Item", [data]);
    return created?.[0];
  } catch (err) {
    console.warn(`${MODULE_ID} | Full item create failed; trying minimal loot item.`, err, data);
    const fallback = manualLootData({
      name: data.name,
      quantity: quantity ?? getItemQuantity(data),
      weight: getItemWeight(data),
      value: getItemValue(data),
      img: data.img,
      description: getPath(data, "system.description.value") ?? "Imported from Party Viewer."
    });
    const created = await actor.createEmbeddedDocuments("Item", [fallback]);
    return created?.[0];
  }
}

async function decrementOrDeleteItem(actor, itemId, quantity) {
  const item = actor.items.get(itemId);
  if (!item) return false;
  const current = getItemQuantity(item);
  const q = Math.max(1, Number(quantity) || 1);
  if (current > q) {
    const update = {};
    if (typeof item.system.quantity === "object") update["system.quantity.value"] = current - q;
    else update["system.quantity"] = current - q;
    await item.update(update);
  } else {
    await actor.deleteEmbeddedDocuments("Item", [itemId]);
  }
  return true;
}

function storageItemFromItem(item, quantity = null) {
  const snapshot = itemDataSnapshot(item, quantity);
  const q = quantity ?? getItemQuantity(snapshot);
  return {
    id: randomId(),
    name: snapshot.name,
    type: snapshot.type,
    img: snapshot.img,
    quantity: q,
    weight: getItemWeight(snapshot),
    value: getItemValue(snapshot),
    itemData: snapshot,
    sourceActorId: itemParentActor(item)?.id ?? null,
    sourceItemId: item.id ?? null
  };
}

function storageItemFromItemData(itemData, quantity = null, source = {}) {
  const snapshot = foundry.utils.deepClone(itemData ?? {});
  delete snapshot._id;
  const q = Math.max(1, Number(quantity ?? getItemQuantity(snapshot)) || 1);
  setItemQuantity(snapshot, q);
  return {
    id: randomId(),
    name: snapshot.name || "Dropped Item",
    type: snapshot.type || "loot",
    img: snapshot.img || "icons/svg/item-bag.svg",
    quantity: q,
    weight: getItemWeight(snapshot),
    value: getItemValue(snapshot),
    itemData: snapshot,
    sourceActorId: source.sourceActorId ?? null,
    sourceItemId: source.sourceItemId ?? null
  };
}

function tryJsonParse(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}
  return null;
}

function parseDragString(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parsed = tryJsonParse(raw);
  if (parsed) return parsed;

  const trimmed = raw.trim();
  const uuidPatterns = [
    /@UUID\[([^\]]+)\]/i,
    /data-uuid=["']([^"']+)["']/i,
    /data-document-uuid=["']([^"']+)["']/i,
    /"uuid"\s*:\s*"([^"]+)"/i,
    /Actor\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9_-]+/i,
    /Item\.[A-Za-z0-9_-]+/i,
    /Compendium\.[A-Za-z0-9_.-]+\.Item\.[A-Za-z0-9_-]+/i
  ];

  for (const pattern of uuidPatterns) {
    const match = trimmed.match(pattern);
    if (match) return { type: "Item", uuid: match[1] ?? match[0] };
  }

  return null;
}

function collectDropCandidates(value, out = []) {
  if (value === null || value === undefined) return out;

  if (typeof value === "string") {
    const parsed = parseDragString(value);
    if (parsed) out.push(parsed);

    // Foundry UUIDs often ride along as plain strings, HTML snippets, or @UUID links.
    const uuidMatches = value.match(/(?:Actor\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9_-]+|Item\.[A-Za-z0-9_-]+|Compendium\.[A-Za-z0-9_.-]+\.Item\.[A-Za-z0-9_-]+)/g) ?? [];
    for (const uuid of uuidMatches) out.push({ type: "Item", uuid });
    return out;
  }

  if (Array.isArray(value)) {
    for (const v of value) collectDropCandidates(v, out);
    return out;
  }

  if (typeof value === "object") {
    out.push(value);
    for (const key of ["uuid", "documentUuid", "documentUUID", "itemUuid", "itemUUID"]) {
      if (typeof value[key] === "string") out.push({ ...value, uuid: value[key] });
    }
    // Only go a few obvious nesting paths; do not deep-walk whole Documents forever.
    for (const key of ["data", "item", "itemData", "documentData", "dragData", "payload", "parent", "actor"]) {
      if (value[key] && value[key] !== value) collectDropCandidates(value[key], out);
    }
  }

  return out;
}

function getRawTransferEntries(event) {
  const ev = event?.originalEvent ?? event;
  const dt = ev?.dataTransfer;
  const entries = [];
  if (!dt) return entries;

  const types = Array.from(dt.types ?? []);
  const preferredTypes = [
    "application/json",
    "text/plain",
    "text/html",
    "text/uri-list",
    "text",
    ...types
  ];

  for (const type of [...new Set(preferredTypes)]) {
    try {
      const raw = dt.getData(type);
      if (raw) entries.push({ type, raw });
    } catch (_) {}
  }
  return entries;
}

function getFoundryDragData(event) {
  const ev = event?.originalEvent ?? event;
  const candidates = [];

  const parserFns = [
    () => globalThis.TextEditor?.getDragEventData?.(ev),
    () => globalThis.TextEditor?.implementation?.getDragEventData?.(ev),
    () => foundry.applications?.ux?.TextEditor?.getDragEventData?.(ev),
    () => foundry.applications?.ux?.TextEditor?.implementation?.getDragEventData?.(ev)
  ];

  for (const parse of parserFns) {
    try {
      const data = parse();
      if (data && typeof data === "object" && Object.keys(data).length) collectDropCandidates(data, candidates);
    } catch (_) {}
  }

  for (const entry of getRawTransferEntries(ev)) {
    collectDropCandidates(entry.raw, candidates);
    const parsed = tryJsonParse(entry.raw);
    if (parsed) collectDropCandidates(parsed, candidates);
  }

  // Prefer candidates that look like Item drops, but keep the raw object as fallback.
  const scored = candidates
    .filter(c => c && typeof c === "object")
    .map(c => {
      const score =
        (c.type === "Item" || c.documentName === "Item" ? 10 : 0) +
        (c.uuid || c.documentUuid || c.documentUUID || c.itemUuid || c.itemUUID ? 8 : 0) +
        (c.actorId || c.actorID || c.parentUuid || c.actorUuid || c.actorUUID ? 3 : 0) +
        (c.itemId || c.itemID || c.id || c._id ? 3 : 0) +
        (c.name ? 1 : 0);
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  const data = scored[0]?.c ?? {};
  if (!Object.keys(data).length) {
    const dt = ev?.dataTransfer;
    if (dt) console.warn(`${MODULE_ID} | Could not parse drop data. Available dataTransfer types:`, Array.from(dt.types ?? []), getRawTransferEntries(ev));
  }
  return data;
}

async function pvFromUuid(uuid) {
  if (!uuid) return null;
  try {
    if (typeof globalThis.fromUuid === "function") return await globalThis.fromUuid(uuid);
  } catch (err) { console.warn(`${MODULE_ID} | global fromUuid failed`, uuid, err); }
  try {
    if (typeof foundry.utils?.fromUuid === "function") return await foundry.utils.fromUuid(uuid);
  } catch (err) { console.warn(`${MODULE_ID} | foundry.utils.fromUuid failed`, uuid, err); }
  try {
    if (typeof globalThis.fromUuidSync === "function") return globalThis.fromUuidSync(uuid);
  } catch (err) { console.warn(`${MODULE_ID} | fromUuidSync failed`, uuid, err); }
  return null;
}


function closestDataContainerFromEvent(event) {
  const candidates = [event?.target, event?.currentTarget];
  for (let node of candidates) {
    if (!node) continue;
    // Drag/drop targets can occasionally be text nodes inside the drop zone. Text nodes
    // do not have closest(), which made the capture handler eat the drop before the
    // real drop-zone handler could process it. Very Foundry. Very goblin.
    if (node.nodeType && node.nodeType !== 1) node = node.parentElement;
    const found = node?.closest?.("[data-container-id]");
    if (found) return found;
  }
  return null;
}

function itemParentActor(item) {
  if (!item) return null;
  if (item.actor) return item.actor;
  const parent = item.parent;
  if (parent?.documentName === "Actor") return parent;
  if (parent?.constructor?.name === "Actor") return parent;
  return null;
}

async function resolveDroppedItem(data) {
  if (!data || typeof data !== "object") return null;

  const candidateList = collectDropCandidates(data, []);
  const uuidSet = new Set();
  for (const c of candidateList) {
    if (!c || typeof c !== "object") continue;
    for (const key of ["uuid", "documentUuid", "documentUUID", "itemUuid", "itemUUID"]) {
      if (typeof c[key] === "string") uuidSet.add(c[key]);
    }
    const nested = c.data ?? c.itemData ?? c.documentData ?? c.item ?? null;
    if (typeof nested?.uuid === "string") uuidSet.add(nested.uuid);
  }

  let item = null;
  for (const uuid of uuidSet) {
    item = await pvFromUuid(uuid);
    if (item?.documentName === "Item") break;
    item = null;
  }

  // Some drag payloads have ids instead of UUIDs. Try all obvious actor/item pairings.
  if (!item) {
    for (const c of candidateList) {
      if (!c || typeof c !== "object") continue;
      const nested = c.data ?? c.itemData ?? c.documentData ?? c.item ?? null;
      const itemId = c.itemId ?? c.itemID ?? c.id ?? c._id ?? nested?._id ?? nested?.id;
      const actorId = c.actorId ?? c.actorID ?? c.actor?.id ?? c.actor?._id ?? c.parent?.id ?? c.parent?._id;
      const parentUuid = c.parentUuid ?? c.parentUUID ?? c.parent?.uuid ?? c.actorUuid ?? c.actorUUID;
      if (actorId && itemId) item = game.actors.get(actorId)?.items.get(itemId) ?? null;
      if (!item && parentUuid && itemId) {
        const parent = await pvFromUuid(parentUuid);
        item = parent?.items?.get(itemId) ?? null;
      }
      if (!item && c.pack && itemId) {
        try { item = await game.packs.get(c.pack)?.getDocument(itemId); } catch (_) {}
      }
      if (!item && itemId) item = game.items.get(itemId) ?? null;
      if (item?.documentName === "Item") break;
      item = null;
    }
  }

  if (item?.documentName === "Item") {
    return { item, itemData: itemDataSnapshot(item), actor: itemParentActor(item) };
  }

  // Raw item-data fallback: this supports drops from some module sheets and compendium clones.
  for (const c of candidateList) {
    if (!c || typeof c !== "object") continue;
    const rawCandidate = c.data ?? c.itemData ?? c.documentData ?? c.item ?? c;
    const looksLikeItemData =
      c.type === "Item" ||
      c.documentName === "Item" ||
      rawCandidate?.documentName === "Item" ||
      Boolean(rawCandidate?.name && (rawCandidate?.system || rawCandidate?.img || rawCandidate?.type));

    if (looksLikeItemData && (rawCandidate?.name || c.name)) {
      const raw = foundry.utils.deepClone(rawCandidate);
      raw.name ??= c.name;
      if (raw.type === "Item") raw.type = c.itemType ?? raw.system?.type ?? "loot";
      raw.type ??= c.itemType ?? "loot";
      raw.img ??= c.img ?? raw.img ?? "icons/svg/item-bag.svg";
      delete raw.uuid;
      delete raw._stats;
      return { item: null, itemData: raw, actor: null };
    }
  }

  console.warn(`${MODULE_ID} | Dropped data did not resolve to an Item.`, data, candidateList);
  return null;
}


function resolveActorIdFromSearch(root, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const options = Array.from(root.querySelectorAll("#pv-add-actor-list option"));
  const option = options.find(o => o.value === raw) ?? options.find(o => o.value.toLowerCase() === raw.toLowerCase());
  if (option?.dataset?.actorId) return option.dataset.actorId;

  const lower = raw.toLowerCase();
  const matches = game.actors.contents.filter(a => {
    const display = `${a.name} (${a.type})`.toLowerCase();
    return display === lower || a.name.toLowerCase() === lower || a.name.toLowerCase().includes(lower);
  });
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    ui.notifications.warn(`Party Viewer found multiple actors matching "${raw}". Choose the exact entry from the search dropdown.`);
    return "";
  }
  return "";
}

function storageItemFromManual(form) {
  const quantity = Math.max(1, Number(form.quantity) || 1);
  const weight = Math.max(0, Number(form.weight) || 0);
  const value = Math.max(0, Number(form.value) || 0);
  const itemData = manualLootData({
    name: form.name,
    quantity,
    weight,
    value,
    img: form.img || "icons/svg/item-bag.svg",
    description: form.description || ""
  });
  return {
    id: randomId(),
    name: itemData.name,
    type: itemData.type,
    img: itemData.img,
    quantity,
    weight,
    value,
    itemData,
    sourceActorId: null,
    sourceItemId: null
  };
}

function totalContainerWeight(container) {
  return (container.items ?? []).reduce((sum, i) => sum + (Number(i.weight) || 0) * (Number(i.quantity) || 1), 0);
}

function totalContainerValue(container) {
  return (container.items ?? []).reduce((sum, i) => sum + (Number(i.value) || 0) * (Number(i.quantity) || 1), 0);
}

function readActorData(actor, data) {
  const hpValue = getPath(actor, "system.attributes.hp.value") ?? 0;
  const hpMax = getPath(actor, "system.attributes.hp.max") ?? 0;
  const hpTemp = getPath(actor, "system.attributes.hp.temp") ?? 0;
  const ac = getPath(actor, "system.attributes.ac.value") ?? "—";
  const pp = getPath(actor, "system.skills.prc.passive") ?? "—";
  const deathSuccess = getPath(actor, "system.attributes.death.success") ?? getPath(actor, "system.attributes.death.successes") ?? 0;
  const deathFailure = getPath(actor, "system.attributes.death.failure") ?? getPath(actor, "system.attributes.death.failures") ?? 0;
  const exhaustion = getPath(actor, "system.attributes.exhaustion", "system.attributes.exhaustion.value") ?? 0;
  const inspiration = getPath(actor, "system.attributes.inspiration") ?? false;
  const effects = actor.effects?.contents ?? [];
  const conditions = effects
    .filter(e => !e.disabled)
    .map(e => e.name || e.label || Array.from(e.statuses ?? [])[0])
    .filter(Boolean)
    .slice(0, 8);
  const owners = game.users.contents.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.name).join(", ");
  const classes = actor.items?.filter(i => i.type === "class").map(i => `${i.name}${getPath(i, "system.levels") ? ` ${getPath(i, "system.levels")}` : ""}`).join(", ");
  const pct = Number(hpMax) > 0 ? Math.max(0, Math.min(100, Math.round((Number(hpValue) / Number(hpMax)) * 100))) : 0;
  return {
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    img: actor.img || "icons/svg/mystery-man.svg",
    type: actor.type,
    owners: owners || "—",
    classes: classes || actor.type,
    hpValue,
    hpMax,
    hpTemp,
    hpDisplay: data.settings.exactHp ? `${hpValue}/${hpMax}${Number(hpTemp) ? ` +${hpTemp}` : ""}` : healthStatus(Number(hpValue), Number(hpMax)),
    hpPct: pct,
    ac,
    pp,
    conditions,
    deathSuccess,
    deathFailure,
    exhaustion,
    inspiration: Boolean(inspiration)
  };
}

function healthStatus(value, max) {
  if (!max) return "Unknown";
  const pct = value / max;
  if (value <= 0) return "Down";
  if (pct <= 0.25) return "Bloodied badly";
  if (pct <= 0.5) return "Bloodied";
  if (pct <= 0.75) return "Hurt";
  return "Healthy";
}

async function mutatePartyData(action, payload = {}, userId = game.user.id) {
  const data = getPartyData();
  const requestingIsGM = requesterIsGM(userId);
  switch (action) {
    case "add-roster": {
      if (!requestingIsGM) throw new Error("Only the GM can add party members.");
      const actor = game.actors.get(payload.actorId);
      if (!actor) throw new Error("Actor not found.");
      if (!data.roster.some(r => r.id === actor.id)) {
        data.roster.push({ id: actor.id, role: payload.role || "pc", hidden: false });
        addLog(data, `${userName(userId)} added ${actor.name} to the party.`, userId);
      }
      break;
    }
    case "remove-roster": {
      if (!requestingIsGM) throw new Error("Only the GM can remove party members.");
      const name = actorName(payload.actorId);
      data.roster = data.roster.filter(r => r.id !== payload.actorId);
      addLog(data, `${userName(userId)} removed ${name} from the party.`, userId);
      break;
    }
    case "update-roster": {
      if (!requestingIsGM) throw new Error("Only the GM can edit party members.");
      const entry = data.roster.find(r => r.id === payload.actorId);
      if (entry) {
        entry.role = payload.role || entry.role || "pc";
        entry.hidden = Boolean(payload.hidden);
        addLog(data, `${userName(userId)} updated ${actorName(payload.actorId)} in the party roster.`, userId);
      }
      break;
    }
    case "create-container": {
      if (!requestingIsGM) throw new Error("Only the GM can create storage containers.");
      const container = {
        id: randomId(),
        name: payload.name || "Shared Storage",
        type: payload.type || "container",
        img: payload.img || "icons/containers/chest/chest-reinforced-steel-brown.webp",
        capacity: Math.max(0, Number(payload.capacity) || 0),
        locked: Boolean(payload.locked),
        playersTake: payload.playersTake !== false,
        playersAdd: payload.playersAdd !== false,
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        items: []
      };
      data.containers.push(container);
      addLog(data, `${userName(userId)} created storage: ${container.name}.`, userId);
      break;
    }
    case "delete-container": {
      if (!requestingIsGM) throw new Error("Only the GM can delete storage containers.");
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      if ((container.items ?? []).length && !payload.confirm) throw new Error("Storage is not empty.");
      data.containers = data.containers.filter(c => c.id !== payload.containerId);
      addLog(data, `${userName(userId)} deleted storage: ${container.name}.`, userId);
      break;
    }
    case "update-container": {
      if (!requestingIsGM) throw new Error("Only the GM can edit storage containers.");
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      container.name = String(payload.name ?? "").trim() || container.name;
      container.type = payload.type || container.type;
      container.capacity = Math.max(0, Number(payload.capacity) || 0);
      container.locked = Boolean(payload.locked);
      container.playersTake = Boolean(payload.playersTake);
      container.playersAdd = Boolean(payload.playersAdd);
      addLog(data, `${userName(userId)} updated storage: ${container.name}.`, userId);
      break;
    }
    case "add-item-data": {
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      if (!requestingIsGM) throw new Error("Players can only add items dragged from actors they own. World and compendium item drops are GM-only.");
      const itemData = foundry.utils.deepClone(payload.itemData ?? {});
      if (!itemData.name) throw new Error("Dropped item data was not readable.");
      if (!itemIsInventoryItem(itemData)) throw new Error("Only inventory items can be added to shared storage.");
      const quantity = Math.max(1, Number(payload.quantity) || 1);
      const item = storageItemFromItemData(itemData, quantity, { sourceActorId: null, sourceItemId: payload.sourceItemId ?? null });
      container.items ??= [];
      container.items.push(item);
      addLog(data, `${userName(userId)} added ${item.quantity} × ${item.name} to ${container.name}.`, userId);
      break;
    }
    case "add-manual-item": {
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      if (!requestingIsGM && (container.locked || !container.playersAdd)) throw new Error("Players cannot add to this storage.");
      const item = storageItemFromManual(payload);
      container.items ??= [];
      container.items.push(item);
      addLog(data, `${userName(userId)} added ${item.quantity} × ${item.name} to ${container.name}.`, userId);
      break;
    }
    case "add-actor-item": {
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      const actor = game.actors.get(payload.actorId);
      const item = actor?.items.get(payload.itemId);
      if (!actor) throw new Error("Source actor not found.");
      if (!requestingIsGM && (container.locked || !container.playersAdd)) throw new Error("Players cannot add to this storage.");
      const requestingUser = game.users.get(userId) ?? game.user;
      if (!requestingIsGM && !canUserOwnActor(actor, requestingUser)) throw new Error("You do not control that actor.");

      const payloadItemData = payload.itemData ? foundry.utils.deepClone(payload.itemData) : null;
      const sourceData = item ? itemDataSnapshot(item) : payloadItemData;
      if (!sourceData?.name) throw new Error("Source item not found or unreadable.");
      if (!itemIsInventoryItem(sourceData)) throw new Error("Only inventory items can be added to shared storage. Features, spells, classes, and sheet mechanics stay on the character sheet where they can think about what they did.");

      const available = item ? getItemQuantity(item) : getItemQuantity(sourceData);
      const quantity = Math.min(Math.max(1, Number(payload.quantity) || 1), Math.max(1, Number(available) || 1));
      const storageItem = item ? storageItemFromItem(item, quantity) : storageItemFromItemData(sourceData, quantity, { sourceActorId: actor.id, sourceItemId: payload.itemId ?? null });
      storageItem.sourceActorId = actor.id;
      storageItem.sourceItemId = item?.id ?? payload.itemId ?? null;
      container.items ??= [];
      container.items.push(storageItem);

      if (payload.move !== false) {
        if (!item) throw new Error("Party Viewer could read the dropped item, but could not find the live source item to remove from the actor. Nothing was moved.");
        await decrementOrDeleteItem(actor, item.id, quantity);
      }
      addLog(data, `${userName(userId)} ${payload.move === false ? "copied" : "moved"} ${quantity} × ${storageItem.name} from ${actor.name} to ${container.name}.`, userId);
      break;
    }
    case "take-storage-item": {
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      const actor = game.actors.get(payload.actorId);
      if (!actor) throw new Error("Target actor not found.");
      const requestingUser = game.users.get(userId) ?? game.user;
      if (!requestingIsGM && !canUserOwnActor(actor, requestingUser)) throw new Error("You do not control that actor.");
      if (!requestingIsGM && (container.locked || !container.playersTake)) throw new Error("Players cannot take from this storage.");
      const item = container.items.find(i => i.id === payload.itemId);
      if (!item) throw new Error("Storage item not found.");
      const quantity = Math.max(1, Number(payload.quantity) || 1);
      if (quantity > Number(item.quantity)) throw new Error(`Not enough ${item.name}.`);
      await createItemOnActor(actor, item.itemData ?? manualLootData(item), quantity);
      item.quantity = Number(item.quantity) - quantity;
      if (item.quantity <= 0) container.items = container.items.filter(i => i.id !== item.id);
      addLog(data, `${userName(userId)} took ${quantity} × ${item.name} from ${container.name} for ${actor.name}.`, userId);
      break;
    }
    case "remove-storage-item": {
      if (!requestingIsGM) throw new Error("Only the GM can remove storage items.");
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      const item = container.items.find(i => i.id === payload.itemId);
      if (!item) throw new Error("Storage item not found.");
      const quantity = Math.max(1, Number(payload.quantity) || 1);
      item.quantity = Number(item.quantity) - quantity;
      if (item.quantity <= 0) container.items = container.items.filter(i => i.id !== item.id);
      addLog(data, `${userName(userId)} removed ${quantity} × ${item.name} from ${container.name}.`, userId);
      break;
    }
    case "update-currency": {
      const container = data.containers.find(c => c.id === payload.containerId);
      if (!container) throw new Error("Storage not found.");
      if (!requestingIsGM && container.locked) throw new Error("Players cannot edit currency in locked storage.");
      container.currency ??= { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      for (const c of ["cp", "sp", "ep", "gp", "pp"]) container.currency[c] = Math.max(0, Number(payload.currency?.[c]) || 0);
      addLog(data, `${userName(userId)} updated currency in ${container.name}.`, userId);
      break;
    }
    case "create-trade": {
      const fromActor = game.actors.get(payload.fromActorId);
      const toActor = game.actors.get(payload.toActorId);
      const item = fromActor?.items.get(payload.itemId);
      if (!fromActor || !toActor || !item) throw new Error("Trade actor or item not found.");
      if (!itemIsTradeable(item)) throw new Error("That item type is not tradeable in Party Viewer.");
      const requestingUser = game.users.get(userId) ?? game.user;
      const fromRoster = data.roster.find(r => r.id === fromActor.id);
      const toRoster = data.roster.find(r => r.id === toActor.id);
      if (!fromRoster || !toRoster) throw new Error("Trades are limited to actors currently added to Party Viewer.");
      if (!requestingIsGM && (fromRoster.hidden || toRoster.hidden)) throw new Error("That party member is not available for trade.");
      if (!requestingIsGM && !canUserOwnActor(fromActor, requestingUser)) throw new Error("You do not control the offering actor.");
      const quantity = Math.max(1, Number(payload.quantity) || 1);
      if (quantity > getItemQuantity(item)) throw new Error(`Not enough ${item.name}.`);
      const trade = {
        id: randomId(),
        createdAt: Date.now(),
        fromUserId: userId,
        fromActorId: fromActor.id,
        toActorId: toActor.id,
        itemId: item.id,
        itemName: item.name,
        itemImg: item.img,
        quantity,
        requestText: payload.requestText || "",
        status: "pending"
      };
      data.trades.unshift(trade);
      addLog(data, `${userName(userId)} offered ${quantity} × ${item.name} from ${fromActor.name} to ${toActor.name}.`, userId);
      break;
    }
    case "accept-trade": {
      const trade = data.trades.find(t => t.id === payload.tradeId);
      if (!trade) throw new Error("Trade not found.");
      const fromActor = game.actors.get(trade.fromActorId);
      const toActor = game.actors.get(trade.toActorId);
      const item = fromActor?.items.get(trade.itemId);
      if (!fromActor || !toActor || !item) throw new Error("Trade actor or item no longer exists.");
      const requestingUser = game.users.get(userId) ?? game.user;
      if (!requestingIsGM && !canUserOwnActor(toActor, requestingUser)) throw new Error("Only the receiving actor owner or GM can accept this trade.");
      if (trade.quantity > getItemQuantity(item)) throw new Error(`Not enough ${item.name}.`);
      await createItemOnActor(toActor, itemDataSnapshot(item, trade.quantity), trade.quantity);
      await decrementOrDeleteItem(fromActor, item.id, trade.quantity);
      trade.status = "accepted";
      trade.resolvedAt = Date.now();
      trade.resolvedBy = userId;
      addLog(data, `${userName(userId)} accepted trade: ${trade.quantity} × ${trade.itemName} to ${toActor.name}.`, userId);
      break;
    }
    case "decline-trade": {
      const trade = data.trades.find(t => t.id === payload.tradeId);
      if (!trade) throw new Error("Trade not found.");
      const toActor = game.actors.get(trade.toActorId);
      const requestingUser = game.users.get(userId) ?? game.user;
      if (!requestingIsGM && !canUserOwnActor(toActor, requestingUser)) throw new Error("Only the receiving actor owner or GM can decline this trade.");
      trade.status = "declined";
      trade.resolvedAt = Date.now();
      trade.resolvedBy = userId;
      addLog(data, `${userName(userId)} declined a trade for ${trade.itemName}.`, userId);
      break;
    }
    case "clear-resolved-trades": {
      if (!requestingIsGM) throw new Error("Only the GM can clear resolved trades.");
      data.trades = data.trades.filter(t => t.status === "pending");
      addLog(data, `${userName(userId)} cleared resolved trades.`, userId);
      break;
    }
    case "update-shared-notes": {
      if (!requestingIsGM && data.settings.playersCanEditNotes === false) throw new Error("Players cannot edit shared party notes.");
      data.sharedNotes = {
        text: payload.notes || "",
        updatedAt: Date.now(),
        updatedBy: userId
      };
      data.notes = data.sharedNotes.text; // keep legacy field in sync for safe rollback
      data.notesUpdatedAt = data.sharedNotes.updatedAt;
      data.notesUpdatedBy = userId;
      addLog(data, `${userName(userId)} updated shared party notes.`, userId);
      break;
    }
    case "update-private-notes": {
      data.privateNotes ??= {};
      data.privateNotes[userId] = {
        text: payload.notes || "",
        public: Boolean(payload.public),
        updatedAt: Date.now(),
        updatedBy: userId
      };
      addLog(data, `${userName(userId)} updated private notes${payload.public ? " and made them public" : ""}.`, userId);
      break;
    }
    case "create-gm-note": {
      if (!requestingIsGM) throw new Error("Only the GM can create GM notes.");
      data.gmNotes ??= [];
      const note = {
        id: randomId(),
        title: payload.title || "GM Note",
        text: payload.notes || "",
        public: Boolean(payload.public),
        createdAt: Date.now(),
        createdBy: userId,
        updatedAt: Date.now(),
        updatedBy: userId
      };
      data.gmNotes.unshift(note);
      addLog(data, `${userName(userId)} created GM note: ${note.title}${note.public ? " and made it public" : ""}.`, userId);
      break;
    }
    case "update-gm-note": {
      if (!requestingIsGM) throw new Error("Only the GM can edit GM notes.");
      const note = data.gmNotes.find(n => n.id === payload.noteId);
      if (!note) throw new Error("GM note not found.");
      note.title = payload.title || note.title || "GM Note";
      note.text = payload.notes || "";
      note.public = Boolean(payload.public);
      note.updatedAt = Date.now();
      note.updatedBy = userId;
      addLog(data, `${userName(userId)} updated GM note: ${note.title}${note.public ? " (public)" : ""}.`, userId);
      break;
    }
    case "delete-gm-note": {
      if (!requestingIsGM) throw new Error("Only the GM can delete GM notes.");
      const note = data.gmNotes.find(n => n.id === payload.noteId);
      if (!note) throw new Error("GM note not found.");
      data.gmNotes = data.gmNotes.filter(n => n.id !== payload.noteId);
      addLog(data, `${userName(userId)} deleted GM note: ${note.title}.`, userId);
      break;
    }
    case "update-settings": {
      if (!requestingIsGM) throw new Error("Only the GM can edit Party Viewer settings.");
      data.settings = foundry.utils.mergeObject(data.settings ?? {}, payload.settings ?? {}, { inplace: false, recursive: true });
      addLog(data, `${userName(userId)} updated Party Viewer settings.`, userId);
      break;
    }
    case "clear-log": {
      if (!requestingIsGM) throw new Error("Only the GM can clear the Party Viewer log.");
      data.log = [];
      break;
    }
    default:
      throw new Error(`Unknown Party Viewer action: ${action}`);
  }
  await savePartyData(data);
  return data;
}

function actionSuccessMessage(action) {
  switch (action) {
    case "add-actor-item": return "Item moved to shared storage.";
    case "take-storage-item": return "Item taken from shared storage.";
    case "create-trade": return "Trade offer created.";
    case "accept-trade": return "Trade accepted.";
    case "decline-trade": return "Trade declined.";
    case "update-shared-notes": return "Shared notes saved.";
    case "update-private-notes": return "Private notes saved.";
    case "update-currency": return "Shared currency updated.";
    default: return "Party Viewer updated.";
  }
}

function shouldNotifySubmitted(action) {
  // Player-owned inventory deposits should feel immediate, not like an approval workflow.
  // The active GM client still commits the world setting behind the curtain because Foundry
  // does not allow players to write world module data directly. Tiny wizard bureaucracy.
  return !["add-actor-item"].includes(action);
}

async function requestMutation(action, payload = {}) {
  if (game.user.isGM) {
    try {
      await mutatePartyData(action, payload, game.user.id);
      PartyViewerApp.refreshOpen();
    } catch (err) {
      console.error(`${MODULE_ID} | ${action} failed`, err);
      ui.notifications.error(err.message || String(err));
    }
    return;
  }

  const gm = activePrimaryGM();
  if (!gm) {
    ui.notifications.error("Party Viewer needs an active GM client to change shared party data.");
    return;
  }

  // Preferred path: socketlib returns success/errors to the player instead of relying on a
  // fire-and-pray core socket message. Players still are not approving anything; the GM
  // client is only used to commit the shared world data and update actor inventory.
  registerPartyViewerSocketlib();
  if (pvSocketlibSocket?.executeAsGM) {
    try {
      const result = await pvSocketlibSocket.executeAsGM("mutatePartyViewerData", action, payload, game.user.id);
      if (result?.ok === false) throw new Error(result.error || "Party Viewer change failed.");
      PartyViewerApp.refreshOpen();
      if (result?.message) ui.notifications.info(result.message);
      else ui.notifications.info(actionSuccessMessage(action));
    } catch (err) {
      console.error(`${MODULE_ID} | socketlib ${action} failed`, err);
      ui.notifications.error(err.message || String(err));
    }
    return;
  }

  const requestId = randomId();
  pendingRequests.set(requestId, { action, createdAt: Date.now() });
  window.setTimeout(() => pendingRequests.delete(requestId), 30000);
  window.setTimeout(() => {
    if (!pendingRequests.has(requestId)) return;
    console.warn(`${MODULE_ID} | No GM socket response yet`, { action, payload, requestId, activeGM: gm?.name });
    ui.notifications.warn("Party Viewer sent the change to the active GM client but did not receive a response. Enabling socketlib is recommended for player inventory deposits.");
  }, 5000);
  game.socket.emit(SOCKET, { type: "mutation", requestId, action, payload, userId: game.user.id });
  if (shouldNotifySubmitted(action)) ui.notifications.info("Party Viewer change sent to the active GM client.");
}

const BaseApplication = globalThis.Application ?? foundry.appv1?.api?.Application;

class PartyViewerApp extends BaseApplication {
  static instance = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "party-viewer-app",
      title: "SaltyBananaSlugs's Party Viewer",
      template: TEMPLATE,
      width: 920,
      height: 760,
      resizable: true,
      classes: ["party-viewer-window"],
      dragDrop: [{ dragSelector: null, dropSelector: ".pv-container, .pv-drop-zone" }]
    });
  }

  static open() {
    if (!this.instance) this.instance = new this();
    this.instance.render(true);
    return this.instance;
  }

  static refreshOpen() {
    if (this.instance?.rendered) this.instance.render(false);
  }

  constructor(options = {}) {
    super(options);
    this.activeTab = "dashboard";
  }

  async getData() {
    const data = getPartyData();
    const rosterEntries = data.roster.filter(r => game.user.isGM || !r.hidden);
    const members = rosterEntries
      .map(r => {
        const actor = game.actors.get(r.id);
        if (!actor) return { missing: true, id: r.id, name: "Missing Actor", role: r.role || "pc", hidden: r.hidden };
        return { ...readActorData(actor, data), role: r.role || "pc", hidden: Boolean(r.hidden) };
      });

    const allActors = [...game.actors.contents].sort((a, b) => a.name.localeCompare(b.name));
    const ownedActors = ownedActorsFor(game.user);
    const partyActors = partyActorsForData(data, game.user);
    const ownedPartyActors = partyActors.filter(a => canUserOwnActor(a, game.user));
    const storageSourceActors = game.user.isGM ? allActors : ownedPartyActors;
    const storageTargetActors = game.user.isGM ? partyActors : ownedPartyActors;
    const tradeSourceActors = game.user.isGM ? partyActors : ownedPartyActors;
    const tradeTargetActors = partyActors;

    const makeActorItemGroups = actors => actors.map(a => ({
      id: a.id,
      name: a.name,
      items: a.items.contents
        .filter(i => itemIsInventoryItem(i))
        .map(i => ({ id: i.id, name: i.name, img: i.img, quantity: getItemQuantity(i), type: i.type }))
        .sort((x, y) => x.name.localeCompare(y.name))
    })).filter(a => a.items.length);

    const actorItems = makeActorItemGroups(storageSourceActors);
    const tradeActorItems = makeActorItemGroups(tradeSourceActors);

    const containers = data.containers.map(c => ({
      ...c,
      weightTotal: totalContainerWeight(c),
      valueTotal: totalContainerValue(c),
      overCapacity: Number(c.capacity) > 0 && totalContainerWeight(c) > Number(c.capacity)
    }));

    const trades = data.trades.map(t => ({
      ...t,
      fromActorName: actorName(t.fromActorId),
      toActorName: actorName(t.toActorId),
      fromUserName: userName(t.fromUserId),
      resolvedByName: t.resolvedBy ? userName(t.resolvedBy) : "",
      createdLabel: formatTime(t.createdAt),
      canResolve: game.user.isGM || canUserOwnActor(game.actors.get(t.toActorId))
    }));

    const privateNote = data.privateNotes?.[game.user.id] ?? { text: "", public: false, updatedAt: null, updatedBy: null };
    const publicPrivateNotes = Object.entries(data.privateNotes ?? {})
      .filter(([, note]) => note.public)
      .map(([userId, note]) => ({
        userId,
        userName: userName(userId),
        text: note.text || "",
        updatedLabel: note.updatedAt ? `${formatTime(note.updatedAt)} by ${userName(note.updatedBy)}` : "Never"
      }))
      .filter(n => n.text.trim().length)
      .sort((a, b) => a.userName.localeCompare(b.userName));

    const publicGmNotes = (data.gmNotes ?? [])
      .filter(n => n.public && n.text.trim().length)
      .map(n => ({
        ...n,
        updatedLabel: n.updatedAt ? `${formatTime(n.updatedAt)} by ${userName(n.updatedBy)}` : "Never"
      }));

    const gmNotes = (data.gmNotes ?? []).map(n => ({
      ...n,
      updatedLabel: n.updatedAt ? `${formatTime(n.updatedAt)} by ${userName(n.updatedBy)}` : "Never"
    }));

    return {
      moduleId: MODULE_ID,
      moduleVersion: MODULE_VERSION,
      icon: ICON,
      isGM: game.user.isGM,
      activeTab: this.activeTab,
      data,
      settings: data.settings,
      members,
      allActors,
      ownedActors,
      storageTargetActors,
      tradeTargetActors,
      actorItems,
      tradeActorItems,
      containers,
      trades,
      log: (data.log ?? []).map(l => ({ ...l, userName: userName(l.userId), timeLabel: formatTime(l.time) })),
      sharedNotes: data.sharedNotes,
      sharedNotesUpdated: data.sharedNotes?.updatedAt ? `${formatTime(data.sharedNotes.updatedAt)} by ${userName(data.sharedNotes.updatedBy)}` : "Never",
      privateNote,
      privateNoteUpdated: privateNote.updatedAt ? `${formatTime(privateNote.updatedAt)} by ${userName(privateNote.updatedBy)}` : "Never",
      publicPrivateNotes,
      publicGmNotes,
      gmNotes
    };
  }

  _canDragDrop(_selector) {
    return true;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-tab]").on("click", ev => {
      ev.preventDefault();
      this.activeTab = ev.currentTarget.dataset.tab;
      this.render(false);
    });

    html.find("[data-action]").on("click", ev => this._onAction(ev));
    html.find(".pv-roster-role, .pv-roster-hidden").on("change", ev => this._onRosterChange(ev));
    html.find(".pv-container-field").on("change", ev => this._onContainerChange(ev));
    html.find(".pv-currency-input").on("change", ev => this._onCurrencyChange(ev));
    html.find(".pv-save-shared-notes").on("click", ev => this._saveSharedNotes(ev));
    html.find(".pv-save-private-notes").on("click", ev => this._savePrivateNotes(ev));
    html.find(".pv-save-gm-note").on("click", ev => this._saveGmNote(ev));
    html.find(".pv-save-settings").on("click", ev => this._saveSettings(ev));

    // Native capture handlers make drag/drop reliable across Foundry v13 sheets and heavily modded setups.
    const root = html?.[0] ?? html;
    if (root?.addEventListener) {
      root.addEventListener("dragenter", ev => this._onNativeDragOver(ev), true);
      root.addEventListener("dragover", ev => this._onNativeDragOver(ev), true);
      root.addEventListener("drop", ev => {
        if (closestDataContainerFromEvent(ev)) this._onDrop(ev);
      }, true);
    }
    html.find(".pv-container, .pv-storage-list, .pv-drop-zone").on("dragover", ev => this._onNativeDragOver(ev.originalEvent ?? ev));
    html.find(".pv-container, .pv-storage-list, .pv-drop-zone").on("drop", ev => this._onDrop(ev.originalEvent ?? ev));
  }

  _onNativeDragOver(event) {
    const target = closestDataContainerFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    target.classList?.add?.("pv-drop-hover");
    window.clearTimeout(this._dropHoverTimeout);
    this._dropHoverTimeout = window.setTimeout(() => target.classList?.remove?.("pv-drop-hover"), 120);
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const target = closestDataContainerFromEvent(event);
    if (!target) return;

    if (this._processingDrop) return;
    this._processingDrop = true;
    window.setTimeout(() => { this._processingDrop = false; }, 250);

    target.classList?.remove?.("pv-drop-hover");
    const containerId = target.dataset.containerId;

    const dragData = getFoundryDragData(event);
    const rawEntries = getRawTransferEntries(event);
    console.debug(`${MODULE_ID} ${MODULE_VERSION} | Drop data`, dragData, rawEntries);
    if (!dragData || !Object.keys(dragData).length) {
      console.warn(`${MODULE_ID} | Unreadable drop event`, event, rawEntries);
      return ui.notifications.warn("Party Viewer saw the drop, but Foundry did not provide readable item data. Open the browser console and look for 'party-viewer' drop logs if this keeps happening.");
    }

    const resolved = await resolveDroppedItem(dragData);
    if (!resolved) {
      console.warn(`${MODULE_ID} | Unresolved drop payload`, dragData, rawEntries);
      return ui.notifications.warn("Party Viewer could not resolve that dropped item. I logged the raw drop data to the console.");
    }

    const itemName = resolved.item?.name ?? resolved.itemData?.name ?? "item";
    const available = Math.max(1, Number(resolved.item ? getItemQuantity(resolved.item) : getItemQuantity(resolved.itemData)) || 1);
    // Foundry v13 blocks browser prompt(), so drag/drop defaults to one item.
    // Hold Shift while dropping to move/copy the entire available stack. Manual quantity controls remain available above the storage list.
    const quantity = event.shiftKey ? available : 1;
    console.debug(`${MODULE_ID} ${MODULE_VERSION} | Resolved drop item`, { itemName, available, quantity, actor: resolved.actor?.name ?? null });

    if (!itemIsInventoryItem(resolved.item ?? resolved.itemData)) {
      return ui.notifications.warn("Party Viewer only stores inventory items. Features, spells, classes, and other sheet mechanics are not wagon cargo, despite what the artificer insists.");
    }

    if (resolved.actor) {
      if (!canUserOwnActor(resolved.actor)) {
        return ui.notifications.warn("You can only drag items from actors you own into shared storage.");
      }
      requestMutation("add-actor-item", {
        containerId,
        actorId: resolved.actor.id,
        itemId: resolved.item?.id ?? resolved.itemData?._id ?? null,
        itemData: resolved.itemData,
        quantity,
        move: true
      });
      return;
    }

    if (!game.user.isGM) {
      return ui.notifications.warn("Players can only drag items from character sheets they own. World or compendium item drops are GM-only, because otherwise the economy becomes three kobolds in a trench coat.");
    }

    requestMutation("add-item-data", {
      containerId,
      itemData: resolved.itemData,
      sourceItemId: resolved.item?.id ?? null,
      quantity
    });
  }

  async _onAction(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const root = button.closest(".party-viewer");
    switch (action) {
      case "add-member": {
        const search = root.querySelector("[name='addActorSearch']")?.value || "";
        const actorId = resolveActorIdFromSearch(root, search);
        const role = root.querySelector("[name='addActorRole']")?.value || "pc";
        if (actorId) requestMutation("add-roster", { actorId, role });
        else ui.notifications.warn("Pick an actor from the search dropdown first.");
        break;
      }
      case "open-actor-sheet": {
        const actor = game.actors.get(button.dataset.actorId);
        if (!actor) return ui.notifications.warn("Actor not found.");
        if (!canUserOwnActor(actor) && !actor.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn("You do not have permission to open that sheet.");
        actor.sheet?.render(true);
        break;
      }
      case "remove-member": {
        const actorId = button.dataset.actorId;
        if (confirm(`Remove ${actorName(actorId)} from the Party Viewer?`)) requestMutation("remove-roster", { actorId });
        break;
      }
      case "create-container": {
        const form = button.closest(".pv-create-container");
        const payload = {
          name: form.querySelector("[name='containerName']")?.value,
          type: form.querySelector("[name='containerType']")?.value,
          capacity: form.querySelector("[name='containerCapacity']")?.value,
          playersTake: form.querySelector("[name='playersTake']")?.checked,
          playersAdd: form.querySelector("[name='playersAdd']")?.checked,
          locked: form.querySelector("[name='locked']")?.checked
        };
        requestMutation("create-container", payload);
        break;
      }
      case "save-container": {
        const panel = button.closest("[data-container-id]");
        if (!panel) return;
        requestMutation("update-container", {
          containerId: panel.dataset.containerId,
          name: panel.querySelector("[name='containerEditName']")?.value,
          type: panel.querySelector("[name='containerEditType']")?.value,
          capacity: panel.querySelector("[name='containerEditCapacity']")?.value,
          locked: panel.querySelector("[name='containerEditLocked']")?.checked,
          playersTake: panel.querySelector("[name='containerEditPlayersTake']")?.checked,
          playersAdd: panel.querySelector("[name='containerEditPlayersAdd']")?.checked
        });
        break;
      }
      case "delete-container": {
        const containerId = button.dataset.containerId;
        if (confirm("Delete this Party Viewer storage container? This does not delete actor items, but stored entries here will be gone. Very goblin, very final.")) {
          requestMutation("delete-container", { containerId, confirm: true });
        }
        break;
      }
      case "add-manual-item": {
        const form = button.closest(".pv-manual-item");
        const payload = {
          containerId: button.dataset.containerId,
          name: form.querySelector("[name='itemName']")?.value,
          quantity: form.querySelector("[name='itemQuantity']")?.value,
          weight: form.querySelector("[name='itemWeight']")?.value,
          value: form.querySelector("[name='itemValue']")?.value,
          img: form.querySelector("[name='itemImg']")?.value,
          description: form.querySelector("[name='itemDescription']")?.value
        };
        requestMutation("add-manual-item", payload);
        break;
      }
      case "add-actor-item": {
        const form = button.closest(".pv-add-actor-item");
        const raw = form.querySelector("[name='actorItem']")?.value || "";
        const [actorId, itemId] = raw.split("|");
        const payload = {
          containerId: form.querySelector("[name='targetContainer']")?.value,
          actorId,
          itemId,
          quantity: form.querySelector("[name='actorItemQuantity']")?.value,
          move: form.querySelector("[name='moveItem']")?.checked
        };
        requestMutation("add-actor-item", payload);
        break;
      }
      case "take-storage-item": {
        const row = button.closest(".pv-storage-item");
        const payload = {
          containerId: button.dataset.containerId,
          itemId: button.dataset.itemId,
          actorId: row.querySelector("[name='takeActor']")?.value,
          quantity: row.querySelector("[name='takeQuantity']")?.value
        };
        requestMutation("take-storage-item", payload);
        break;
      }
      case "remove-storage-item": {
        const row = button.closest(".pv-storage-item");
        const payload = {
          containerId: button.dataset.containerId,
          itemId: button.dataset.itemId,
          quantity: row.querySelector("[name='takeQuantity']")?.value
        };
        if (confirm("Remove this stored item without giving it to an actor? Into the void it goes, tiny spreadsheet goblin.")) {
          requestMutation("remove-storage-item", payload);
        }
        break;
      }
      case "create-trade": {
        const form = button.closest(".pv-trade-form");
        const raw = form.querySelector("[name='tradeItem']")?.value || "";
        const [fromActorId, itemId] = raw.split("|");
        const payload = {
          fromActorId,
          itemId,
          toActorId: form.querySelector("[name='tradeTarget']")?.value,
          quantity: form.querySelector("[name='tradeQuantity']")?.value,
          requestText: form.querySelector("[name='requestText']")?.value
        };
        requestMutation("create-trade", payload);
        break;
      }
      case "accept-trade": requestMutation("accept-trade", { tradeId: button.dataset.tradeId }); break;
      case "decline-trade": requestMutation("decline-trade", { tradeId: button.dataset.tradeId }); break;
      case "clear-resolved-trades": requestMutation("clear-resolved-trades"); break;
      case "create-gm-note": {
        const form = button.closest(".pv-gm-note-create");
        requestMutation("create-gm-note", {
          title: form.querySelector("[name='gmNoteTitle']")?.value || "GM Note",
          notes: form.querySelector("[name='gmNoteText']")?.value || "",
          public: form.querySelector("[name='gmNotePublic']")?.checked || false
        });
        break;
      }
      case "delete-gm-note": {
        if (confirm("Delete this GM note? The note goblin eats it forever.")) requestMutation("delete-gm-note", { noteId: button.dataset.noteId });
        break;
      }
      case "clear-log": if (confirm("Clear the Party Viewer transaction log?")) requestMutation("clear-log"); break;
    }
  }

  _onRosterChange(event) {
    const row = event.currentTarget.closest("[data-actor-id]");
    if (!row) return;
    requestMutation("update-roster", {
      actorId: row.dataset.actorId,
      role: row.querySelector(".pv-roster-role")?.value || "pc",
      hidden: row.querySelector(".pv-roster-hidden")?.checked || false
    });
  }

  _onContainerChange(event) {
    const panel = event.currentTarget.closest("[data-container-id]");
    if (!panel) return;
    requestMutation("update-container", {
      containerId: panel.dataset.containerId,
      name: panel.querySelector("[name='containerEditName']")?.value,
      type: panel.querySelector("[name='containerEditType']")?.value,
      capacity: panel.querySelector("[name='containerEditCapacity']")?.value,
      locked: panel.querySelector("[name='containerEditLocked']")?.checked,
      playersTake: panel.querySelector("[name='containerEditPlayersTake']")?.checked,
      playersAdd: panel.querySelector("[name='containerEditPlayersAdd']")?.checked
    });
  }

  _onCurrencyChange(event) {
    const panel = event.currentTarget.closest("[data-container-id]");
    if (!panel) return;
    const currency = {};
    for (const c of ["cp", "sp", "ep", "gp", "pp"]) currency[c] = Number(panel.querySelector(`[name='currency-${c}']`)?.value) || 0;
    requestMutation("update-currency", { containerId: panel.dataset.containerId, currency });
  }

  _saveSharedNotes(event) {
    event.preventDefault();
    const notes = event.currentTarget.closest(".pv-shared-notes")?.querySelector("[name='sharedNotes']")?.value ?? "";
    requestMutation("update-shared-notes", { notes });
  }

  _savePrivateNotes(event) {
    event.preventDefault();
    const panel = event.currentTarget.closest(".pv-private-notes");
    const notes = panel?.querySelector("[name='privateNotes']")?.value ?? "";
    const isPublic = panel?.querySelector("[name='privateNotesPublic']")?.checked ?? false;
    requestMutation("update-private-notes", { notes, public: isPublic });
  }

  _saveGmNote(event) {
    event.preventDefault();
    const panel = event.currentTarget.closest(".pv-gm-note");
    requestMutation("update-gm-note", {
      noteId: panel?.dataset.noteId,
      title: panel?.querySelector("[name='gmNoteTitle']")?.value || "GM Note",
      notes: panel?.querySelector("[name='gmNoteText']")?.value || "",
      public: panel?.querySelector("[name='gmNotePublic']")?.checked || false
    });
  }

  _saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget.closest(".pv-settings");
    const settings = {};
    for (const input of form.querySelectorAll("input[type='checkbox'][data-setting]")) settings[input.dataset.setting] = input.checked;
    requestMutation("update-settings", { settings });
  }
}

function injectPartyButton() {
  if (!game.settings.get(MODULE_ID, "showButton")) return;
  if (document.getElementById("party-viewer-open-button")) return;
  const button = document.createElement("button");
  button.id = "party-viewer-open-button";
  button.type = "button";
  button.title = "SaltyBananaSlugs's Party Viewer";
  button.innerHTML = `<img src="${ICON}" alt=""> <span>Party</span>`;
  button.addEventListener("click", () => PartyViewerApp.open());
  document.body.appendChild(button);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "partyData", {
    name: "SaltyBananaSlugs's Party Viewer Data",
    scope: "world",
    config: false,
    type: Object,
    default: defaultPartyData()
  });

  game.settings.register(MODULE_ID, "showButton", {
    name: "Show SaltyBananaSlugs's Party Viewer Button",
    hint: "Adds a small floating SaltyBananaSlugs's Party Viewer button for players and GMs.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      document.getElementById("party-viewer-open-button")?.remove();
      injectPartyButton();
    }
  });

  Handlebars.registerHelper("pvEq", (a, b) => a === b);
  Handlebars.registerHelper("pvChecked", v => v ? "checked" : "");
  Handlebars.registerHelper("pvMoney", v => Number(v || 0).toLocaleString());
  Handlebars.registerHelper("pvFixed", (v, digits = 1) => Number(v || 0).toFixed(Number(digits) || 0));
  Handlebars.registerHelper("pvNl2br", text => new Handlebars.SafeString(Handlebars.escapeExpression(text || "").replace(/\n/g, "<br>")));
});


Hooks.once("socketlib.ready", () => {
  registerPartyViewerSocketlib();
});

Hooks.once("ready", () => {
  // If socketlib was already ready before this module reached the hook, register here too.
  // The guard prevents duplicate handlers. This keeps player-owned deposits from
  // disappearing into the wizard basement when load order gets spicy.
  registerPartyViewerSocketlib();
  window.PartyViewer = {
    open: () => PartyViewerApp.open(),
    app: PartyViewerApp,
    getData: getPartyData
  };

  game.socket.on(SOCKET, async message => {
    if (!message) return;

    if (message.type === "result") {
      if (message.userId !== game.user.id) return;
      const pending = pendingRequests.get(message.requestId);
      pendingRequests.delete(message.requestId);
      if (message.ok) {
        ui.notifications.info(message.message || actionSuccessMessage(pending?.action || message.action));
        PartyViewerApp.refreshOpen();
      } else {
        console.error(`${MODULE_ID} | Remote mutation failed`, message);
        ui.notifications.error(message.error || "Party Viewer change failed.");
      }
      return;
    }

    if (message.type && message.type !== "mutation") return;
    if (!isPrimaryGM()) return;

    try {
      await mutatePartyData(message.action, message.payload ?? {}, message.userId);
      PartyViewerApp.refreshOpen();
      if (message.requestId) {
        game.socket.emit(SOCKET, {
          type: "result",
          requestId: message.requestId,
          userId: message.userId,
          action: message.action,
          ok: true,
          message: actionSuccessMessage(message.action)
        });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Socket mutation failed`, message, err);
      if (message.requestId) {
        game.socket.emit(SOCKET, {
          type: "result",
          requestId: message.requestId,
          userId: message.userId,
          action: message.action,
          ok: false,
          error: err.message || String(err)
        });
      } else {
        ui.notifications.warn(`Party Viewer change failed: ${err.message || err}`);
      }
    }
  });

  injectPartyButton();
});

Hooks.on("updateActor", () => PartyViewerApp.refreshOpen());
Hooks.on("createActiveEffect", () => PartyViewerApp.refreshOpen());
Hooks.on("updateActiveEffect", () => PartyViewerApp.refreshOpen());
Hooks.on("deleteActiveEffect", () => PartyViewerApp.refreshOpen());
Hooks.on("createItem", () => PartyViewerApp.refreshOpen());
Hooks.on("updateItem", () => PartyViewerApp.refreshOpen());
Hooks.on("deleteItem", () => PartyViewerApp.refreshOpen());
Hooks.on("updateSetting", setting => {
  if (setting?.key === `${MODULE_ID}.partyData`) PartyViewerApp.refreshOpen();
});
