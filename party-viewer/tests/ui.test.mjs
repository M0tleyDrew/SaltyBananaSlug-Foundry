import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
const rendered = [];
globalThis.Application = class {
  constructor(options) {
    this.options = options;
  }
  static get defaultOptions() {
    return {};
  }
  render() {
    this.rendered = true;
    rendered.push(this);
    return this;
  }
  async close() {
    this.rendered = false;
  }
  activateListeners() {}
};
const { setupPartyTrades, TradeWindow } =
  await import("../scripts/trade-ui.js");
test("GM socket authority opens only participant windows, synchronizes offers, and completes once for duplicate clicks", async () => {
  const f = fixture();
  f.a.add("sword", "Sword", 2);
  f.b.add("secret", "Unshared Secret", 1);
  const packets = [];
  let handle;
  game.socket = {
    on: (name, fn) => (handle = fn),
    emit: (name, msg) => packets.push(msg),
  };
  let tail = Promise.resolve();
  const run = (fn) => {
    const next = tail.catch(() => {}).then(fn);
    tail = next;
    return next;
  };
  setupPartyTrades({
    run,
    primaryGM: () => f.gm,
    data: () => ({ roster: [{ id: "a" }, { id: "b" }] }),
    dropData() {},
    resolveDrop() {},
  });
  const rpc = async (action, payload, userId = "alice") => {
    const id = `request${packets.length}`;
    await handle({ type: "trade-request", action, payload, userId, id });
    const result = packets.findLast(
      (p) => p.type === "trade-result" && p.id === id,
    );
    assert.equal(result.ok, true, result.error);
    return result.result;
  };
  const initial = await rpc("start", {
    actorId: "a",
    targetActorId: "b",
    targetUserId: "bob",
  });
  assert.equal(rendered.length, 0, "GM does not get unsolicited trade windows");
  const message = packets.find((p) => p.type === "trade-view");
  assert.deepEqual(message.targets.sort(), ["alice", "bob", "gm"]);
  game.user = f.alice;
  await handle(message);
  assert.equal(rendered.at(-1).session.id, initial.id);
  assert.equal(
    rendered
      .at(-1)
      .getData()
      .sides.filter((s) => s.editable).length,
    1,
  );
  game.user = f.users.get("outsider");
  const count = rendered.length;
  await handle(message);
  assert.equal(rendered.length, count);
  game.user = f.gm;
  const offered = await rpc("offer", {
    id: initial.id,
    revision: initial.revision,
    actorId: "a",
    items: [{ itemId: "sword", quantity: 1 }],
    currency: { gp: 2 },
  });
  assert.equal(JSON.stringify(offered).includes("Unshared Secret"), false);
  await rpc("ready", {
    id: initial.id,
    offerRevision: offered.offerRevision,
    actorId: "a",
    ready: true,
  });
  const ready = await rpc(
    "ready",
    {
      id: initial.id,
      offerRevision: offered.offerRevision,
      actorId: "b",
      ready: true,
    },
    "bob",
  );
  const payload = { id: ready.id, offerRevision: ready.offerRevision };
  await Promise.all([
    rpc("complete", payload),
    rpc("complete", payload, "bob"),
  ]);
  assert.equal(f.a.items.get("sword").system.quantity, 1);
  assert.equal(f.b.items.contents.filter((i) => i.name === "Sword").length, 1);
  assert.equal(f.a.system.currency.gp, 8);
  assert.equal(f.b.system.currency.gp, 12);
});
test("a currency draft survives remote updates and disables readiness/completion until saved", () => {
  const f = fixture(),
    s = {
      id: "draft",
      revision: 1,
      status: "open",
      sides: [
        {
          actorId: "a",
          userId: "alice",
          name: "A",
          ready: true,
          items: [],
          currency: { cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 },
        },
        {
          actorId: "b",
          userId: "bob",
          name: "B",
          ready: true,
          items: [],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        },
      ],
    };
  game.user = f.alice;
  const app = new TradeWindow(s);
  app.currencyDrafts.set("a", { gp: 5 });
  app.session = { ...s, revision: 2 };
  const data = app.getData();
  assert.equal(data.complete, false);
  assert.equal(data.sides[0].dirty, true);
  assert.equal(data.sides[0].coins.find((c) => c.coin === "gp").amount, 5);
  assert.equal(data.sides[1].editable, false);
});
