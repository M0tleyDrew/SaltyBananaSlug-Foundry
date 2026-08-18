const MODULE_ID = "saltybananaslug-scene-piles";
const MODULE_TITLE = "SaltyBananaSlug's Scene Piles";
const MODULE_PATH = `modules/${MODULE_ID}`;
const FALLBACK_LOGO_PATH = `${MODULE_PATH}/assets/saltybananaslug.svg`;
let LOGO_PATH = FALLBACK_LOGO_PATH;

async function resolveLogoPath() {
  const candidates = [
    "modules/saltybananaslug-web-viewer/assets/banana-slug.svg",
    "modules/saltybananaslugs-message-cantrip/assets/party-viewer.svg",
    "modules/saltybananaslug-party-viewer/assets/party-viewer.svg",
    "modules/saltybananaslugs-party-viewer/assets/party-viewer.svg",
    FALLBACK_LOGO_PATH
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(path, { method: "GET", cache: "no-store" });
      if (response.ok) {
        LOGO_PATH = path;
        return path;
      }
    } catch (error) {
      console.debug(`${MODULE_TITLE} | Could not probe logo path ${path}`, error);
    }
  }
  return LOGO_PATH;
}
const JOURNAL_FOLDER = "SaltyBananaSlug Scene Piles";
const ITEM_FOLDER = "SaltyBananaSlug Scene Pile Items";

let scenePilesApp;

function duplicate(data) {
  return foundry.utils.deepClone(data);
}

function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function cleanItemData(source) {
  const data = source?.toObject ? source.toObject() : duplicate(source ?? {});
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  delete data._stats;
  if (data.flags?.[MODULE_ID]) {
    delete data.flags[MODULE_ID];
    if (!Object.keys(data.flags).length) delete data.flags;
  }
  return data;
}

function getItemQuantity(itemOrData) {
  try {
    if (game.itempiles?.API?.getItemQuantity) {
      const quantity = game.itempiles.API.getItemQuantity(itemOrData);
      if (Number.isFinite(Number(quantity))) return Number(quantity);
    }
  } catch (error) {
    console.debug(`${MODULE_TITLE} | Item Piles quantity lookup failed`, error);
  }

  const path = game.itempiles?.API?.ITEM_QUANTITY_ATTRIBUTE || "system.quantity";
  const value = foundry.utils.getProperty(itemOrData, path)
    ?? foundry.utils.getProperty(itemOrData, `system.${path}`)
    ?? 1;
  return Number.isFinite(Number(value)) ? Number(value) : 1;
}

function selectedTokenDocument() {
  return canvas?.tokens?.controlled?.[0]?.document ?? null;
}

function getPlacementPoint() {
  const selected = selectedTokenDocument();
  if (selected) {
    const gridSize = canvas.grid?.size || canvas.scene?.grid?.size || 100;
    return {
      x: selected.x + ((selected.width || 1) * gridSize) / 2,
      y: selected.y + ((selected.height || 1) * gridSize) / 2
    };
  }

  const pivot = canvas?.stage?.pivot;
  if (pivot) return { x: pivot.x, y: pivot.y };

  const rect = canvas?.scene?.dimensions?.sceneRect;
  if (rect) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

  return { x: 0, y: 0 };
}

function pileTargetActor(target) {
  if (!target) return null;
  if (target.documentName === "Token") return target.actor;
  if (target.documentName === "Actor") return target;
  if (target.actor?.documentName === "Actor") return target.actor;
  return null;
}

function isItemPileTarget(target) {
  try {
    if (game.itempiles?.API?.isValidItemPile?.(target)) return true;

    // Some Item Piles API versions validate TokenDocuments but not sidebar Actors.
    // Fall back to the module's published pile-flag path so Actor drops still work.
    const actor = pileTargetActor(target);
    const pileFlagPath = game.itempiles?.flags?.PILE;
    return Boolean(actor && pileFlagPath && foundry.utils.getProperty(actor, pileFlagPath));
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not validate Item Pile`, error);
    return false;
  }
}

async function getOrCreateFolder(name, type) {
  let folder = game.folders.find((entry) => entry.type === type && entry.name === name && !entry.folder);
  if (!folder) folder = await Folder.create({ name, type, sorting: "a" });
  return folder;
}

function itemRowFromDocument(item) {
  const itemData = cleanItemData(item);
  return {
    id: foundry.utils.randomID(),
    name: item.name || itemData.name || "Unnamed Item",
    img: item.img || itemData.img || "icons/svg/item-bag.svg",
    type: item.type || itemData.type || "item",
    quantity: getItemQuantity(item),
    sourceUuid: item.uuid || null,
    itemData
  };
}

function itemRowFromData(itemData, sourceUuid = null) {
  const clean = cleanItemData(itemData);
  return {
    id: foundry.utils.randomID(),
    name: clean.name || "Unnamed Item",
    img: clean.img || "icons/svg/item-bag.svg",
    type: clean.type || "item",
    quantity: getItemQuantity(clean),
    sourceUuid,
    itemData: clean
  };
}

async function resolveDropDocument(data) {
  if (data.uuid) {
    try {
      const document = await fromUuid(data.uuid);
      if (document) return document;
    } catch (error) {
      console.debug(`${MODULE_TITLE} | UUID drop resolution failed`, data.uuid, error);
    }
  }

  if (data.type === "Item" && data.id) return game.items.get(data.id) || null;
  if (data.type === "Actor" && data.id) return game.actors.get(data.id) || null;
  if (data.type === "JournalEntry" && data.id) return game.journal.get(data.id) || null;
  if (data.type === "Token" && data.sceneId && data.tokenId) {
    return game.scenes.get(data.sceneId)?.tokens.get(data.tokenId) || null;
  }
  return null;
}

async function collectItemsFromJournal(document) {
  const journal = document.documentName === "JournalEntryPage" ? document.parent : document;
  const onlyPage = document.documentName === "JournalEntryPage" ? document : null;
  if (!journal || journal.documentName !== "JournalEntry") return { journal: null, rows: [] };

  const uuids = new Set();
  const managedUuids = journal.getFlag(MODULE_ID, "itemUuids") || [];
  for (const uuid of managedUuids) uuids.add(uuid);

  const pages = onlyPage ? [onlyPage] : [...journal.pages];
  for (const page of pages) {
    if (page.type !== "text") continue;
    const content = page.text?.content || "";

    for (const match of content.matchAll(/@UUID\[([^\]#]+)(?:#[^\]]+)?\]/g)) uuids.add(match[1]);
    for (const match of content.matchAll(/data-uuid=["']([^"']+)["']/g)) uuids.add(match[1]);
    for (const match of content.matchAll(/data-sbs-item-uuid=["']([^"']+)["']/g)) uuids.add(match[1]);

    for (const match of content.matchAll(/@Item\[([^\]]+)\]/g)) {
      const item = game.items.get(match[1]) || game.items.getName(match[1]);
      if (item) uuids.add(item.uuid);
    }
  }

  const rows = [];
  for (const uuid of uuids) {
    try {
      const item = await fromUuid(uuid);
      if (item?.documentName === "Item") rows.push(itemRowFromDocument(item));
    } catch (error) {
      console.warn(`${MODULE_TITLE} | Broken item link in ${journal.name}: ${uuid}`, error);
    }
  }

  return { journal, rows };
}

function buildJournalContent(name, items) {
  const rows = items.map((item) => {
    const quantity = getItemQuantity(item);
    const quantityText = quantity !== 1 ? `<span class="sbs-scene-piles-qty">× ${escapeHTML(quantity)}</span>` : "";
    return `
      <li class="sbs-scene-piles-journal-item" data-sbs-item-uuid="${escapeHTML(item.uuid)}">
        <img src="${escapeHTML(item.img || "icons/svg/item-bag.svg")}" alt="" width="36" height="36">
        <span class="sbs-scene-piles-item-link">@UUID[${item.uuid}]{${escapeHTML(item.name)}}</span>
        ${quantityText}
      </li>`;
  }).join("");

  return `
    <section class="sbs-scene-piles-journal">
      <header>
        <img src="${LOGO_PATH}" alt="SaltyBananaSlug" width="52" height="52">
        <div>
          <h1>${escapeHTML(name)}</h1>
          <p>Drag an item link from this journal onto an Actor sheet whenever the loot goblin demands paperwork.</p>
        </div>
      </header>
      <ul class="sbs-scene-piles-journal-list">${rows}</ul>
    </section>`;
}

async function createBackingItems(rows, journalId, sharePlayers) {
  const folder = await getOrCreateFolder(ITEM_FOLDER, "Item");
  const ownership = { default: sharePlayers ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  const data = rows.map((row) => {
    const item = cleanItemData(row.itemData);
    item.folder = folder.id;
    item.ownership = ownership;
    item.flags = foundry.utils.mergeObject(item.flags || {}, {
      [MODULE_ID]: {
        managed: true,
        ownerJournalId: journalId,
        originalUuid: row.sourceUuid || null
      }
    }, { inplace: false });
    return item;
  });
  return Item.createDocuments(data);
}

async function deleteManagedBackingItems(journal) {
  const ids = game.items
    .filter((item) => item.getFlag(MODULE_ID, "ownerJournalId") === journal.id)
    .map((item) => item.id);
  if (ids.length) await Item.deleteDocuments(ids);
}

async function placeJournalNote(journal, page) {
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn(`${MODULE_TITLE}: Open a Scene before pinning the Journal.`);
    return null;
  }

  const existing = canvas.scene.notes.find((note) => note.entryId === journal.id && (!page || note.pageId === page.id));
  if (existing) {
    ui.notifications.info(`${journal.name} is already pinned to this Scene.`);
    return existing;
  }

  const point = getPlacementPoint();
  const [note] = await canvas.scene.createEmbeddedDocuments("Note", [{
    entryId: journal.id,
    pageId: page?.id || null,
    x: point.x,
    y: point.y,
    texture: { src: LOGO_PATH },
    iconSize: Math.max(64, canvas.grid?.size || 64),
    text: journal.name,
    fontSize: 24,
    textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
    textColor: "#f6e6a8"
  }]);
  return note;
}

async function createLauncherMacro() {
  if (!game.user.isGM) return;
  const command = `game.modules.get("${MODULE_ID}")?.api?.open();`;
  const existing = game.macros.find((macro) => macro.getFlag(MODULE_ID, "launcher"));
  if (existing) {
    const updates = {};
    if (existing.name !== MODULE_TITLE) updates.name = MODULE_TITLE;
    if (existing.img !== LOGO_PATH) updates.img = LOGO_PATH;
    if (existing.command !== command) updates.command = command;
    if (existing.type !== "script") updates.type = "script";
    if (Object.keys(updates).length) await existing.update(updates);
    return existing;
  }

  const macro = await Macro.create({
    name: MODULE_TITLE,
    type: "script",
    img: LOGO_PATH,
    command,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [MODULE_ID]: { launcher: true } }
  });
  ui.notifications.info(`${MODULE_TITLE}: Launcher macro created in the Macro Directory.`);
  return macro;
}

class ScenePilesApplication extends Application {
  constructor(options = {}) {
    super(options);
    this.rows = [];
    this.sourceLabel = "Nothing loaded";
    this.sourcePileToken = null;
    this.loadedJournal = null;
    this.outputName = "Scene Loot";
    this.attachNote = false;
    this.sharePlayers = true;
    this.removeOriginalPile = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "saltybananaslug-scene-piles",
      title: MODULE_TITLE,
      template: `${MODULE_PATH}/templates/scene-piles.html`,
      width: 650,
      height: 690,
      resizable: true,
      classes: ["saltybananaslug-scene-piles-window"]
    });
  }

  getData() {
    return {
      logoPath: LOGO_PATH,
      items: this.rows,
      itemCount: this.rows.length,
      sourceLabel: this.sourceLabel,
      loadedJournalName: this.loadedJournal?.name || "None",
      outputName: this.outputName,
      attachNote: this.attachNote,
      sharePlayers: this.sharePlayers,
      removeOriginalPile: this.removeOriginalPile,
      canUpdateJournal: Boolean(this.loadedJournal?.getFlag(MODULE_ID, "managed"))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const root = html[0];
    const dropZone = root.querySelector("[data-drop-zone]");
    dropZone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone?.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragover");
      await this._handleDrop(event);
    });

    html.on("change", "input[name='outputName']", (event) => { this.outputName = event.currentTarget.value; });
    html.on("change", "input[name='attachNote']", (event) => { this.attachNote = event.currentTarget.checked; });
    html.on("change", "input[name='sharePlayers']", (event) => { this.sharePlayers = event.currentTarget.checked; });
    html.on("change", "input[name='removeOriginalPile']", (event) => { this.removeOriginalPile = event.currentTarget.checked; });

    html.on("click", "[data-action]", async (event) => {
      event.preventDefault();
      const action = event.currentTarget.dataset.action;
      try {
        if (action === "load-selected-pile") await this.loadSelectedPile();
        if (action === "clear-items") this.clearItems();
        if (action === "remove-item") this.removeItem(event.currentTarget.dataset.rowId);
        if (action === "create-journal") await this.createJournal();
        if (action === "update-journal") await this.updateJournal();
        if (action === "create-pile") await this.createPile();
      } catch (error) {
        console.error(`${MODULE_TITLE} | ${action} failed`, error);
        ui.notifications.error(`${MODULE_TITLE}: ${error.message || "Something exploded in the loot bureaucracy."}`);
      }
    });
  }

  _syncForm() {
    const root = this.element?.[0];
    if (!root) return;
    this.outputName = root.querySelector("input[name='outputName']")?.value?.trim() || this.outputName;
    this.attachNote = Boolean(root.querySelector("input[name='attachNote']")?.checked);
    this.sharePlayers = Boolean(root.querySelector("input[name='sharePlayers']")?.checked);
    this.removeOriginalPile = Boolean(root.querySelector("input[name='removeOriginalPile']")?.checked);
  }

  async _handleDrop(event) {
    const textEditor = foundry.applications?.ux?.TextEditor ?? globalThis.TextEditor;
    if (!textEditor?.getDragEventData) throw new Error("Foundry's drag-and-drop parser is unavailable.");
    const data = textEditor.getDragEventData(event);
    const document = await resolveDropDocument(data);

    if (!document && data.type === "Item" && data.data) {
      this.rows.push(itemRowFromData(data.data));
      this.sourceLabel = "Dropped Item data";
      return this.render(false);
    }

    if (!document) {
      ui.notifications.warn(`${MODULE_TITLE}: I could not resolve that drop.`);
      return;
    }

    if (document.documentName === "Item") {
      this.rows.push(itemRowFromDocument(document));
      this.sourceLabel = "Dropped Items";
      if (this.rows.length === 1) this.outputName = `${document.name} Pile`;
      return this.render(false);
    }

    if (["JournalEntry", "JournalEntryPage"].includes(document.documentName)) {
      return this.loadJournal(document);
    }

    if (["Actor", "Token"].includes(document.documentName)) {
      return this.loadPile(document);
    }

    ui.notifications.warn(`${MODULE_TITLE}: Drop Items, Journals, or Item Pile tokens here.`);
  }

  clearItems() {
    this.rows = [];
    this.sourceLabel = "Nothing loaded";
    this.sourcePileToken = null;
    this.loadedJournal = null;
    this.render(false);
  }

  removeItem(rowId) {
    this.rows = this.rows.filter((row) => row.id !== rowId);
    this.render(false);
  }

  async loadSelectedPile() {
    const token = selectedTokenDocument();
    if (!token) throw new Error("Select an Item Pile token first.");
    return this.loadPile(token);
  }

  async loadPile(target) {
    const token = target.documentName === "Token" ? target : null;
    const actor = pileTargetActor(target);
    if (!actor) throw new Error("That target does not have an Actor.");

    const validationTarget = token || actor;
    if (!isItemPileTarget(validationTarget)) throw new Error("That is not an Item Pile.");

    this.rows = actor.items.map(itemRowFromDocument);
    this.sourceLabel = `Item Pile: ${actor.name}`;
    this.sourcePileToken = token;
    this.loadedJournal = null;
    this.outputName = actor.name || "Scene Loot";
    this.render(false);
    ui.notifications.info(`Loaded ${this.rows.length} item(s) from ${actor.name}.`);
  }

  async loadJournal(document) {
    const { journal, rows } = await collectItemsFromJournal(document);
    if (!journal) throw new Error("That is not a Journal Entry.");
    if (!rows.length) throw new Error("No working Item links were found in that Journal.");

    this.rows = rows;
    this.sourceLabel = `Journal: ${journal.name}`;
    this.loadedJournal = journal;
    this.sourcePileToken = null;
    this.outputName = journal.name;
    this.render(false);
    ui.notifications.info(`Loaded ${rows.length} linked item(s) from ${journal.name}.`);
  }

  async createJournal() {
    if (!game.user.isGM) throw new Error("Only a GM can create Scene Pile journals.");
    if (!this.rows.length) throw new Error("Load at least one Item first.");
    this._syncForm();

    const name = this.outputName || "Scene Loot";
    const folder = await getOrCreateFolder(JOURNAL_FOLDER, "JournalEntry");
    const ownership = { default: this.sharePlayers ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    const journal = await JournalEntry.create({
      name,
      folder: folder.id,
      ownership,
      flags: { [MODULE_ID]: { managed: true } }
    });

    let items = [];
    try {
      items = await createBackingItems(this.rows, journal.id, this.sharePlayers);
      const content = buildJournalContent(name, items);
      const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name: "Items",
        type: "text",
        text: {
          content,
          format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
        },
        ownership
      }]);

      await journal.update({
        [`flags.${MODULE_ID}.itemUuids`]: items.map((item) => item.uuid),
        [`flags.${MODULE_ID}.pageId`]: page.id
      });

      if (this.attachNote) await placeJournalNote(journal, page);
      if (this.removeOriginalPile && this.sourcePileToken) {
        await game.itempiles.API.deleteItemPile(this.sourcePileToken);
        this.sourcePileToken = null;
      }

      this.loadedJournal = journal;
      this.sourceLabel = `Journal: ${journal.name}`;
      this.render(false);
      journal.sheet.render(true);
      ui.notifications.info(`Created ${journal.name} with ${items.length} draggable Item link(s).`);
      return journal;
    } catch (error) {
      if (items.length) await Item.deleteDocuments(items.map((item) => item.id));
      await journal.delete();
      throw error;
    }
  }

  async updateJournal() {
    if (!game.user.isGM) throw new Error("Only a GM can update Scene Pile journals.");
    if (!this.loadedJournal?.getFlag(MODULE_ID, "managed")) throw new Error("Load a Journal created by this module first.");
    if (!this.rows.length) throw new Error("The Journal needs at least one Item.");
    this._syncForm();

    const journal = this.loadedJournal;
    const name = this.outputName || journal.name;
    const ownership = { default: this.sharePlayers ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };

    const oldBackingItemIds = game.items
      .filter((item) => item.getFlag(MODULE_ID, "ownerJournalId") === journal.id)
      .map((item) => item.id);
    let items = [];

    try {
      items = await createBackingItems(this.rows, journal.id, this.sharePlayers);
      const content = buildJournalContent(name, items);
      const pageId = journal.getFlag(MODULE_ID, "pageId");
      let page = journal.pages.get(pageId) || journal.pages.find((entry) => entry.type === "text");

      if (page) {
        await page.update({
          name: "Items",
          "text.content": content,
          "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
          ownership
        });
      } else {
        [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
          name: "Items",
          type: "text",
          text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
          ownership
        }]);
      }

      await journal.update({
        name,
        ownership,
        [`flags.${MODULE_ID}.itemUuids`]: items.map((item) => item.uuid),
        [`flags.${MODULE_ID}.pageId`]: page.id
      });

      if (oldBackingItemIds.length) await Item.deleteDocuments(oldBackingItemIds);
      if (this.attachNote) await placeJournalNote(journal, page);
      this.sourceLabel = `Journal: ${journal.name}`;
      this.render(false);
      journal.sheet.render(true);
      ui.notifications.info(`Updated ${journal.name} with ${items.length} draggable Item link(s).`);
    } catch (error) {
      if (items.length) await Item.deleteDocuments(items.map((item) => item.id));
      throw error;
    }
  }

  async createPile() {
    if (!game.user.isGM) throw new Error("Only a GM can create Scene Item Piles.");
    if (!game.itempiles?.API) throw new Error("Item Piles is not ready or enabled.");
    if (!canvas?.ready || !canvas.scene) throw new Error("Open a Scene before creating the Item Pile.");
    if (!this.rows.length) throw new Error("Load at least one Item first.");
    this._syncForm();

    const name = this.outputName || "Scene Loot";
    const position = getPlacementPoint();
    const items = this.rows.map((row) => cleanItemData(row.itemData));
    const result = await game.itempiles.API.createItemPile({
      sceneId: canvas.scene.id,
      position,
      items,
      createActor: true,
      actorOverrides: { name },
      tokenOverrides: {
        name,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL
      },
      itemPileFlags: {
        type: game.itempiles.pile_types?.PILE || "pile",
        displayOne: false,
        deleteWhenEmpty: false
      }
    });

    const token = result?.tokenUuid ? await fromUuid(result.tokenUuid) : null;
    token?.object?.control({ releaseOthers: true });
    ui.notifications.info(`Created Item Pile: ${name}.`);
    return result;
  }
}

Hooks.once("init", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = {
    open() {
      if (!game.user.isGM) {
        ui.notifications.warn(`${MODULE_TITLE} is GM-only.`);
        return;
      }
      scenePilesApp ??= new ScenePilesApplication();
      scenePilesApp.render(true);
      return scenePilesApp;
    },
    get app() { return scenePilesApp; },
    get logoPath() { return LOGO_PATH; }
  };
});

Hooks.once("ready", async () => {
  await resolveLogoPath();
  if (!game.modules.get("item-piles")?.active) {
    ui.notifications.error(`${MODULE_TITLE} requires Item Piles to be enabled.`);
    return;
  }
  await createLauncherMacro();
});
