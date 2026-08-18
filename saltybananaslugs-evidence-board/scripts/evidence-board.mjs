const MODULE_ID = "saltybananaslugs-evidence-board";
const MODULE_TITLE = "SaltyBananaSlug's Evidence Board";
const FLAG_BOARD = "boardData";
const FLAG_IS_BOARD = "isEvidenceBoard";
const SCHEMA_VERSION = 1;
const BRAND = `modules/${MODULE_ID}/assets/sbs-logo.svg`;

const { ApplicationV2 } = foundry.applications.api;

const CARD_COLORS = {
  yellow: { label: "Yellow", hex: "#d4ad39" },
  red: { label: "Red", hex: "#a84a42" },
  blue: { label: "Blue", hex: "#4f7898" },
  green: { label: "Green", hex: "#5f7d51" },
  purple: { label: "Purple", hex: "#775c8d" },
  white: { label: "White", hex: "#b8b5aa" }
};

const LINE_COLORS = {
  red: { label: "Red String", hex: "#bb3434" },
  gold: { label: "Gold String", hex: "#c99b28" },
  blue: { label: "Blue String", hex: "#4a7aa5" },
  green: { label: "Green String", hex: "#5f8a55" },
  white: { label: "White String", hex: "#d9d4c7" }
};

const TYPE_ICONS = {
  note: "fa-note-sticky",
  image: "fa-image",
  Actor: "fa-user",
  Item: "fa-suitcase",
  JournalEntry: "fa-book-open",
  JournalEntryPage: "fa-file-lines",
  Scene: "fa-map",
  RollTable: "fa-table-list",
  Playlist: "fa-music",
  PlaylistSound: "fa-volume-high",
  Cards: "fa-cards",
  Card: "fa-address-card",
  Macro: "fa-code",
  ChatMessage: "fa-message"
};

let managerApp = null;
const openBoardApps = new Map();

function log(...args) { console.log(`${MODULE_TITLE} |`, ...args); }
function warn(...args) { console.warn(`${MODULE_TITLE} |`, ...args); }

function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function randomID() {
  return globalThis.foundry?.utils?.randomID?.() ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

function esc(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escAttr(value = "") {
  return esc(value).replaceAll('"', "&quot;");
}

function nl2br(value = "") {
  return esc(value).replaceAll("\n", "<br>");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function nowIso() { return new Date().toISOString(); }

function boardDefaults(input = {}) {
  const width = clamp(input.width ?? 1800, 1000, 4000);
  const height = clamp(input.height ?? 1100, 700, 3000);
  return {
    schemaVersion: SCHEMA_VERSION,
    description: String(input.description ?? "").trim(),
    width,
    height,
    background: ["cork", "dark", "paper"].includes(input.background) ? input.background : "cork",
    locked: Boolean(input.locked ?? false),
    cards: Array.isArray(input.cards) ? input.cards.map(normalizeCard) : [],
    connections: Array.isArray(input.connections) ? input.connections.map(normalizeConnection) : [],
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: input.updatedAt ?? nowIso()
  };
}

function normalizeCard(input = {}) {
  const type = String(input.type ?? "note");
  const defaultSize = type === "image" ? { w: 320, h: 220 } : { w: 250, h: 170 };
  return {
    id: String(input.id ?? randomID()),
    type,
    title: String(input.title ?? "Untitled Evidence").trim() || "Untitled Evidence",
    body: String(input.body ?? ""),
    uuid: String(input.uuid ?? ""),
    img: String(input.img ?? ""),
    color: CARD_COLORS[input.color] ? input.color : "yellow",
    x: clamp(input.x ?? 80, 0, 3900),
    y: clamp(input.y ?? 80, 0, 2900),
    w: clamp(input.w ?? defaultSize.w, 180, 600),
    h: clamp(input.h ?? defaultSize.h, 110, 500),
    createdBy: input.createdBy ?? game.user?.id ?? null,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: input.updatedAt ?? nowIso()
  };
}

function normalizeConnection(input = {}) {
  return {
    id: String(input.id ?? randomID()),
    from: String(input.from ?? ""),
    to: String(input.to ?? ""),
    label: String(input.label ?? "").trim(),
    color: LINE_COLORS[input.color] ? input.color : "red",
    createdBy: input.createdBy ?? game.user?.id ?? null,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: input.updatedAt ?? nowIso()
  };
}

function getBoardData(journal) {
  const raw = journal?.getFlag?.(MODULE_ID, FLAG_BOARD) ?? {};
  return boardDefaults(raw);
}

async function saveBoardData(journal, data) {
  if (!journal) throw new Error("Evidence board no longer exists.");
  const normalized = boardDefaults({ ...data, updatedAt: nowIso() });
  await journal.setFlag(MODULE_ID, FLAG_BOARD, normalized);
  Hooks.callAll("sbsEvidenceBoard.boardUpdated", journal, clone(normalized));
  return normalized;
}

function isBoard(journal) {
  return journal?.getFlag?.(MODULE_ID, FLAG_IS_BOARD) === true;
}

function userCanView(journal, user = game.user) {
  if (!journal || !user) return false;
  if (user.isGM) return true;
  return journal.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
}

function userCanOwn(journal, user = game.user) {
  if (!journal || !user) return false;
  if (user.isGM) return true;
  return journal.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

function userCanEdit(journal, data = getBoardData(journal), user = game.user) {
  return user.isGM || (userCanOwn(journal, user) && !data.locked);
}

function listBoards() {
  return [...(game.journal ?? [])]
    .filter(isBoard)
    .filter(j => userCanView(j))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureBoardFolder() {
  if (!game.user?.isGM) return null;
  let folder = game.folders?.find(f => f.type === "JournalEntry" && f.name === "SBS Evidence Boards") ?? null;
  if (!folder) {
    folder = await Folder.create({ name: "SBS Evidence Boards", type: "JournalEntry", sorting: "a" });
  }
  return folder;
}

async function createBoard({ name, description = "", defaultOwnership = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } = {}) {
  if (!game.user?.isGM) throw new Error("Only a GM can create evidence boards.");
  const cleanName = String(name ?? "New Evidence Board").trim() || "New Evidence Board";
  const folder = await ensureBoardFolder();
  const board = await JournalEntry.create({
    name: cleanName,
    folder: folder?.id ?? null,
    ownership: { default: Number(defaultOwnership) },
    flags: {
      [MODULE_ID]: {
        [FLAG_IS_BOARD]: true,
        [FLAG_BOARD]: boardDefaults({ description })
      }
    },
    pages: [{
      name: "Evidence Board",
      type: "text",
      text: {
        content: `<p><strong>${esc(cleanName)}</strong> is managed by ${MODULE_TITLE}. Open it with the Evidence Board button or macro.</p>`,
        format: 1
      }
    }]
  }, { renderSheet: false });
  return board;
}

async function duplicateBoard(journal) {
  if (!game.user?.isGM) throw new Error("Only a GM can duplicate evidence boards.");
  const folder = await ensureBoardFolder();
  const source = getBoardData(journal);
  const copied = boardDefaults({
    ...clone(source),
    cards: source.cards.map(c => ({ ...clone(c), id: randomID(), createdAt: nowIso(), updatedAt: nowIso() })),
    connections: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const idMap = new Map();
  source.cards.forEach((c, i) => idMap.set(c.id, copied.cards[i].id));
  copied.connections = source.connections
    .filter(c => idMap.has(c.from) && idMap.has(c.to))
    .map(c => normalizeConnection({
      ...clone(c),
      id: randomID(),
      from: idMap.get(c.from),
      to: idMap.get(c.to),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));

  return JournalEntry.create({
    name: `${journal.name} Copy`,
    folder: folder?.id ?? journal.folder?.id ?? null,
    ownership: clone(journal.ownership),
    flags: { [MODULE_ID]: { [FLAG_IS_BOARD]: true, [FLAG_BOARD]: copied } },
    pages: [{
      name: "Evidence Board",
      type: "text",
      text: { content: `<p>Managed by ${MODULE_TITLE}.</p>`, format: 1 }
    }]
  }, { renderSheet: false });
}

function iconForType(type) {
  return TYPE_ICONS[type] ?? "fa-thumbtack";
}

function cardAccent(card) {
  return CARD_COLORS[card.color]?.hex ?? CARD_COLORS.yellow.hex;
}

function lineColor(connection) {
  return LINE_COLORS[connection.color]?.hex ?? LINE_COLORS.red.hex;
}

function option(value, label, selected) {
  return `<option value="${escAttr(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
}

function brandHeader(title, subtitle = "") {
  return `<header class="sbs-eb-brand-header">
    <img src="${BRAND}" alt="SBS">
    <div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
  </header>`;
}

function formatDocType(type) {
  const map = {
    JournalEntry: "Journal",
    JournalEntryPage: "Journal Page",
    RollTable: "Roll Table",
    PlaylistSound: "Playlist Sound"
  };
  return map[type] ?? type ?? "Evidence";
}

function resolveCollectionDocument(type, id) {
  const collections = {
    Actor: game.actors,
    Item: game.items,
    JournalEntry: game.journal,
    Scene: game.scenes,
    RollTable: game.tables,
    Playlist: game.playlists,
    Cards: game.cards,
    Macro: game.macros,
    ChatMessage: game.messages
  };
  return collections[type]?.get?.(id) ?? null;
}

async function resolveDropDocument(data = {}) {
  if (data.uuid) {
    try {
      const doc = await fromUuid(data.uuid);
      if (doc) return doc;
    } catch (_err) {}
  }
  if (data.type && data.id) {
    const doc = resolveCollectionDocument(data.type, data.id);
    if (doc) return doc;
    try {
      const uuidDoc = await fromUuid(`${data.type}.${data.id}`);
      if (uuidDoc) return uuidDoc;
    } catch (_err) {}
  }
  if (data.actorId) return game.actors?.get(data.actorId) ?? null;
  if (data.tokenId) {
    const scene = data.sceneId ? game.scenes?.get(data.sceneId) : canvas?.scene;
    return scene?.tokens?.get(data.tokenId) ?? null;
  }
  return null;
}

function readDragData(event) {
  try {
    const parsed = globalThis.TextEditor?.getDragEventData?.(event);
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length) return parsed;
  } catch (_err) {}
  for (const mime of ["application/json", "text/plain"]) {
    try {
      const raw = event.dataTransfer?.getData(mime);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_err) {}
  }
  return {};
}

function documentImage(doc) {
  if (!doc) return "";
  if (doc.documentName === "Token" || doc.documentName === "TokenDocument") return doc.texture?.src ?? doc.actor?.img ?? "";
  return doc.img ?? doc.thumbnail ?? doc.background?.src ?? doc.texture?.src ?? "";
}

function documentTitle(doc) {
  if (!doc) return "Dropped Evidence";
  if (doc.documentName === "Token" || doc.documentName === "TokenDocument") return doc.name ?? doc.actor?.name ?? "Token";
  return doc.name ?? doc.title ?? formatDocType(doc.documentName);
}

function documentUuid(doc) {
  if (!doc) return "";
  if (doc.documentName === "Token" || doc.documentName === "TokenDocument") return doc.actor?.uuid ?? doc.uuid ?? "";
  return doc.uuid ?? "";
}

function documentType(doc) {
  if (!doc) return "note";
  if (doc.documentName === "Token" || doc.documentName === "TokenDocument") return "Actor";
  return doc.documentName ?? "note";
}

function documentBody(doc) {
  if (!doc) return "";
  const type = documentType(doc);
  if (type === "Actor") {
    const actor = doc.actor ?? doc;
    const subtype = actor.type ? ` • ${actor.type}` : "";
    return `${formatDocType(type)}${subtype}`;
  }
  if (type === "Item") {
    const subtype = doc.type ? ` • ${doc.type}` : "";
    return `${formatDocType(type)}${subtype}`;
  }
  if (type === "Scene") return "Scene reference";
  if (type === "JournalEntryPage") return `Journal page${doc.parent?.name ? ` • ${doc.parent.name}` : ""}`;
  return `${formatDocType(type)} reference`;
}

function emptyState(message, detail = "") {
  return `<div class="sbs-eb-empty"><img src="${BRAND}" alt=""><h3>${esc(message)}</h3>${detail ? `<p>${esc(detail)}</p>` : ""}</div>`;
}

class SBSBaseApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["sbs-eb-window"],
    tag: "div",
    window: {
      frame: true,
      resizable: true,
      minimizable: true,
      icon: "fa-solid fa-thumbtack"
    },
    position: { width: 900, height: 700 }
  };

  async _renderHTML(context, options) { return this.buildHTML(context, options); }
  _replaceHTML(result, content) { content.innerHTML = result; }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners(this.element);
  }

  activateListeners(element) {
    element.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", event => this.onAction(event, el.dataset.action, el));
    });
  }

  async onAction() {}
}

class BoardManagerApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-manager",
    window: { title: "SaltyBananaSlug's Evidence Boards" },
    position: { width: 860, height: 680 }
  };

  buildHTML() {
    const boards = listBoards();
    return `<div class="sbs-eb-shell sbs-eb-manager-shell">
      ${brandHeader("Evidence Boards", "Pins, strings, suspicious photos, and absolutely no assumptions whatsoever.")}
      <div class="sbs-eb-manager-toolbar">
        <div class="sbs-eb-manager-count"><i class="fa-solid fa-thumbtack"></i> ${boards.length} board${boards.length === 1 ? "" : "s"}</div>
        ${game.user.isGM ? `<button class="sbs-eb-primary" data-action="create-board"><i class="fa-solid fa-plus"></i> New Board</button>` : ""}
      </div>
      <div class="sbs-eb-manager-list">
        ${boards.length ? boards.map(board => this.renderBoardRow(board)).join("") : emptyState("No evidence boards available.", game.user.isGM ? "Create one and begin the red-string nonsense." : "Your GM has not shared one with you yet.")}
      </div>
    </div>`;
  }

  renderBoardRow(board) {
    const data = getBoardData(board);
    const canEdit = userCanEdit(board, data);
    const canOwn = userCanOwn(board);
    return `<article class="sbs-eb-board-row" data-board-id="${board.id}">
      <div class="sbs-eb-board-row-icon"><i class="fa-solid fa-thumbtack"></i></div>
      <div class="sbs-eb-board-row-main">
        <h2>${esc(board.name)} ${data.locked ? `<span class="sbs-eb-badge locked"><i class="fa-solid fa-lock"></i> Locked</span>` : ""}</h2>
        <p>${esc(data.description || "No description yet.")}</p>
        <div class="sbs-eb-row-meta">
          <span><i class="fa-solid fa-note-sticky"></i> ${data.cards.length} cards</span>
          <span><i class="fa-solid fa-share-nodes"></i> ${data.connections.length} links</span>
          <span><i class="fa-solid ${canEdit ? "fa-pen" : canOwn ? "fa-eye" : "fa-eye"}"></i> ${canEdit ? "Editable" : "View only"}</span>
        </div>
      </div>
      <div class="sbs-eb-board-row-actions">
        <button class="sbs-eb-primary" data-action="open-board"><i class="fa-solid fa-up-right-from-square"></i> Open</button>
        ${game.user.isGM ? `<button data-action="board-settings" title="Board settings"><i class="fa-solid fa-sliders"></i></button><button data-action="duplicate-board" title="Duplicate"><i class="fa-solid fa-copy"></i></button><button class="danger" data-action="delete-board" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ""}
      </div>
    </article>`;
  }

  async onAction(event, action, el) {
    const boardId = el.closest("[data-board-id]")?.dataset.boardId;
    const board = boardId ? game.journal.get(boardId) : null;
    if (action === "create-board") return new CreateBoardApp().render(true);
    if (action === "open-board" && board) return openBoard(board);
    if (action === "board-settings" && board) return new BoardSettingsApp(board).render(true);
    if (action === "duplicate-board" && board) {
      const copy = await duplicateBoard(board);
      ui.notifications.info(`Duplicated ${board.name}.`);
      await this.render();
      return openBoard(copy);
    }
    if (action === "delete-board" && board) {
      if (!globalThis.confirm(`Delete the evidence board "${board.name}" permanently?`)) return;
      await board.delete();
      ui.notifications.info(`Deleted ${board.name}.`);
      return this.render();
    }
  }
}

class CreateBoardApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-create-board",
    window: { title: "Create Evidence Board" },
    position: { width: 560, height: "auto" }
  };

  buildHTML() {
    return `<div class="sbs-eb-shell sbs-eb-form-shell">
      ${brandHeader("Create Evidence Board", "Give the conspiracy somewhere respectable to live.")}
      <div class="sbs-eb-form-grid">
        <label class="wide"><span>Board Name</span><input name="name" placeholder="The Welch Murders" autofocus></label>
        <label class="wide"><span>Description</span><textarea name="description" rows="3" placeholder="What are we trying to figure out?"></textarea></label>
        <label class="wide"><span>Default Player Access</span><select name="defaultOwnership">
          ${option(CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, "Everyone can edit", CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)}
          ${option(CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, "Everyone can view", CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)}
          ${option(CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "GM only", CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)}
        </select></label>
      </div>
      <footer class="sbs-eb-footer"><button data-action="cancel">Cancel</button><button class="sbs-eb-primary" data-action="create"><i class="fa-solid fa-plus"></i> Create Board</button></footer>
    </div>`;
  }

  async onAction(event, action) {
    if (action === "cancel") return this.close();
    if (action === "create") {
      const name = this.element.querySelector('[name="name"]')?.value?.trim();
      if (!name) return ui.notifications.warn("Give the evidence board a name first.");
      const description = this.element.querySelector('[name="description"]')?.value ?? "";
      const defaultOwnership = Number(this.element.querySelector('[name="defaultOwnership"]')?.value ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
      const board = await createBoard({ name, description, defaultOwnership });
      ui.notifications.info(`Created ${board.name}.`);
      await this.close();
      if (managerApp?.rendered) await managerApp.render();
      return openBoard(board);
    }
  }
}

class BoardSettingsApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-board-settings",
    window: { title: "Evidence Board Settings" },
    position: { width: 680, height: 720 }
  };

  constructor(board) {
    super({ id: `sbs-eb-board-settings-${board.id}` });
    this.board = board;
  }

  buildHTML() {
    const board = this.board;
    const data = getBoardData(board);
    const ownership = board.ownership ?? {};
    const users = game.users.filter(u => !u.isGM);
    return `<div class="sbs-eb-shell sbs-eb-form-shell">
      ${brandHeader("Board Settings", board.name)}
      <div class="sbs-eb-settings-scroll">
        <div class="sbs-eb-form-grid">
          <label class="wide"><span>Name</span><input name="name" value="${escAttr(board.name)}"></label>
          <label class="wide"><span>Description</span><textarea name="description" rows="3">${esc(data.description)}</textarea></label>
          <label><span>Background</span><select name="background">
            ${option("cork", "Corkboard", data.background)}${option("dark", "Dark Board", data.background)}${option("paper", "Case File Paper", data.background)}
          </select></label>
          <label><span>Board Size</span><select name="size">
            ${option("1600x900", "1600 × 900", `${data.width}x${data.height}`)}
            ${option("1800x1100", "1800 × 1100", `${data.width}x${data.height}`)}
            ${option("2400x1400", "2400 × 1400", `${data.width}x${data.height}`)}
            ${option("3200x1800", "3200 × 1800", `${data.width}x${data.height}`)}
          </select></label>
          <label class="wide sbs-eb-checkbox"><input type="checkbox" name="locked" ${data.locked ? "checked" : ""}><span><strong>Lock board for players</strong><small>Players can still view it, but only a GM can change it.</small></span></label>
        </div>
        <section class="sbs-eb-permissions">
          <h2><i class="fa-solid fa-users"></i> Player Permissions</h2>
          <p>These are real Foundry Journal permissions. <strong>Edit</strong> means the player can move/add/connect evidence.</p>
          <div class="sbs-eb-permission-row default"><strong>Default</strong><select name="perm-default">
            ${defaultPermissionOptions(ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE)}
          </select></div>
          ${users.map(user => `<div class="sbs-eb-permission-row"><span>${esc(user.name)}</span><select name="perm-${user.id}">${permissionOptions(ownership[user.id] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT)}</select></div>`).join("") || `<p class="sbs-eb-muted">No non-GM users exist in this world yet.</p>`}
        </section>
      </div>
      <footer class="sbs-eb-footer"><button data-action="cancel">Cancel</button><button class="sbs-eb-primary" data-action="save"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button></footer>
    </div>`;
  }

  async onAction(event, action) {
    if (action === "cancel") return this.close();
    if (action !== "save") return;
    const name = this.element.querySelector('[name="name"]')?.value?.trim() || this.board.name;
    const description = this.element.querySelector('[name="description"]')?.value ?? "";
    const background = this.element.querySelector('[name="background"]')?.value ?? "cork";
    const [width, height] = String(this.element.querySelector('[name="size"]')?.value ?? "1800x1100").split("x").map(Number);
    const locked = Boolean(this.element.querySelector('[name="locked"]')?.checked);
    const ownership = clone(this.board.ownership ?? {});
    ownership.default = Number(this.element.querySelector('[name="perm-default"]')?.value ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE);
    for (const user of game.users.filter(u => !u.isGM)) {
      const value = Number(this.element.querySelector(`[name="perm-${user.id}"]`)?.value ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT);
      if (value === CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT) delete ownership[user.id];
      else ownership[user.id] = value;
    }

    const data = getBoardData(this.board);
    data.description = description;
    data.background = background;
    data.width = width;
    data.height = height;
    data.locked = locked;
    data.cards = data.cards.map(c => ({ ...c, x: clamp(c.x, 0, width - c.w), y: clamp(c.y, 0, height - c.h) }));
    await this.board.update({ name, ownership, [`flags.${MODULE_ID}.${FLAG_BOARD}`]: boardDefaults(data) });
    ui.notifications.info("Evidence board settings saved.");
    await this.close();
    if (managerApp?.rendered) await managerApp.render();
    const app = openBoardApps.get(this.board.id);
    if (app?.rendered) await app.render();
  }
}

function permissionOptions(selected) {
  return [
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT, "Inherit"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "None"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, "View"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, "Edit"]
  ].map(([value, label]) => option(value, label, selected)).join("");
}

function defaultPermissionOptions(selected) {
  return [
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, "None"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, "View"],
    [CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, "Edit"]
  ].map(([value, label]) => option(value, label, selected)).join("");
}

class CardEditorApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-card-editor",
    window: { title: "Evidence Card" },
    position: { width: 620, height: 650 }
  };

  constructor(boardApp, card = null, { type = "note", x = 80, y = 80 } = {}) {
    super({ id: `sbs-eb-card-editor-${boardApp.board.id}-${card?.id ?? randomID()}` });
    this.boardApp = boardApp;
    this.board = boardApp.board;
    this.existingId = card?.id ?? null;
    this.draft = normalizeCard(card ?? { type, x, y, title: type === "image" ? "Image Evidence" : "New Note", body: "" });
  }

  buildHTML() {
    const card = this.draft;
    const isImage = card.type === "image";
    return `<div class="sbs-eb-shell sbs-eb-form-shell">
      ${brandHeader(this.existingId ? "Edit Evidence" : "Add Evidence", formatDocType(card.type))}
      <div class="sbs-eb-form-grid">
        <label class="wide"><span>Title</span><input name="title" value="${escAttr(card.title)}"></label>
        <label class="wide"><span>Notes / Caption</span><textarea name="body" rows="6" placeholder="What do we know about this?">${esc(card.body)}</textarea></label>
        ${(isImage || card.img) ? `<label class="wide"><span>Image Path / URL</span><input name="img" value="${escAttr(card.img)}" placeholder="worlds/my-world/assets/clue.webp"></label>` : ""}
        <label><span>Pin Color</span><select name="color">${Object.entries(CARD_COLORS).map(([value, c]) => option(value, c.label, card.color)).join("")}</select></label>
        <label><span>Card Size</span><select name="size">
          ${option("220x140", "Small", `${card.w}x${card.h}`)}
          ${option("250x170", "Medium", `${card.w}x${card.h}`)}
          ${option("320x220", "Large", `${card.w}x${card.h}`)}
          ${option("420x300", "Extra Large", `${card.w}x${card.h}`)}
        </select></label>
        ${card.uuid ? `<div class="sbs-eb-linked-doc wide"><i class="fa-solid fa-link"></i><span>Linked Foundry document</span><code>${esc(card.uuid)}</code></div>` : ""}
      </div>
      <footer class="sbs-eb-footer">
        ${this.existingId ? `<button class="danger left" data-action="delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
        <button data-action="cancel">Cancel</button><button class="sbs-eb-primary" data-action="save"><i class="fa-solid fa-floppy-disk"></i> Save Evidence</button>
      </footer>
    </div>`;
  }

  async onAction(event, action) {
    if (action === "cancel") return this.close();
    if (action === "delete") {
      const data = getBoardData(this.board);
      const card = data.cards.find(c => c.id === this.existingId);
      if (!card) return this.close();
      if (!globalThis.confirm(`Delete "${card.title}" and all connections to it?`)) return;
      data.cards = data.cards.filter(c => c.id !== card.id);
      data.connections = data.connections.filter(c => c.from !== card.id && c.to !== card.id);
      await saveBoardData(this.board, data);
      await this.close();
      return this.boardApp.render();
    }
    if (action !== "save") return;
    const title = this.element.querySelector('[name="title"]')?.value?.trim();
    if (!title) return ui.notifications.warn("Give the evidence a title first.");
    const body = this.element.querySelector('[name="body"]')?.value ?? "";
    const imgInput = this.element.querySelector('[name="img"]');
    const img = imgInput ? imgInput.value.trim() : this.draft.img;
    const color = this.element.querySelector('[name="color"]')?.value ?? "yellow";
    const [w, h] = String(this.element.querySelector('[name="size"]')?.value ?? `${this.draft.w}x${this.draft.h}`).split("x").map(Number);

    const data = getBoardData(this.board);
    if (!userCanEdit(this.board, data)) return ui.notifications.warn("You cannot edit this board right now.");
    const existing = this.existingId ? data.cards.find(c => c.id === this.existingId) : null;
    const saved = normalizeCard({ ...this.draft, ...existing, title, body, img, color, w, h, updatedAt: nowIso() });
    saved.x = clamp(saved.x, 0, data.width - saved.w);
    saved.y = clamp(saved.y, 0, data.height - saved.h);
    if (existing) data.cards = data.cards.map(c => c.id === existing.id ? saved : c);
    else data.cards.push(saved);
    await saveBoardData(this.board, data);
    await this.close();
    return this.boardApp.render();
  }
}

class ConnectionEditorApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-connection-editor",
    window: { title: "Evidence Connection" },
    position: { width: 520, height: "auto" }
  };

  constructor(boardApp, connection = null, { from = null, to = null } = {}) {
    super({ id: `sbs-eb-connection-editor-${boardApp.board.id}-${connection?.id ?? randomID()}` });
    this.boardApp = boardApp;
    this.board = boardApp.board;
    this.existingId = connection?.id ?? null;
    this.draft = normalizeConnection(connection ?? { from, to, label: "", color: "red" });
  }

  buildHTML() {
    const data = getBoardData(this.board);
    const fromCard = data.cards.find(c => c.id === this.draft.from);
    const toCard = data.cards.find(c => c.id === this.draft.to);
    return `<div class="sbs-eb-shell sbs-eb-form-shell">
      ${brandHeader(this.existingId ? "Edit Connection" : "Connect Evidence", `${fromCard?.title ?? "?"} → ${toCard?.title ?? "?"}`)}
      <div class="sbs-eb-form-grid">
        <label class="wide"><span>Connection Label</span><input name="label" value="${escAttr(this.draft.label)}" placeholder="works for / seen with / killed by / ???"></label>
        <label class="wide"><span>String Color</span><select name="color">${Object.entries(LINE_COLORS).map(([value, c]) => option(value, c.label, this.draft.color)).join("")}</select></label>
      </div>
      <footer class="sbs-eb-footer">
        ${this.existingId ? `<button class="danger left" data-action="delete"><i class="fa-solid fa-trash"></i> Delete Link</button>` : ""}
        <button data-action="cancel">Cancel</button><button class="sbs-eb-primary" data-action="save"><i class="fa-solid fa-link"></i> Save Connection</button>
      </footer>
    </div>`;
  }

  async onAction(event, action) {
    if (action === "cancel") return this.close();
    const data = getBoardData(this.board);
    if (!userCanEdit(this.board, data)) return ui.notifications.warn("You cannot edit this board right now.");
    if (action === "delete") {
      data.connections = data.connections.filter(c => c.id !== this.existingId);
      await saveBoardData(this.board, data);
      await this.close();
      return this.boardApp.render();
    }
    if (action === "save") {
      const label = this.element.querySelector('[name="label"]')?.value?.trim() ?? "";
      const color = this.element.querySelector('[name="color"]')?.value ?? "red";
      const saved = normalizeConnection({ ...this.draft, label, color, updatedAt: nowIso() });
      const existing = this.existingId ? data.connections.find(c => c.id === this.existingId) : null;
      if (existing) data.connections = data.connections.map(c => c.id === existing.id ? saved : c);
      else data.connections.push(saved);
      await saveBoardData(this.board, data);
      await this.close();
      this.boardApp.connectFrom = null;
      this.boardApp.connectMode = false;
      return this.boardApp.render();
    }
  }
}

class EvidenceBoardApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbs-eb-board",
    window: { title: "Evidence Board" },
    position: { width: 1180, height: 820 }
  };

  constructor(board) {
    super({ id: `sbs-eb-board-${board.id}` });
    this.board = board;
    this.zoom = 0.8;
    this.search = "";
    this.connectMode = false;
    this.connectFrom = null;
  }

  buildHTML() {
    if (!this.board || !game.journal?.has(this.board.id)) return `<div class="sbs-eb-shell">${emptyState("This evidence board no longer exists.")}</div>`;
    if (!userCanView(this.board)) return `<div class="sbs-eb-shell">${emptyState("You no longer have access to this evidence board.")}</div>`;
    const data = getBoardData(this.board);
    const canEdit = userCanEdit(this.board, data);
    const stageW = Math.round(data.width * this.zoom);
    const stageH = Math.round(data.height * this.zoom);
    return `<div class="sbs-eb-shell sbs-eb-board-shell">
      <div class="sbs-eb-board-topbar">
        <div class="sbs-eb-board-title">
          <img src="${BRAND}" alt="SBS"><div><h1>${esc(this.board.name)}</h1><p>${esc(data.description || "Follow the evidence. Or dramatically point at the red string.")}</p></div>
        </div>
        <div class="sbs-eb-board-status">
          ${data.locked ? `<span class="sbs-eb-badge locked"><i class="fa-solid fa-lock"></i> Players Locked</span>` : ""}
          <span class="sbs-eb-badge ${canEdit ? "editable" : "readonly"}"><i class="fa-solid ${canEdit ? "fa-pen" : "fa-eye"}"></i> ${canEdit ? "Edit" : "View"}</span>
        </div>
      </div>
      <div class="sbs-eb-toolbar">
        <div class="sbs-eb-toolbar-group">
          <button data-action="open-manager" title="Boards"><i class="fa-solid fa-table-columns"></i></button>
          ${canEdit ? `<button class="sbs-eb-primary" data-action="add-note"><i class="fa-solid fa-note-sticky"></i> Note</button><button data-action="add-image"><i class="fa-solid fa-image"></i> Image</button><button class="${this.connectMode ? "active" : ""}" data-action="connect"><i class="fa-solid fa-share-nodes"></i> ${this.connectFrom ? "Choose second card" : "Connect"}</button>` : ""}
        </div>
        <div class="sbs-eb-search"><i class="fa-solid fa-magnifying-glass"></i><input data-search value="${escAttr(this.search)}" placeholder="Search evidence..."></div>
        <div class="sbs-eb-toolbar-group sbs-eb-zoom">
          <button data-action="zoom-out" title="Zoom out"><i class="fa-solid fa-minus"></i></button><span>${Math.round(this.zoom * 100)}%</span><button data-action="zoom-in" title="Zoom in"><i class="fa-solid fa-plus"></i></button><button data-action="zoom-reset" title="Reset zoom"><i class="fa-solid fa-arrows-to-circle"></i></button>
        </div>
        ${game.user.isGM ? `<div class="sbs-eb-toolbar-group"><button data-action="toggle-lock" title="${data.locked ? "Unlock for players" : "Lock for players"}"><i class="fa-solid ${data.locked ? "fa-lock-open" : "fa-lock"}"></i></button><button data-action="board-settings" title="Board settings"><i class="fa-solid fa-sliders"></i></button></div>` : ""}
      </div>
      ${this.connectMode ? `<div class="sbs-eb-connect-banner"><i class="fa-solid fa-share-nodes"></i> ${this.connectFrom ? "Now click the evidence card you want to connect it to." : "Click the first evidence card to start a connection."}<button data-action="cancel-connect">Cancel</button></div>` : ""}
      <div class="sbs-eb-board-scroll" data-board-scroll>
        <div class="sbs-eb-stage" style="width:${stageW}px;height:${stageH}px;">
          <div class="sbs-eb-board sbs-eb-bg-${data.background}" data-board style="width:${data.width}px;height:${data.height}px;transform:scale(${this.zoom});">
            ${this.renderConnections(data)}
            ${data.cards.map(card => this.renderCard(card, canEdit)).join("")}
            ${data.cards.length ? "" : `<div class="sbs-eb-board-empty"><img src="${BRAND}" alt=""><h2>Nothing pinned yet.</h2><p>${canEdit ? "Drop a Foundry document here or add a note." : "There is currently no evidence on this board."}</p></div>`}
          </div>
        </div>
      </div>
    </div>`;
  }

  renderConnections(data) {
    const byId = new Map(data.cards.map(c => [c.id, c]));
    const items = data.connections.map(connection => {
      const a = byId.get(connection.from);
      const b = byId.get(connection.to);
      if (!a || !b) return "";
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h / 2;
      const x2 = b.x + b.w / 2;
      const y2 = b.y + b.h / 2;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const color = lineColor(connection);
      return `<g class="sbs-eb-connection" data-connection-id="${connection.id}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" />
        ${connection.label ? `<text x="${mx}" y="${my - 8}" text-anchor="middle">${esc(connection.label)}</text>` : ""}
      </g>`;
    }).join("");
    return `<svg class="sbs-eb-connections" data-connections viewBox="0 0 ${data.width} ${data.height}" preserveAspectRatio="none">${items}</svg>`;
  }

  renderCard(card, canEdit) {
    const isDoc = Boolean(card.uuid);
    const img = card.img ? `<img class="sbs-eb-card-image" src="${escAttr(card.img)}" alt="">` : "";
    const search = `${card.title} ${card.body} ${card.type}`.toLowerCase();
    const selected = this.connectFrom === card.id;
    return `<article class="sbs-eb-card ${selected ? "connection-selected" : ""}" data-card-id="${card.id}" data-search="${escAttr(search)}" style="left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px;--card-accent:${cardAccent(card)};">
      <div class="sbs-eb-pin"></div>
      <header class="sbs-eb-card-header ${canEdit ? "sbs-eb-card-drag" : ""}">
        <i class="fa-solid ${iconForType(card.type)}"></i><strong>${esc(card.title)}</strong>
        <div class="sbs-eb-card-actions">
          ${isDoc ? `<button data-action="open-document" title="Open linked document"><i class="fa-solid fa-up-right-from-square"></i></button>` : ""}
          ${canEdit ? `<button data-action="edit-card" title="Edit"><i class="fa-solid fa-pen"></i></button>` : ""}
        </div>
      </header>
      <div class="sbs-eb-card-content">${img}${card.body ? `<div class="sbs-eb-card-body">${nl2br(card.body)}</div>` : ""}${!img && !card.body ? `<div class="sbs-eb-card-placeholder">${esc(formatDocType(card.type))}</div>` : ""}</div>
      <footer>${isDoc ? `<span><i class="fa-solid fa-link"></i> ${esc(formatDocType(card.type))}</span>` : `<span><i class="fa-solid fa-thumbtack"></i> Evidence</span>`}</footer>
    </article>`;
  }

  activateListeners(element) {
    super.activateListeners(element);
    const data = getBoardData(this.board);
    const canEdit = userCanEdit(this.board, data);
    const boardEl = element.querySelector("[data-board]");
    const scrollEl = element.querySelector("[data-board-scroll]");

    const search = element.querySelector("[data-search]");
    search?.addEventListener("input", () => {
      this.search = search.value.trim();
      this.applySearch();
    });
    this.applySearch();

    element.querySelectorAll("[data-card-id]").forEach(cardEl => {
      cardEl.addEventListener("click", event => this.onCardClick(event, cardEl));
      if (canEdit) {
        cardEl.querySelector(".sbs-eb-card-drag")?.addEventListener("pointerdown", event => this.startCardDrag(event, cardEl));
      }
    });

    element.querySelectorAll("[data-connection-id]").forEach(el => {
      el.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!canEdit) return;
        const connection = getBoardData(this.board).connections.find(c => c.id === el.dataset.connectionId);
        if (connection) new ConnectionEditorApp(this, connection).render(true);
      });
    });

    if (canEdit && boardEl) {
      boardEl.addEventListener("dragover", event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        boardEl.classList.add("dragover");
      });
      boardEl.addEventListener("dragleave", () => boardEl.classList.remove("dragover"));
      boardEl.addEventListener("drop", event => this.onDrop(event, boardEl));
    }

    if (scrollEl && !this._scrollInitialized) {
      this._scrollInitialized = true;
      requestAnimationFrame(() => {
        scrollEl.scrollLeft = Math.max(0, (scrollEl.scrollWidth - scrollEl.clientWidth) / 2);
        scrollEl.scrollTop = Math.max(0, (scrollEl.scrollHeight - scrollEl.clientHeight) / 2);
      });
    }
  }

  async onAction(event, action, el) {
    event?.preventDefault?.();
    const cardEl = el.closest("[data-card-id]");
    const cardId = cardEl?.dataset.cardId;
    if (action === "open-manager") return openManager();
    if (action === "add-note") {
      const pos = this.defaultNewCardPosition();
      return new CardEditorApp(this, null, { type: "note", ...pos }).render(true);
    }
    if (action === "add-image") {
      const pos = this.defaultNewCardPosition();
      return new CardEditorApp(this, null, { type: "image", ...pos }).render(true);
    }
    if (action === "edit-card") {
      const card = getBoardData(this.board).cards.find(c => c.id === cardId);
      if (card) return new CardEditorApp(this, card).render(true);
    }
    if (action === "open-document") return this.openLinkedDocument(cardId);
    if (action === "connect") {
      this.connectMode = !this.connectMode;
      this.connectFrom = null;
      return this.render();
    }
    if (action === "cancel-connect") {
      this.connectMode = false;
      this.connectFrom = null;
      return this.render();
    }
    if (action === "zoom-in") { this.zoom = clamp(this.zoom + 0.1, 0.4, 1.5); this._scrollInitialized = true; return this.render(); }
    if (action === "zoom-out") { this.zoom = clamp(this.zoom - 0.1, 0.4, 1.5); this._scrollInitialized = true; return this.render(); }
    if (action === "zoom-reset") { this.zoom = 0.8; this._scrollInitialized = false; return this.render(); }
    if (action === "board-settings" && game.user.isGM) return new BoardSettingsApp(this.board).render(true);
    if (action === "toggle-lock" && game.user.isGM) {
      const data = getBoardData(this.board);
      data.locked = !data.locked;
      await saveBoardData(this.board, data);
      ui.notifications.info(data.locked ? "Evidence board locked for players." : "Evidence board unlocked for players.");
      return this.render();
    }
  }

  async onCardClick(event, cardEl) {
    if (event.target.closest("button")) return;
    if (!this.connectMode) return;
    event.preventDefault();
    event.stopPropagation();
    const cardId = cardEl.dataset.cardId;
    if (!this.connectFrom) {
      this.connectFrom = cardId;
      return this.render();
    }
    if (this.connectFrom === cardId) {
      this.connectFrom = null;
      return this.render();
    }
    const from = this.connectFrom;
    const to = cardId;
    return new ConnectionEditorApp(this, null, { from, to }).render(true);
  }

  applySearch() {
    const needle = this.search.toLowerCase();
    this.element?.querySelectorAll?.("[data-card-id]").forEach(card => {
      card.hidden = Boolean(needle && !card.dataset.search.includes(needle));
    });
  }

  defaultNewCardPosition() {
    const scroll = this.element?.querySelector?.("[data-board-scroll]");
    const data = getBoardData(this.board);
    if (!scroll) return { x: 80, y: 80 };
    return {
      x: clamp((scroll.scrollLeft + scroll.clientWidth / 2) / this.zoom - 125, 20, data.width - 270),
      y: clamp((scroll.scrollTop + scroll.clientHeight / 2) / this.zoom - 85, 20, data.height - 200)
    };
  }

  async onDrop(event, boardEl) {
    event.preventDefault();
    event.stopPropagation();
    boardEl.classList.remove("dragover");
    const data = getBoardData(this.board);
    if (!userCanEdit(this.board, data)) return;
    const dragData = readDragData(event);
    const doc = await resolveDropDocument(dragData);
    if (!doc) return ui.notifications.warn("Evidence Board could not understand that drop. Try dropping an Actor, Item, Journal, Scene, or another Foundry document.");
    const rect = boardEl.getBoundingClientRect();
    const type = documentType(doc);
    const w = type === "Scene" ? 320 : 250;
    const h = type === "Scene" ? 220 : 170;
    const x = clamp((event.clientX - rect.left) / this.zoom - w / 2, 10, data.width - w - 10);
    const y = clamp((event.clientY - rect.top) / this.zoom - 35, 10, data.height - h - 10);
    data.cards.push(normalizeCard({
      type,
      title: documentTitle(doc),
      body: documentBody(doc),
      uuid: documentUuid(doc),
      img: documentImage(doc),
      x, y, w, h,
      color: type === "Actor" ? "blue" : type === "Item" ? "green" : type === "JournalEntry" || type === "JournalEntryPage" ? "yellow" : "white"
    }));
    await saveBoardData(this.board, data);
    ui.notifications.info(`${documentTitle(doc)} pinned to ${this.board.name}.`);
    return this.render();
  }

  startCardDrag(event, cardEl) {
    if (this.connectMode || event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    const data = getBoardData(this.board);
    if (!userCanEdit(this.board, data)) return;
    const card = data.cards.find(c => c.id === cardEl.dataset.cardId);
    const boardEl = this.element.querySelector("[data-board]");
    if (!card || !boardEl) return;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = card.x;
    const startY = card.y;
    cardEl.classList.add("dragging");

    const move = ev => {
      const dx = (ev.clientX - startClientX) / this.zoom;
      const dy = (ev.clientY - startClientY) / this.zoom;
      card.x = clamp(startX + dx, 0, data.width - card.w);
      card.y = clamp(startY + dy, 0, data.height - card.h);
      cardEl.style.left = `${card.x}px`;
      cardEl.style.top = `${card.y}px`;
      this.updateConnectionGeometry(data);
    };

    const up = async () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      cardEl.classList.remove("dragging");
      card.updatedAt = nowIso();
      try {
        const fresh = getBoardData(this.board);
        const target = fresh.cards.find(c => c.id === card.id);
        if (!target) throw new Error("That evidence card no longer exists.");
        target.x = card.x;
        target.y = card.y;
        target.updatedAt = card.updatedAt;
        await saveBoardData(this.board, fresh);
      }
      catch (err) {
        console.error(`${MODULE_TITLE} | Failed to save card position`, err);
        ui.notifications.error("Could not save that evidence position.");
        await this.render();
      }
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  }

  updateConnectionGeometry(data) {
    const byId = new Map(data.cards.map(c => [c.id, c]));
    this.element?.querySelectorAll?.("[data-connection-id]").forEach(group => {
      const connection = data.connections.find(c => c.id === group.dataset.connectionId);
      const a = connection ? byId.get(connection.from) : null;
      const b = connection ? byId.get(connection.to) : null;
      if (!connection || !a || !b) return;
      const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const line = group.querySelector("line");
      line?.setAttribute("x1", x1); line?.setAttribute("y1", y1); line?.setAttribute("x2", x2); line?.setAttribute("y2", y2);
      const text = group.querySelector("text");
      if (text) { text.setAttribute("x", (x1 + x2) / 2); text.setAttribute("y", (y1 + y2) / 2 - 8); }
    });
  }

  async openLinkedDocument(cardId) {
    const card = getBoardData(this.board).cards.find(c => c.id === cardId);
    if (!card?.uuid) return;
    try {
      const doc = await fromUuid(card.uuid);
      if (!doc) return ui.notifications.warn("That linked Foundry document no longer exists.");
      if (doc.testUserPermission && !doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return ui.notifications.warn("You do not have permission to open that document.");
      if (doc.sheet?.render) return doc.sheet.render(true);
      if (doc.parent?.sheet?.render) return doc.parent.sheet.render(true);
      ui.notifications.warn("That document does not have an openable sheet.");
    } catch (err) {
      console.error(`${MODULE_TITLE} | Failed to open linked document`, err);
      ui.notifications.error("Could not open that linked document.");
    }
  }
}

async function openManager() {
  if (managerApp?.rendered) {
    managerApp.bringToFront?.();
    return managerApp;
  }
  managerApp = new BoardManagerApp();
  await managerApp.render(true);
  return managerApp;
}

async function resolveBoardRef(ref) {
  if (!ref) return null;
  if (ref.documentName === "JournalEntry" && isBoard(ref)) return ref;
  const id = typeof ref === "string" ? ref : ref.id;
  let board = id ? game.journal?.get(id) : null;
  if (!board && typeof ref === "string") board = game.journal?.find(j => isBoard(j) && j.name === ref) ?? null;
  return board && isBoard(board) ? board : null;
}

async function openBoard(ref) {
  const board = await resolveBoardRef(ref);
  if (!board) {
    if (!ref) return openManager();
    ui.notifications.warn("Evidence board not found.");
    return null;
  }
  if (!userCanView(board)) {
    ui.notifications.warn("You do not have permission to view that evidence board.");
    return null;
  }
  const existing = openBoardApps.get(board.id);
  if (existing?.rendered) {
    existing.bringToFront?.();
    return existing;
  }
  const app = new EvidenceBoardApp(board);
  openBoardApps.set(board.id, app);
  await app.render(true);
  return app;
}


async function addCardToBoard(ref, input = {}) {
  const board = await resolveBoardRef(ref);
  if (!board) throw new Error("Evidence board not found.");
  const data = getBoardData(board);
  if (!userCanEdit(board, data)) throw new Error("You do not have permission to edit that evidence board.");
  const card = normalizeCard(input);
  card.x = clamp(card.x, 0, data.width - card.w);
  card.y = clamp(card.y, 0, data.height - card.h);
  data.cards.push(card);
  await saveBoardData(board, data);
  return clone(card);
}

async function connectBoardCards(ref, fromCardId, toCardId, { label = "", color = "red" } = {}) {
  const board = await resolveBoardRef(ref);
  if (!board) throw new Error("Evidence board not found.");
  const data = getBoardData(board);
  if (!userCanEdit(board, data)) throw new Error("You do not have permission to edit that evidence board.");
  if (!data.cards.some(c => c.id === fromCardId) || !data.cards.some(c => c.id === toCardId)) throw new Error("Both evidence cards must exist on the board.");
  if (fromCardId === toCardId) throw new Error("An evidence card cannot connect to itself.");
  const connection = normalizeConnection({ from: fromCardId, to: toCardId, label, color });
  data.connections.push(connection);
  await saveBoardData(board, data);
  return clone(connection);
}

function registerSettings() {
  game.settings.register(MODULE_ID, "sceneControlVisibility", {
    name: "Evidence Board Scene Control",
    hint: "Who gets the Evidence Board button in Scene Controls.",
    scope: "world",
    config: true,
    type: String,
    choices: { everyone: "Everyone", gm: "GM Only", none: "Nobody" },
    default: "everyone"
  });

  game.settings.register(MODULE_ID, "createMacro", {
    name: "Create Evidence Board Macro",
    hint: "Automatically create/update an Open Evidence Boards macro on GM login.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

function registerSceneControls(controls) {
  const visibility = game.settings.get(MODULE_ID, "sceneControlVisibility");
  const visible = visibility === "everyone" || (visibility === "gm" && game.user.isGM);
  if (!visible || visibility === "none") return;
  controls.sbseb = {
    name: "sbseb",
    title: "SaltyBananaSlug's Evidence Board",
    icon: "fa-solid fa-thumbtack",
    order: 86,
    visible: true,
    activeTool: "sbseb-anchor",
    onChange: (_event, active) => { if (active) void openManager(); },
    tools: {
      "sbseb-anchor": {
        name: "sbseb-anchor",
        title: "Evidence Board Tools",
        icon: "fa-solid fa-circle",
        order: -100,
        visible: false
      },
      "evidence-board": {
        name: "evidence-board",
        title: "Open Evidence Boards",
        icon: "fa-solid fa-thumbtack",
        order: 0,
        button: true,
        onChange: () => { void openManager(); }
      }
    }
  };
}

async function ensureMacro() {
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, "createMacro")) return;
  const name = "Open Evidence Boards";
  const command = `game.modules.get("${MODULE_ID}").api.openManager();`;
  let folder = game.folders?.find(f => f.type === "Macro" && f.name === "SaltyBananaSlug") ?? null;
  if (!folder) folder = await Folder.create({ name: "SaltyBananaSlug", type: "Macro", sorting: "a" });
  let macro = game.macros?.find(m => m.name === name && m.getFlag(MODULE_ID, "managed") === true) ?? null;
  if (!macro) {
    macro = await Macro.create({ name, type: "script", img: BRAND, command, folder: folder?.id ?? null, flags: { [MODULE_ID]: { managed: true } } });
  } else {
    const updates = {};
    if (macro.command !== command) updates.command = command;
    if (macro.img !== BRAND) updates.img = BRAND;
    if (folder && macro.folder?.id !== folder.id) updates.folder = folder.id;
    if (Object.keys(updates).length) await macro.update(updates);
  }
}

function exposeAPI() {
  const api = {
    openManager,
    openBoard,
    listBoards,
    createBoard,
    duplicateBoard,
    addCard: addCardToBoard,
    connectCards: connectBoardCards,
    getBoardData,
    saveBoardData
  };
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  game.sbsEvidenceBoard = api;
}

Hooks.once("init", () => {
  registerSettings();
  log("Initializing.");
});

Hooks.on("getSceneControlButtons", registerSceneControls);

Hooks.once("ready", async () => {
  exposeAPI();
  await ensureMacro();
  log(`Ready. ${listBoards().length} accessible board(s).`);
});

Hooks.on("createJournalEntry", journal => {
  if (!isBoard(journal)) return;
  if (managerApp?.rendered) void managerApp.render();
});

Hooks.on("updateJournalEntry", journal => {
  if (!isBoard(journal)) return;
  if (managerApp?.rendered) void managerApp.render();
  const app = openBoardApps.get(journal.id);
  if (app?.rendered) {
    app.board = journal;
    if (!userCanView(journal)) void app.close();
    else void app.render();
  }
});

Hooks.on("deleteJournalEntry", journal => {
  if (!isBoard(journal)) return;
  if (managerApp?.rendered) void managerApp.render();
  const app = openBoardApps.get(journal.id);
  if (app?.rendered) void app.close();
  openBoardApps.delete(journal.id);
});
