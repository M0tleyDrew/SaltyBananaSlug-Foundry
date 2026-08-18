const MODULE_ID = "saltybananaslug-quests-objectives";
const SOCKET = `module.${MODULE_ID}`;
const BRAND = `modules/${MODULE_ID}/assets/sbs-brand.svg`;

const { ApplicationV2 } = foundry.applications.api;

let stateCache = null;
let boardApp = null;
let managerApp = null;
let editorApp = null;

const STATUS_LABELS = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
  abandoned: "Abandoned"
};

const KIND_LABELS = {
  main: "Main Quest",
  side: "Side Quest",
  personal: "Personal Quest"
};

const AUDIENCE_LABELS = {
  party: "Party",
  private: "Private",
  gm: "GM Secret"
};

const REVEAL_LABELS = {
  always: "Always Visible",
  manual: "Manual Reveal",
  previous: "After Previous Objective",
  objective: "After Specific Objective",
  gm: "GM Secret"
};

function clone(value) {
  return foundry.utils.deepClone(value);
}

function randomID() {
  return foundry.utils.randomID();
}

function esc(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function nl2br(value = "") {
  return esc(value).replace(/\n/g, "<br>");
}

function now() {
  return Date.now();
}

function emptyState() {
  return { version: 1, quests: [] };
}

function normalizeState(raw) {
  const state = raw && typeof raw === "object" ? clone(raw) : emptyState();
  state.version = 1;
  state.quests = Array.isArray(state.quests) ? state.quests.map(normalizeQuest) : [];
  return state;
}

function normalizeQuest(raw = {}) {
  const q = clone(raw);
  q.id ||= randomID();
  q.title = String(q.title || "Untitled Quest");
  q.description = String(q.description || "");
  q.kind = ["main", "side", "personal"].includes(q.kind) ? q.kind : "side";
  q.ownerId = q.ownerId || null;
  q.createdBy = q.createdBy || q.ownerId || game.user?.id || null;
  q.audience = ["party", "private", "gm"].includes(q.audience) ? q.audience : "party";
  q.revealed = q.audience === "gm" ? false : q.revealed !== false;
  q.initialRevealed = q.audience === "gm" ? false : q.initialRevealed ?? q.revealed;
  q.status = ["active", "completed", "failed", "abandoned"].includes(q.status) ? q.status : "active";
  q.initialStatus = q.initialStatus || "active";
  q.sequential = Boolean(q.sequential);
  q.autoComplete = ["manual", "all", "any"].includes(q.autoComplete) ? q.autoComplete : "manual";
  q.createdAt ||= now();
  q.updatedAt ||= q.createdAt;
  q.completedAt ||= null;
  q.objectives = Array.isArray(q.objectives) ? q.objectives.map((o, i) => normalizeObjective(o, i)) : [];
  refreshDerivedRevealState(q);
  return q;
}

function normalizeObjective(raw = {}, index = 0) {
  const o = clone(raw);
  o.id ||= randomID();
  o.title = String(o.title || `Objective ${index + 1}`);
  o.description = String(o.description || "");
  o.required = o.required !== false;
  o.completed = Boolean(o.completed);
  o.completedAt ||= null;
  o.revealMode = ["always", "manual", "previous", "objective", "gm"].includes(o.revealMode) ? o.revealMode : "always";
  o.revealAfterId = o.revealAfterId || null;
  o.revealed = o.revealMode === "gm" ? false : o.revealed !== false;
  o.initialRevealed = o.revealMode === "gm" ? false : o.initialRevealed ?? o.revealed;
  return o;
}

function refreshDerivedRevealState(quest) {
  for (let i = 0; i < quest.objectives.length; i++) {
    const objective = quest.objectives[i];
    if (objective.revealMode === "always") objective.revealed = true;
    if (objective.revealMode === "gm") objective.revealed = false;
    if (objective.revealMode === "previous" && i > 0 && quest.objectives[i - 1].completed) objective.revealed = true;
    if (objective.revealMode === "previous" && i === 0) objective.revealed = true;
    if (objective.revealMode === "objective") {
      const dependency = quest.objectives.find(o => o.id === objective.revealAfterId);
      if (dependency?.completed) objective.revealed = true;
    }
  }
}

function getState() {
  if (stateCache) return clone(stateCache);
  const raw = game.settings.get(MODULE_ID, "questData");
  stateCache = normalizeState(raw);
  return clone(stateCache);
}

async function saveState(state, { broadcast = true } = {}) {
  const normalized = normalizeState(state);
  stateCache = clone(normalized);
  await game.settings.set(MODULE_ID, "questData", normalized);
  if (broadcast) game.socket.emit(SOCKET, { type: "stateChanged", state: normalized });
  rerenderAll();
  updateHUD();
  return normalized;
}

function activeGM() {
  return game.users
    .filter(u => u.active && u.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

function userCanSeeQuest(user, quest) {
  if (user.isGM) return true;
  if (quest.audience === "gm") return false;
  if (!quest.revealed) return false;
  if (quest.audience === "private") return quest.ownerId === user.id;
  return true;
}

function userCanSeeObjective(user, quest, objective) {
  if (user.isGM) return true;
  if (!userCanSeeQuest(user, quest)) return false;
  if (objective.revealMode === "gm") return false;
  return objective.revealed === true;
}

function projectQuestForUser(user, quest) {
  if (!userCanSeeQuest(user, quest)) return null;
  if (user.isGM) return clone(quest);
  const projected = clone(quest);
  projected.objectives = quest.objectives
    .filter(objective => userCanSeeObjective(user, quest, objective))
    .map(objective => clone(objective));
  return projected;
}

function userCanEditQuest(user, quest) {
  if (user.isGM) return true;
  return quest.kind === "personal" && quest.ownerId === user.id;
}

function findQuest(state, questId) {
  return state.quests.find(q => q.id === questId);
}

function objectiveCompletionMayCompleteQuest(quest) {
  if (quest.autoComplete === "manual") return;
  const required = quest.objectives.filter(o => o.required && o.revealMode !== "gm");
  if (!required.length) return;
  const shouldComplete = quest.autoComplete === "all"
    ? required.every(o => o.completed)
    : required.some(o => o.completed);
  if (shouldComplete) {
    quest.status = "completed";
    quest.completedAt = now();
  }
}

function resetQuestInPlace(quest) {
  quest.status = quest.initialStatus || "active";
  quest.revealed = quest.audience === "gm" ? false : Boolean(quest.initialRevealed);
  quest.completedAt = null;
  quest.updatedAt = now();
  for (const objective of quest.objectives) {
    objective.completed = false;
    objective.completedAt = null;
    objective.revealed = objective.revealMode === "gm" ? false : Boolean(objective.initialRevealed);
  }
  refreshDerivedRevealState(quest);
}

function sanitizeQuestForPlayerCreation(raw, requesterId) {
  const q = normalizeQuest(raw);
  q.kind = "personal";
  q.ownerId = requesterId;
  q.createdBy = requesterId;
  q.audience = q.audience === "party" ? "party" : "private";
  q.revealed = true;
  q.initialRevealed = true;
  q.status = "active";
  q.initialStatus = "active";
  q.autoComplete = ["manual", "all", "any"].includes(q.autoComplete) ? q.autoComplete : "manual";
  q.objectives = q.objectives.map(o => ({
    ...o,
    revealMode: "always",
    revealAfterId: null,
    revealed: true,
    initialRevealed: true
  }));
  return q;
}

function validateAndApplyMutation(state, message, requester) {
  const { action, questId, objectiveId, data } = message;
  const isGM = requester?.isGM;
  let quest = questId ? findQuest(state, questId) : null;

  switch (action) {
    case "createQuest": {
      if (isGM) {
        const created = normalizeQuest(data);
        created.createdBy = requester.id;
        created.createdAt = now();
        created.updatedAt = created.createdAt;
        if (created.kind === "personal" && !created.ownerId) created.ownerId = requester.id;
        state.quests.push(created);
        return { ok: true, questId: created.id };
      }
      if (!game.settings.get(MODULE_ID, "allowPersonalQuests")) return { ok: false, error: "Player personal quests are disabled." };
      const created = sanitizeQuestForPlayerCreation(data, requester.id);
      state.quests.push(created);
      return { ok: true, questId: created.id };
    }

    case "updateQuest": {
      if (!quest) return { ok: false, error: "Quest not found." };
      if (!userCanEditQuest(requester, quest)) return { ok: false, error: "You cannot edit that quest." };
      const preserved = { id: quest.id, createdAt: quest.createdAt, createdBy: quest.createdBy };
      let replacement = normalizeQuest({ ...data, ...preserved });
      if (!isGM) {
        replacement = sanitizeQuestForPlayerCreation(replacement, requester.id);
        replacement.id = preserved.id;
        replacement.createdAt = preserved.createdAt;
        replacement.createdBy = preserved.createdBy;
        replacement.status = quest.status;
        replacement.completedAt = quest.completedAt;
      }
      replacement.updatedAt = now();
      state.quests[state.quests.indexOf(quest)] = replacement;
      return { ok: true, questId: replacement.id };
    }

    case "deleteQuest": {
      if (!quest) return { ok: false, error: "Quest not found." };
      if (!userCanEditQuest(requester, quest)) return { ok: false, error: "You cannot delete that quest." };
      state.quests = state.quests.filter(q => q.id !== quest.id);
      return { ok: true };
    }

    case "setQuestStatus": {
      if (!quest) return { ok: false, error: "Quest not found." };
      if (!userCanEditQuest(requester, quest)) return { ok: false, error: "You cannot change that quest." };
      const status = data?.status;
      if (!["active", "completed", "failed", "abandoned"].includes(status)) return { ok: false, error: "Invalid quest status." };
      quest.status = status;
      quest.completedAt = status === "completed" ? now() : null;
      quest.updatedAt = now();
      return { ok: true };
    }

    case "toggleObjective": {
      if (!quest) return { ok: false, error: "Quest not found." };
      if (!userCanEditQuest(requester, quest)) return { ok: false, error: "You cannot change objectives on that quest." };
      const objective = quest.objectives.find(o => o.id === objectiveId);
      if (!objective) return { ok: false, error: "Objective not found." };
      objective.completed = Boolean(data?.completed);
      objective.completedAt = objective.completed ? now() : null;
      quest.updatedAt = now();
      refreshDerivedRevealState(quest);
      objectiveCompletionMayCompleteQuest(quest);
      return { ok: true };
    }

    case "revealQuest": {
      if (!isGM || !quest) return { ok: false, error: "GM permission required." };
      if (quest.audience === "gm") return { ok: false, error: "GM Secret quests cannot be revealed until their audience is changed." };
      quest.revealed = Boolean(data?.revealed);
      quest.updatedAt = now();
      return { ok: true };
    }

    case "revealObjective": {
      if (!isGM || !quest) return { ok: false, error: "GM permission required." };
      const objective = quest.objectives.find(o => o.id === objectiveId);
      if (!objective) return { ok: false, error: "Objective not found." };
      if (objective.revealMode === "gm") return { ok: false, error: "GM Secret objectives cannot be revealed until their reveal mode is changed." };
      objective.revealed = Boolean(data?.revealed);
      quest.updatedAt = now();
      return { ok: true };
    }

    case "resetQuest": {
      if (!quest) return { ok: false, error: "Quest not found." };
      if (!userCanEditQuest(requester, quest)) return { ok: false, error: "You cannot reset that quest." };
      resetQuestInPlace(quest);
      return { ok: true };
    }

    case "resetAll": {
      if (!isGM) return { ok: false, error: "GM permission required." };
      const includePersonal = Boolean(data?.includePersonal);
      for (const q of state.quests) {
        if (!includePersonal && q.kind === "personal") continue;
        resetQuestInPlace(q);
      }
      return { ok: true };
    }

    case "clearAll": {
      if (!isGM) return { ok: false, error: "GM permission required." };
      state.quests = [];
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

async function mutate(action, payload = {}) {
  const request = {
    type: "mutation",
    requestId: randomID(),
    requesterId: game.user.id,
    action,
    ...payload
  };

  if (game.user.isGM) {
    const state = getState();
    const result = validateAndApplyMutation(state, request, game.user);
    if (!result.ok) {
      ui.notifications.warn(result.error);
      return result;
    }
    await saveState(state);
    return result;
  }

  const gm = activeGM();
  if (!gm) {
    ui.notifications.warn("A GM must be connected to change quests.");
    return { ok: false, error: "No active GM." };
  }

  game.socket.emit(SOCKET, request);
  return { ok: true, pending: true };
}

function handleSocket(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "stateChanged") {
    stateCache = normalizeState(message.state);
    rerenderAll();
    updateHUD();
    return;
  }

  if (message.type === "mutationResult" && message.targetUserId === game.user.id) {
    if (!message.ok) ui.notifications.warn(message.error || "Quest change failed.");
    return;
  }

  if (message.type !== "mutation") return;
  const gm = activeGM();
  if (!game.user.isGM || !gm || gm.id !== game.user.id) return;

  const requester = game.users.get(message.requesterId);
  if (!requester) return;

  (async () => {
    const state = getState();
    const result = validateAndApplyMutation(state, message, requester);
    if (result.ok) await saveState(state);
    game.socket.emit(SOCKET, {
      type: "mutationResult",
      targetUserId: requester.id,
      requestId: message.requestId,
      ...result
    });
  })();
}

function rerenderAll() {
  // Keep window ownership inside this module and use only public ApplicationV2 lifecycle APIs.
  if (boardApp?.rendered) void boardApp.render();
  if (managerApp?.rendered) void managerApp.render();
}

function getTrackedQuestId() {
  return game.settings.get(MODULE_ID, "trackedQuestId") || "";
}

async function setTrackedQuestId(questId) {
  await game.settings.set(MODULE_ID, "trackedQuestId", questId || "");
  updateHUD();
  rerenderAll();
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

class SBSBaseApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["sbsqo-window"],
    tag: "div",
    window: {
      frame: true,
      resizable: true,
      minimizable: true,
      icon: "fa-solid fa-list-check"
    },
    position: {
      width: 920,
      height: 720
    }
  };

  async _renderHTML(context, options) {
    return this.buildHTML(context, options);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners(this.element);
  }

  activateListeners(element) {
    element.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", event => this.onAction(event, el.dataset.action, el));
    });
    element.querySelectorAll("[data-change]").forEach(el => {
      el.addEventListener("change", event => this.onChange(event, el.dataset.change, el));
    });
  }

  async onAction() {}
  async onChange() {}
}

class QuestBoardApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbsqo-quest-board",
    window: { title: "SaltyBananaSlug's Quests & Objectives" },
    position: { width: 900, height: 700 }
  };

  constructor(options = {}) {
    super(options);
    this.tab = "active";
  }

  buildHTML() {
    const state = getState();
    const quests = state.quests
      .map(q => projectQuestForUser(game.user, q))
      .filter(Boolean)
      .filter(q => this.tab === "active" ? q.status === "active" : q.status !== "active")
      .sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : kindOrder(a.kind) - kindOrder(b.kind)));

    const groups = ["main", "side", "personal"].map(kind => ({
      kind,
      quests: quests.filter(q => q.kind === kind)
    })).filter(g => g.quests.length);

    return `
      <div class="sbsqo-shell">
        ${brandHeader("Quest Board", "Your missions, objectives, and terrible life choices.")}
        <div class="sbsqo-toolbar sbsqo-board-toolbar">
          <div class="sbsqo-tabs">
            <button class="${this.tab === "active" ? "active" : ""}" data-action="tab-active"><i class="fa-solid fa-bolt"></i> Active</button>
            <button class="${this.tab === "completed" ? "active" : ""}" data-action="tab-completed"><i class="fa-solid fa-circle-check"></i> Completed & History</button>
          </div>
          <div class="sbsqo-toolbar-actions">
            ${game.settings.get(MODULE_ID, "allowPersonalQuests") ? `<button data-action="create-personal"><i class="fa-solid fa-plus"></i> Personal Quest</button>` : ""}
            ${game.user.isGM ? `<button data-action="open-manager"><i class="fa-solid fa-screwdriver-wrench"></i> GM Manager</button>` : ""}
          </div>
        </div>
        <div class="sbsqo-scroll sbsqo-board-content">
          ${groups.length ? groups.map(g => this.renderGroup(g)).join("") : emptyBoard(this.tab)}
        </div>
      </div>`;
  }

  renderGroup(group) {
    return `
      <section class="sbsqo-quest-group">
        <h2><span>${esc(KIND_LABELS[group.kind])}</span><small>${group.quests.length}</small></h2>
        <div class="sbsqo-quest-list">
          ${group.quests.map(q => renderQuestCard(q, { manager: false })).join("")}
        </div>
      </section>`;
  }

  async onAction(event, action, el) {
    const questId = el.closest("[data-quest-id]")?.dataset.questId;
    const objectiveId = el.closest("[data-objective-id]")?.dataset.objectiveId;

    if (action === "tab-active") { this.tab = "active"; return this.render(); }
    if (action === "tab-completed") { this.tab = "completed"; return this.render(); }
    if (action === "create-personal") return openQuestEditor(null, { personal: true });
    if (action === "open-manager") return openManager();
    if (action === "edit-quest") return openQuestEditor(questId);
    if (action === "delete-quest") return confirmDeleteQuest(questId);
    if (action === "reset-quest") return confirmResetQuest(questId);
    if (action === "complete-quest") return mutate("setQuestStatus", { questId, data: { status: "completed" } });
    if (action === "reactivate-quest") return mutate("setQuestStatus", { questId, data: { status: "active" } });
    if (action === "track-quest") return setTrackedQuestId(getTrackedQuestId() === questId ? "" : questId);
    if (action === "toggle-objective") {
      const checkbox = el.matches("input") ? el : el.querySelector("input");
      return mutate("toggleObjective", { questId, objectiveId, data: { completed: checkbox?.checked } });
    }
  }
}

class QuestManagerApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbsqo-quest-manager",
    window: { title: "SBS Quest Manager" },
    position: { width: 1000, height: 760 }
  };

  constructor(options = {}) {
    super(options);
    this.filter = "all";
  }

  buildHTML() {
    const state = getState();
    let quests = state.quests;
    if (this.filter === "active") quests = quests.filter(q => q.status === "active");
    else if (this.filter === "hidden") quests = quests.filter(q => q.audience === "gm" || !q.revealed || q.objectives.some(o => !o.revealed || o.revealMode === "gm"));
    else if (this.filter === "completed") quests = quests.filter(q => q.status === "completed");
    else if (this.filter === "personal") quests = quests.filter(q => q.kind === "personal");

    return `
      <div class="sbsqo-shell">
        ${brandHeader("GM Quest Manager", "The part where you know which basement cult actually exists.")}
        <div class="sbsqo-toolbar sbsqo-manager-toolbar">
          <div class="sbsqo-filter-row">
            ${["all", "active", "hidden", "completed", "personal"].map(f => `<button class="${this.filter === f ? "active" : ""}" data-action="filter-${f}">${capitalize(f)}</button>`).join("")}
          </div>
          <div class="sbsqo-toolbar-actions">
            <button data-action="create-campaign"><i class="fa-solid fa-plus"></i> New Quest</button>
            <button data-action="reset-all"><i class="fa-solid fa-rotate-left"></i> Reset All</button>
            <button class="danger" data-action="clear-all"><i class="fa-solid fa-trash"></i> Clear All</button>
          </div>
        </div>
        <div class="sbsqo-scroll sbsqo-manager-content">
          ${quests.length ? quests.map(q => renderQuestCard(q, { manager: true })).join("") : `<div class="sbsqo-empty"><i class="fa-solid fa-scroll"></i><h3>No quests match this filter.</h3></div>`}
        </div>
      </div>`;
  }

  async onAction(event, action, el) {
    const questId = el.closest("[data-quest-id]")?.dataset.questId;
    const objectiveId = el.closest("[data-objective-id]")?.dataset.objectiveId;

    if (action.startsWith("filter-")) { this.filter = action.replace("filter-", ""); return this.render(); }
    if (action === "create-campaign") return openQuestEditor(null, { personal: false });
    if (action === "edit-quest") return openQuestEditor(questId);
    if (action === "delete-quest") return confirmDeleteQuest(questId);
    if (action === "reset-quest") return confirmResetQuest(questId);
    if (action === "reset-all") return confirmResetAll();
    if (action === "clear-all") return confirmClearAll();
    if (action === "complete-quest") return mutate("setQuestStatus", { questId, data: { status: "completed" } });
    if (action === "reactivate-quest") return mutate("setQuestStatus", { questId, data: { status: "active" } });
    if (action === "fail-quest") return mutate("setQuestStatus", { questId, data: { status: "failed" } });
    if (action === "abandon-quest") return mutate("setQuestStatus", { questId, data: { status: "abandoned" } });
    if (action === "track-quest") return setTrackedQuestId(getTrackedQuestId() === questId ? "" : questId);
    if (action === "reveal-quest") return mutate("revealQuest", { questId, data: { revealed: true } });
    if (action === "hide-quest") return mutate("revealQuest", { questId, data: { revealed: false } });
    if (action === "reveal-objective") return mutate("revealObjective", { questId, objectiveId, data: { revealed: true } });
    if (action === "hide-objective") return mutate("revealObjective", { questId, objectiveId, data: { revealed: false } });
    if (action === "toggle-objective") {
      const checkbox = el.matches("input") ? el : el.querySelector("input");
      return mutate("toggleObjective", { questId, objectiveId, data: { completed: checkbox?.checked } });
    }
  }
}

class QuestEditorApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbsqo-quest-editor",
    window: { title: "Quest Editor" },
    position: { width: 860, height: 780 }
  };

  constructor(quest = null, { personal = false } = {}) {
    super();
    this.isNew = !quest;
    this.personalMode = personal || (!game.user.isGM && !quest) || quest?.kind === "personal" && !game.user.isGM;
    this.draft = quest ? clone(quest) : this.newDraft();
  }

  newDraft() {
    const personal = this.personalMode;
    return normalizeQuest({
      id: randomID(),
      title: "",
      description: "",
      kind: personal ? "personal" : "side",
      ownerId: personal ? game.user.id : null,
      audience: personal ? "private" : "party",
      revealed: true,
      initialRevealed: true,
      sequential: false,
      autoComplete: "manual",
      objectives: []
    });
  }

  buildHTML() {
    const q = this.draft;
    const isGM = game.user.isGM;
    const personalLocked = this.personalMode && !isGM;
    const users = game.users.filter(u => !u.isGM);

    return `
      <div class="sbsqo-shell sbsqo-editor-shell">
        ${brandHeader(this.isNew ? "Create Quest" : "Edit Quest", this.personalMode ? "Personal quests belong to their player; objectives belong to the quest." : "Build the mission now. Reveal the suffering later.")}
        <div class="sbsqo-scroll sbsqo-editor-content">
          <div class="sbsqo-form-grid">
            <label class="wide"><span>Quest Title</span><input name="title" value="${esc(q.title)}" placeholder="The Missing Caravan"></label>
            <label><span>Quest Type</span>
              <select name="kind" ${personalLocked ? "disabled" : ""}>
                ${option("main", "Main Quest", q.kind)}
                ${option("side", "Side Quest", q.kind)}
                ${option("personal", "Personal Quest", q.kind)}
              </select>
            </label>
            <label><span>Visibility</span>
              <select name="audience">
                ${option("party", "Party", q.audience)}
                ${option("private", "Private (Owner + GM)", q.audience)}
                ${isGM ? option("gm", "GM Secret", q.audience) : ""}
              </select>
            </label>
            ${isGM ? `<label><span>Private Quest Owner</span><select name="ownerId"><option value="">None</option>${users.map(u => option(u.id, u.name, q.ownerId)).join("")}</select></label>` : ""}
            ${isGM && q.audience !== "gm" ? `<label class="checkbox-label"><input type="checkbox" name="revealed" ${q.revealed ? "checked" : ""}><span>Quest starts revealed to its audience</span></label>` : ""}
            <label><span>Completion</span><select name="autoComplete">${option("manual", "Manual", q.autoComplete)}${option("all", "All Required Objectives", q.autoComplete)}${option("any", "Any Required Objective", q.autoComplete)}</select></label>
            <label class="checkbox-label"><input type="checkbox" name="sequential" ${q.sequential ? "checked" : ""}><span>Sequential objective workflow</span></label>
            <label class="wide"><span>Description</span><textarea name="description" rows="5" placeholder="What are the heroes supposed to do, allegedly?">${esc(q.description)}</textarea></label>
          </div>

          <div class="sbsqo-objective-editor-header">
            <div><h2>Objectives</h2><p>Objectives are nested inside this quest and reset with it.</p></div>
            <button data-action="add-objective"><i class="fa-solid fa-plus"></i> Add Objective</button>
          </div>

          <div class="sbsqo-objective-editor-list">
            ${q.objectives.length ? q.objectives.map((o, i) => this.renderObjectiveEditor(o, i)).join("") : `<div class="sbsqo-empty compact"><p>No objectives yet. A quest may also be completed manually with none.</p></div>`}
          </div>
        </div>
        <footer class="sbsqo-editor-footer">
          <div class="sbsqo-editor-footer-left">
            ${!this.isNew && userCanEditQuest(game.user, q) ? `<button class="danger" data-action="delete-current-quest"><i class="fa-solid fa-trash"></i> Delete Quest</button>` : ""}
          </div>
          <div class="sbsqo-editor-footer-right">
            <button data-action="cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
            <button class="primary" data-action="save"><i class="fa-solid fa-floppy-disk"></i> ${this.isNew ? "Create Quest" : "Save Quest"}</button>
          </div>
        </footer>
      </div>`;
  }

  renderObjectiveEditor(o, index) {
    const isGM = game.user.isGM;
    const canHide = isGM && !this.personalMode;
    const prior = this.draft.objectives.filter(x => x.id !== o.id);
    return `
      <article class="sbsqo-objective-editor" data-objective-id="${o.id}">
        <div class="sbsqo-objective-number">${index + 1}</div>
        <div class="sbsqo-objective-fields">
          <label class="wide"><span>Objective</span><input name="objective-title" value="${esc(o.title)}" placeholder="Search the eastern road"></label>
          <label class="wide"><span>Details</span><textarea name="objective-description" rows="2" placeholder="Optional detail shown beneath the objective.">${esc(o.description)}</textarea></label>
          <label class="checkbox-label"><input type="checkbox" name="objective-required" ${o.required ? "checked" : ""}><span>Required</span></label>
          ${canHide ? `<label><span>Reveal Rule</span><select name="objective-reveal-mode">${option("always", "Always Visible", o.revealMode)}${option("manual", "Manual Reveal", o.revealMode)}${option("previous", "After Previous Objective", o.revealMode)}${option("objective", "After Specific Objective", o.revealMode)}${option("gm", "GM Secret", o.revealMode)}</select></label>` : `<input type="hidden" name="objective-reveal-mode" value="always">`}
          ${canHide ? `<label><span>Reveal After</span><select name="objective-reveal-after"><option value="">Choose Objective</option>${prior.map(p => option(p.id, p.title || "Untitled Objective", o.revealAfterId)).join("")}</select></label>` : ""}
          ${canHide && !["always", "gm"].includes(o.revealMode) ? `<label class="checkbox-label"><input type="checkbox" name="objective-revealed" ${o.revealed ? "checked" : ""}><span>Currently revealed</span></label>` : ""}
        </div>
        <div class="sbsqo-objective-row-actions">
          <button data-action="move-objective-up" title="Move Up" ${index === 0 ? "disabled" : ""}><i class="fa-solid fa-chevron-up"></i></button>
          <button data-action="move-objective-down" title="Move Down" ${index === this.draft.objectives.length - 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-down"></i></button>
          <button class="danger" data-action="remove-objective" title="Remove Objective"><i class="fa-solid fa-trash"></i></button>
        </div>
      </article>`;
  }

  syncDraft() {
    const root = this.element;
    if (!root) return;
    const get = name => root.querySelector(`[name="${name}"]`);
    this.draft.title = get("title")?.value ?? this.draft.title;
    this.draft.description = get("description")?.value ?? this.draft.description;
    this.draft.kind = get("kind")?.value ?? this.draft.kind;
    this.draft.audience = get("audience")?.value ?? this.draft.audience;
    this.draft.ownerId = get("ownerId")?.value || (this.personalMode ? game.user.id : null);
    this.draft.autoComplete = get("autoComplete")?.value ?? this.draft.autoComplete;
    this.draft.sequential = Boolean(get("sequential")?.checked);
    if (this.draft.audience === "gm") {
      this.draft.revealed = false;
    } else if (get("revealed")) {
      this.draft.revealed = Boolean(get("revealed").checked);
    }

    for (const row of root.querySelectorAll(".sbsqo-objective-editor")) {
      const objective = this.draft.objectives.find(o => o.id === row.dataset.objectiveId);
      if (!objective) continue;
      objective.title = row.querySelector('[name="objective-title"]')?.value ?? objective.title;
      objective.description = row.querySelector('[name="objective-description"]')?.value ?? objective.description;
      objective.required = Boolean(row.querySelector('[name="objective-required"]')?.checked);
      const priorRevealMode = objective.revealMode;
      objective.revealMode = row.querySelector('[name="objective-reveal-mode"]')?.value || "always";
      objective.revealAfterId = row.querySelector('[name="objective-reveal-after"]')?.value || null;
      if (objective.revealMode === "always") objective.revealed = true;
      else if (objective.revealMode === "gm") objective.revealed = false;
      else {
        const revealedInput = row.querySelector('[name="objective-revealed"]');
        if (revealedInput) objective.revealed = Boolean(revealedInput.checked);
        else if (priorRevealMode === "always") objective.revealed = false;
      }
    }
  }

  applyRevealRuleInvariants() {
    // Sequential mode only chooses the default reveal rule when an objective is added.
    // An explicit editor choice must always win when the quest is saved.
    for (const objective of this.draft.objectives) {
      if (objective.revealMode === "always") {
        objective.revealed = true;
        objective.initialRevealed = true;
      } else if (objective.revealMode === "gm") {
        objective.revealed = false;
        objective.initialRevealed = false;
      }
    }
  }

  async onAction(event, action, el) {
    const objectiveId = el.closest("[data-objective-id]")?.dataset.objectiveId;
    this.syncDraft();

    if (action === "cancel") return this.close();
    if (action === "delete-current-quest") {
      const questId = this.draft.id;
      await this.close();
      return confirmDeleteQuest(questId);
    }
    if (action === "add-objective") {
      const index = this.draft.objectives.length;
      this.draft.objectives.push(normalizeObjective({
        id: randomID(),
        title: "",
        required: true,
        revealMode: this.draft.sequential && game.user.isGM && !this.personalMode && index > 0 ? "previous" : "always",
        revealed: !(this.draft.sequential && game.user.isGM && !this.personalMode && index > 0),
        initialRevealed: !(this.draft.sequential && game.user.isGM && !this.personalMode && index > 0)
      }, index));
      return this.render();
    }
    if (action === "remove-objective") {
      this.draft.objectives = this.draft.objectives.filter(o => o.id !== objectiveId);
      return this.render();
    }
    if (action === "move-objective-up" || action === "move-objective-down") {
      const index = this.draft.objectives.findIndex(o => o.id === objectiveId);
      const next = action === "move-objective-up" ? index - 1 : index + 1;
      if (index >= 0 && next >= 0 && next < this.draft.objectives.length) {
        [this.draft.objectives[index], this.draft.objectives[next]] = [this.draft.objectives[next], this.draft.objectives[index]];
      }
      return this.render();
    }
    if (action === "save") {
      if (!this.draft.title.trim()) return ui.notifications.warn("Give the quest a title first.");
      this.applyRevealRuleInvariants();
      this.draft.initialRevealed = this.isNew ? this.draft.revealed : this.draft.initialRevealed;
      for (const objective of this.draft.objectives) {
        if (this.isNew) objective.initialRevealed = objective.revealed;
      }
      const result = await mutate(this.isNew ? "createQuest" : "updateQuest", {
        questId: this.draft.id,
        data: this.draft
      });
      if (result.ok) {
        ui.notifications.info(this.isNew ? "Quest created." : "Quest saved.");
        return this.close();
      }
    }
  }
}

class ConfirmApp extends SBSBaseApplication {
  static DEFAULT_OPTIONS = {
    id: "sbsqo-confirm",
    window: { title: "Confirm" },
    position: { width: 480, height: "auto" }
  };

  constructor({ title, message, confirmText = "Confirm", danger = false, phrase = null, checkboxLabel = null, checkboxDefault = false, onConfirm }) {
    super();
    this.confirmTitle = title;
    this.message = message;
    this.confirmText = confirmText;
    this.danger = danger;
    this.phrase = phrase;
    this.checkboxLabel = checkboxLabel;
    this.checkboxDefault = checkboxDefault;
    this.onConfirm = onConfirm;
  }

  buildHTML() {
    return `<div class="sbsqo-confirm-shell">
      ${brandHeader(this.confirmTitle, "")}
      <div class="sbsqo-confirm-body"><p>${this.message}</p>${this.phrase ? `<label><span>Type <strong>${esc(this.phrase)}</strong> to continue</span><input name="phrase" autocomplete="off"></label>` : ""}${this.checkboxLabel ? `<label class="checkbox-label confirm-checkbox"><input type="checkbox" name="confirm-checkbox" ${this.checkboxDefault ? "checked" : ""}><span>${esc(this.checkboxLabel)}</span></label>` : ""}</div>
      <footer class="sbsqo-editor-footer"><button data-action="cancel">Cancel</button><button class="${this.danger ? "danger" : "primary"}" data-action="confirm">${esc(this.confirmText)}</button></footer>
    </div>`;
  }

  async onAction(event, action) {
    if (action === "cancel") return this.close();
    if (action === "confirm") {
      if (this.phrase && this.element.querySelector('[name="phrase"]')?.value !== this.phrase) return ui.notifications.warn(`Type ${this.phrase} exactly to continue.`);
      const checked = Boolean(this.element.querySelector('[name="confirm-checkbox"]')?.checked);
      await this.onConfirm?.(checked);
      return this.close();
    }
  }
}

function kindOrder(kind) {
  return { main: 0, side: 1, personal: 2 }[kind] ?? 9;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
}

function brandHeader(title, subtitle) {
  return `<header class="sbsqo-brand-header"><img src="${BRAND}" alt="SBS"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div></header>`;
}

function emptyBoard(tab) {
  return `<div class="sbsqo-empty"><img src="${BRAND}" alt=""><h3>${tab === "active" ? "No active quests." : "No completed quests yet."}</h3><p>${tab === "active" ? "The campaign is peaceful. Suspiciously peaceful." : "Go accomplish something heroic, questionable, or both."}</p></div>`;
}

function renderQuestCard(quest, { manager = false } = {}) {
  const tracked = getTrackedQuestId() === quest.id;
  const canEdit = userCanEditQuest(game.user, quest);
  const visibleObjectives = manager ? quest.objectives : quest.objectives.filter(o => userCanSeeObjective(game.user, quest, o));
  const progressObjectives = manager ? quest.objectives : visibleObjectives;
  const hiddenCount = manager ? quest.objectives.filter(o => !userCanSeeObjective({ ...game.user, isGM: false, id: quest.ownerId || "__none" }, quest, o)).length : 0;
  const owner = quest.ownerId ? game.users.get(quest.ownerId)?.name || "Unknown Player" : null;

  const visibilityBadge = quest.audience === "gm"
    ? `<span class="sbsqo-badge secret"><i class="fa-solid fa-user-secret"></i> GM Secret</span>`
    : !quest.revealed
      ? `<span class="sbsqo-badge hidden"><i class="fa-solid fa-eye-slash"></i> Hidden</span>`
      : quest.audience === "private"
        ? `<span class="sbsqo-badge private"><i class="fa-solid fa-lock"></i> ${esc(owner || "Private")}</span>`
        : `<span class="sbsqo-badge visible"><i class="fa-solid fa-users"></i> Party</span>`;

  return `<article class="sbsqo-quest-card ${quest.status !== "active" ? `status-${quest.status}` : ""} ${!quest.revealed || quest.audience === "gm" ? "gm-hidden" : ""}" data-quest-id="${quest.id}">
    <div class="sbsqo-quest-card-header">
      <div class="sbsqo-quest-title-block">
        <div class="sbsqo-quest-kicker">${esc(KIND_LABELS[quest.kind])}</div>
        <h3>${esc(quest.title)}</h3>
        <div class="sbsqo-badges">${manager ? visibilityBadge : ""}${quest.kind === "personal" && owner ? `<span class="sbsqo-badge"><i class="fa-solid fa-user"></i> ${esc(owner)}</span>` : ""}<span class="sbsqo-badge status">${esc(STATUS_LABELS[quest.status])}</span>${quest.sequential ? `<span class="sbsqo-badge"><i class="fa-solid fa-arrow-down-1-9"></i> Sequential</span>` : ""}${hiddenCount ? `<span class="sbsqo-badge hidden">${hiddenCount} hidden objective${hiddenCount === 1 ? "" : "s"}</span>` : ""}</div>
      </div>
      <div class="sbsqo-card-actions">
        <button data-action="track-quest" class="${tracked ? "active" : ""}" title="${tracked ? "Stop Tracking" : "Track Quest"}"><i class="fa-solid fa-thumbtack"></i></button>
        ${canEdit ? `<button data-action="edit-quest" title="Edit Quest"><i class="fa-solid fa-pen"></i></button>` : ""}
      </div>
    </div>
    ${quest.description ? `<div class="sbsqo-quest-description">${nl2br(quest.description)}</div>` : ""}
    <div class="sbsqo-objectives">
      ${visibleObjectives.length ? visibleObjectives.map((o, i) => renderObjective(quest, o, i, manager)).join("") : `<div class="sbsqo-no-objectives">${manager ? (quest.objectives.length ? "All objectives are currently hidden from players." : "No objectives listed.") : "No current objectives."}</div>`}
    </div>
    <footer class="sbsqo-quest-footer">
      <div class="sbsqo-meta">${quest.completedAt ? `Completed ${esc(formatDate(quest.completedAt))}` : `${progressObjectives.filter(o => o.completed).length}/${progressObjectives.length} objectives complete`}</div>
      <div class="sbsqo-card-footer-actions">
        ${quest.status === "active" && canEdit ? `<button data-action="complete-quest"><i class="fa-solid fa-check"></i> Complete</button>` : ""}
        ${quest.status !== "active" && canEdit ? `<button data-action="reactivate-quest"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>` : ""}
        ${manager && quest.status === "active" ? `<button data-action="fail-quest"><i class="fa-solid fa-xmark"></i> Fail</button><button data-action="abandon-quest"><i class="fa-solid fa-person-walking-arrow-right"></i> Abandon</button>` : ""}
        ${manager && quest.audience !== "gm" ? `<button data-action="${quest.revealed ? "hide-quest" : "reveal-quest"}"><i class="fa-solid fa-${quest.revealed ? "eye-slash" : "eye"}"></i> ${quest.revealed ? "Hide" : "Reveal"}</button>` : ""}
        ${canEdit ? `<button data-action="reset-quest"><i class="fa-solid fa-rotate"></i> Reset</button><button class="danger" data-action="delete-quest" title="Delete Quest"><i class="fa-solid fa-trash"></i> Delete Quest</button>` : ""}
      </div>
    </footer>
  </article>`;
}

function renderObjective(quest, objective, index, manager) {
  const canEdit = userCanEditQuest(game.user, quest);
  const isSecret = objective.revealMode === "gm";
  const isHidden = !objective.revealed && !isSecret;
  const classes = [objective.completed ? "complete" : "", manager && (isHidden || isSecret) ? "hidden-objective" : ""].filter(Boolean).join(" ");
  const revealBadge = manager
    ? `<span class="sbsqo-objective-visibility ${isSecret ? "secret" : isHidden ? "hidden" : "visible"}">${isSecret ? "GM Secret" : isHidden ? REVEAL_LABELS[objective.revealMode] : "Visible"}</span>`
    : "";

  return `<div class="sbsqo-objective ${classes}" data-objective-id="${objective.id}">
    <label class="sbsqo-objective-check ${canEdit ? "editable" : ""}">
      <input type="checkbox" ${objective.completed ? "checked" : ""} ${canEdit ? `data-action="toggle-objective"` : "disabled"}>
      <span class="sbsqo-custom-check"><i class="fa-solid fa-check"></i></span>
    </label>
    <div class="sbsqo-objective-text"><div class="sbsqo-objective-title">${objective.required ? "" : `<i class="fa-regular fa-star" title="Optional"></i>`}${esc(objective.title)}</div>${objective.description ? `<div class="sbsqo-objective-description">${nl2br(objective.description)}</div>` : ""}${revealBadge}</div>
    ${manager && !isSecret && objective.revealMode !== "always" ? `<button class="sbsqo-small-button" data-action="${objective.revealed ? "hide-objective" : "reveal-objective"}" title="${objective.revealed ? "Hide Objective" : "Reveal Objective"}"><i class="fa-solid fa-${objective.revealed ? "eye-slash" : "eye"}"></i></button>` : ""}
  </div>`;
}

async function openBoard() {
  // Foundry v13's own Scene Control example uses foundry.applications.instances to
  // locate a currently-rendered ApplicationV2. Use that as the primary source of
  // truth, with our local reference only as a fallback.
  try {
    const registered = foundry.applications?.instances?.get?.("sbsqo-quest-board");
    const existing = registered?.rendered ? registered : (boardApp?.rendered ? boardApp : null);
    if (existing) {
      boardApp = existing;
      if (existing.minimized) await existing.maximize();
      existing.bringToFront();
      return existing;
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not reuse an existing Quest Board; opening a fresh one.`, error);
  }

  // Never try to resurrect a closed instance. A new click gets a new ApplicationV2.
  boardApp = null;
  const app = new QuestBoardApp();
  boardApp = app;
  app.addEventListener("close", () => {
    if (boardApp === app) boardApp = null;
  }, { once: true });

  try {
    await app.render({ force: true });
    app.bringToFront();
    return app;
  } catch (error) {
    if (boardApp === app) boardApp = null;
    console.error(`${MODULE_ID} | Quest Board failed to open.`, error);
    ui.notifications.error("Quests & Objectives could not open the Quest Board. Check the console for details.");
    return null;
  }
}

function openManager() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can open the Quest Manager.");
  managerApp ||= new QuestManagerApp();
  managerApp.render({ force: true });
  return managerApp;
}

function openQuestEditor(questId = null, { personal = false } = {}) {
  const quest = questId ? findQuest(getState(), questId) : null;
  if (questId && !quest) return ui.notifications.warn("Quest not found.");
  if (quest && !userCanEditQuest(game.user, quest)) return ui.notifications.warn("You cannot edit that quest.");
  if (!game.user.isGM && !personal && !quest) return ui.notifications.warn("Players can only create personal quests.");
  editorApp?.close();
  editorApp = new QuestEditorApp(quest, { personal });
  editorApp.render({ force: true });
  return editorApp;
}

async function openTrackedQuest() {
  const id = getTrackedQuestId();
  const quest = findQuest(getState(), id);
  if (!quest || !userCanSeeQuest(game.user, quest)) {
    ui.notifications.warn("You do not currently have a visible tracked quest.");
    return openBoard();
  }
  const app = await openBoard();
  if (!app) return null;
  const card = app.element?.querySelector(`[data-quest-id="${id}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  card?.classList.add("sbsqo-pulse");
  setTimeout(() => card?.classList.remove("sbsqo-pulse"), 1200);
  return app;
}

function confirmDeleteQuest(questId) {
  const quest = findQuest(getState(), questId);
  if (!quest) return;
  new ConfirmApp({
    title: "Delete Quest?",
    message: `Permanently delete <strong>${esc(quest.title)}</strong> and all objectives inside it?`,
    confirmText: "Delete Quest",
    danger: true,
    onConfirm: () => mutate("deleteQuest", { questId })
  }).render({ force: true });
}

function confirmResetQuest(questId) {
  const quest = findQuest(getState(), questId);
  if (!quest) return;
  new ConfirmApp({
    title: "Reset Quest?",
    message: `Reset <strong>${esc(quest.title)}</strong> to its authored starting state? Completion and reveal progress will be cleared.`,
    confirmText: "Reset Quest",
    onConfirm: () => mutate("resetQuest", { questId })
  }).render({ force: true });
}

function confirmResetAll() {
  new ConfirmApp({
    title: "Reset All Campaign Quests?",
    message: `Reset every quest and objective to its authored starting state. By default this resets campaign quests and leaves player-created personal quests alone.`,
    confirmText: "Reset All Quests",
    checkboxLabel: "Also reset player-created personal quests",
    checkboxDefault: false,
    onConfirm: includePersonal => mutate("resetAll", { data: { includePersonal } })
  }).render({ force: true });
}

function confirmClearAll() {
  new ConfirmApp({
    title: "Clear ALL Quests?",
    message: `This permanently removes every campaign quest, personal quest, and every objective nested inside them. This is the orbital strike button.`,
    confirmText: "Clear Everything",
    danger: true,
    phrase: "CLEAR",
    onConfirm: () => mutate("clearAll")
  }).render({ force: true });
}

function registerSettings() {
  game.settings.register(MODULE_ID, "questData", {
    name: "Quest Data",
    scope: "world",
    config: false,
    type: Object,
    default: emptyState(),
    // Core world-setting synchronization is a second path alongside the module socket.
    onChange: value => {
      stateCache = normalizeState(value);
      rerenderAll();
      updateHUD();
    }
  });

  game.settings.register(MODULE_ID, "sceneControlVisibility", {
    name: "Scene Control Visibility",
    hint: "Who sees the dedicated Quests & Objectives control group on the left toolbar?",
    scope: "world",
    config: true,
    type: String,
    choices: {
      everyone: "Everyone",
      gm: "GM Only",
      none: "Nobody"
    },
    default: "everyone",
    requiresReload: true
  });

  game.settings.register(MODULE_ID, "allowPersonalQuests", {
    name: "Allow Player Personal Quests",
    hint: "Players can create and manage their own personal quests, either private or party-visible.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "createMacros", {
    name: "Create SBS Quest Macros",
    hint: "Create the module's four SBS-branded launcher macros in the world Macro directory.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "floatingButton", {
    name: "Floating Quest Button",
    hint: "Show a small SBS quest launcher on your own screen.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => updateHUD()
  });

  game.settings.register(MODULE_ID, "floatingPosition", {
    name: "Floating Button Position",
    scope: "client",
    config: true,
    type: String,
    choices: {
      "top-left": "Top Left",
      "top-right": "Top Right",
      "bottom-left": "Bottom Left",
      "bottom-right": "Bottom Right"
    },
    default: "bottom-left",
    onChange: () => updateHUD()
  });

  game.settings.register(MODULE_ID, "floatingOffsetX", {
    name: "Floating Button Horizontal Offset",
    hint: "Distance in pixels from the chosen screen edge.",
    scope: "client",
    config: true,
    type: Number,
    default: 20,
    onChange: () => updateHUD()
  });

  game.settings.register(MODULE_ID, "floatingOffsetY", {
    name: "Floating Button Vertical Offset",
    hint: "Distance in pixels from the chosen screen edge.",
    scope: "client",
    config: true,
    type: Number,
    default: 120,
    onChange: () => updateHUD()
  });

  game.settings.register(MODULE_ID, "trackedQuestId", {
    name: "Tracked Quest",
    scope: "client",
    config: false,
    type: String,
    default: "",
    onChange: () => updateHUD()
  });

  game.settings.register(MODULE_ID, "trackedHUD", {
    name: "Show Tracked Quest HUD",
    hint: "When you track a quest, show its currently-visible incomplete objectives on the canvas.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => updateHUD()
  });
}

function registerSceneControls(controls) {
  const visibility = game.settings.get(MODULE_ID, "sceneControlVisibility");
  const visible = visibility === "everyone" || (visibility === "gm" && game.user.isGM);
  if (!visible || visibility === "none") return;

  controls.sbsqo = {
    name: "sbsqo",
    title: "SaltyBananaSlug's Quests & Objectives",
    icon: "fa-solid fa-scroll sbsqo-scene-control-icon",
    order: 85,
    visible: true,
    // SceneControl.activeTool must be a persistent tool. Quest Board is a momentary
    // button, so making it the activeTool causes Foundry to consume its state after
    // the first activation. Keep a hidden inert tool active instead.
    activeTool: "sbsqo-anchor",
    onChange: (_event, active) => {
      if (active) void openBoard();
    },
    tools: {
      "sbsqo-anchor": {
        name: "sbsqo-anchor",
        title: "Quest Tools",
        icon: "fa-solid fa-circle",
        order: -100,
        visible: false
      },
      "quest-board": {
        name: "quest-board",
        title: "Open Quest Board",
        icon: "fa-solid fa-list-check sbsqo-quest-board-control-icon",
        order: 0,
        button: true,
        onChange: () => { void openBoard(); }
      },
      "personal-quest": {
        name: "personal-quest",
        title: "Create Personal Quest",
        icon: "fa-solid fa-user-plus",
        order: 1,
        button: true,
        visible: game.settings.get(MODULE_ID, "allowPersonalQuests"),
        onChange: () => { openQuestEditor(null, { personal: true }); }
      },
      "tracked-quest": {
        name: "tracked-quest",
        title: "Open Tracked Quest",
        icon: "fa-solid fa-thumbtack",
        order: 2,
        button: true,
        onChange: () => { void openTrackedQuest(); }
      },
      "new-quest": {
        name: "new-quest",
        title: "Create Campaign Quest",
        icon: "fa-solid fa-square-plus",
        order: 3,
        button: true,
        visible: game.user.isGM,
        onChange: () => { openQuestEditor(null, { personal: false }); }
      },
      "quest-manager": {
        name: "quest-manager",
        title: "Quest Manager",
        icon: "fa-solid fa-screwdriver-wrench",
        order: 4,
        button: true,
        visible: game.user.isGM,
        onChange: () => { openManager(); }
      }
    }
  };
}

function hudPositionStyle(position, x, y) {
  const style = [];
  style.push(position.includes("left") ? `left:${x}px` : `right:${x}px`);
  style.push(position.includes("top") ? `top:${y}px` : `bottom:${y}px`);
  return style.join(";");
}

function updateHUD() {
  document.getElementById("sbsqo-floating-launcher")?.remove();
  document.getElementById("sbsqo-tracked-hud")?.remove();
  if (!game?.ready) return;

  const position = game.settings.get(MODULE_ID, "floatingPosition");
  const x = Number(game.settings.get(MODULE_ID, "floatingOffsetX")) || 0;
  const y = Number(game.settings.get(MODULE_ID, "floatingOffsetY")) || 0;

  if (game.settings.get(MODULE_ID, "floatingButton")) {
    const button = document.createElement("button");
    button.id = "sbsqo-floating-launcher";
    button.className = "sbsqo-floating-launcher";
    button.style.cssText = hudPositionStyle(position, x, y);
    button.innerHTML = `<img src="${BRAND}" alt=""><span class="sbsqo-launcher-badge">${getState().quests.filter(q => q.status === "active" && userCanSeeQuest(game.user, q)).length}</span>`;
    button.title = "Open Quests & Objectives";
    button.addEventListener("click", openBoard);
    document.body.appendChild(button);
  }

  if (!game.settings.get(MODULE_ID, "trackedHUD")) return;
  const trackedId = getTrackedQuestId();
  const quest = findQuest(getState(), trackedId);
  if (!quest || quest.status !== "active" || !userCanSeeQuest(game.user, quest)) return;
  const objectives = quest.objectives.filter(o => userCanSeeObjective(game.user, quest, o) && !o.completed);

  const hud = document.createElement("aside");
  hud.id = "sbsqo-tracked-hud";
  hud.className = `sbsqo-tracked-hud ${position.includes("right") ? "anchor-right" : "anchor-left"}`;
  const hudY = y + (game.settings.get(MODULE_ID, "floatingButton") ? 72 : 0);
  hud.style.cssText = hudPositionStyle(position, x, hudY);
  hud.innerHTML = `<div class="sbsqo-tracked-header"><button class="sbsqo-tracked-title" title="Open Quest"><i class="fa-solid fa-thumbtack"></i><span>${esc(quest.title)}</span></button><button class="sbsqo-untrack" title="Stop Tracking"><i class="fa-solid fa-xmark"></i></button></div><div class="sbsqo-tracked-objectives">${objectives.length ? objectives.slice(0, 5).map(o => `<div><i class="fa-regular fa-square"></i><span>${esc(o.title)}</span></div>`).join("") : `<em>No visible incomplete objectives.</em>`}</div>`;
  hud.querySelector(".sbsqo-tracked-title").addEventListener("click", openTrackedQuest);
  hud.querySelector(".sbsqo-untrack").addEventListener("click", () => setTrackedQuestId(""));
  document.body.appendChild(hud);
}

async function ensureMacros() {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "createMacros")) return;

  let folder = game.folders.find(f => f.type === "Macro" && f.flags?.[MODULE_ID]?.generatedFolder);
  if (!folder) {
    folder = await Folder.create({
      name: "SaltyBananaSlug - Quests & Objectives",
      type: "Macro",
      color: "#d6a82f",
      flags: { [MODULE_ID]: { generatedFolder: true } }
    });
  }

  const specs = [
    {
      key: "board",
      name: "SBS Quests — Quest Board",
      img: `modules/${MODULE_ID}/assets/quest-board.svg`,
      command: `game.modules.get("${MODULE_ID}").api.openBoard();`
    },
    {
      key: "personal",
      name: "SBS Quests — Personal Quest",
      img: `modules/${MODULE_ID}/assets/personal-quest.svg`,
      command: `game.modules.get("${MODULE_ID}").api.createPersonalQuest();`
    },
    {
      key: "tracked",
      name: "SBS Quests — Tracked Quest",
      img: `modules/${MODULE_ID}/assets/tracked-quest.svg`,
      command: `game.modules.get("${MODULE_ID}").api.openTrackedQuest();`
    },
    {
      key: "manager",
      name: "SBS Quests — GM Manager",
      img: `modules/${MODULE_ID}/assets/quest-manager.svg`,
      command: `game.modules.get("${MODULE_ID}").api.openManager();`
    }
  ];

  for (const spec of specs) {
    let macro = game.macros.find(m => m.flags?.[MODULE_ID]?.generatedMacro === spec.key);
    if (!macro) {
      macro = await Macro.create({
        name: spec.name,
        type: "script",
        img: spec.img,
        command: spec.command,
        folder: folder.id,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        flags: { [MODULE_ID]: { generatedMacro: spec.key } }
      });
    } else {
      await macro.update({ name: spec.name, img: spec.img, command: spec.command, folder: folder.id });
    }
  }
}

function exposeAPI() {
  const module = game.modules.get(MODULE_ID);
  module.api = {
    openBoard,
    openManager,
    createPersonalQuest: () => openQuestEditor(null, { personal: true }),
    createCampaignQuest: () => openQuestEditor(null, { personal: false }),
    openTrackedQuest,
    getState,
    mutate
  };
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.on("getSceneControlButtons", registerSceneControls);

Hooks.once("ready", async () => {
  stateCache = normalizeState(game.settings.get(MODULE_ID, "questData"));
  game.socket.on(SOCKET, handleSocket);
  exposeAPI();
  updateHUD();
  await ensureMacros();
  console.log(`${MODULE_ID} | Ready`);
});
