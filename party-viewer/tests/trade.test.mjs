import test from "node:test";
import assert from "node:assert/strict";
import { TradeEngine, coins, quantity } from "../scripts/trade-engine.js";
import { fixture } from "./helpers.mjs";
async function setup() {
  const f = fixture();
  f.a.add("sword", "Sword", 3);
  f.b.add("shield", "Shield", 1);
  const views = [];
  let id = 0;
  const engine = new TradeEngine({
    actors: () => f.actors,
    users: () => f.users,
    roster: () => [{ id: "a" }, { id: "b" }, { id: "v" }],
    id: () => `trade${++id}`,
    emit: (v) => views.push(v),
  });
  let s = await engine.act(
    "start",
    { actorId: "a", targetActorId: "b", targetUserId: "bob" },
    f.alice,
  );
  const act = async (action, p = {}, user = f.alice) => {
    const live = engine.sessions.get(s.id);
    s = await engine.act(
      action,
      {
        id: s.id,
        revision: live.revision,
        offerRevision: live.offerRevision,
        ...p,
      },
      user,
    );
    return s;
  };
  return {
    ...f,
    engine,
    act,
    views,
    get s() {
      return s;
    },
  };
}
const offer = (f, actorId, items = [], currency = {}) =>
  f.act(
    "offer",
    { actorId, items, currency },
    actorId === "a" ? f.alice : f.bob,
  );
const ready = async (f) => {
  await f.act("ready", { actorId: "a", ready: true });
  await f.act("ready", { actorId: "b", ready: true }, f.bob);
};
test("two-sided items and exact coin denominations move only after both ready and explicit completion", async () => {
  const f = await setup();
  await offer(f, "a", [{ itemId: "sword", quantity: 2 }], { gp: 4, cp: 2 });
  await offer(f, "b", [{ itemId: "shield", quantity: 1 }], { sp: 2 });
  assert.equal(quantity(f.a.items.get("sword")), 3);
  await assert.rejects(f.act("complete"), /Both players/);
  await ready(f);
  assert.equal(f.a.items.size, 1);
  await f.act("complete");
  assert.equal(f.s.status, "completed");
  assert.equal(quantity(f.a.items.get("sword")), 1);
  assert.equal(
    f.a.items.contents.find((i) => i.name === "Shield").type,
    "loot",
  );
  assert.equal(
    f.b.items.contents.find((i) => i.name === "Sword").system.quantity,
    2,
  );
  assert.deepEqual(coins(f.a), { cp: 18, sp: 5, ep: 0, gp: 6, pp: 1 });
  assert.deepEqual(coins(f.b), { cp: 22, sp: 1, ep: 0, gp: 14, pp: 1 });
  const counts = [f.a.items.size, f.b.items.size];
  await f.act("complete");
  assert.deepEqual([f.a.items.size, f.b.items.size], counts);
});
test("changing either offer clears both ready states; GM can complete but cannot ready for participants", async () => {
  const f = await setup();
  await offer(f, "a", [], { gp: 1 });
  await ready(f);
  await offer(f, "b", [], { cp: 1 });
  assert.ok(f.s.sides.every((x) => !x.ready));
  await assert.rejects(
    f.act("ready", { actorId: "a", ready: true }, f.gm),
    /own side/,
  );
  await ready(f);
  await f.act("complete", {}, f.gm);
  assert.equal(f.s.status, "completed");
});
test("outsiders cannot inspect, edit, cancel or complete another session; other inventories are absent from snapshots", async () => {
  const f = await setup();
  for (const action of ["watch", "cancel", "complete", "offer"])
    await assert.rejects(
      f.act(action, {}, f.users.get("outsider")),
      /not available/,
    );
  assert.equal(JSON.stringify(f.views).includes("Sword"), false);
  await offer(f, "a", [{ itemId: "sword", quantity: 1 }]);
  assert.equal(JSON.stringify(f.s).includes("Shield"), false);
  assert.equal(JSON.stringify(f.s).includes("signature"), false);
  await assert.rejects(
    f.act("offer", { actorId: "b", items: [], currency: {} }),
    /own side/,
  );
});
test("stale revisions, duplicate items, nonphysical items and invalid quantities cannot enter an offer", async () => {
  const f = await setup();
  f.a.add("feat", "Action Surge", 1, "feat");
  for (const items of [
    [{ itemId: "sword", quantity: 4 }],
    [{ itemId: "sword", quantity: 0 }],
    [{ itemId: "sword", quantity: 1.5 }],
    [{ itemId: "feat", quantity: 1 }],
    [
      { itemId: "sword", quantity: 1 },
      { itemId: "sword", quantity: 1 },
    ],
  ])
    await assert.rejects(offer(f, "a", items));
  await assert.rejects(offer(f, "a", [], { gp: 11 }));
  await assert.rejects(offer(f, "a", [], { cp: -1 }));
  await assert.rejects(
    f.engine.act(
      "offer",
      { id: f.s.id, revision: -1, actorId: "a", items: [], currency: {} },
      f.alice,
    ),
    /offer changed/,
  );
});
test("external offered-item or coin changes invalidate readiness; unrelated inventory edits do not", async () => {
  const f = await setup();
  await offer(f, "a", [{ itemId: "sword", quantity: 2 }], { gp: 8 });
  await ready(f);
  f.a.add("other", "Other", 1);
  const count = f.views.length;
  f.engine.invalidateActor(f.a);
  assert.equal(f.views.length, count);
  await f.a.items.get("sword").update({ "system.quantity": 1 });
  f.engine.invalidateActor(f.a);
  assert.ok(
    f.engine.view(f.engine.sessions.get(f.s.id)).sides.every((x) => !x.ready),
  );
  await assert.rejects(f.act("complete"), /Both players/);
});
test("item-create failure rolls back source quantities and deleted source items without coin loss", async () => {
  const f = await setup();
  await offer(f, "a", [{ itemId: "sword", quantity: 2 }]);
  await offer(f, "b", [{ itemId: "shield", quantity: 1 }]);
  await ready(f);
  f.b.failCreate = true;
  await assert.rejects(f.act("complete"), /changes restored/);
  assert.equal(quantity(f.a.items.get("sword")), 3);
  assert.equal(quantity(f.b.items.get("shield")), 1);
  assert.equal(f.a.items.size, 1);
  assert.equal(f.b.items.size, 1);
  assert.equal(coins(f.a).gp, 10);
});
test("currency failure after item transfer restores both inventories and coins", async () => {
  const f = await setup();
  await offer(f, "a", [{ itemId: "sword", quantity: 3 }], { gp: 5 });
  await ready(f);
  f.b.failUpdate = true;
  await assert.rejects(f.act("complete"), /changes restored/);
  assert.equal(quantity(f.a.items.get("sword")), 3);
  assert.equal(f.b.items.size, 1);
  assert.equal(coins(f.a).gp, 10);
});
test("ownership loss and depleted funds are rechecked before final completion", async () => {
  const f = await setup();
  await offer(f, "a", [], { gp: 8 });
  await ready(f);
  f.a.system.currency.gp = 1;
  await assert.rejects(f.act("complete"), /no longer has/);
  assert.equal(f.b.system.currency.gp, 10);
});
test("ready messages can arrive together for the same unchanged offer", async () => {
  const f = await setup();
  await offer(f, "a", [], { gp: 1 });
  const revision = f.s.revision,
    offerRevision = f.s.offerRevision;
  await f.engine.act(
    "ready",
    { id: f.s.id, revision, offerRevision, actorId: "a", ready: true },
    f.alice,
  );
  await f.engine.act(
    "ready",
    { id: f.s.id, revision, offerRevision, actorId: "b", ready: true },
    f.bob,
  );
  assert.ok(f.engine.sessions.get(f.s.id).sides.every((x) => x.ready));
});
