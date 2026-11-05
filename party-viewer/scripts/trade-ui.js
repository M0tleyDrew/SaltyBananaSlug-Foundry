import { TradeEngine, COINS, PHYSICAL, quantity } from "./trade-engine.js";
const MOD = "party-viewer",
  SOCKET = `module.${MOD}`;
const Base = globalThis.Application ?? foundry.appv1?.api?.Application;
let context, engine, picker;
const windows = new Map(),
  requests = new Map();
function userOwns(user, actor) {
  return user?.isGM || actor?.testUserPermission(user, "OWNER");
}
function error(e) {
  ui.notifications.error(e.message ?? String(e));
}
function receive(view) {
  const current = windows.get(view.id);
  if (current && current.session.revision > view.revision) return;
  const participant = view.sides.some((s) => s.userId === game.user.id);
  if (!current && !participant) return;
  const app = current ?? new TradeWindow(view);
  app.session = view;
  windows.set(view.id, app);
  app.render(true);
}
async function execute(action, payload, userId) {
  return context.run(() => engine.act(action, payload, game.users.get(userId)));
}
function request(action, payload = {}) {
  const gm = context.primaryGM();
  if (!gm) return Promise.reject(new Error("An active GM is needed to trade."));
  if (game.user.id === gm.id) return execute(action, payload, game.user.id);
  const id = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(
        new Error(
          "The GM did not respond. Reopen Trades to check the session before retrying.",
        ),
      );
    }, 15000);
    requests.set(id, { resolve, reject, timer, gmId: gm.id });
    game.socket.emit(SOCKET, {
      type: "trade-request",
      id,
      action,
      payload,
      userId: game.user.id,
    });
  });
}
export function setupPartyTrades(config) {
  context = config;
  engine = new TradeEngine({
    actors: () => game.actors,
    users: () => game.users,
    roster: () => context.data().roster,
    id: () => foundry.utils.randomID(),
    emit: (view) => {
      const targets = [
        ...new Set([
          ...view.sides.map((s) => s.userId),
          ...game.users.filter((u) => u.isGM && u.active).map((u) => u.id),
        ]),
      ];
      if (targets.includes(game.user.id)) receive(view);
      game.socket.emit(SOCKET, {
        type: "trade-view",
        gmId: game.user.id,
        targets,
        view,
      });
    },
  });
  game.socket.on(SOCKET, async (msg) => {
    if (!msg?.type?.startsWith("trade-")) return;
    if (msg.type === "trade-view") {
      if (
        msg.gmId === context.primaryGM()?.id &&
        msg.targets?.includes(game.user.id)
      )
        receive(msg.view);
      return;
    }
    if (msg.type === "trade-result") {
      if (msg.userId !== game.user.id) return;
      const pending = requests.get(msg.id);
      if (!pending || pending.gmId !== msg.gmId) return;
      clearTimeout(pending.timer);
      requests.delete(msg.id);
      msg.ok
        ? pending.resolve(msg.result)
        : pending.reject(new Error(msg.error));
      return;
    }
    if (
      msg.type !== "trade-request" ||
      context.primaryGM()?.id !== game.user.id
    )
      return;
    try {
      const result = await execute(msg.action, msg.payload ?? {}, msg.userId);
      game.socket.emit(SOCKET, {
        type: "trade-result",
        id: msg.id,
        userId: msg.userId,
        gmId: game.user.id,
        ok: true,
        result,
      });
    } catch (e) {
      game.socket.emit(SOCKET, {
        type: "trade-result",
        id: msg.id,
        userId: msg.userId,
        gmId: game.user.id,
        ok: false,
        error: e.message,
      });
    }
  });
}
export function invalidateTradeActor(actor) {
  if (engine && context?.primaryGM()?.id === game.user.id)
    context.run(() => engine.invalidateActor(actor)).catch(error);
}
export async function openPartyTrades() {
  try {
    const sessions = await request("list");
    if (!picker) picker = new TradePicker();
    picker.sessions = sessions;
    picker.render(true);
  } catch (e) {
    error(e);
  }
}
export class TradePicker extends Base {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pv-trade-picker",
      title: "Party Trades",
      template: `modules/${MOD}/templates/trade-picker.hbs`,
      width: 590,
      height: 480,
      resizable: true,
      classes: ["party-viewer-window", "pv-trade-window"],
    });
  }
  getData() {
    const roster = context
      .data()
      .roster.filter((r) => game.user.isGM || !r.hidden)
      .map((r) => game.actors.get(r.id))
      .filter(Boolean);
    return {
      sources: roster
        .filter((a) => userOwns(game.user, a))
        .map((a) => ({ id: a.id, name: a.name })),
      targets: game.users
        .filter((u) => u.active && u.id !== game.user.id)
        .flatMap((u) =>
          roster
            .filter((a) => userOwns(u, a))
            .map((a) => ({
              value: `${u.id}|${a.id}`,
              name: `${u.name} — ${a.name}`,
            })),
        ),
      sessions: (this.sessions ?? []).map((s) => ({
        id: s.id,
        name: s.sides.map((x) => x.name).join(" ↔ "),
      })),
    };
  }
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    root
      .querySelector('[data-action="start"]')
      ?.addEventListener("click", async () => {
        const actorId = root.querySelector('[name="source"]').value,
          [targetUserId, targetActorId] = (
            root.querySelector('[name="target"]').value ?? ""
          ).split("|");
        try {
          const view = await request("start", {
            actorId,
            targetUserId,
            targetActorId,
          });
          receive(view);
          await this.close();
        } catch (e) {
          error(e);
        }
      });
    root.querySelectorAll("[data-session]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          const view = await request("watch", { id: b.dataset.session });
          const app = windows.get(view.id) ?? new TradeWindow(view);
          windows.set(view.id, app);
          receive(view);
        } catch (e) {
          error(e);
        }
      }),
    );
    root
      .querySelector('[data-action="refresh"]')
      ?.addEventListener("click", () => openPartyTrades());
  }
}
export class TradeWindow extends Base {
  constructor(session) {
    super({ id: `pv-trade-${session.id}` });
    this.session = session;
    this.busy = false;
    this.currencyDrafts = new Map();
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Party Trade",
      template: `modules/${MOD}/templates/trade-session.hbs`,
      width: 820,
      height: 610,
      resizable: true,
      classes: ["party-viewer-window", "pv-trade-window"],
    });
  }
  async close(options) {
    windows.delete(this.session.id);
    return super.close(options);
  }
  getData() {
    const s = this.session,
      open = s.status === "open",
      dirty = this.currencyDrafts.size > 0;
    return {
      id: s.id,
      status: s.status,
      error: s.error,
      open,
      complete:
        open &&
        !dirty &&
        s.sides.every((x) => x.ready) &&
        s.sides.some(
          (x) => x.items.length || Object.values(x.currency).some(Boolean),
        ),
      sides: s.sides.map((side) => ({
        ...side,
        mine: side.userId === game.user.id,
        editable: open && side.userId === game.user.id,
        dirty: this.currencyDrafts.has(side.actorId),
        coins: COINS.map((c) => ({
          coin: c,
          amount:
            this.currencyDrafts.get(side.actorId)?.[c] ?? side.currency[c],
        })),
      })),
    };
  }
  async act(action, payload = {}) {
    if (this.busy) return;
    this.busy = true;
    try {
      const view = await request(action, {
        id: this.session.id,
        revision: this.session.revision,
        offerRevision: this.session.offerRevision,
        ...payload,
      });
      receive(view);
      return view;
    } catch (e) {
      error(e);
      try {
        receive(await request("watch", { id: this.session.id }));
      } catch (_) {}
      return null;
    } finally {
      this.busy = false;
    }
  }
  async offer(
    side,
    items = side.items,
    currency = this.currencyDrafts.get(side.actorId) ?? side.currency,
  ) {
    if (this.busy) return;
    const draft = this.currencyDrafts.get(side.actorId);
    this.currencyDrafts.delete(side.actorId);
    const result = await this.act("offer", {
      actorId: side.actorId,
      items: items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
      currency,
    });
    if (!result && draft) {
      this.currencyDrafts.set(side.actorId, draft);
      this.render(false);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    root.querySelectorAll("[data-side]").forEach((panel) => {
      const side = this.session.sides.find(
        (s) => s.actorId === panel.dataset.side,
      );
      if (side.userId !== game.user.id || this.session.status !== "open")
        return;
      panel.addEventListener("dragover", (ev) => {
        ev.preventDefault();
      });
      panel.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (this.busy) return;
        try {
          const data = context.dropData(ev),
            resolved = await context.resolveDrop(data),
            item = resolved?.item;
          if (
            !item ||
            resolved.actor?.id !== side.actorId ||
            !PHYSICAL.has(item.type)
          )
            throw new Error(
              "Drag an inventory item from your selected character sheet onto your own side.",
            );
          const items = side.items.map((i) => ({ ...i })),
            existing = items.find((i) => i.itemId === item.id);
          if (existing) {
            if (existing.quantity >= quantity(item)) return;
            existing.quantity++;
          } else items.push({ itemId: item.id, quantity: 1 });
          await this.offer(side, items);
        } catch (e) {
          error(e);
        }
      });
      panel.querySelectorAll("[data-remove]").forEach((b) =>
        b.addEventListener("click", () =>
          this.offer(
            side,
            side.items.filter((i) => i.itemId !== b.dataset.remove),
          ),
        ),
      );
      panel.querySelectorAll("[data-quantity]").forEach((input) =>
        input.addEventListener("change", () =>
          this.offer(
            side,
            side.items.map((i) =>
              i.itemId === input.dataset.quantity
                ? { ...i, quantity: Number(input.value) }
                : i,
            ),
          ),
        ),
      );
      panel
        .querySelector("[data-save-coins]")
        ?.addEventListener("click", () => {
          const currency = Object.fromEntries(
            COINS.map((c) => [
              c,
              Number(panel.querySelector(`[name="${c}"]`).value),
            ]),
          );
          this.offer(side, side.items, currency);
        });
      panel.querySelectorAll("[data-coin]").forEach((input) =>
        input.addEventListener("input", () => {
          const currency = Object.fromEntries(
            COINS.map((c) => [
              c,
              Number(panel.querySelector(`[name="${c}"]`).value),
            ]),
          );
          this.currencyDrafts.set(side.actorId, currency);
          if (side.ready && !this.busy)
            this.act("ready", { actorId: side.actorId, ready: false });
          panel.dataset.dirty = "true";
          const ready = panel.querySelector("[data-ready]");
          if (ready) ready.disabled = true;
          const complete = root.querySelector("[data-complete]");
          if (complete) complete.disabled = true;
        }),
      );
      panel
        .querySelector("[data-ready]")
        ?.addEventListener("click", () =>
          this.act("ready", { actorId: side.actorId, ready: !side.ready }),
        );
    });
    root
      .querySelector("[data-complete]")
      ?.addEventListener("click", () => this.act("complete"));
    root
      .querySelector("[data-cancel]")
      ?.addEventListener("click", () => this.act("cancel"));
  }
}
