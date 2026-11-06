export const COINS = ["cp", "sp", "ep", "gp", "pp"];
export const PHYSICAL = new Set([
  "weapon",
  "equipment",
  "consumable",
  "tool",
  "loot",
  "backpack",
  "container",
]);
export const clone = (value) => foundry.utils.deepClone(value);
export function quantity(item) {
  const raw = item?._source?.system?.quantity ?? item?.system?.quantity ?? 1;
  const n = Number(typeof raw === "object" ? raw.value : raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
export function coins(actor) {
  return Object.fromEntries(
    COINS.map((c) => [c, Number(actor?.system?.currency?.[c] ?? 0)]),
  );
}
export function whole(value, min = 0) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min)
    throw new Error("Use whole, nonnegative quantities.");
  return n;
}
export function itemCopy(item, q) {
  const d = clone(item.toObject ? item.toObject() : item);
  delete d._id;
  delete d._stats;
  delete d.ownership;
  delete d.folder;
  if (typeof d.system.quantity === "object") d.system.quantity.value = q;
  else d.system.quantity = q;
  if (d.system.container) d.system.container = null;
  return d;
}
function signature(item) {
  const d = clone(item.toObject ? item.toObject() : item);
  delete d._stats;
  return JSON.stringify(d);
}
function currencyPatch(value) {
  return Object.fromEntries(
    COINS.map((c) => [`system.currency.${c}`, value[c]]),
  );
}
function setQty(item, q) {
  return item.update({
    [typeof item.system.quantity === "object"
      ? "system.quantity.value"
      : "system.quantity"]: q,
  });
}

/** No inventory moves until completion. The caller serializes this with other Party Viewer mutations. */
export class TradeEngine {
  constructor({ actors, users, roster, id, emit }) {
    Object.assign(this, { actors, users, roster, id, emit });
    this.sessions = new Map();
  }
  owns(user, actor) {
    return Boolean(
      user && actor && (user.isGM || actor.testUserPermission(user, "OWNER")),
    );
  }
  allowed(session, user) {
    return Boolean(
      user?.isGM || session.sides.some((s) => s.userId === user?.id),
    );
  }
  view(session) {
    return {
      id: session.id,
      revision: session.revision,
      offerRevision: session.offerRevision,
      status: session.status,
      error: session.error ?? "",
      sides: session.sides.map((s) => ({
        userId: s.userId,
        actorId: s.actorId,
        name: this.actors().get(s.actorId)?.name ?? "Missing character",
        userName: this.users().get(s.userId)?.name ?? "Missing player",
        ready: s.ready,
        currency: clone(s.currency),
        items: s.items.map(({ signature, ...i }) => clone(i)),
      })),
    };
  }
  changed(s) {
    s.revision++;
    this.emit(this.view(s));
    return this.view(s);
  }
  clearReady(s) {
    for (const side of s.sides) side.ready = false;
  }
  requireSide(s, user, actorId) {
    const side = s.sides.find((x) => x.actorId === actorId);
    if (
      !side ||
      side.userId !== user?.id ||
      !this.owns(user, this.actors().get(actorId))
    )
      throw new Error("You can edit only your own side of this trade.");
    return side;
  }
  validate(s) {
    for (const side of s.sides) {
      const actor = this.actors().get(side.actorId),
        user = this.users().get(side.userId);
      if (!this.owns(user, actor))
        throw new Error("A participant no longer controls their character.");
      if (
        !this.roster().some(
          (r) => r.id === actor.id && (user.isGM || !r.hidden),
        )
      )
        throw new Error(
          "A character is no longer available in the party roster.",
        );
      const balance = coins(actor);
      for (const c of COINS) {
        whole(balance[c]);
        if (balance[c] < side.currency[c])
          throw new Error(`${actor.name} no longer has the offered ${c}.`);
      }
      for (const offer of side.items) {
        const item = actor.items.get(offer.itemId);
        if (
          !item ||
          quantity(item) < offer.quantity ||
          signature(item) !== offer.signature
        )
          throw new Error(
            `${offer.name} changed or is no longer available. Update the offer and ready again.`,
          );
      }
    }
  }
  async act(action, p, user) {
    if (!user) throw new Error("Player not found.");
    if (action === "list")
      return [...this.sessions.values()]
        .filter((s) => this.allowed(s, user) && s.status === "open")
        .map((s) => this.view(s));
    if (action === "start") {
      const roster = this.roster();
      const a = this.actors().get(p.actorId),
        b = this.actors().get(p.targetActorId),
        target = this.users().get(p.targetUserId);
      if (
        !a ||
        !b ||
        a.id === b.id ||
        !this.owns(user, a) ||
        !target?.active ||
        target.id === user.id ||
        !this.owns(target, b)
      )
        throw new Error(
          "Choose your character and a different online player with a character they own.",
        );
      if (
        ![a, b].every((actor) =>
          roster.some((r) => r.id === actor.id && (user.isGM || !r.hidden)),
        )
      )
        throw new Error("Both characters must be in the party roster.");
      const s = {
        id: this.id(),
        revision: 0,
        offerRevision: 0,
        status: "open",
        sides: [
          { actorId: a.id, userId: user.id },
          { actorId: b.id, userId: target.id },
        ].map((side) => ({
          ...side,
          ready: false,
          items: [],
          currency: Object.fromEntries(COINS.map((c) => [c, 0])),
        })),
      };
      this.sessions.set(s.id, s);
      return this.changed(s);
    }
    const s = this.sessions.get(p.id);
    if (!s || !this.allowed(s, user))
      throw new Error("Trade not found or not available to you.");
    if (action === "watch") return this.view(s);
    if (s.status !== "open") {
      if (action === "complete" && s.status === "completed")
        return this.view(s);
      throw new Error("This trade is closed.");
    }
    if (action === "cancel") {
      s.status = "cancelled";
      this.clearReady(s);
      return this.changed(s);
    }
    if (
      action === "offer"
        ? p.revision !== s.revision
        : p.offerRevision !== s.offerRevision
    )
      throw new Error(
        "The offer changed. Review the current offer and try again.",
      );
    if (action === "offer") {
      const side = this.requireSide(s, user, p.actorId),
        actor = this.actors().get(side.actorId);
      if (!Array.isArray(p.items) || p.items.length > 200)
        throw new Error("Invalid item offer.");
      const ids = new Set();
      const items = p.items.map((row) => {
        if (ids.has(row.itemId)) throw new Error("Duplicate item in offer.");
        ids.add(row.itemId);
        const item = actor.items.get(row.itemId),
          q = whole(row.quantity, 1);
        if (!item || !PHYSICAL.has(item.type) || quantity(item) < q)
          throw new Error(
            "Offer only available inventory items from your own character.",
          );
        if (
          actor.items.contents.some(
            (child) => child.system?.container === item.id,
          )
        )
          throw new Error("Empty this container before trading it.");
        return {
          itemId: item.id,
          name: item.name,
          img: item.img || "icons/svg/item-bag.svg",
          quantity: q,
          signature: signature(item),
        };
      });
      const currency = Object.fromEntries(
        COINS.map((c) => [c, whole(p.currency?.[c] ?? 0)]),
      );
      const balance = coins(actor);
      for (const c of COINS)
        if (currency[c] > balance[c]) throw new Error(`Not enough ${c}.`);
      side.items = items;
      side.currency = currency;
      s.offerRevision++;
      s.error = "";
      this.clearReady(s);
      return this.changed(s);
    }
    if (action === "ready") {
      const side = this.requireSide(s, user, p.actorId);
      try {
        this.validate(s);
      } catch (error) {
        this.clearReady(s);
        s.error = error.message;
        this.changed(s);
        throw error;
      }
      side.ready = Boolean(p.ready);
      s.error = "";
      return this.changed(s);
    }
    if (action !== "complete") throw new Error("Unknown trade action.");
    if (!s.sides.every((side) => side.ready))
      throw new Error("Both players must be ready.");
    if (
      !s.sides.some(
        (side) =>
          side.items.length || Object.values(side.currency).some(Boolean),
      )
    )
      throw new Error("Add an item or currency before completing the trade.");
    try {
      this.validate(s);
    } catch (error) {
      this.clearReady(s);
      s.error = error.message;
      this.changed(s);
      throw error;
    }
    const undo = [];
    s.status = "completing";
    this.changed(s);
    try {
      const plans = s.sides.map((side, index) => ({
        side,
        actor: this.actors().get(side.actorId),
        target: this.actors().get(s.sides[1 - index].actorId),
      }));
      // Remove all sources first; receiver stacks can never become another offered source.
      const transfers = [];
      for (const { side, actor, target } of plans) {
        for (const offer of side.items) {
          const item = actor.items.get(offer.itemId),
            before = clone(item.toObject()),
            copy = itemCopy(item, offer.quantity),
            left = quantity(item) - offer.quantity;
          if (left > 0) {
            await setQty(item, left);
            undo.push(() =>
              item.update({ "system.quantity": before.system.quantity }),
            );
          } else {
            await actor.deleteEmbeddedDocuments("Item", [item.id]);
            undo.push(() =>
              actor.createEmbeddedDocuments("Item", [before], { keepId: true }),
            );
          }
          transfers.push({ target, copy });
        }
      }
      for (const { target, copy } of transfers) {
        const created = await target.createEmbeddedDocuments("Item", [copy]);
        if (!created?.length)
          throw new Error("Foundry did not create the received item.");
        undo.push(() =>
          target.deleteEmbeddedDocuments(
            "Item",
            created.map((i) => i.id),
          ),
        );
      }
      for (const { side, actor } of plans) {
        const before = coins(actor),
          other = s.sides.find((x) => x !== side),
          next = {};
        for (const c of COINS)
          next[c] = whole(before[c] - side.currency[c] + other.currency[c]);
        await actor.update(currencyPatch(next));
        undo.push(() => actor.update(currencyPatch(before)));
      }
      s.status = "completed";
      s.error = "";
      return this.changed(s);
    } catch (error) {
      let failed = false;
      for (const reverse of undo.reverse())
        try {
          await reverse();
        } catch (rollbackError) {
          failed = true;
          console.error("Party Viewer trade rollback failed", rollbackError);
        }
      s.status = failed ? "error" : "open";
      this.clearReady(s);
      s.error = failed
        ? "Trade failed and could not fully restore inventory. Ask the GM to check both characters before continuing."
        : `Trade failed; changes restored. ${error.message}`;
      this.changed(s);
      throw new Error(s.error);
    }
  }
  invalidateActor(actor) {
    for (const s of this.sessions.values()) {
      if (
        s.status !== "open" ||
        !s.sides.some((side) => side.actorId === actor?.id) ||
        !s.sides.some((side) => side.ready)
      )
        continue;
      try {
        this.validate(s);
      } catch (error) {
        this.clearReady(s);
        s.error = error.message;
        this.changed(s);
      }
    }
  }
}
