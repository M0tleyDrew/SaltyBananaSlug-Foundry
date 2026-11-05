import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveInventory,
  configureLink,
  refreshLinked,
  addLinkedItem,
  removeLinkedItem,
} from "../scripts/linked-storage.js";
import { fixture, Collection, merge } from "./helpers.mjs";
function setup() {
  const f = fixture();
  const docs = new Map(f.actors.contents.map((a) => [a.uuid, a]));
  globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;
  return { ...f, docs };
}
const storage = () => ({
  id: "wagon",
  name: "Wagon",
  items: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
});
test("linking Actor or vehicle Token uses the same physical inventory and exact currency", async () => {
  const f = setup(),
    v = f.actors.get("v");
  v.type = "vehicle";
  v.add("crate", "Crate", 4);
  v.add("feature", "Feature", 1, "feat");
  const token = {
    uuid: "Scene.s.Token.wagon",
    documentName: "Token",
    name: "Wagon token",
    actor: v,
    getFlag: () => null,
  };
  f.docs.set(token.uuid, token);
  const c = storage();
  await configureLink(c, token.uuid);
  assert.equal(c.linkedActorId, v.id);
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].quantity, 4);
  await addLinkedItem(
    c,
    { name: "Rope", type: "loot", system: { quantity: 20 } },
    2,
  );
  assert.equal(
    v.items.contents.find((i) => i.name === "Rope").system.quantity,
    2,
  );
  await removeLinkedItem(c, "crate", 3);
  assert.equal(v.items.get("crate").system.quantity, 1);
  assert.equal(c.items.find((i) => i.id === "crate").quantity, 1);
});
test("existing virtual stock migrates once using remaining quantity; unlink leaves live inventory intact", async () => {
  const f = setup(),
    v = f.actors.get("v"),
    c = storage();
  c.items = [
    {
      quantity: 2,
      itemData: { name: "Rope", type: "loot", system: { quantity: 99 } },
    },
  ];
  c.currency.gp = 5;
  await configureLink(c, v.uuid);
  assert.equal(v.items.contents[0].system.quantity, 2);
  assert.equal(v.system.currency.gp, 15);
  await configureLink(c, v.uuid);
  assert.equal(v.items.size, 1);
  await configureLink(c, "");
  assert.equal(v.items.size, 1);
  assert.equal(v.system.currency.gp, 15);
  assert.equal(c.items.length, 0);
  assert.equal(c.currency.gp, 0);
});
test("actor-owned bag links show only nested contents and keep bag coins separate from actor coins", async () => {
  const f = setup(),
    v = f.actors.get("v"),
    bag = v.add("bag", "Bag", 1, "container");
  v.add("inside", "Inside", 3, "loot", { container: "bag" });
  v.add("outside", "Outside", 5);
  const inner = v.add("inner", "Inner", 1, "container", { container: "bag" });
  v.add("nested", "Nested", 2, "loot", { container: "inner" });
  f.docs.set(bag.uuid, bag);
  const c = storage();
  await configureLink(c, bag.uuid);
  assert.deepEqual(c.items.map((i) => i.name).sort(), [
    "Inner",
    "Inside",
    "Nested",
  ]);
  await addLinkedItem(
    c,
    { name: "New", type: "loot", system: { quantity: 1 } },
    1,
  );
  assert.equal(
    v.items.contents.find((i) => i.name === "New").system.container,
    "bag",
  );
  await (
    await resolveInventory(bag.uuid)
  ).setCurrency({ cp: 1, sp: 0, ep: 0, gp: 2, pp: 0 });
  assert.equal(v.system.currency.gp, 10);
  await refreshLinked(c);
  assert.equal(c.currency.gp, 2);
  await assert.rejects(removeLinkedItem(c, inner.id, 1), /Empty/);
});
test("bad UUID and compendium sources fail before moving virtual stock; failed migration rolls back", async () => {
  const f = setup(),
    c = storage(),
    v = f.actors.get("v");
  c.items = [
    {
      quantity: 1,
      itemData: { name: "Rope", type: "loot", system: { quantity: 1 } },
    },
  ];
  await assert.rejects(configureLink(c, "missing"), /could not be found/);
  assert.equal(c.items.length, 1);
  v.failUpdate = true;
  await assert.rejects(configureLink(c, v.uuid));
  assert.equal(v.items.size, 0);
  assert.equal(c.linkedUuid, undefined);
});
test("live inventory changes are reflected on refresh, and a missing link reports an error", async () => {
  const f = setup(),
    v = f.actors.get("v"),
    item = v.add("food", "Food", 5),
    c = storage();
  await configureLink(c, v.uuid);
  await item.update({ "system.quantity": 2 });
  await refreshLinked(c);
  assert.equal(c.items[0].quantity, 2);
  f.docs.delete(v.uuid);
  await refreshLinked(c);
  assert.equal(c.items.length, 0);
  assert.match(c.linkError, /could not be found/);
});
test("SBS container token UUID resolves its actual inventory actor instead of its empty shell", async () => {
  const f = setup(),
    v = f.actors.get("v");
  v.add("stock", "Stock", 3);
  const token = {
    documentName: "Token",
    uuid: "Scene.s.Token.chest",
    name: "Chest",
    actor: f.a,
    getFlag: (ns, key) =>
      ns === "saltybananaslug-containers" && key === "container"
        ? { isContainer: true, inventoryActorId: v.id }
        : null,
  };
  f.docs.set(token.uuid, token);
  const c = storage();
  await configureLink(c, token.uuid);
  assert.equal(c.linkedActorId, v.id);
  assert.equal(c.items[0].quantity, 3);
});

let api;
async function main() {
  if (api) return api;
  globalThis.Application = class {
    static get defaultOptions() {
      return {};
    }
    render() {}
  };
  globalThis.Hooks = { on() {}, once() {} };
  api = await import("../scripts/party-viewer.js");
  return api;
}
function worldSetup(f) {
  let world = { roster: [{ id: "a" }, { id: "b" }], containers: [] };
  game.settings = {
    get: () => structuredClone(world),
    set: async (ns, key, data) => {
      world = structuredClone(data);
    },
  };
  return () => world;
}
test("Party Viewer links, deposits, and withdrawals mutate live stock through its GM queue", async () => {
  const f = setup(),
    api = await main(),
    world = worldSetup(f);
  await api.mutatePartyData(
    "create-container",
    { name: "Wagon", linkedUuid: "Actor.v" },
    "gm",
  );
  const c = world().containers[0];
  f.a.add("source", "Source", 3);
  await api.mutatePartyData(
    "add-actor-item",
    {
      containerId: c.id,
      actorId: "a",
      itemId: "source",
      quantity: 2,
      move: true,
    },
    "alice",
  );
  assert.equal(f.a.items.get("source").system.quantity, 1);
  const entry = world().containers[0].items[0];
  await api.mutatePartyData(
    "take-storage-item",
    { containerId: c.id, actorId: "b", itemId: entry.id, quantity: 1 },
    "bob",
  );
  assert.equal(
    f.b.items.contents.find((i) => i.name === "Source").system.quantity,
    1,
  );
  assert.equal(
    f.actors.get("v").items.contents.find((i) => i.name === "Source").system
      .quantity,
    1,
  );
  await assert.rejects(
    api.mutatePartyData(
      "update-currency",
      { containerId: c.id, currency: { gp: 500 } },
      "alice",
    ),
    /Only the GM/,
  );
});
test("failed world-setting save reverses link migration instead of duplicating old storage", async () => {
  const f = setup(),
    api = await main(),
    world = worldSetup(f);
  await api.mutatePartyData("create-container", { name: "Old" }, "gm");
  const c = world().containers[0];
  await api.mutatePartyData(
    "add-manual-item",
    { containerId: c.id, name: "Old Rope", quantity: 2 },
    "gm",
  );
  const realSet = game.settings.set;
  game.settings.set = async () => {
    throw new Error("Save failed");
  };
  await assert.rejects(
    api.mutatePartyData(
      "update-container",
      { containerId: c.id, linkedUuid: "Actor.v" },
      "gm",
    ),
    /Save failed/,
  );
  game.settings.set = realSet;
  assert.equal(f.actors.get("v").items.size, 0);
  assert.equal(world().containers[0].items[0].quantity, 2);
});
test("legacy one-sided accept cannot bypass the two-party ready protocol", async () => {
  const f = setup(),
    api = await main();
  worldSetup(f);
  await assert.rejects(
    api.mutatePartyData("accept-trade", { tradeId: "old" }, "bob"),
    /separate Trades window/,
  );
});

test("taking a linked bag item clears its old container reference on the receiving character", async () => {
  const f = setup(),
    api = await main(),
    world = worldSetup(f),
    v = f.actors.get("v"),
    bag = v.add("bag", "Bag", 1, "container");
  v.add("food", "Food", 2, "loot", { container: "bag" });
  f.docs.set(bag.uuid, bag);
  await api.mutatePartyData(
    "create-container",
    { name: "Bag contents", linkedUuid: bag.uuid },
    "gm",
  );
  const c = world().containers[0];
  await api.mutatePartyData(
    "take-storage-item",
    { containerId: c.id, actorId: "b", itemId: "food", quantity: 1 },
    "bob",
  );
  assert.equal(f.b.items.contents[0].system.container, null);
  assert.equal(v.items.get("food").system.quantity, 1);
});
