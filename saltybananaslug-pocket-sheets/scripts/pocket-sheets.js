const MODULE_ID = "saltybananaslug-pocket-sheets";
const SETTING_ASSIGNMENTS = "assignments";
const SOCKET = `module.${MODULE_ID}`;

const state = { active: false, actorId: null, sheet: null, manager: null, refreshTimer: null, customTabs: new Map() };
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
const signed = (value) => Number(value || 0) >= 0 ? `+${Number(value || 0)}` : String(Number(value || 0));

function elementOf(value) {
  if (!value) return null;
  if (value instanceof HTMLElement) return value;
  if (value[0] instanceof HTMLElement) return value[0];
  return null;
}

function assignments() { return game.settings.get(MODULE_ID, SETTING_ASSIGNMENTS) ?? {}; }
function currentAssignment() { return assignments()[game.user.id] ?? { enabled: false, actorId: null }; }
function assignedActor() { const a = currentAssignment(); return game.actors.get(a.actorId) ?? game.user.character ?? null; }

function labelFromConfig(group, key, fallback = key) {
  const entry = CONFIG.DND5E?.[group]?.[key];
  const value = typeof entry === "string" ? entry : entry?.label;
  return value ? game.i18n.localize(value) : fallback;
}

function itemCollection(actor, types) { return actor.items.filter((item) => types.includes(item.type)); }
function containerIdOf(item) {
  const container = item.system?.container;
  if (!container) return null;
  if (typeof container === "string") return container;
  return container.id ?? container._id ?? null;
}
function usesLabel(item) {
  const uses = item.system?.uses;
  if (uses?.max !== undefined && uses?.max !== null && uses.max !== "") return `${uses.spent ?? 0}/${uses.max} spent`;
  const quantity = item.system?.quantity;
  if (quantity !== undefined && quantity !== null && Number(quantity) !== 1) return `Qty ${quantity}`;
  return "";
}
function activitiesFor(item) {
  const found = new Map();
  const collect = (activities) => {
    if (!activities) return;
    let entries = [];
    if (Array.isArray(activities)) entries = activities;
    else if (Array.isArray(activities.contents)) entries = activities.contents;
    else if (typeof activities.values === "function") entries = Array.from(activities.values());
    else if (typeof activities === "object") entries = Object.entries(activities).map(([id, activity]) => ({ ...activity, _id: activity?._id ?? id }));
    for (const activity of entries) {
      const id = activity?.id ?? activity?._id;
      if (activity && id && (!found.has(id) || typeof activity.use === "function")) found.set(id, activity);
    }
  };
  collect(item.system?.activities);
  collect(item.activities);
  collect(item._source?.system?.activities);
  return Array.from(found.values());
}
function usableActivities(item) {
  return activitiesFor(item).filter((activity) => activity.visible !== false && activity.canUse !== false);
}

function renderActivityButtons(item, activities) {
  if (!activities.length) return "";
  const button = (activity, { action, method = "", label, icon, secondary = false }) => {
    const id = activity.id ?? activity._id;
    return `<button type="button" class="sbs-pocket-use${secondary ? " secondary" : ""}" data-action="${action}"${method ? ` data-method="${method}"` : ""} data-item-id="${item.id}" data-activity-id="${id}"><i class="fa-solid ${icon}"></i><span>${esc(label)}</span></button>`;
  };
  const attack = activities.find((activity) => activity.type === "attack");
  const healing = activities.find((activity) => activity.type === "heal");
  const damage = attack ?? activities.find((activity) => ["damage", "save"].includes(activity.type));
  const controls = [];

  if (item.type === "spell") {
    const primary = attack ?? activities[0];
    controls.push(button(primary, { action: "use-activity", label: attack ? "Cast & Attack" : "Cast", icon: "fa-wand-sparkles" }));
  } else if (attack) {
    controls.push(button(attack, { action: "use-weapon-attack", label: "Attack", icon: "fa-dice-d20" }));
  } else if (!healing && !damage) {
    const primary = activities[0];
    controls.push(button(primary, { action: "use-activity", label: primary.name || "Use", icon: "fa-dice-d20" }));
  }

  if (healing) controls.push(button(healing, { action: "roll-activity", method: "rollDamage", label: "Healing", icon: "fa-heart", secondary: true }));
  else if (damage) controls.push(button(damage, { action: "roll-activity", method: "rollDamage", label: "Damage", icon: "fa-burst", secondary: true }));
  return controls.join("");
}

function renderItemRow(item, { spell = false, feature = false } = {}) {
  const uses = usesLabel(item);
  const prep = item.system?.preparation;
  const prepared = prep?.mode !== undefined && !["always", "innate", "pact"].includes(prep.mode)
    ? `<button type="button" class="sbs-pocket-mini ${prep.prepared ? "active" : ""}" data-action="toggle-prepared" data-item-id="${item.id}" aria-label="Toggle prepared"><i class="fa-solid fa-bookmark"></i></button>` : "";
  const equipped = !spell && !feature && item.system?.equipped !== undefined
    ? `<button type="button" class="sbs-pocket-mini ${item.system.equipped ? "active" : ""}" data-action="toggle-equipped" data-item-id="${item.id}" aria-label="Toggle equipped"><i class="fa-solid fa-shield"></i></button>` : "";
  const activities = usableActivities(item);
  const useButtons = renderActivityButtons(item, activities);
  return `<article class="sbs-pocket-item" data-item-id="${item.id}">
    <img src="${esc(item.img)}" alt="" draggable="false">
    <div class="sbs-pocket-item-name"><strong>${esc(item.name)}</strong><span>${esc(uses || labelFromConfig("itemTypes", item.type, item.type))}</span></div>
    <div class="sbs-pocket-item-actions">${prepared}${equipped}${useButtons}<button type="button" class="sbs-pocket-description" data-action="item-details" data-item-id="${item.id}"><i class="fa-solid fa-book-open"></i> Expand</button><button type="button" class="sbs-pocket-chat" data-action="item-chat" data-item-id="${item.id}"><i class="fa-solid fa-comment"></i> Chat</button></div>
    <div class="sbs-pocket-item-details" hidden></div>
  </article>`;
}

function section(title, contents, empty = "Nothing here.") { return `<section class="sbs-pocket-card"><h3>${esc(title)}</h3>${contents || `<p class="sbs-pocket-empty">${esc(empty)}</p>`}</section>`; }

function renderContainerTree(actor, item, seen = new Set()) {
  if (seen.has(item.id)) return "";
  const branch = new Set(seen);
  branch.add(item.id);
  const children = actor.items.filter((child) => containerIdOf(child) === item.id);
  const row = renderItemRow(item, { spell: item.type === "spell", feature: ["feat", "class", "subclass", "race", "background"].includes(item.type) });
  if (!children.length) return row;
  return `<div class="sbs-pocket-container-tree">${row}<div class="sbs-pocket-container-contents"><h4><i class="fa-solid fa-box-open"></i> Contents</h4>${children.map((child) => renderContainerTree(actor, child, branch)).join("")}</div></div>`;
}

function renderAttributes(actor) {
  const system = actor.system;
  const hp = system.attributes?.hp ?? {};
  const movement = system.attributes?.movement ?? {};
  const speed = Object.entries(movement).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0).map(([k, v]) => `${labelFromConfig("movementTypes", k, k)} ${v}`).join(" · ") || "—";
  const abilities = Object.entries(system.abilities ?? {}).map(([key, a]) => {
    const proficient = Number(a.proficient ?? a.save?.proficient ?? a.saveProficient ?? 0) > 0;
    return `<article class="sbs-pocket-ability"><strong>${esc(labelFromConfig("abilities", key, key.toUpperCase()))}</strong><span class="score">${a.value ?? "—"}</span><button type="button" data-action="roll-ability" data-key="${key}">Check</button><button type="button" class="sbs-pocket-save ${proficient ? "proficient" : ""}" data-action="roll-save" data-key="${key}">${proficient ? '<i class="fa-solid fa-circle-check"></i> ' : ""}Save</button>${proficient ? '<small class="sbs-pocket-save-prof">Proficient</small>' : ""}</article>`;
  }).join("");
  const skills = Object.entries(system.skills ?? {}).map(([key, s]) => `<button type="button" class="sbs-pocket-skill" data-action="roll-skill" data-key="${key}"><span>${esc(labelFromConfig("skills", key, key))}</span><strong>${signed(s.total ?? s.mod)}</strong><small>Passive ${s.passive ?? "—"}</small></button>`).join("");
  const death = system.attributes?.death ?? {};
  const success = Number(death.success ?? 0), failure = Number(death.failure ?? 0);
  const pip = (filled, kind) => Array.from({ length: 3 }, (_, index) => `<i class="fa-${index < filled ? "solid" : "regular"} fa-circle ${kind}"></i>`).join("");
  const deathSaves = Number(hp.value ?? 0) <= 0 || success > 0 || failure > 0
    ? section("Death Saves", `<div class="sbs-pocket-death"><div><span>Successes</span><b>${pip(success, "success")}</b></div><div><span>Failures</span><b>${pip(failure, "failure")}</b></div><button type="button" data-action="roll-death-save"><i class="fa-solid fa-heart-crack"></i> Roll Death Save</button></div>`)
    : "";
  return `<section class="sbs-pocket-hero"><img src="${esc(actor.img)}" alt="${esc(actor.name)}" draggable="false"><div><h2>${esc(actor.name)}</h2><p>${esc(system.details?.race?.name ?? system.details?.race ?? "")} ${system.details?.level ? `· Level ${system.details.level}` : ""}</p></div></section>
    <section class="sbs-pocket-vitals"><label><span>HP</span><input inputmode="numeric" type="number" data-update-path="system.attributes.hp.value" value="${Number(hp.value ?? 0)}"><b>/ ${esc(hp.max ?? "—")}</b></label><label><span>Temp</span><input inputmode="numeric" type="number" data-update-path="system.attributes.hp.temp" value="${Number(hp.temp ?? 0)}"></label><div><span>AC</span><strong>${system.attributes?.ac?.value ?? "—"}</strong></div><button type="button" data-action="roll-initiative"><span>Initiative</span><strong>${signed(system.attributes?.init?.total ?? system.attributes?.init?.mod)}</strong></button><div><span>Speed</span><strong>${esc(speed)}</strong></div><div><span>Proficiency</span><strong>${signed(system.attributes?.prof)}</strong></div></section>
    ${deathSaves}${section("Abilities", `<div class="sbs-pocket-abilities">${abilities}</div>`)}${section("Skills", `<div class="sbs-pocket-skills">${skills}</div>`)}`;
}

function renderInventory(actor) {
  const groups = [["Weapons", ["weapon"]], ["Equipment", ["equipment"]], ["Consumables", ["consumable"]], ["Tools", ["tool"]], ["Containers", ["container"]], ["Other", ["loot", "backpack"]]];
  return groups.map(([title, types]) => {
    const items = itemCollection(actor, types).filter((item) => !containerIdOf(item));
    const rows = items.map((item) => item.type === "container" ? renderContainerTree(actor, item) : renderItemRow(item)).join("");
    return rows ? section(title, `<div class="sbs-pocket-list">${rows}</div>`) : "";
  }).join("") || section("Inventory", "", "No carried items.");
}
function renderFeatures(actor) { const rows = itemCollection(actor, ["feat", "class", "subclass", "race", "background"]).map((i) => renderItemRow(i, { feature: true })).join(""); return section("Features", `<div class="sbs-pocket-list">${rows}</div>`, "No features."); }

function spellSlots(actor) {
  return Object.entries(actor.system.spells ?? {}).filter(([, s]) => s?.max || s?.override).map(([key, s]) => `<label class="sbs-pocket-slot"><span>${esc(key === "pact" ? "Pact" : key.replace("spell", "Level "))}</span><input inputmode="numeric" type="number" data-update-path="system.spells.${key}.value" value="${Number(s.value ?? 0)}"><b>/ ${esc(s.max ?? s.override ?? 0)}</b></label>`).join("");
}
function renderSpells(actor) {
  const groups = new Map();
  for (const item of itemCollection(actor, ["spell"])) { const level = Number(item.system.level ?? 0); groups.set(level, [...(groups.get(level) ?? []), item]); }
  const slots = spellSlots(actor);
  const lists = Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([level, items]) => section(level ? `Level ${level}` : "Cantrips", `<div class="sbs-pocket-list">${items.map((i) => renderItemRow(i, { spell: true })).join("")}</div>`)).join("");
  return `${slots ? section("Spell Slots", `<div class="sbs-pocket-slots">${slots}</div>`) : ""}${lists || section("Spells", "", "No spells.")}`;
}
function renderEffects(actor) {
  const rows = actor.effects.map((e) => `<article class="sbs-pocket-effect"><img src="${esc(e.img)}" alt="" draggable="false"><div><strong>${esc(e.name)}</strong><span>${e.disabled ? "Inactive" : "Active"}</span></div><button type="button" class="sbs-pocket-mini ${e.disabled ? "" : "active"}" data-action="toggle-effect" data-effect-id="${e.id}" aria-label="Toggle effect"><i class="fa-solid fa-power-off"></i></button></article>`).join("");
  return section("Effects", `<div class="sbs-pocket-list">${rows}</div>`, "No effects.");
}
function traitValue(value) {
  if (value == null || value === "" || value === false) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Set) return Array.from(value).join(", ");
  if (typeof value === "object") { const selected = value.value instanceof Set ? Array.from(value.value) : Array.isArray(value.value) ? value.value : []; return [...selected, value.custom].filter(Boolean).join(", "); }
  return String(value);
}
function renderTraits(actor) { const rows = Object.entries(actor.system.traits ?? {}).map(([key, value]) => { const text = traitValue(value); return text ? `<div class="sbs-pocket-trait"><strong>${esc(labelFromConfig("characterFlags", key, key))}</strong><span>${esc(text)}</span></div>` : ""; }).join(""); return section("Special Traits", `<div class="sbs-pocket-traits">${rows}</div>`, "No visible special traits."); }
function renderBastions(actor) {
  const items = actor.items.filter((i) => ["facility", "bastion"].includes(i.type)).map((i) => renderItemRow(i, { feature: true })).join("");
  let facts = "";
  if (actor.system.bastion && typeof actor.system.bastion === "object") facts = Object.entries(foundry.utils.flattenObject(actor.system.bastion)).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v) && v !== "").slice(0, 40).map(([k, v]) => `<div class="sbs-pocket-trait"><strong>${esc(k.split(".").at(-1))}</strong><span>${esc(v)}</span></div>`).join("");
  return `${facts ? section("Bastion", `<div class="sbs-pocket-traits">${facts}</div>`) : ""}${section("Facilities", `<div class="sbs-pocket-list">${items}</div>`, "No bastion facilities are available.")}`;
}
async function renderBiography(actor) {
  const raw = actor.system.details?.biography?.value ?? actor.system.details?.biography ?? "";
  const enriched = raw ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(String(raw), { async: true, relativeTo: actor }) : "";
  return section("Biography", `<div class="sbs-pocket-prose">${enriched}</div>`, "No biography.");
}

class PocketSheet extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "sbs-pocket-mobile-sheet", classes: ["sbs-pocket-mobile"], window: { title: "Pocket Sheets", frame: false }, position: { width: 480, height: 800 } };
  constructor(actor, options = {}) { super(options); this.actor = actor; this.activeTab = "attributes"; this.scrollPositions = new Map(); this._railAbort = null; }
  async _renderHTML() {
    const showTraits = game.settings.get(MODULE_ID, "showSpecialTraits");
    const hasBastion = Boolean(this.actor.system.bastion) || this.actor.items.some((i) => ["facility", "bastion"].includes(i.type));
    const tabs = [
      { id: "attributes", label: "Attributes", icon: "fa-solid fa-shield-halved", render: () => renderAttributes(this.actor) },
      { id: "inventory", label: "Inventory", icon: "fa-solid fa-backpack", render: () => renderInventory(this.actor) },
      { id: "features", label: "Features", icon: "fa-solid fa-star", render: () => renderFeatures(this.actor) },
      { id: "spellbook", label: "Spellbook", icon: "fa-solid fa-book-sparkles", render: () => renderSpells(this.actor) },
      { id: "effects", label: "Effects", icon: "fa-solid fa-bolt", render: () => renderEffects(this.actor) },
      ...(hasBastion ? [{ id: "bastions", label: "Bastions", icon: "fa-solid fa-castle", render: () => renderBastions(this.actor) }] : []),
      ...(showTraits ? [{ id: "traits", label: "Special Traits", icon: "fa-solid fa-list-check", render: () => renderTraits(this.actor) }] : []),
      { id: "biography", label: "Biography", icon: "fa-solid fa-scroll", render: () => renderBiography(this.actor) }
    ];
    for (const tab of state.customTabs.values()) if (!tab.visible || await tab.visible(this.actor, game.user)) tabs.push(tab);
    if (!tabs.some((t) => t.id === this.activeTab)) this.activeTab = tabs[0].id;
    const nav = tabs.map((t) => `<button type="button" class="${t.id === this.activeTab ? "active" : ""}" data-action="change-tab" data-tab="${esc(t.id)}"><i class="${esc(t.icon || "fa-solid fa-puzzle-piece")}"></i><span>${esc(t.label)}</span></button>`).join("");
    const panels = (await Promise.all(tabs.map(async (t) => `<section class="sbs-pocket-panel ${t.id === this.activeTab ? "active" : ""}" data-panel="${esc(t.id)}">${await t.render(this.actor, game.user)}</section>`))).join("");
    const version = game.modules.get(MODULE_ID)?.version ?? "0.3.1";
    return `<header class="sbs-pocket-mobile-header"><img src="modules/${MODULE_ID}/assets/pocket-sheets.svg" alt="" draggable="false"><div><strong>Pocket Sheets</strong><span>${esc(this.actor.name)}</span></div><i class="fa-solid fa-wifi" title="Connected"></i></header><nav class="sbs-pocket-mobile-tabs">${nav}</nav><main class="sbs-pocket-mobile-content">${panels}</main><footer class="sbs-pocket-mobile-footer">SaltyBananaSlug's Pocket Sheets <span>v${esc(version)}</span></footer><aside class="sbs-pocket-rail" aria-label="Sheet scroll controls"><button type="button" data-rail="top"><i class="fa-solid fa-chevron-up"></i></button><div class="sbs-pocket-track"><div class="sbs-pocket-thumb"></div></div><button type="button" data-rail="bottom"><i class="fa-solid fa-chevron-down"></i></button></aside>`;
  }
  _replaceHTML(result, content) { content.innerHTML = result; }
  _onRender(context, options) {
    super._onRender(context, options);
    const root = elementOf(this.element); if (!root) return;
    root.querySelectorAll("[draggable]").forEach((n) => n.removeAttribute("draggable"));
    for (const type of ["dragstart", "dragenter", "dragover", "drop"]) root.addEventListener(type, (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, { capture: true });
    let pointer = null, suppressUntil = 0;
    root.addEventListener("pointerdown", (e) => { if (!e.target.closest(".sbs-pocket-rail")) pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; }, { capture: true });
    root.addEventListener("pointermove", (e) => { if (pointer?.id === e.pointerId && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 9) pointer.moved = true; }, { capture: true });
    root.addEventListener("pointerup", (e) => { if (pointer?.id === e.pointerId) { if (pointer.moved) suppressUntil = performance.now() + 650; pointer = null; } }, { capture: true });
    root.addEventListener("click", (e) => { if (performance.now() < suppressUntil && !e.target.closest(".sbs-pocket-rail")) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true });
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("change", (e) => this._onChange(e));
    this._installRail(root);
    const content = root.querySelector(".sbs-pocket-mobile-content"); if (content) content.scrollTop = this.scrollPositions.get(this.activeTab) ?? 0;
  }
  async _onClick(event) {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const action = button.dataset.action; const key = button.dataset.key; const item = this.actor.items.get(button.dataset.itemId);
    try {
      if (action === "change-tab") return this.changeTab(button.dataset.tab);
      if (action === "roll-ability") return await this._runAndClosePrompt(() => this.actor.rollAbilityCheck?.({ ability: key, event }));
      if (action === "roll-save") return await this._runAndClosePrompt(() => this.actor.rollSavingThrow?.({ ability: key, event }));
      if (action === "roll-skill") return await this._runAndClosePrompt(() => this.actor.rollSkill?.({ skill: key, event }));
      if (action === "roll-initiative") return await this._runAndClosePrompt(() => this.actor.rollInitiativeDialog?.({ event }));
      if (action === "roll-death-save") return this._rollDeathSave(event);
      if (action === "use-activity" && item) return await this._useActivity(item, button.dataset.activityId, event);
      if (action === "use-weapon-attack" && item) return await this._useWeaponAttack(item, button.dataset.activityId, event);
      if (action === "roll-activity" && item) return await this._rollActivity(item, button.dataset.activityId, button.dataset.method, event);
      if (action === "item-details" && item) return this._toggleDetails(button.closest(".sbs-pocket-item"), item);
      if (action === "item-chat" && item) return await this._postItemToChat(item);
      if (action === "toggle-equipped" && item) return item.update({ "system.equipped": !item.system.equipped });
      if (action === "toggle-prepared" && item) return item.update({ "system.preparation.prepared": !item.system.preparation.prepared });
      if (action === "toggle-effect") { const effect = this.actor.effects.get(button.dataset.effectId); if (effect) return effect.update({ disabled: !effect.disabled }); }
    } catch (error) { console.error(`${MODULE_ID} | Action failed`, error); ui.notifications.error(`Pocket Sheets could not complete that action: ${error.message}`); }
  }
  async _rollDeathSave(event) {
    if (typeof this.actor.rollDeathSave === "function") return this.actor.rollDeathSave({ event });
    if (typeof this.actor.rollDeathSavingThrow === "function") return this.actor.rollDeathSavingThrow({ event });
    ui.notifications.warn("Death saves are unavailable on this dnd5e version.");
  }
  async _useActivity(item, activityId, event) {
    const activity = item.system?.activities?.get?.(activityId)
      ?? item.activities?.get?.(activityId)
      ?? activitiesFor(item).find((entry) => (entry.id ?? entry._id) === activityId);
    if (!activity) return ui.notifications.warn(`${item.name} no longer has that activity.`);
    if (typeof activity.use === "function") return this._runAndClosePrompt(() => activity.use({ event, legacy: false }));
    const macroRoll = globalThis.dnd5e?.documents?.macro?.rollItem;
    if (typeof macroRoll === "function") return this._runAndClosePrompt(() => macroRoll(item.name, { event, activityName: activity.name }));
    if (typeof item.use === "function") return this._runAndClosePrompt(() => item.use({ event, legacy: false, activityId }));
    ui.notifications.warn(`${item.name}: ${activity.name || "activity"} cannot be used on this dnd5e version.`);
  }
  async _rollActivity(item, activityId, method, event) {
    const activity = item.system?.activities?.get?.(activityId)
      ?? item.activities?.get?.(activityId)
      ?? activitiesFor(item).find((entry) => (entry.id ?? entry._id) === activityId);
    if (!activity || typeof activity[method] !== "function") return ui.notifications.warn(`${item.name} has no ${method === "rollDamage" ? "damage" : "roll"} action.`);
    return await this._runAndClosePrompt(() => activity[method]({ event }, {}, {}));
  }
  async _useWeaponAttack(item, activityId, event) {
    const prepared = item.system?.activities;
    const activities = prepared?.contents ?? (typeof prepared?.values === "function" ? Array.from(prepared.values()) : []);
    const activity = activities.find((entry) => (entry.id === activityId) && (entry.type === "attack"))
      ?? activities.find((entry) => entry.type === "attack")
      ?? activitiesFor(item).find((entry) => (entry.id ?? entry._id) === activityId && entry.type === "attack");
    if (!activity || typeof activity.use !== "function") {
      return ui.notifications.error(`${item.name} has no usable prepared attack activity.`);
    }

    let hookId;
    const removeHook = () => {
      if (hookId !== undefined) Hooks.off("dnd5e.rollAttackV2", hookId);
      hookId = undefined;
    };
    hookId = Hooks.on("dnd5e.rollAttackV2", (rolls, context) => {
      if (context?.subject?.item?.id !== item.id) return;
      removeHook();
      window.setTimeout(() => this._closeNativePrompts(), 100);
    });
    window.setTimeout(removeHook, 120000);
    try {
      // Create the native activity card but suppress its unreliable asynchronous auto-action.
      const results = await activity.use({ event, legacy: false, subsequentActions: false });
      const message = results?.message;
      if (!message) {
        removeHook();
        return ui.notifications.error(`${item.name} did not create an attack activity message.`);
      }

      // Press the real Attack control rendered on dnd5e's chat card whenever it is mounted.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const cardButton = document.querySelector(`[data-message-id="${message.id}"] [data-action="rollAttack"]`);
      if (cardButton) {
        cardButton.click();
        return results;
      }

      // Pocket Mode can keep the chat log unmounted. Invoke the exact handler registered to that same card button.
      const messageActivity = message.getAssociatedActivity?.() ?? activity;
      const handler = messageActivity.metadata?.usage?.actions?.rollAttack;
      if (typeof handler !== "function") {
        removeHook();
        return ui.notifications.error(`${item.name}'s dnd5e chat card has no Attack handler.`);
      }
      const target = document.createElement("button");
      target.dataset.action = "rollAttack";
      handler.call(messageActivity, event, target, message);
      return results;
    } catch (error) {
      removeHook();
      throw error;
    }
  }
  async _runAndClosePrompt(action) {
    const result = await action();
    window.setTimeout(() => this._closeNativePrompts(), 100);
    return result;
  }
  _closeNativePrompts() {
    for (const prompt of document.querySelectorAll(".activity-usage, .activity-choice, .roll-configuration")) {
      const app = prompt.matches(".application, .app") ? prompt : prompt.closest(".application, .app");
      if (!app || app.offsetParent === null) continue;
      const close = app.querySelector(":scope > .window-header [data-action='close'], :scope > header [data-action='close'], .window-header .close");
      close?.click();
    }
  }
  async _toggleDetails(row, item) {
    const details = row.querySelector(".sbs-pocket-item-details"); if (!details) return;
    if (!details.hidden) { details.hidden = true; return; }
    const raw = item.system.description?.value ?? item.system.description ?? "No description.";
    details.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(String(raw), { async: true, relativeTo: item }); details.hidden = false; this._updateRail();
  }
  async _postItemToChat(item) {
    if (typeof item.displayCard === "function") return item.displayCard();
    const raw = item.system.description?.value ?? item.system.description ?? "No description.";
    const content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(String(raw), { async: true, relativeTo: item });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<h3>${esc(item.name)}</h3>${content}` });
  }
  async _onChange(event) { const input = event.target.closest("[data-update-path]"); if (input) await this.actor.update({ [input.dataset.updatePath]: input.type === "number" ? Number(input.value) : input.value }); }
  changeTab(tab) {
    const root = elementOf(this.element); const content = root?.querySelector(".sbs-pocket-mobile-content"); if (content) this.scrollPositions.set(this.activeTab, content.scrollTop); this.activeTab = tab;
    root?.querySelectorAll(".sbs-pocket-mobile-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab)); root?.querySelectorAll(".sbs-pocket-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab)); if (content) content.scrollTop = this.scrollPositions.get(tab) ?? 0; this._updateRail();
  }
  _installRail(root) {
    this._railAbort?.abort(); const abort = new AbortController(); this._railAbort = abort;
    const content = root.querySelector(".sbs-pocket-mobile-content"), track = root.querySelector(".sbs-pocket-track"), thumb = root.querySelector(".sbs-pocket-thumb"); if (!content || !track || !thumb) return;
    let dragging = false, offset = 0;
    const move = (y) => { const rect = track.getBoundingClientRect(), travel = Math.max(1, rect.height - thumb.offsetHeight), top = Math.max(0, Math.min(travel, y - rect.top - offset)); content.scrollTop = (top / travel) * Math.max(0, content.scrollHeight - content.clientHeight); };
    thumb.addEventListener("pointerdown", (e) => { dragging = true; offset = e.clientY - thumb.getBoundingClientRect().top; thumb.setPointerCapture(e.pointerId); e.preventDefault(); }, { signal: abort.signal });
    thumb.addEventListener("pointermove", (e) => { if (dragging) { move(e.clientY); e.preventDefault(); } }, { signal: abort.signal });
    thumb.addEventListener("pointerup", (e) => { dragging = false; if (thumb.hasPointerCapture?.(e.pointerId)) thumb.releasePointerCapture(e.pointerId); }, { signal: abort.signal });
    track.addEventListener("pointerdown", (e) => { if (e.target !== thumb) { offset = thumb.offsetHeight / 2; move(e.clientY); e.preventDefault(); } }, { signal: abort.signal });
    root.querySelector("[data-rail='top']").addEventListener("click", () => content.scrollTo({ top: 0, behavior: "smooth" }), { signal: abort.signal }); root.querySelector("[data-rail='bottom']").addEventListener("click", () => content.scrollTo({ top: content.scrollHeight, behavior: "smooth" }), { signal: abort.signal }); content.addEventListener("scroll", () => { this.scrollPositions.set(this.activeTab, content.scrollTop); this._updateRail(); }, { passive: true, signal: abort.signal }); this._updateRail();
  }
  _updateRail() {
    const root = elementOf(this.element), content = root?.querySelector(".sbs-pocket-mobile-content"), track = root?.querySelector(".sbs-pocket-track"), thumb = root?.querySelector(".sbs-pocket-thumb"); if (!content || !track || !thumb) return;
    const max = Math.max(0, content.scrollHeight - content.clientHeight), height = Math.max(44, track.clientHeight * Math.min(1, content.clientHeight / Math.max(1, content.scrollHeight))), travel = Math.max(0, track.clientHeight - height); thumb.style.height = `${height}px`; thumb.style.transform = `translateY(${max ? (content.scrollTop / max) * travel : 0}px)`; root.querySelector(".sbs-pocket-rail")?.classList.toggle("no-scroll", max < 2);
  }
  async close(options = {}) { if (state.active && !options.force) return this; this._railAbort?.abort(); return super.close(options); }
}

class PocketManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "sbs-pocket-manager", classes: ["sbs-pocket-manager"], tag: "form", window: { title: "SaltyBananaSlug's Pocket Sheets", icon: "fa-solid fa-mobile-screen-button", resizable: true }, position: { width: 620, height: 650 } };
  async _renderHTML() {
    const saved = assignments(), players = game.users.filter((u) => !u.isGM), actors = game.actors.filter((a) => a.type === "character");
    const rows = players.map((user) => { const a = saved[user.id] ?? {}, actorId = a.actorId ?? user.character?.id ?? ""; const options = actors.map((actor) => `<option value="${actor.id}" ${actor.id === actorId ? "selected" : ""}>${esc(actor.name)}${actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) ? "" : " — not owned"}</option>`).join(""); return `<div class="sbs-pocket-user-row" data-user-id="${user.id}"><img src="${esc(user.avatar)}" alt=""><div class="sbs-pocket-user-name"><strong>${esc(user.name)}</strong><span class="${user.active ? "online" : "offline"}"><i class="fa-${user.active ? "solid" : "regular"} fa-circle"></i> ${user.active ? "Online" : "Offline"}</span></div><label class="sbs-pocket-toggle"><input type="checkbox" name="enabled" ${a.enabled ? "checked" : ""}><span>Pocket Mode</span></label><select name="actorId"><option value="">— Choose character —</option>${options}</select></div>`; }).join("");
    return `<section class="sbs-pocket-manager-body"><header><img src="modules/${MODULE_ID}/assets/pocket-sheets.svg" alt=""><div><h2>Pocket Sheets</h2><p>Assign a character and enable phone mode per player.</p></div></header><div class="sbs-pocket-manager-note"><i class="fa-solid fa-shield-halved"></i><span>Players need Owner permission for their assigned Actor.</span></div><div class="sbs-pocket-user-list">${rows || "<p>No player users exist yet.</p>"}</div><footer><button type="button" data-disable-all><i class="fa-solid fa-mobile-screen"></i> Disable All</button><button type="submit" class="save"><i class="fa-solid fa-floppy-disk"></i> Save &amp; Apply</button></footer></section>`;
  }
  _replaceHTML(result, content) { content.innerHTML = result; }
  _onRender(context, options) { super._onRender(context, options); const root = elementOf(this.element); root?.querySelector("[data-disable-all]")?.addEventListener("click", () => root.querySelectorAll("input[name='enabled']").forEach((i) => { i.checked = false; })); root?.addEventListener("submit", async (e) => { e.preventDefault(); await this.save(root); }); }
  async save(root) {
    const next = {}; let invalid = false;
    for (const row of root.querySelectorAll(".sbs-pocket-user-row")) { const user = game.users.get(row.dataset.userId), enabled = row.querySelector("[name='enabled']").checked, actorId = row.querySelector("[name='actorId']").value || null, actor = game.actors.get(actorId); if (enabled && (!actor || !actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))) { row.classList.add("invalid"); invalid = true; continue; } row.classList.remove("invalid"); next[user.id] = { enabled, actorId }; }
    if (invalid) return ui.notifications.error("Every enabled player needs an assigned Actor they own."); await game.settings.set(MODULE_ID, SETTING_ASSIGNMENTS, next); game.socket.emit(SOCKET, { type: "refresh", userIds: Object.keys(next) }); ui.notifications.info("Pocket Sheet assignments saved.");
  }
}

function openManager() { if (game.user.isGM) { state.manager ??= new PocketManager(); state.manager.render({ force: true }); } }
function addManagerButton(html) { if (!game.user.isGM) return; const root = elementOf(html); if (!root || root.querySelector(".sbs-pocket-manager-button")) return; const header = root.querySelector(".directory-header .header-actions") ?? root.querySelector(".directory-header"); if (!header) return; const button = document.createElement("button"); button.type = "button"; button.className = "sbs-pocket-manager-button"; button.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> Pocket Sheets'; button.addEventListener("click", openManager); header.append(button); }
function scheduleRefresh(actorId) { if (!state.active || actorId !== state.actorId) return; clearTimeout(state.refreshTimer); state.refreshTimer = setTimeout(() => state.sheet?.render({ force: true }), 180); }
async function enterPocketMode() {
  if (game.user.isGM) return; const assignment = currentAssignment(); if (!assignment.enabled) return leavePocketMode(); const actor = assignedActor(); if (!actor?.isOwner) return ui.notifications.error("Pocket Sheets needs an assigned character you own.", { permanent: true });
  if (state.sheet && state.actorId !== actor.id) await state.sheet.close({ force: true }); state.active = true; state.actorId = actor.id; document.body.classList.add("sbs-pocket-mode"); state.sheet ??= new PocketSheet(actor); state.sheet.actor = actor; state.sheet.render({ force: true });
}
async function leavePocketMode() { state.active = false; state.actorId = null; clearTimeout(state.refreshTimer); document.body.classList.remove("sbs-pocket-mode"); if (state.sheet) await state.sheet.close({ force: true }); state.sheet = null; }
function registerTab(tab) { if (!tab?.id || !tab?.label || typeof tab.render !== "function") throw new Error("Pocket Sheets tabs require id, label, and render."); state.customTabs.set(tab.id, tab); if (state.active) scheduleRefresh(state.actorId); }
async function ensureLauncherMacro() { if (!game.user.isGM) return; const command = `game.modules.get('${MODULE_ID}').api.openManager();`; const existing = game.macros.find((m) => m.getFlag(MODULE_ID, "launcher") || m.name === "SaltyBananaSlug's Pocket Sheets"); if (existing) return existing.update({ command, img: `modules/${MODULE_ID}/assets/pocket-sheets.svg` }); return Macro.create({ name: "SaltyBananaSlug's Pocket Sheets", type: "script", img: `modules/${MODULE_ID}/assets/pocket-sheets.svg`, command, flags: { [MODULE_ID]: { launcher: true } } }); }

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_ASSIGNMENTS, { name: "Pocket assignments", scope: "world", config: false, type: Object, default: {}, onChange: () => setTimeout(enterPocketMode, 50) });
  game.settings.register(MODULE_ID, "showSpecialTraits", { name: "Show Special Traits to Pocket Players", hint: "Special Traits can contain GM-facing configuration. Leave disabled unless players should see that page.", scope: "world", config: true, type: Boolean, default: false });
  game.settings.registerMenu(MODULE_ID, "manager", { name: "Pocket Sheets Manager", label: "Open Pocket Sheets Manager", hint: "Assign characters and enable Pocket Mode for players.", icon: "fa-solid fa-mobile-screen-button", type: PocketManager, restricted: true });
});
Hooks.once("ready", () => {
  game.socket.on(SOCKET, (m) => { if (m?.type === "refresh" && (!m.userIds?.length || m.userIds.includes(game.user.id))) enterPocketMode(); }); game.modules.get(MODULE_ID).api = { openManager, enterPocketMode, leavePocketMode, registerTab }; ensureLauncherMacro().catch((e) => console.error(`${MODULE_ID} | Launcher macro failed`, e)); setTimeout(enterPocketMode, 400);
});
Hooks.on("renderActorDirectory", (_app, html) => addManagerButton(html));
Hooks.on("renderSidebarTab", (app, html) => { if (`${app?.constructor?.name} ${app?.tabName}`.toLowerCase().includes("actor")) addManagerButton(html); });
Hooks.on("updateActor", (a) => scheduleRefresh(a.id));
Hooks.on("createItem", (i) => scheduleRefresh(i.parent?.id)); Hooks.on("updateItem", (i) => scheduleRefresh(i.parent?.id)); Hooks.on("deleteItem", (i) => scheduleRefresh(i.parent?.id));
Hooks.on("createActiveEffect", (e) => scheduleRefresh(e.parent?.id)); Hooks.on("updateActiveEffect", (e) => scheduleRefresh(e.parent?.id)); Hooks.on("deleteActiveEffect", (e) => scheduleRefresh(e.parent?.id));
Hooks.on("createChatMessage", (message) => { if (!state.active || message.author?.id !== game.user.id) return; const root = elementOf(state.sheet?.element); if (!root) return; root.querySelector(".sbs-pocket-roll-toast")?.remove(); const toast = document.createElement("div"); toast.className = "sbs-pocket-roll-toast"; toast.innerHTML = `<span>${esc(message.flavor || message.speaker?.alias || "Roll")}</span><strong>${Number.isFinite(message.rolls?.[0]?.total) ? message.rolls[0].total : "Rolled"}</strong>`; root.append(toast); requestAnimationFrame(() => toast.classList.add("show")); setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 200); }, 2400); });
