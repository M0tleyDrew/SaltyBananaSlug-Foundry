import {
  COINS,
  PHYSICAL,
  coins,
  quantity,
  clone,
  whole,
  itemCopy,
} from "./trade-engine.js";
const MOD = "party-viewer",
  SBS = "saltybananaslug-containers";
export function normalizeInventoryUuid(value) {
  const text = String(value ?? "").trim();
  return text.match(/^@UUID\[([^\]]+)\](?:\{[^}]*\})?$/)?.[1] ?? text;
}
export async function resolveInventory(uuid) {
  uuid = normalizeInventoryUuid(uuid);
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error("Linked inventory UUID could not be found.");
  let actor,
    bag = null,
    token = null;
  if (doc.documentName === "Token") {
    token = doc;
    const cfg = doc.getFlag?.(SBS, "container");
    actor = cfg?.isContainer
      ? game.actors.get(cfg.inventoryActorId)
      : doc.actor;
  } else if (doc.documentName === "Actor") {
    actor = doc;
    const inv = doc.getFlag?.(SBS, "inventoryActorId");
    if (inv) actor = game.actors.get(inv);
  } else if (
    doc.documentName === "Item" &&
    ["container", "backpack"].includes(doc.type) &&
    doc.parent?.documentName === "Actor"
  ) {
    bag = doc;
    actor = doc.parent;
  }
  if (!actor || actor.pack)
    throw new Error(
      "Use a world Actor, vehicle, scene Token, or an actor-owned container Item UUID.",
    );
  if (!token && actor.getFlag?.(SBS, "isInventory")) {
    const ref = actor.getFlag(SBS, "tokenRef");
    token = game.scenes.get(ref?.sceneId)?.tokens.get(ref?.tokenId);
  }
  const contains = (item) => {
    if (!bag) return true;
    const seen = new Set();
    let parent = item.system?.container;
    while (parent && !seen.has(parent)) {
      if (parent === bag.id) return true;
      seen.add(parent);
      parent = actor.items.get(parent)?.system?.container;
    }
    return false;
  };
  return {
    doc,
    actor,
    bag,
    token,
    items: () =>
      actor.items.contents.filter(
        (i) => PHYSICAL.has(i.type) && contains(i) && quantity(i) > 0,
      ),
    currency: () =>
      bag
        ? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...bag.getFlag(MOD, "currency") }
        : coins(actor),
    setCurrency: async (value) => {
      if (bag) await bag.setFlag(MOD, "currency", value);
      else
        await actor.update(
          Object.fromEntries(
            COINS.map((c) => [`system.currency.${c}`, value[c]]),
          ),
        );
    },
  };
}
export async function linkedAccess(ref, user, actor, action) {
  if (user.isGM) return;
  if (ref.token?.getFlag?.(SBS, "container")?.isContainer) {
    const service = await import(
      `/modules/${SBS}/scripts/container-service.js`
    );
    service.validateInteraction(
      ref.token,
      user,
      actor,
      action === "take" ? "withdraw" : action === "add" ? "deposit" : "inspect",
    );
  }
}
export async function refreshLinked(container, { user = game.user } = {}) {
  if (!container.linkedUuid) return container;
  try {
    const ref = await resolveInventory(container.linkedUuid);
    if (!user.isGM) await linkedAccess(ref, user, user.character, "inspect");
    container.linkedActorId = ref.actor.id;
    container.linkedName = ref.doc.name;
    container.linkError = "";
    container.items = ref.items().map((item) => {
      const itemData = clone(item.toObject());
      delete itemData._id;
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        img: item.img,
        quantity: quantity(item),
        weight:
          Number(item.system?.weight?.value ?? item.system?.weight ?? 0) || 0,
        value: Number(item.system?.price?.value ?? 0) || 0,
        itemData,
      };
    });
    container.currency = clone(ref.currency());
    return container;
  } catch (e) {
    container.items = [];
    container.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    container.linkError = e.message;
    return container;
  }
}
export async function configureLink(container, uuid) {
  uuid = normalizeInventoryUuid(uuid);
  if (uuid === container.linkedUuid) return;
  if (container.linkedUuid && !uuid) {
    container.linkedUuid = "";
    container.linkedActorId = "";
    container.linkedName = "";
    container.items = [];
    container.currency = Object.fromEntries(COINS.map((c) => [c, 0]));
    container.linkError = "";
    return;
  }
  if (container.linkedUuid && uuid !== container.linkedUuid)
    throw new Error(
      "Unlink the current inventory before linking a different UUID. Its inventory stays on the original document.",
    );
  const ref = await resolveInventory(uuid),
    created = [];
  const before = clone(ref.currency());
  try {
    for (const entry of container.items ?? []) {
      const data = itemCopy(entry.itemData, whole(entry.quantity, 1));
      if (ref.bag) data.system.container = ref.bag.id;
      const docs = await ref.actor.createEmbeddedDocuments("Item", [data]);
      created.push(...docs.map((i) => i.id));
    }
    const next = {};
    for (const c of COINS)
      next[c] = whole(
        Number(before[c] ?? 0) + Number(container.currency?.[c] ?? 0),
      );
    await ref.setCurrency(next);
  } catch (e) {
    if (created.length)
      await ref.actor.deleteEmbeddedDocuments("Item", created);
    await ref.setCurrency(before);
    throw e;
  }
  container.linkedUuid = uuid;
  await refreshLinked(container);
  return async () => {
    if (created.length)
      await ref.actor.deleteEmbeddedDocuments("Item", created);
    await ref.setCurrency(before);
  };
}
export async function addLinkedItem(container, itemData, q) {
  q = whole(q, 1);
  const ref = await resolveInventory(container.linkedUuid),
    data = itemCopy(itemData, q);
  if (ref.bag) data.system.container = ref.bag.id;
  const result = await ref.actor.createEmbeddedDocuments("Item", [data]);
  await refreshLinked(container);
  return { ref, created: result };
}
export async function removeLinkedItem(container, id, q) {
  q = whole(q, 1);
  const ref = await resolveInventory(container.linkedUuid),
    item = ref.items().find((i) => i.id === id);
  if (!item || quantity(item) < q)
    throw new Error("Linked inventory item is no longer available.");
  if (
    ref.actor.items.contents.some(
      (child) => child.system?.container === item.id,
    )
  )
    throw new Error("Empty this container before removing it.");
  if (quantity(item) === q)
    await ref.actor.deleteEmbeddedDocuments("Item", [id]);
  else
    await item.update({
      [typeof item.system.quantity === "object"
        ? "system.quantity.value"
        : "system.quantity"]: quantity(item) - q,
    });
  await refreshLinked(container);
}
