// Optional browser test: npm install playwright handlebars; npx playwright install chromium
// Run: node party-viewer/tests/browser-smoke.cjs
const fs = require("fs"),
  http = require("http"),
  path = require("path"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const server = http.createServer((req, res) => {
  const target = path.join(
    root,
    decodeURIComponent(req.url).replace("/modules/", "/"),
  );
  if (!target.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(target, (e, b) => {
    if (e) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "content-type",
      target.endsWith(".js") || target.endsWith(".mjs")
        ? "application/javascript"
        : target.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(b);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PARTY_VIEWER_CHROMIUM
      ? { executablePath: process.env.PARTY_VIEWER_CHROMIUM }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const pages = {},
    errors = [];
  for (const id of ["gm", "alice", "bob"]) {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
    });
    pages[id] = page;
    page.on("pageerror", (e) => errors.push(id + ": " + e.message));
    await page.exposeFunction("relay", async (msg) => {
      for (const [target, p] of Object.entries(pages))
        if (target !== id)
          await p.evaluate(async (msg) => {
            for (const handler of window.socketHandlers ?? [])
              await handler(msg);
          }, msg);
    });
    await page.goto(url + "/party-viewer/README.md");
    await page.addScriptTag({
      path: require.resolve("handlebars/dist/handlebars.js"),
    });
    await page.evaluate(async (id) => {
      document.body.innerHTML = "";
      window.socketHandlers = [];
      window.notices = [];
      window.apps = [];
      const helpers = await import("/party-viewer/tests/helpers.mjs");
      const f = helpers.fixture();
      foundry.utils.deepClone = (v) => structuredClone(v);
      game.user = f.users.get(id);
      f.a.add("sword", "Sword", 3);
      f.b.add("shield", "Shield", 1);
      f.b.add("secret", "Hidden Inventory Item", 4);
      game.socket = {
        on: (name, fn) => socketHandlers.push(fn),
        emit: (name, msg) => window.relay(msg),
      };
      window.ui = {
        notifications: {
          error: (m) => notices.push(m),
          info: (m) => notices.push(m),
        },
      };
      globalThis.Application = class {
        constructor(options = {}) {
          this.options = { ...this.constructor.defaultOptions, ...options };
          apps.push(this);
        }
        static get defaultOptions() {
          return {};
        }
        render() {
          (async () => {
            const data = await this.getData();
            const html = Handlebars.compile(
              await (
                await fetch("/" + this.options.template.replace("modules/", ""))
              ).text(),
            )(data);
            let root = document.getElementById(this.options.id);
            if (!root) {
              root = document.createElement("div");
              root.id = this.options.id;
              document.body.appendChild(root);
            }
            root.className = "party-viewer-window pv-trade-window";
            root.style.width = "820px";
            root.innerHTML = `<div class="window-content">${html}</div>`;
            this.element = [root];
            this.rendered = true;
            this.activateListeners([root]);
          })().catch((e) => notices.push(e.message));
          return this;
        }
        async close() {
          this.element?.[0]?.remove();
          this.rendered = false;
        }
        activateListeners() {}
      };
      const api = await import("/party-viewer/scripts/trade-ui.js");
      let tail = Promise.resolve();
      api.setupPartyTrades({
        data: () => ({ roster: [{ id: "a" }, { id: "b" }] }),
        primaryGM: () => f.gm,
        run: (fn) => {
          const p = tail.catch(() => {}).then(fn);
          tail = p;
          return p;
        },
        dropData: (ev) => JSON.parse(ev.dataTransfer.getData("text/plain")),
        resolveDrop: async (data) => {
          const [actorId, itemId] = data.ref.split("|");
          const actor = game.actors.get(actorId);
          return { actor, item: actor.items.get(itemId) };
        },
      });
      window.openTrades = api.openPartyTrades;
    }, id);
  }
  const a = pages.alice,
    b = pages.bob,
    g = pages.gm;
  await a.evaluate(() => openTrades());
  await a.locator('[name="source"]').selectOption("a");
  await a.locator('[name="target"]').selectOption("bob|b");
  await a.locator('[data-action="start"]').click();
  await a.waitForSelector(".pv-trade-session");
  await b.waitForSelector(".pv-trade-session");
  if (await g.locator(".pv-trade-session").count())
    throw Error("GM auto-opened unsolicited session");
  const drop = async (page, actorId, ref) =>
    page.locator(`[data-side="${actorId}"]`).evaluate((panel, ref) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", JSON.stringify({ ref }));
      panel.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
    }, ref);
  await drop(a, "a", "a|sword");
  await a.waitForSelector('[data-remove="sword"]');
  await b.waitForSelector('[data-side="a"] .pv-offered-item');
  if (
    (await a.locator(".pv-trade-session").innerText()).includes(
      "Hidden Inventory Item",
    )
  )
    throw Error("Other inventory leaked");
  await drop(b, "b", "b|shield");
  await b.waitForSelector('[data-remove="shield"]');
  await a.waitForSelector('[data-side="b"] .pv-offered-item');
  await a.locator('[data-side="a"] [name="gp"]').fill("4");
  await a.locator("[data-save-coins]").click();
  await b.waitForFunction(
    () => document.querySelector('[data-side="a"] [name="gp"]').value === "4",
  );
  if (!(await a.locator("[data-complete]").isDisabled()))
    throw Error("Early completion enabled");
  await a.locator("[data-ready]").click();
  await b.waitForFunction(() =>
    document.querySelector('[data-side="a"]').innerText.includes("· Ready"),
  );
  await b.locator("[data-ready]").click();
  await a.waitForFunction(
    () => !document.querySelector("[data-complete]").disabled,
  );
  await g.evaluate(() => openTrades());
  await g.locator("[data-session]").click();
  await g.waitForSelector(".pv-trade-session");
  if (await g.locator("[data-ready]").count())
    throw Error("GM observer can ready for players");
  await g.locator("[data-complete]").click();
  await a.waitForFunction(() =>
    document
      .querySelector(".pv-trade-session header")
      .innerText.includes("completed"),
  );
  await b.waitForFunction(() =>
    document
      .querySelector(".pv-trade-session header")
      .innerText.includes("completed"),
  );
  const result = await g.evaluate(() => ({
    a: game.actors.get("a").system.currency.gp,
    b: game.actors.get("b").system.currency.gp,
    itemsA: game.actors
      .get("a")
      .items.contents.map((i) => [i.name, i.system.quantity]),
    itemsB: game.actors
      .get("b")
      .items.contents.map((i) => [i.name, i.system.quantity]),
  }));
  if (
    result.a !== 6 ||
    result.b !== 14 ||
    !result.itemsA.some((i) => i[0] === "Shield") ||
    !result.itemsB.some((i) => i[0] === "Sword")
  )
    throw Error("Incorrect completed transfer " + JSON.stringify(result));
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Three-client browser simulation passed: picker, both automatic windows, two-sided drag/drop, currency, ready gate, GM observation/completion, synchronized result.",
  );
  console.log(JSON.stringify(result));
  const storagePage = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  await storagePage.goto(url + "/party-viewer/README.md");
  await storagePage.addScriptTag({
    path: require.resolve("handlebars/dist/handlebars.js"),
  });
  await storagePage.addScriptTag({
    path: require.resolve("jquery/dist/jquery.js"),
  });
  await storagePage.evaluate(async () => {
    const { fixture } = await import("/party-viewer/tests/helpers.mjs");
    const f = fixture();
    const listeners = new Map();
    globalThis.Hooks = {
      once() {},
      on(name, fn) {
        const list = listeners.get(name) ?? [];
        list.push(fn);
        listeners.set(name, list);
      },
      callAll(name, ...args) {
        for (const fn of listeners.get(name) ?? []) fn(...args);
      },
    };
    window.notices = [];
    globalThis.ui = {
      notifications: {
        info: (m) => notices.push(m),
        error: (m) => notices.push(m),
        warn: (m) => notices.push(m),
      },
    };
    window.world = {
      roster: [],
      containers: [
        {
          id: "wagon",
          name: "Shared Wagon",
          items: [
            {
              id: "old",
              name: "Old Rope",
              quantity: 2,
              itemData: {
                name: "Old Rope",
                type: "loot",
                system: { quantity: 2 },
              },
            },
          ],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        },
      ],
    };
    game.settings = {
      get: (ns, key) => (key === "partyData" ? structuredClone(world) : false),
      set: async (ns, key, value) => {
        window.world = structuredClone(value);
      },
    };
    globalThis.fromUuid = async (uuid) => {
      const parts = uuid.split(".");
      const actor = game.actors.get(parts[1]);
      return parts.length === 4 ? actor?.items.get(parts[3]) : actor;
    };
    for (const [name, fn] of Object.entries({
      pvEq: (a, b) => a === b,
      pvChecked: (v) => (v ? "checked" : ""),
      pvMoney: (v) => String(v || 0),
      pvFixed: (v) => Number(v || 0).toFixed(1),
      pvNl2br: (v) => v || "",
    }))
      Handlebars.registerHelper(name, fn);
    globalThis.Application = class {
      constructor(options = {}) {
        this.options = { ...this.constructor.defaultOptions, ...options };
      }
      static get defaultOptions() {
        return {};
      }
      render() {
        (async () => {
          const data = await this.getData(),
            template = await (
              await fetch("/" + this.options.template.replace("modules/", ""))
            ).text();
          let root = document.getElementById(this.options.id);
          if (!root) {
            root = document.createElement("div");
            root.id = this.options.id;
            document.body.appendChild(root);
          }
          root.innerHTML = Handlebars.compile(template)(data);
          this.element = jQuery(root);
          this.rendered = true;
          this.activateListeners(this.element);
        })().catch((e) => notices.push(e.message));
        return this;
      }
      activateListeners() {}
      async close() {
        this.element.remove();
        this.rendered = false;
      }
    };
    const api = await import("/party-viewer/scripts/party-viewer.js");
    const app = new api.PartyViewerApp();
    api.PartyViewerApp.instance = app;
    app.activeTab = "storage";
    app.render(true);
    window.storageApp = app;
    f.a.add("deposit", "Dragged Supplies", 2);
    f.actors.get("v").type = "vehicle";
  });
  await storagePage.waitForSelector(
    '.pv-container [data-action="save-container"]',
  );
  if (await storagePage.locator('[name="actorItem"]').count())
    throw Error("Inventory dropdown still rendered");
  if (await storagePage.locator(".pv-manual-item").count())
    throw Error("Storage is not drag-only");
  await storagePage
    .locator('.pv-container [name="containerLinkedUuid"]')
    .fill("Actor.v");
  await storagePage
    .locator('.pv-container [name="containerEditName"]')
    .fill("Linked Vehicle");
  await storagePage
    .locator('.pv-container [name="containerEditCapacity"]')
    .fill("125");
  await storagePage
    .locator('.pv-container [data-action="save-container"]')
    .click();
  await storagePage.waitForFunction(
    () =>
      world.containers[0].linkedUuid === "Actor.v" &&
      world.containers[0].name === "Linked Vehicle" &&
      world.containers[0].capacity === 125,
  );
  if (
    !(await storagePage.evaluate(() =>
      game.actors
        .get("v")
        .items.contents.some(
          (i) => i.name === "Old Rope" && i.system.quantity === 2,
        ),
    ))
  )
    throw Error("Save did not migrate stock to vehicle sheet");
  await storagePage.waitForSelector(".pv-linked-inventory");
  await storagePage.evaluate(async () => {
    const actor = game.actors.get("v");
    const [item] = await actor.createEmbeddedDocuments("Item", [
      { name: "Sheet Added Rations", type: "loot", system: { quantity: 5 } },
    ]);
    Hooks.callAll("createItem", item);
  });
  await storagePage.waitForFunction(() =>
    document
      .querySelector(".pv-storage-list")
      ?.textContent.includes("Sheet Added Rations"),
  );
  await storagePage.locator(".pv-drop-zone").evaluate((panel) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/plain",
      JSON.stringify({ type: "Item", uuid: "Actor.a.Item.deposit" }),
    );
    panel.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
  });
  await storagePage.waitForFunction(() =>
    game.actors
      .get("v")
      .items.contents.some((i) => i.name === "Dragged Supplies"),
  );
  await storagePage.waitForFunction(() =>
    document
      .querySelector(".pv-storage-list")
      ?.textContent.includes("Dragged Supplies"),
  );
  await storagePage.evaluate(() => {
    storageApp.activeTab = "gm";
    storageApp.render(false);
  });
  await storagePage.waitForSelector(
    '.pv-gm-storage-row [name="containerLinkedUuid"]',
  );
  if (
    (await storagePage
      .locator('.pv-gm-storage-row [name="containerLinkedUuid"]')
      .inputValue()) !== "Actor.v"
  )
    throw Error("Link was not persisted");
  await storagePage
    .locator('.pv-gm-storage-row [name="containerEditName"]')
    .fill("Saved from GM editor");
  await storagePage
    .locator('.pv-gm-storage-row [data-action="save-container"]')
    .click();
  await storagePage.waitForFunction(
    () => world.containers[0].name === "Saved from GM editor",
  );
  const storageResult = await storagePage.evaluate(() => ({
    name: world.containers[0].name,
    uuid: world.containers[0].linkedUuid,
    stock: game.actors
      .get("v")
      .items.contents.map((i) => [i.name, i.system.quantity]),
    source: game.actors.get("a").items.get("deposit").system.quantity,
    notices,
  }));
  if (storageResult.source !== 1)
    throw Error("Drag did not remove source quantity");
  console.log(
    "Storage browser checks passed: clicked Save in both editors, persisted UUID and settings, migrated stock, sheet-to-storage update, drag-to-sheet update, no inventory dropdown.",
  );
  console.log(JSON.stringify(storageResult));
  // Exercise the GM Users tab and the selected native UserConfig document.
  await storagePage.addStyleTag({path: path.join(root, "party-viewer/styles/party-viewer.css")});
  await storagePage.evaluate(() => {
    window.nativeUserSettings = [];
    foundry.applications = {sheets: {UserConfig: class {
      constructor({document}) {this.user = document;}
      render(force) {nativeUserSettings.push({id: this.user.id, force}); return this;}
    }}};
    game.users.get("alice").character = game.actors.get("a");
    game.users.get("bob").active = false;
    storageApp.activeTab = "users";
    storageApp.render(false);
  });
  await storagePage.waitForSelector('.pv-user-row[data-user-id="bob"]');
  if (!(await storagePage.locator('.pv-user-row[data-user-id="bob"]').innerText()).includes("Offline"))
    throw Error("Offline user omitted");
  await storagePage.locator('[data-action="open-user-settings"][data-user-id="bob"]').click();
  const native = await storagePage.evaluate(() => nativeUserSettings);
  if (native.length !== 1 || native[0].id !== "bob" || !native[0].force)
    throw Error("Wrong native user settings opened");
  await storagePage.evaluate(() => {
    game.user = game.users.get("alice");
    storageApp.activeTab = "users";
    storageApp.render(false);
  });
  await storagePage.waitForFunction(() => !document.querySelector('[data-tab="users"]'));
  if (await storagePage.locator('[data-action="open-user-settings"]').count())
    throw Error("Player sees user configuration controls");
  console.log("Users browser checks passed: offline user visible, native settings receive selected User document, players have no Users tab or controls.");
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
