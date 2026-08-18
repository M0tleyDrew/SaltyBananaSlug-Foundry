const MODULE_ID = "saltybananaslugs-npc-memories";
const MODULE_TITLE = "SaltyBananaSlug's NPC Memories";
const DB_NAME = "SBS NPC Memories Database";
const DB_FLAG = "database";
const PAGE_DATA_FLAG = "memoryData";
const SCHEMA_VERSION = 1;

const CATEGORY_OPTIONS = [
  ["interaction", "Interaction"],
  ["information", "Information"],
  ["relationship", "Relationship"],
  ["promise", "Promise / Debt"],
  ["favor", "Gift / Favor"],
  ["conflict", "Conflict"],
  ["transaction", "Transaction"],
  ["quest", "Quest"],
  ["faction", "Faction"],
  ["other", "Other"]
];

const IMPORTANCE_OPTIONS = [
  ["trivial", "Trivial"],
  ["minor", "Minor"],
  ["normal", "Normal"],
  ["important", "Important"],
  ["critical", "Critical"]
];

const TONE_OPTIONS = [
  ["negative", "Negative"],
  ["neutral", "Neutral"],
  ["positive", "Positive"]
];

const CATEGORY_ICONS = {
  interaction: "fa-comments",
  information: "fa-circle-info",
  relationship: "fa-people-arrows",
  promise: "fa-handshake",
  favor: "fa-gift",
  conflict: "fa-burst",
  transaction: "fa-coins",
  quest: "fa-scroll",
  faction: "fa-flag",
  other: "fa-brain"
};

function log(...args) { console.log(`${MODULE_TITLE} |`, ...args); }
function warn(...args) { console.warn(`${MODULE_TITLE} |`, ...args); }

function duplicate(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function randomId() {
  return globalThis.foundry?.utils?.randomID?.() ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function labelFor(options, value, fallback = "") {
  return options.find(([key]) => key === value)?.[1] ?? fallback ?? value ?? "";
}

function nowIso() { return new Date().toISOString(); }

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function normalizeTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
  return [...new Set(String(value ?? "").split(",").map(v => v.trim()).filter(Boolean))];
}


function actorDisplayName(actor) {
  const raw = String(actor?.name ?? "Unnamed NPC");
  if (actor?.getFlag?.("saltybananaslug-merchants", "isShell") === true) {
    return raw.replace(/^\[Merchant Shell\]\s*/i, "") || raw;
  }
  return raw;
}

function stableActorKey(actor) {
  return actor?.uuid ?? (actor?.id ? `Actor.${actor.id}` : null);
}

async function resolveActor(ref) {
  if (!ref) return null;
  if (ref.documentName === "Actor") return ref;
  if (ref.documentName === "Token" || ref.documentName === "TokenDocument") return ref.actor ?? ref.document?.actor ?? null;
  if (ref.actor?.documentName === "Actor") return ref.actor;
  if (typeof ref !== "string") return null;

  if (ref.includes(".")) {
    try {
      const doc = await fromUuid(ref);
      if (doc?.documentName === "Actor") return doc;
      if (doc?.actor?.documentName === "Actor") return doc.actor;
    } catch (_err) {}
  }
  return game.actors?.get(ref) ?? game.actors?.getName?.(ref) ?? null;
}

async function resolveRelatedName(uuid, fallback = "") {
  if (!uuid) return fallback || "";
  try {
    const doc = await fromUuid(uuid);
    const actor = doc?.documentName === "Actor" ? doc : doc?.actor;
    return actor?.name ?? fallback ?? "";
  } catch (_err) {
    return fallback || "";
  }
}

function normalizeMemory(input = {}, previous = null) {
  const createdAt = previous?.createdAt ?? input.createdAt ?? nowIso();
  const createdBy = previous?.createdBy ?? input.createdBy ?? game.user?.id ?? null;
  return {
    id: previous?.id ?? input.id ?? randomId(),
    title: String(input.title ?? previous?.title ?? "Untitled Memory").trim() || "Untitled Memory",
    body: String(input.body ?? previous?.body ?? "").trim(),
    category: CATEGORY_OPTIONS.some(([v]) => v === input.category) ? input.category : (previous?.category ?? "interaction"),
    importance: IMPORTANCE_OPTIONS.some(([v]) => v === input.importance) ? input.importance : (previous?.importance ?? "normal"),
    tone: TONE_OPTIONS.some(([v]) => v === input.tone) ? input.tone : (previous?.tone ?? "neutral"),
    relatedActorUuid: String(input.relatedActorUuid ?? previous?.relatedActorUuid ?? "").trim(),
    relatedActorName: String(input.relatedActorName ?? previous?.relatedActorName ?? "").trim(),
    campaignDate: String(input.campaignDate ?? previous?.campaignDate ?? "").trim(),
    tags: normalizeTags(input.tags ?? previous?.tags ?? []),
    source: String(input.source ?? previous?.source ?? "manual").trim() || "manual",
    sourceLabel: String(input.sourceLabel ?? previous?.sourceLabel ?? "").trim(),
    sourceEventId: String(input.sourceEventId ?? previous?.sourceEventId ?? "").trim(),
    pinned: Boolean(input.pinned ?? previous?.pinned ?? false),
    archived: Boolean(input.archived ?? previous?.archived ?? false),
    metadata: duplicate(input.metadata ?? previous?.metadata ?? {}),
    createdAt,
    createdBy,
    updatedAt: nowIso()
  };
}

class MemoryStore {
  static database = null;
  static pageIndex = new Map();

  static async initialize() {
    if (!game.user?.isGM) return;
    this.database = game.journal?.find(j => j.getFlag(MODULE_ID, DB_FLAG) === true) ?? null;
    if (!this.database) {
      this.database = await JournalEntry.create({
        name: DB_NAME,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [MODULE_ID]: { [DB_FLAG]: true, schemaVersion: SCHEMA_VERSION } }
      }, { renderSheet: false });
    }
    this.rebuildIndex();
  }

  static rebuildIndex() {
    this.pageIndex.clear();
    if (!this.database) return;
    for (const page of this.database.pages ?? []) {
      const key = page.getFlag(MODULE_ID, "actorKey");
      if (key) this.pageIndex.set(key, page.id);
    }
  }

  static async ensureDatabase() {
    if (!game.user?.isGM) throw new Error("NPC Memories database is GM-only.");
    if (!this.database || !game.journal?.has(this.database.id)) await this.initialize();
    return this.database;
  }

  static async getPage(actor, { create = false } = {}) {
    const db = await this.ensureDatabase();
    const key = stableActorKey(actor);
    if (!key) throw new Error("Could not determine an Actor UUID for this memory record.");

    const indexed = this.pageIndex.get(key);
    let page = indexed ? db.pages.get(indexed) : null;
    if (!page) {
      page = db.pages.find(p => p.getFlag(MODULE_ID, "actorKey") === key) ?? null;
      if (page) this.pageIndex.set(key, page.id);
    }
    if (page || !create) return page;

    const created = await db.createEmbeddedDocuments("JournalEntryPage", [{
      name: actorDisplayName(actor),
      type: "text",
      text: {
        content: `<p><strong>${escapeHtml(actorDisplayName(actor))}</strong> — managed by ${MODULE_TITLE}. Use the NPC sheet's Memories tab to edit this data.</p>`,
        format: 1
      },
      flags: {
        [MODULE_ID]: {
          actorKey: key,
          actorName: actorDisplayName(actor),
          [PAGE_DATA_FLAG]: { schemaVersion: SCHEMA_VERSION, memories: [] }
        }
      }
    }], { renderSheet: false });

    page = created?.[0] ?? null;
    if (page) this.pageIndex.set(key, page.id);
    return page;
  }

  static async getMemories(actor) {
    if (!game.user?.isGM) return [];
    const page = await this.getPage(actor, { create: false });
    const data = page?.getFlag(MODULE_ID, PAGE_DATA_FLAG) ?? {};
    const memories = Array.isArray(data.memories) ? data.memories : [];
    return duplicate(memories);
  }

  static async saveMemories(actor, memories) {
    const page = await this.getPage(actor, { create: true });
    const data = {
      schemaVersion: SCHEMA_VERSION,
      actorKey: stableActorKey(actor),
      actorName: actorDisplayName(actor),
      updatedAt: nowIso(),
      memories: duplicate(memories)
    };
    await page.setFlag(MODULE_ID, PAGE_DATA_FLAG, data);
    const displayName = actorDisplayName(actor);
    if (page.name !== displayName) await page.update({ name: displayName });
    return duplicate(memories);
  }

  static async purgeActor(actor) {
    const page = await this.getPage(actor, { create: false });
    if (!page) return false;
    const key = stableActorKey(actor);
    await this.database.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
    this.pageIndex.delete(key);
    return true;
  }
}

const api = {
  version: "0.1.1",
  moduleId: MODULE_ID,

  async get(actorRef, filters = {}) {
    const actor = await resolveActor(actorRef);
    if (!actor || !game.user?.isGM) return [];
    let memories = await MemoryStore.getMemories(actor);
    if (filters.archived === false) memories = memories.filter(m => !m.archived);
    if (filters.category) memories = memories.filter(m => m.category === filters.category);
    if (filters.relatedActorUuid) memories = memories.filter(m => m.relatedActorUuid === filters.relatedActorUuid);
    if (filters.source) memories = memories.filter(m => m.source === filters.source);
    return memories;
  },

  async add(actorRef, data = {}) {
    if (!game.user?.isGM) throw new Error(`${MODULE_TITLE} only allows GM writes.`);
    const actor = await resolveActor(actorRef);
    if (!actor) throw new Error("NPC Memories could not resolve the target Actor.");
    const memories = await MemoryStore.getMemories(actor);
    const memory = normalizeMemory(data);
    if (memory.relatedActorUuid && !memory.relatedActorName) {
      memory.relatedActorName = await resolveRelatedName(memory.relatedActorUuid, "");
    }
    memories.push(memory);
    await MemoryStore.saveMemories(actor, memories);
    Hooks.callAll("sbsNpcMemories.memoryCreated", actor, duplicate(memory));
    return duplicate(memory);
  },

  async update(actorRef, memoryId, patch = {}) {
    if (!game.user?.isGM) throw new Error(`${MODULE_TITLE} only allows GM writes.`);
    const actor = await resolveActor(actorRef);
    if (!actor) throw new Error("NPC Memories could not resolve the target Actor.");
    const memories = await MemoryStore.getMemories(actor);
    const index = memories.findIndex(m => m.id === memoryId);
    if (index < 0) return null;
    const updated = normalizeMemory({ ...memories[index], ...patch }, memories[index]);
    if (updated.relatedActorUuid && !updated.relatedActorName) {
      updated.relatedActorName = await resolveRelatedName(updated.relatedActorUuid, "");
    }
    memories[index] = updated;
    await MemoryStore.saveMemories(actor, memories);
    Hooks.callAll("sbsNpcMemories.memoryUpdated", actor, duplicate(updated));
    return duplicate(updated);
  },

  async remove(actorRef, memoryId) {
    if (!game.user?.isGM) throw new Error(`${MODULE_TITLE} only allows GM writes.`);
    const actor = await resolveActor(actorRef);
    if (!actor) throw new Error("NPC Memories could not resolve the target Actor.");
    const memories = await MemoryStore.getMemories(actor);
    const existing = memories.find(m => m.id === memoryId);
    if (!existing) return false;
    await MemoryStore.saveMemories(actor, memories.filter(m => m.id !== memoryId));
    Hooks.callAll("sbsNpcMemories.memoryDeleted", actor, duplicate(existing));
    return true;
  },

  async purge(actorRef) {
    if (!game.user?.isGM) throw new Error(`${MODULE_TITLE} only allows GM writes.`);
    const actor = await resolveActor(actorRef);
    if (!actor) return false;
    const result = await MemoryStore.purgeActor(actor);
    if (result) Hooks.callAll("sbsNpcMemories.actorPurged", actor);
    return result;
  },

  async recordMerchantEvent(merchantActorRef, event = {}) {
    const customer = await resolveActor(event.customerActor ?? event.customerActorUuid ?? event.customerId ?? null);
    const eventType = String(event.type ?? event.eventType ?? "interaction").toLowerCase();
    const titles = {
      purchase: "Customer Purchase",
      sale: "Customer Sale",
      "favor-change": "Customer Favor Changed",
      favor: "Customer Favor Changed",
      transaction: "Merchant Transaction",
      interaction: "Merchant Interaction"
    };
    const title = event.title ?? titles[eventType] ?? "Merchant Memory";
    const body = event.body ?? event.summary ?? event.description ?? "";
    return this.add(merchantActorRef, {
      title,
      body,
      category: eventType.includes("favor") ? "relationship" : (eventType === "interaction" ? "interaction" : "transaction"),
      importance: event.importance ?? "normal",
      tone: event.tone ?? "neutral",
      relatedActorUuid: customer?.uuid ?? event.customerActorUuid ?? "",
      relatedActorName: customer?.name ?? event.customerName ?? "",
      campaignDate: event.campaignDate ?? "",
      tags: ["merchant", eventType, ...(event.tags ?? [])],
      source: "sbs-merchants",
      sourceLabel: "SBS Merchants",
      sourceEventId: event.transactionId ?? event.eventId ?? "",
      metadata: duplicate(event.metadata ?? {
        type: eventType,
        amount: event.amount ?? null,
        currency: event.currency ?? null,
        itemName: event.itemName ?? null,
        quantity: event.quantity ?? null,
        favorFrom: event.favorFrom ?? null,
        favorTo: event.favorTo ?? null
      })
    });
  },

  async recordFactionEvent(actorRef, event = {}) {
    return this.add(actorRef, {
      title: event.title ?? "Faction Memory",
      body: event.body ?? event.summary ?? event.description ?? "",
      category: "faction",
      importance: event.importance ?? "normal",
      tone: event.tone ?? "neutral",
      relatedActorUuid: event.relatedActorUuid ?? "",
      relatedActorName: event.relatedActorName ?? "",
      campaignDate: event.campaignDate ?? "",
      tags: ["faction", ...(event.tags ?? [])],
      source: event.source ?? "sbs-factions",
      sourceLabel: event.sourceLabel ?? "SBS Factions",
      sourceEventId: event.eventId ?? "",
      metadata: duplicate(event.metadata ?? event)
    });
  },

  async recordQuestEvent(actorRef, event = {}) {
    return this.add(actorRef, {
      title: event.title ?? "Quest Memory",
      body: event.body ?? event.summary ?? event.description ?? "",
      category: "quest",
      importance: event.importance ?? "normal",
      tone: event.tone ?? "neutral",
      relatedActorUuid: event.relatedActorUuid ?? "",
      relatedActorName: event.relatedActorName ?? "",
      campaignDate: event.campaignDate ?? "",
      tags: ["quest", ...(event.tags ?? [])],
      source: event.source ?? "sbs-quests-objectives",
      sourceLabel: event.sourceLabel ?? "SBS Quests & Objectives",
      sourceEventId: event.eventId ?? event.questId ?? "",
      metadata: duplicate(event.metadata ?? event)
    });
  },

  async open(actorRef) {
    const actor = await resolveActor(actorRef);
    if (!actor) return false;
    if (!actor.sheet) return false;
    actor.sheet._sbsOpenMemoriesRequested = true;
    actor.sheet.render(true);
    return true;
  },

  database() { return MemoryStore.database; }
};

function findNpcSheetClasses() {
  const found = new Set();
  const visited = new Set();

  const consider = value => {
    if (!value || visited.has(value)) return;
    if ((typeof value === "object") || (typeof value === "function")) visited.add(value);
    if (typeof value === "function") {
      const tabs = value.TABS;
      const parts = value.PARTS;
      if (Array.isArray(tabs) && parts && tabs.some(t => t?.tab === "biography") && tabs.some(t => t?.tab === "features")) {
        found.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) consider(v);
      return;
    }
    if (value instanceof Map) {
      for (const v of value.values()) consider(v);
      return;
    }
    if (typeof value === "object") {
      if (typeof value.cls === "function") consider(value.cls);
      for (const v of Object.values(value)) {
        if (v !== value.cls) consider(v);
      }
    }
  };

  consider(globalThis.game?.dnd5e?.applications?.actor?.NPCActorSheet);
  consider(globalThis.dnd5e?.applications?.actor?.NPCActorSheet);
  consider(globalThis.CONFIG?.Actor?.sheetClasses?.npc);
  return [...found];
}

function patchNpcSheetClass(cls) {
  if (!cls || cls.__sbsNpcMemoriesPatched) return false;
  if (!Array.isArray(cls.TABS) || !cls.PARTS) return false;

  const memoriesPart = {
    container: { classes: ["tab-body"], id: "tabs" },
    template: `modules/${MODULE_ID}/templates/npc-memories.hbs`,
    scrollable: [""]
  };

  const nativeParts = Object.entries(cls.PARTS).filter(([key]) => key !== "memories");
  const rebuiltParts = {};
  let insertedPart = false;
  for (const [key, value] of nativeParts) {
    // D&D5e's native tab order puts Special Traits after our desired position.
    // If that part is absent, insert immediately before the shared tabs navigation.
    if (!insertedPart && (key === "specialTraits" || key === "tabs")) {
      rebuiltParts.memories = memoriesPart;
      insertedPart = true;
    }
    rebuiltParts[key] = value;
  }
  if (!insertedPart) rebuiltParts.memories = memoriesPart;
  cls.PARTS = rebuiltParts;

  const tabs = cls.TABS.filter(t => t?.tab !== "memories");
  const newTab = { tab: "memories", label: "SBSNPCMemories.Tab", icon: "fa-solid fa-brain" };
  const specialIndex = tabs.findIndex(t => t?.tab === "specialTraits");
  if (specialIndex >= 0) tabs.splice(specialIndex, 0, newTab);
  else tabs.push(newTab);
  cls.TABS = tabs;
  Object.defineProperty(cls, "__sbsNpcMemoriesPatched", { value: true, configurable: true });
  log(`Patched NPC sheet class ${cls.name}.`);
  return true;
}

function patchDefaultNpcSheets() {
  const classes = findNpcSheetClasses();
  let count = 0;
  for (const cls of classes) if (patchNpcSheetClass(cls)) count++;
  if (!count) warn("No compatible D&D5e NPC sheet class was found during setup; fallback DOM injection will be used.");
}

function getAppActor(app) {
  return app?.actor ?? app?.document ?? app?.object ?? null;
}

function getRootElement(element) {
  if (!element) return null;
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function removePlayerMemoryUi(root) {
  root.querySelectorAll('[data-tab="memories"], [data-sbs-npc-memories-part]').forEach(el => el.remove());
}

function injectFallbackTab(root) {
  if (root.querySelector('[data-sbs-npc-memories-part]')) return;
  const nav = root.querySelector('.tabs-right nav, nav.tabs-right, nav[data-group="primary"], .sheet-tabs[data-group="primary"], nav.tabs');
  const tabBody = root.querySelector('#tabs.tab-body, #tabs, .tab-body');
  if (!nav || !tabBody) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "item sbs-memory-fallback-tab";
  button.dataset.tab = "memories";
  button.dataset.group = "primary";
  button.innerHTML = '<i class="fa-solid fa-brain"></i><span>Memories</span>';
  nav.append(button);

  const section = document.createElement("section");
  section.className = "tab sbs-npc-memories-part";
  section.dataset.tab = "memories";
  section.dataset.group = "primary";
  section.dataset.sbsNpcMemoriesPart = "";
  section.hidden = true;
  section.innerHTML = '<div class="sbs-memory-host" data-sbs-memory-host></div>';
  tabBody.append(section);

  button.addEventListener("click", ev => {
    ev.preventDefault();
    nav.querySelectorAll('[data-tab]').forEach(el => el.classList.remove("active"));
    button.classList.add("active");
    tabBody.querySelectorAll('[data-tab]').forEach(el => {
      if (el === section) return;
      el.classList.remove("active");
    });
    section.hidden = false;
    section.classList.add("active");
  });

  nav.querySelectorAll('[data-tab]:not([data-tab="memories"])').forEach(el => {
    el.addEventListener("click", () => {
      section.hidden = true;
      section.classList.remove("active");
      button.classList.remove("active");
    });
  });
}

function getUiState(app) {
  return app._sbsNpcMemoriesState ??= {
    composerOpen: false,
    editingId: null,
    search: "",
    category: "",
    importance: "",
    includeArchived: false
  };
}

function optionHtml(options, selected) {
  return options.map(([value, label]) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function renderComposer(state, editing) {
  if (!state.composerOpen && !editing) return "";
  const memory = editing ?? {
    title: "",
    body: "",
    category: "interaction",
    importance: "normal",
    tone: "neutral",
    relatedActorUuid: "",
    relatedActorName: "",
    campaignDate: "",
    tags: []
  };

  const heading = editing ? "Edit Memory" : "Add Memory";
  const saveLabel = editing ? "Save Changes" : "Remember This";
  const related = memory.relatedActorName || "Drop an Actor or token here";
  return `
    <div class="sbs-memory-composer" data-memory-composer data-memory-id="${escapeAttr(editing?.id ?? "")}">
      <div class="sbs-composer-titlebar">
        <h3><i class="fa-solid ${editing ? "fa-pen-to-square" : "fa-brain"}"></i> ${heading}</h3>
        <button type="button" class="icon" data-action="cancel-compose" data-tooltip="Cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="sbs-memory-form-grid">
        <label class="span-2"><span>Memory title</span><input name="title" type="text" value="${escapeAttr(memory.title)}" placeholder="What will this NPC remember?" required></label>
        <label><span>Category</span><select name="category">${optionHtml(CATEGORY_OPTIONS, memory.category)}</select></label>
        <label><span>Importance</span><select name="importance">${optionHtml(IMPORTANCE_OPTIONS, memory.importance)}</select></label>
        <label><span>Emotional tone</span><select name="tone">${optionHtml(TONE_OPTIONS, memory.tone)}</select></label>
        <label><span>Campaign date</span><input name="campaignDate" type="text" value="${escapeAttr(memory.campaignDate)}" placeholder="e.g. 12th of Eleasis"></label>
        <label class="span-2"><span>Related actor / character</span>
          <div class="sbs-related-drop" data-related-drop tabindex="0">
            <i class="fa-solid fa-user-tag"></i>
            <strong data-related-label>${escapeHtml(related)}</strong>
            <button type="button" class="icon" data-action="clear-related" data-tooltip="Clear related actor"><i class="fa-solid fa-eraser"></i></button>
          </div>
          <input type="hidden" name="relatedActorUuid" value="${escapeAttr(memory.relatedActorUuid)}">
          <input type="text" name="relatedActorName" value="${escapeAttr(memory.relatedActorName)}" placeholder="Or type a name manually">
        </label>
        <label class="span-2"><span>Tags</span><input name="tags" type="text" value="${escapeAttr((memory.tags ?? []).join(", "))}" placeholder="merchant, suspicious, owes-party"></label>
        <label class="span-2"><span>What happened?</span><textarea name="body" rows="5" placeholder="Details, promises, lies, insults, favors, information learned…">${escapeHtml(memory.body)}</textarea></label>
      </div>
      <div class="sbs-composer-actions">
        <button type="button" data-action="cancel-compose"><i class="fa-solid fa-ban"></i> Cancel</button>
        <button type="button" class="sbs-primary" data-action="commit-memory"><i class="fa-solid fa-floppy-disk"></i> ${saveLabel}</button>
      </div>
    </div>`;
}

function memorySort(a, b) {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;
  return String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? ""));
}

function renderMemoryCard(memory) {
  const categoryLabel = labelFor(CATEGORY_OPTIONS, memory.category, "Other");
  const importanceLabel = labelFor(IMPORTANCE_OPTIONS, memory.importance, "Normal");
  const toneLabel = labelFor(TONE_OPTIONS, memory.tone, "Neutral");
  const sourceLabel = memory.sourceLabel || (memory.source === "manual" ? "Manual" : memory.source);
  const searchable = [memory.title, memory.body, categoryLabel, importanceLabel, toneLabel, memory.relatedActorName, memory.campaignDate, sourceLabel, ...(memory.tags ?? [])].join(" ").toLowerCase();
  const tags = (memory.tags ?? []).map(tag => `<span class="sbs-memory-tag">${escapeHtml(tag)}</span>`).join("");
  const metaBits = [
    memory.relatedActorName ? `<span><i class="fa-solid fa-user"></i> ${escapeHtml(memory.relatedActorName)}</span>` : "",
    memory.campaignDate ? `<span><i class="fa-solid fa-calendar-days"></i> ${escapeHtml(memory.campaignDate)}</span>` : "",
    sourceLabel ? `<span><i class="fa-solid fa-plug"></i> ${escapeHtml(sourceLabel)}</span>` : "",
    `<span><i class="fa-regular fa-clock"></i> ${escapeHtml(formatTime(memory.createdAt))}</span>`
  ].filter(Boolean).join("");

  return `<article class="sbs-memory-card ${memory.pinned ? "is-pinned" : ""} ${memory.archived ? "is-archived" : ""}"
      data-memory-id="${escapeAttr(memory.id)}"
      data-search="${escapeAttr(searchable)}"
      data-category="${escapeAttr(memory.category)}"
      data-importance="${escapeAttr(memory.importance)}"
      data-archived="${memory.archived ? "true" : "false"}">
    <div class="sbs-memory-card-icon"><i class="fa-solid ${CATEGORY_ICONS[memory.category] ?? "fa-brain"}"></i></div>
    <div class="sbs-memory-card-main">
      <div class="sbs-memory-card-head">
        <div>
          <h3>${memory.pinned ? '<i class="fa-solid fa-thumbtack sbs-pin-marker"></i> ' : ""}${escapeHtml(memory.title)}</h3>
          <div class="sbs-memory-badges">
            <span class="badge category">${escapeHtml(categoryLabel)}</span>
            <span class="badge importance ${escapeAttr(memory.importance)}">${escapeHtml(importanceLabel)}</span>
            <span class="badge tone ${escapeAttr(memory.tone)}">${escapeHtml(toneLabel)}</span>
            ${memory.archived ? '<span class="badge archived">Archived</span>' : ""}
          </div>
        </div>
        <div class="sbs-memory-card-actions">
          <button type="button" class="icon" data-action="toggle-pin" data-memory-id="${escapeAttr(memory.id)}" data-tooltip="${memory.pinned ? "Unpin" : "Pin"}"><i class="fa-solid fa-thumbtack"></i></button>
          <button type="button" class="icon" data-action="edit-memory" data-memory-id="${escapeAttr(memory.id)}" data-tooltip="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
          <button type="button" class="icon" data-action="toggle-archive" data-memory-id="${escapeAttr(memory.id)}" data-tooltip="${memory.archived ? "Restore" : "Archive"}"><i class="fa-solid ${memory.archived ? "fa-box-open" : "fa-box-archive"}"></i></button>
          <button type="button" class="icon danger" data-action="delete-memory" data-memory-id="${escapeAttr(memory.id)}" data-tooltip="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      ${memory.body ? `<div class="sbs-memory-body">${escapeHtml(memory.body)}</div>` : '<div class="sbs-memory-body is-empty">No additional details.</div>'}
      <div class="sbs-memory-meta">${metaBits}</div>
      ${tags ? `<div class="sbs-memory-tags">${tags}</div>` : ""}
    </div>
  </article>`;
}

async function renderMemoryHost(app, root) {
  const actor = getAppActor(app);
  if (!actor || actor.type !== "npc" || !game.user?.isGM) return;
  const host = root.querySelector('[data-sbs-memory-host]');
  if (!host) return;

  const state = getUiState(app);
  const memories = (await MemoryStore.getMemories(actor)).sort(memorySort);
  const editing = state.editingId ? memories.find(m => m.id === state.editingId) ?? null : null;
  if (state.editingId && !editing) state.editingId = null;

  const active = memories.filter(m => !m.archived);
  const pinned = active.filter(m => m.pinned).length;
  const critical = active.filter(m => m.importance === "critical").length;

  host.innerHTML = `
    <div class="sbs-memory-shell">
      <header class="sbs-memory-hero">
        <img src="modules/${MODULE_ID}/assets/sbs-logo.svg" alt="SBS logo">
        <div class="sbs-memory-hero-copy">
          <h2>NPC Memories</h2>
          <p>What ${escapeHtml(actorDisplayName(actor))} remembers, believes, owes, suspects, loves, hates, bought, sold, promised, or absolutely refuses to let go.</p>
        </div>
        <button type="button" class="sbs-add-memory sbs-primary" data-action="open-compose"><i class="fa-solid fa-plus"></i> Add Memory</button>
      </header>

      <div class="sbs-memory-stats">
        <span><strong>${active.length}</strong> active</span>
        <span><strong>${pinned}</strong> pinned</span>
        <span><strong>${critical}</strong> critical</span>
        <span class="sbs-integration-status"><i class="fa-solid fa-link"></i> API ready for Merchants / Factions</span>
      </div>

      ${renderComposer(state, editing)}

      <div class="sbs-memory-toolbar">
        <label class="sbs-memory-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-filter="search" value="${escapeAttr(state.search)}" placeholder="Search memories…"></label>
        <select data-filter="category"><option value="">All categories</option>${optionHtml(CATEGORY_OPTIONS, state.category)}</select>
        <select data-filter="importance"><option value="">All importance</option>${optionHtml(IMPORTANCE_OPTIONS, state.importance)}</select>
        <label class="sbs-show-archived"><input type="checkbox" data-filter="archived" ${state.includeArchived ? "checked" : ""}> Archived</label>
      </div>

      <div class="sbs-memory-list" data-memory-list>
        ${memories.length ? memories.map(renderMemoryCard).join("") : `
          <div class="sbs-memory-empty">
            <img src="modules/${MODULE_ID}/assets/sbs-logo.svg" alt="SBS logo">
            <h3>Nothing rattling around in there yet.</h3>
            <p>Add the NPC's first memory. Later, SBS Merchants and the Faction Manager can feed events into this same history automatically.</p>
            <button type="button" class="sbs-primary" data-action="open-compose"><i class="fa-solid fa-plus"></i> Add First Memory</button>
          </div>`}
      </div>
      <div class="sbs-memory-no-results" data-no-results hidden>No memories match those filters. The NPC has not forgotten them; you are merely failing your Investigation check.</div>
    </div>`;

  bindMemoryUi(app, root, host, actor, memories);
  applyFilters(app, host);
}

function applyFilters(app, host) {
  const state = getUiState(app);
  const cards = [...host.querySelectorAll('.sbs-memory-card')];
  let visible = 0;
  for (const card of cards) {
    const matchesSearch = !state.search || card.dataset.search.includes(state.search.toLowerCase());
    const matchesCategory = !state.category || card.dataset.category === state.category;
    const matchesImportance = !state.importance || card.dataset.importance === state.importance;
    const matchesArchived = state.includeArchived || card.dataset.archived !== "true";
    const show = matchesSearch && matchesCategory && matchesImportance && matchesArchived;
    card.hidden = !show;
    if (show) visible++;
  }
  const none = host.querySelector('[data-no-results]');
  if (none) none.hidden = !(cards.length && visible === 0);
}

async function confirmDelete(title) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    try {
      return await DialogV2.confirm({
        window: { title: "Forget this memory?" },
        content: `<p>Delete <strong>${escapeHtml(title)}</strong> permanently?</p><p>This cannot be undone.</p>`,
        yes: { label: "Forget It", icon: "fa-solid fa-trash" },
        no: { label: "Keep It", icon: "fa-solid fa-brain" }
      });
    } catch (_err) {}
  }
  return globalThis.confirm(`Delete the memory "${title}" permanently?`);
}

function bindMemoryUi(app, root, host, actor, memories) {
  const state = getUiState(app);

  host.querySelectorAll('[data-action="open-compose"]').forEach(btn => btn.addEventListener("click", () => {
    state.composerOpen = true;
    state.editingId = null;
    renderMemoryHost(app, root);
  }));

  host.querySelectorAll('[data-action="cancel-compose"]').forEach(btn => btn.addEventListener("click", () => {
    state.composerOpen = false;
    state.editingId = null;
    renderMemoryHost(app, root);
  }));

  const composer = host.querySelector('[data-memory-composer]');
  if (composer) {
    const relatedDrop = composer.querySelector('[data-related-drop]');
    const uuidInput = composer.querySelector('input[name="relatedActorUuid"]');
    const nameInput = composer.querySelector('input[name="relatedActorName"]');
    const relatedLabel = composer.querySelector('[data-related-label]');

    const readDragData = ev => {
      try {
        const parsed = globalThis.TextEditor?.getDragEventData?.(ev);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_err) {}
      for (const mime of ["text/plain", "application/json"]) {
        try {
          const raw = ev.dataTransfer?.getData(mime);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (_err) {}
      }
      return {};
    };

    const resolveDroppedActor = async dragData => {
      let doc = null;
      if (dragData.uuid) {
        try { doc = await fromUuid(dragData.uuid); } catch (_err) {}
      }
      if (!doc && dragData.type === "Actor" && dragData.id) doc = game.actors?.get(dragData.id) ?? null;
      if (!doc && dragData.actorId) doc = game.actors?.get(dragData.actorId) ?? null;
      if (!doc && dragData.tokenId) {
        const scene = dragData.sceneId ? game.scenes?.get(dragData.sceneId) : canvas?.scene;
        doc = scene?.tokens?.get(dragData.tokenId) ?? null;
      }
      if (doc?.documentName === "Actor") return doc;
      if (doc?.actor?.documentName === "Actor") return doc.actor;
      if (doc?.document?.actor?.documentName === "Actor") return doc.document.actor;
      return null;
    };

    for (const type of ["dragenter", "dragover"]) {
      relatedDrop?.addEventListener(type, ev => {
        ev.preventDefault();
        ev.stopPropagation();
        relatedDrop.classList.add("dragover");
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      }, { capture: true });
    }
    relatedDrop?.addEventListener("dragleave", ev => {
      ev.stopPropagation();
      relatedDrop.classList.remove("dragover");
    }, { capture: true });
    relatedDrop?.addEventListener("drop", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      relatedDrop.classList.remove("dragover");
      try {
        const relatedActor = await resolveDroppedActor(readDragData(ev));
        if (!relatedActor) return ui.notifications.warn("Drop an Actor or token onto the Related Actor field.");
        uuidInput.value = relatedActor.uuid;
        nameInput.value = relatedActor.name;
        relatedLabel.textContent = relatedActor.name;
      } catch (err) {
        console.error(`${MODULE_TITLE} | Related Actor drop failed`, err);
        ui.notifications.error("NPC Memories could not read that dropped Actor.");
      }
    }, { capture: true });

    composer.querySelector('[data-action="clear-related"]')?.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      uuidInput.value = "";
      nameInput.value = "";
      relatedLabel.textContent = "Drop an Actor or token here";
    });

    nameInput?.addEventListener("input", () => {
      if (uuidInput.value && nameInput.value !== relatedLabel.textContent) uuidInput.value = "";
      relatedLabel.textContent = nameInput.value || "Drop an Actor or token here";
    });

    const value = name => composer.querySelector(`[name="${name}"]`)?.value ?? "";
    const commit = async ev => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      const submit = composer.querySelector('[data-action="commit-memory"]');
      const data = {
        title: value("title").trim(),
        category: value("category"),
        importance: value("importance"),
        tone: value("tone"),
        campaignDate: value("campaignDate"),
        relatedActorUuid: value("relatedActorUuid"),
        relatedActorName: value("relatedActorName"),
        tags: normalizeTags(value("tags")),
        body: value("body")
      };
      if (!data.title) {
        ui.notifications.warn("Give the memory a title first.");
        composer.querySelector('input[name="title"]')?.focus();
        return;
      }
      submit?.setAttribute("disabled", "disabled");
      const id = composer.dataset.memoryId;
      try {
        if (id) await api.update(actor, id, data);
        else await api.add(actor, data);
        state.composerOpen = false;
        state.editingId = null;
        ui.notifications.info(id ? "Memory updated." : `${actorDisplayName(actor)} will remember that.`);
        await renderMemoryHost(app, root);
      } catch (err) {
        console.error(`${MODULE_TITLE} | Memory save failed`, err);
        ui.notifications.error(`NPC Memories: ${err.message ?? err}`);
        submit?.removeAttribute("disabled");
      }
    };

    composer.querySelector('[data-action="commit-memory"]')?.addEventListener("click", commit);
    composer.addEventListener("keydown", ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") commit(ev);
    });
  }

  host.querySelectorAll('[data-action="edit-memory"]').forEach(btn => btn.addEventListener("click", () => {
    state.editingId = btn.dataset.memoryId;
    state.composerOpen = true;
    renderMemoryHost(app, root);
  }));

  host.querySelectorAll('[data-action="toggle-pin"]').forEach(btn => btn.addEventListener("click", async () => {
    const memory = memories.find(m => m.id === btn.dataset.memoryId);
    if (!memory) return;
    await api.update(actor, memory.id, { pinned: !memory.pinned });
    await renderMemoryHost(app, root);
  }));

  host.querySelectorAll('[data-action="toggle-archive"]').forEach(btn => btn.addEventListener("click", async () => {
    const memory = memories.find(m => m.id === btn.dataset.memoryId);
    if (!memory) return;
    await api.update(actor, memory.id, { archived: !memory.archived });
    await renderMemoryHost(app, root);
  }));

  host.querySelectorAll('[data-action="delete-memory"]').forEach(btn => btn.addEventListener("click", async () => {
    const memory = memories.find(m => m.id === btn.dataset.memoryId);
    if (!memory) return;
    if (!await confirmDelete(memory.title)) return;
    await api.remove(actor, memory.id);
    await renderMemoryHost(app, root);
  }));

  const search = host.querySelector('[data-filter="search"]');
  search?.addEventListener("input", () => {
    state.search = search.value.trim();
    applyFilters(app, host);
  });
  const category = host.querySelector('[data-filter="category"]');
  category?.addEventListener("change", () => {
    state.category = category.value;
    applyFilters(app, host);
  });
  const importance = host.querySelector('[data-filter="importance"]');
  importance?.addEventListener("change", () => {
    state.importance = importance.value;
    applyFilters(app, host);
  });
  const archived = host.querySelector('[data-filter="archived"]');
  archived?.addEventListener("change", () => {
    state.includeArchived = archived.checked;
    applyFilters(app, host);
  });
}

async function onNpcSheetRender(app, element) {
  const actor = getAppActor(app);
  if (!actor || actor.type !== "npc") return;
  const root = getRootElement(element);
  if (!root) return;

  if (!game.user?.isGM) {
    removePlayerMemoryUi(root);
    return;
  }

  injectFallbackTab(root);
  await renderMemoryHost(app, root);

  if (app._sbsOpenMemoriesRequested) {
    app._sbsOpenMemoriesRequested = false;
    const tab = root.querySelector('[data-tab="memories"]');
    tab?.click();
  }
}

function installMerchantHooks() {
  Hooks.on("sbsMerchants.transactionCompleted", async (merchantActor, event = {}) => {
    if (!game.user?.isGM) return;
    try { await api.recordMerchantEvent(merchantActor, event); }
    catch (err) { warn("Merchant transaction memory failed", err); }
  });

  Hooks.on("sbsMerchants.favorChanged", async (merchantActor, customerActor, change = {}) => {
    if (!game.user?.isGM) return;
    try {
      await api.recordMerchantEvent(merchantActor, {
        ...change,
        type: "favor-change",
        customerActor,
        title: change.title ?? `Favor changed: ${change.from ?? "?"} → ${change.to ?? "?"}`,
        summary: change.summary ?? change.reason ?? "Merchant favor changed.",
        favorFrom: change.from,
        favorTo: change.to,
        tone: change.tone ?? "neutral",
        importance: change.importance ?? "important"
      });
    } catch (err) { warn("Merchant favor memory failed", err); }
  });
}

Hooks.once("init", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  game.sbsNpcMemories = api;
  log("Initializing.");
});

Hooks.once("setup", () => {
  // Do not patch the sheet class at all for players. The data store is GM-only,
  // and there is no reason to make a secret tab briefly exist before removing it.
  if (game.user?.isGM) patchDefaultNpcSheets();
});

Hooks.once("ready", async () => {
  if (game.user?.isGM) {
    await MemoryStore.initialize();
    installMerchantHooks();
    log("Ready. Database:", MemoryStore.database?.name ?? "unavailable");
  }
});

Hooks.on("renderActorSheetV2", onNpcSheetRender);
Hooks.on("renderActorSheet", onNpcSheetRender);
