const MODULE_ID = "saltybananaslugs-factions";
const MODULE_TITLE = "SaltyBananaSlug's Factions";
const DB_NAME = "SBS Factions Database";
const DEFAULT_IMAGE = `modules/${MODULE_ID}/assets/factions-logo.svg`;
const AppBase = foundry.appv1.api.Application;
const clone = value => foundry.utils.deepClone(value);
const clampScore = value => Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
const nowIso = () => new Date().toISOString();
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\'":"&#039;","\"":"&quot;"}[c]));
const rid = () => foundry.utils.randomID();

const STANDARD_FAVOR = [
  { id: "hated", name: "Hated" },
  { id: "unfriendly", name: "Unfriendly" },
  { id: "neutral", name: "Neutral" },
  { id: "friendly", name: "Friendly" },
  { id: "favored", name: "Favored" },
  { id: "beloved", name: "Beloved" }
];

const DEFAULT_TIERS = [
  { id: "hostile", min: -100, name: "Hostile", merchantFavorId: "hated", disposition: -1, tone: "negative" },
  { id: "unfriendly", min: -60, name: "Unfriendly", merchantFavorId: "unfriendly", disposition: 0, tone: "negative" },
  { id: "neutral", min: -20, name: "Neutral", merchantFavorId: "neutral", disposition: 0, tone: "neutral" },
  { id: "friendly", min: 21, name: "Friendly", merchantFavorId: "friendly", disposition: 0, tone: "positive" },
  { id: "favored", min: 51, name: "Favored", merchantFavorId: "favored", disposition: 1, tone: "positive" },
  { id: "allied", min: 81, name: "Allied", merchantFavorId: "beloved", disposition: 1, tone: "positive" }
];

const DEFAULT_EFFECTS = { autoMerchantFavor: true, autoDisposition: true, autoMemories: true };

function normalizeTier(raw = {}) {
  return {
    id: String(raw.id || rid()),
    min: clampScore(raw.min ?? -100),
    name: String(raw.name || "Standing"),
    merchantFavorId: String(raw.merchantFavorId ?? "neutral"),
    disposition: [-1, 0, 1].includes(Number(raw.disposition)) ? Number(raw.disposition) : 0,
    tone: ["positive", "neutral", "negative"].includes(raw.tone) ? raw.tone : "neutral"
  };
}

function normalizeMember(raw = {}) {
  return {
    id: String(raw.id || rid()),
    actorUuid: String(raw.actorUuid || ""),
    merchantTokenUuid: String(raw.merchantTokenUuid || ""),
    name: String(raw.name || "Unknown Member"),
    image: String(raw.image || "icons/svg/mystery-man.svg"),
    role: String(raw.role || "Member"),
    kind: String(raw.kind || "actor"),
    memories: raw.memories !== false,
    disposition: raw.disposition !== false,
    merchantFavor: raw.merchantFavor !== false
  };
}

function normalizeFaction(raw = {}) {
  const tiers = (Array.isArray(raw.tiers) && raw.tiers.length ? raw.tiers : DEFAULT_TIERS).map(normalizeTier).sort((a, b) => a.min - b.min);
  return {
    id: String(raw.id || rid()),
    name: String(raw.name || "New Faction"),
    shortName: String(raw.shortName || ""),
    image: String(raw.image || ""),
    description: String(raw.description || ""),
    gmNotes: String(raw.gmNotes || ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    partyScore: clampScore(raw.partyScore ?? 0),
    characterScores: raw.characterScores && typeof raw.characterScores === "object" ? clone(raw.characterScores) : {},
    members: Array.isArray(raw.members) ? raw.members.map(normalizeMember) : [],
    tiers,
    effects: { ...DEFAULT_EFFECTS, ...(raw.effects || {}) },
    relationships: raw.relationships && typeof raw.relationships === "object" ? clone(raw.relationships) : {},
    log: Array.isArray(raw.log) ? raw.log.slice(-250) : [],
    createdAt: raw.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function factionImage(faction) { return faction?.image || DEFAULT_IMAGE; }
function scoreClass(score) { return score < -10 ? "score-negative" : score > 10 ? "score-positive" : "score-neutral"; }
function relationLabel(score) {
  if (score <= -75) return "Sworn Enemies";
  if (score <= -35) return "Hostile";
  if (score < 0) return "Unfriendly";
  if (score === 0) return "Neutral";
  if (score < 35) return "Cordial";
  if (score < 75) return "Friendly";
  return "Allied";
}
function tierFor(faction, score) {
  const tiers = [...(faction?.tiers || DEFAULT_TIERS)].sort((a, b) => a.min - b.min);
  let match = tiers[0] || normalizeTier(DEFAULT_TIERS[0]);
  for (const tier of tiers) if (score >= tier.min) match = tier;
  return match;
}
function effectiveScore(faction, actor) {
  const id = actor?.id ?? (typeof actor === "string" ? actor.replace(/^Actor\./, "") : "");
  if (id && Object.prototype.hasOwnProperty.call(faction.characterScores || {}, id)) return clampScore(faction.characterScores[id]);
  return clampScore(faction.partyScore);
}

async function resolveActor(ref) {
  if (!ref) return null;
  if (ref.documentName === "Actor") return ref;
  if (ref.documentName === "Token" || ref.documentName === "TokenDocument") return ref.actor ?? null;
  if (ref.actor?.documentName === "Actor") return ref.actor;
  if (typeof ref !== "string") return null;
  if (ref.includes(".")) {
    try {
      const doc = await fromUuid(ref);
      if (doc?.documentName === "Actor") return doc;
      if (doc?.actor?.documentName === "Actor") return doc.actor;
    } catch (_err) {}
  }
  return game.actors.get(ref) ?? null;
}

async function resolveToken(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Token" ? doc : null;
  } catch (_err) { return null; }
}

async function memberActor(member) {
  return resolveActor(member.actorUuid);
}

async function merchantTokensForMember(member) {
  const out = [];
  if (member.merchantTokenUuid) {
    const token = await resolveToken(member.merchantTokenUuid);
    if (token?.getFlag?.("saltybananaslug-merchants", "merchant")) out.push(token);
  }
  const actor = await memberActor(member);
  if (actor && game.sbsMerchants?.findByActor) {
    for (const token of game.sbsMerchants.findByActor(actor) || []) if (!out.some(t => t.uuid === token.uuid)) out.push(token);
  } else if (actor) {
    for (const scene of game.scenes || []) for (const token of scene.tokens || []) {
      if (!token.getFlag?.("saltybananaslug-merchants", "merchant")) continue;
      const pub = token.getFlag("saltybananaslug-merchants", "merchant");
      if (token.actorId === actor.id || pub?.linkedOriginalActorId === actor.id || pub?.shellActorId === actor.id) out.push(token);
    }
  }
  return out;
}

function tokensForActor(actor) {
  if (!actor) return [];
  const out = [];
  for (const scene of game.scenes || []) for (const token of scene.tokens || []) if (token.actorId === actor.id) out.push(token);
  return out;
}

function desiredFavorForMerchant(token, desiredId) {
  const levels = game.sbsMerchants?.getFavorLevels?.(token) || [];
  if (!levels.length) return desiredId;
  const exact = levels.find(l => String(l.id) === String(desiredId));
  if (exact) return exact.id;
  const standardIndex = Math.max(0, STANDARD_FAVOR.findIndex(x => x.id === desiredId));
  const mappedIndex = Math.round((standardIndex / Math.max(1, STANDARD_FAVOR.length - 1)) * Math.max(0, levels.length - 1));
  return levels[Math.max(0, Math.min(levels.length - 1, mappedIndex))]?.id ?? levels[0]?.id ?? "";
}

class FactionStore {
  static _database = null;
  static cache = new Map();

  static async database() {
    if (this._database && game.journal.get(this._database.id)) return this._database;
    let db = game.journal.find(j => j.getFlag?.(MODULE_ID, "database") === true);
    if (!db && game.user.isGM) {
      db = await JournalEntry.create({
        name: DB_NAME,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [MODULE_ID]: { database: true } }
      });
    }
    this._database = db || null;
    return this._database;
  }

  static async refresh() {
    this.cache.clear();
    const db = await this.database();
    if (!db) return [];
    for (const page of db.pages || []) {
      const raw = page.getFlag?.(MODULE_ID, "faction");
      if (!raw) continue;
      const faction = normalizeFaction(raw);
      this.cache.set(faction.id, faction);
    }
    return this.allSync();
  }

  static allSync() { return [...this.cache.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  static getSync(id) { return this.cache.get(id) ? clone(this.cache.get(id)) : null; }

  static async save(raw) {
    if (!game.user.isGM) throw new Error("GM only.");
    const faction = normalizeFaction(raw);
    const db = await this.database();
    if (!db) throw new Error("Faction database unavailable.");
    let page = db.pages.find(p => p.getFlag?.(MODULE_ID, "factionId") === faction.id);
    const flags = { [MODULE_ID]: { factionId: faction.id, faction } };
    const text = { content: `<h1>${escapeHtml(faction.name)}</h1><p>SBS Factions private database record.</p>`, format: 1 };
    if (!page) {
      [page] = await db.createEmbeddedDocuments("JournalEntryPage", [{ name: faction.name, type: "text", text, flags }]);
    } else {
      await page.update({ name: faction.name, text, flags });
    }
    this.cache.set(faction.id, faction);
    return clone(faction);
  }

  static async remove(id) {
    if (!game.user.isGM) throw new Error("GM only.");
    const db = await this.database();
    const page = db?.pages?.find(p => p.getFlag?.(MODULE_ID, "factionId") === id);
    if (page) await db.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
    this.cache.delete(id);
    for (const faction of this.cache.values()) {
      if (faction.relationships?.[id]) {
        delete faction.relationships[id];
        await this.save(faction);
      }
    }
    return true;
  }
}

async function addFactionMember(factionId, ref, options = {}) {
  const faction = FactionStore.getSync(factionId);
  if (!faction) throw new Error("Faction not found.");
  let doc = ref;
  if (typeof ref === "string") {
    try { doc = await fromUuid(ref); } catch (_err) { doc = await resolveActor(ref); }
  }
  const token = doc?.documentName === "Token" ? doc : doc?.document?.documentName === "Token" ? doc.document : null;
  const actor = token?.actor ?? (doc?.documentName === "Actor" ? doc : doc?.actor);
  if (!actor) throw new Error("Drop an Actor or Token.");
  const merchantToken = token?.getFlag?.("saltybananaslug-merchants", "merchant") ? token : null;
  if (faction.members.some(m => m.actorUuid === actor.uuid && (!merchantToken || m.merchantTokenUuid === merchantToken.uuid))) {
    ui.notifications.warn(`${actor.name} is already a member of ${faction.name}.`);
    return faction;
  }
  const member = normalizeMember({
    actorUuid: actor.uuid,
    merchantTokenUuid: merchantToken?.uuid || "",
    name: merchantToken?.name || actor.name,
    image: token?.texture?.src || actor.img || "icons/svg/mystery-man.svg",
    role: options.role || "Member",
    kind: merchantToken ? "merchant" : "actor"
  });
  faction.members.push(member);
  const saved = await FactionStore.save(faction);
  Hooks.callAll("sbsFactions.memberAdded", clone(saved), clone(member), actor, merchantToken);
  return saved;
}

async function recordFactionMemories(faction, target, oldScore, newScore, oldTier, newTier, reason) {
  if (!faction.effects.autoMemories || !game.sbsNpcMemories?.recordFactionEvent) return 0;
  const targetActor = target === "party" ? null : await resolveActor(target);
  const delta = newScore - oldScore;
  const crossed = oldTier?.id !== newTier?.id;
  const direction = delta > 0 ? "improved" : delta < 0 ? "worsened" : "changed";
  let count = 0;
  for (const member of faction.members.filter(m => m.memories !== false)) {
    const actor = await memberActor(member);
    if (!actor || actor.type === "character") continue;
    const bodyParts = [];
    bodyParts.push(targetActor ? `${targetActor.name}'s standing with ${faction.name} ${direction} from ${oldScore} to ${newScore}.` : `The party's standing with ${faction.name} ${direction} from ${oldScore} to ${newScore}.`);
    if (crossed) bodyParts.push(`Standing changed from ${oldTier?.name || "Unknown"} to ${newTier?.name || "Unknown"}.`);
    if (reason) bodyParts.push(`Reason: ${reason}`);
    try {
      await game.sbsNpcMemories.recordFactionEvent(actor, {
        title: `${faction.name}: Standing ${direction}`,
        body: bodyParts.join(" "),
        tone: delta > 0 ? "positive" : delta < 0 ? "negative" : newTier?.tone || "neutral",
        importance: crossed ? "major" : "normal",
        relatedActorUuid: targetActor?.uuid || "",
        relatedActorName: targetActor?.name || "",
        tags: [faction.name, newTier?.name || "standing", targetActor ? "individual-reputation" : "party-reputation"],
        eventId: rid(),
        metadata: { factionId: faction.id, factionName: faction.name, oldScore, newScore, delta, oldTier: oldTier?.id, newTier: newTier?.id, reason, target: targetActor?.uuid || "party" }
      });
      count++;
    } catch (err) { console.warn(`${MODULE_TITLE} | memory effect failed`, actor?.name, err); }
  }
  return count;
}

async function applyMerchantFavor(faction, target = "party") {
  if (!faction.effects.autoMerchantFavor || !game.sbsMerchants?.setRelation) return 0;
  const targetActors = target === "party" ? game.actors.filter(a => a.type === "character") : [await resolveActor(target)].filter(Boolean);
  let count = 0;
  for (const member of faction.members.filter(m => m.merchantFavor !== false)) {
    const merchants = await merchantTokensForMember(member);
    if (!merchants.length) continue;
    for (const customer of targetActors) {
      const score = effectiveScore(faction, customer);
      const tier = tierFor(faction, score);
      for (const merchant of merchants) {
        const favorId = desiredFavorForMerchant(merchant, tier.merchantFavorId);
        try {
          await game.sbsMerchants.setRelation(merchant, customer, {
            favorId,
            reason: `${faction.name} standing is ${tier.name} (${score}).`,
            source: MODULE_ID,
            emitHook: false
          });
          count++;
        } catch (err) { console.warn(`${MODULE_TITLE} | merchant favor effect failed`, merchant?.name, customer?.name, err); }
      }
    }
  }
  return count;
}

async function applyDisposition(faction) {
  if (!faction.effects.autoDisposition) return 0;
  const tier = tierFor(faction, faction.partyScore);
  let count = 0;
  for (const member of faction.members.filter(m => m.disposition !== false)) {
    const actor = await memberActor(member);
    if (!actor || actor.type === "character") continue;
    for (const token of tokensForActor(actor)) {
      if (Number(token.disposition) === Number(tier.disposition)) continue;
      try { await token.update({ disposition: Number(tier.disposition) }); count++; }
      catch (err) { console.warn(`${MODULE_TITLE} | disposition effect failed`, token?.name, err); }
    }
  }
  return count;
}

async function applyEffects(factionId, { target = "party", oldScore = null, newScore = null, oldTier = null, newTier = null, reason = "", recordMemory = false } = {}) {
  const faction = FactionStore.getSync(factionId);
  if (!faction) throw new Error("Faction not found.");
  const results = { merchantFavor: 0, dispositions: 0, memories: 0 };
  results.merchantFavor = await applyMerchantFavor(faction, target);
  if (target === "party") results.dispositions = await applyDisposition(faction);
  if (recordMemory && oldScore !== null && newScore !== null) results.memories = await recordFactionMemories(faction, target, oldScore, newScore, oldTier || tierFor(faction, oldScore), newTier || tierFor(faction, newScore), reason);
  Hooks.callAll("sbsFactions.effectsApplied", clone(faction), clone(results), { target, oldScore, newScore, reason });
  return results;
}

async function setReputation(factionId, target = "party", value = 0, options = {}) {
  if (!game.user.isGM) throw new Error("GM only.");
  const faction = FactionStore.getSync(factionId);
  if (!faction) throw new Error("Faction not found.");
  const reason = String(options.reason || "").trim();
  let actor = null;
  let targetId = "party";
  let targetName = "Whole Party";
  let oldScore;
  if (target === "party" || target == null) {
    oldScore = clampScore(faction.partyScore);
  } else {
    actor = await resolveActor(target);
    if (!actor) throw new Error("Character not found.");
    targetId = actor.id;
    targetName = actor.name;
    oldScore = effectiveScore(faction, actor);
  }
  const next = clampScore(value);
  if (oldScore === next && options.force !== true) return clone(faction);
  const oldTier = tierFor(faction, oldScore);
  if (targetId === "party") faction.partyScore = next;
  else faction.characterScores[targetId] = next;
  const newTier = tierFor(faction, next);
  const delta = next - oldScore;
  faction.log.push({ id: rid(), when: nowIso(), by: game.user.name, targetId, targetName, oldScore, newScore: next, delta, oldTier: oldTier.name, newTier: newTier.name, oldTierId: oldTier.id, newTierId: newTier.id, reason });
  if (faction.log.length > 250) faction.log = faction.log.slice(-250);
  const saved = await FactionStore.save(faction);
  const event = { faction: clone(saved), target: actor || "party", targetId, targetName, oldScore, newScore: next, delta, oldTier: clone(oldTier), newTier: clone(newTier), reason };
  Hooks.callAll("sbsFactions.reputationChanged", event);
  if (oldTier.id !== newTier.id) Hooks.callAll("sbsFactions.tierChanged", event);
  await applyEffects(factionId, { target: actor || "party", oldScore, newScore: next, oldTier, newTier, reason, recordMemory: true });
  return FactionStore.getSync(factionId);
}

async function changeReputation(factionId, target = "party", delta = 0, options = {}) {
  const faction = FactionStore.getSync(factionId);
  if (!faction) throw new Error("Faction not found.");
  const actor = target === "party" ? null : await resolveActor(target);
  const current = target === "party" ? faction.partyScore : effectiveScore(faction, actor);
  return setReputation(factionId, actor || "party", clampScore(current + Number(delta || 0)), options);
}

async function clearCharacterOverride(factionId, actorRef, options = {}) {
  const faction = FactionStore.getSync(factionId);
  const actor = await resolveActor(actorRef);
  if (!faction || !actor) throw new Error("Faction or character not found.");
  const oldScore = effectiveScore(faction, actor);
  const oldTier = tierFor(faction, oldScore);
  delete faction.characterScores[actor.id];
  const next = faction.partyScore;
  const newTier = tierFor(faction, next);
  faction.log.push({ id: rid(), when: nowIso(), by: game.user.name, targetId: actor.id, targetName: actor.name, oldScore, newScore: next, delta: next - oldScore, oldTier: oldTier.name, newTier: newTier.name, oldTierId: oldTier.id, newTierId: newTier.id, reason: options.reason || "Individual reputation override cleared; now inherits party standing." });
  await FactionStore.save(faction);
  await applyEffects(factionId, { target: actor, oldScore, newScore: next, oldTier, newTier, reason: options.reason || "Now inherits party standing.", recordMemory: true });
  return FactionStore.getSync(factionId);
}

function readDragData(ev) {
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
}

async function documentFromDragData(data) {
  if (data.uuid) {
    try { return await fromUuid(data.uuid); } catch (_err) {}
  }
  if (data.type === "Actor" && data.id) return game.actors.get(data.id) || null;
  if (data.actorId && data.tokenId) {
    const scene = data.sceneId ? game.scenes.get(data.sceneId) : canvas.scene;
    return scene?.tokens?.get(data.tokenId) || game.actors.get(data.actorId) || null;
  }
  if (data.actorId) return game.actors.get(data.actorId) || null;
  return null;
}

class FactionManager extends AppBase {
  constructor(options = {}) {
    super(options);
    this.selectedId = null;
    this.activeTab = "details";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sbs-faction-manager",
      title: "SBS Faction Manager",
      template: `modules/${MODULE_ID}/templates/faction-manager.hbs`,
      width: Math.min(1120, Math.max(760, window.innerWidth - 220)),
      height: Math.min(780, Math.max(560, window.innerHeight - 100)),
      resizable: true,
      minimizable: true,
      classes: ["sbs-factions", "sbsf-manager"]
    });
  }

  async getData() {
    const factions = FactionStore.allSync();
    if (!this.selectedId || !FactionStore.getSync(this.selectedId)) this.selectedId = factions[0]?.id || null;
    const selected = this.selectedId ? FactionStore.getSync(this.selectedId) : null;
    const list = factions.map(f => {
      const tier = tierFor(f, f.partyScore);
      return { id: f.id, name: f.name, image: factionImage(f), score: f.partyScore, tierName: tier.name, scoreClass: scoreClass(f.partyScore), active: f.id === this.selectedId, search: `${f.name} ${f.shortName} ${(f.tags || []).join(" ")}`.toLowerCase() };
    });
    const data = { logo: DEFAULT_IMAGE, factions: list, selected: null, tabs: {}, deltas: [
      { value: -10, label: "-10", className: "negative" }, { value: -5, label: "-5", className: "negative" }, { value: -1, label: "-1", className: "negative" },
      { value: 1, label: "+1", className: "positive" }, { value: 5, label: "+5", className: "positive" }, { value: 10, label: "+10", className: "positive" }
    ] };
    data.tabs[this.activeTab] = true;
    if (!selected) return data;
    const partyTier = tierFor(selected, selected.partyScore);
    const memberRows = [];
    for (const member of selected.members) {
      const actor = await memberActor(member);
      const merchant = member.merchantTokenUuid ? await resolveToken(member.merchantTokenUuid) : null;
      memberRows.push({ ...member, name: merchant?.name || actor?.name || member.name, image: merchant?.texture?.src || actor?.img || member.image, kindLabel: member.kind === "merchant" || merchant ? "SBS Merchant" : actor?.type === "npc" ? "NPC" : actor?.type || "Actor", missing: !actor && !merchant });
    }
    const characterRows = game.actors.filter(a => a.type === "character").map(actor => {
      const score = effectiveScore(selected, actor), tier = tierFor(selected, score), inherited = !Object.prototype.hasOwnProperty.call(selected.characterScores, actor.id);
      return { id: actor.id, name: actor.name, image: actor.img, score, tierName: tier.name, scoreClass: scoreClass(score), inherited };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const tierRows = selected.tiers.map(t => ({
      ...t,
      favorOptions: STANDARD_FAVOR.map(x => ({ ...x, selected: x.id === t.merchantFavorId })),
      dispositionOptions: [{ value: -1, name: "Hostile" }, { value: 0, name: "Neutral" }, { value: 1, name: "Friendly" }].map(x => ({ ...x, selected: Number(x.value) === Number(t.disposition) })),
      toneOptions: [{ value: "negative", name: "Negative" }, { value: "neutral", name: "Neutral" }, { value: "positive", name: "Positive" }].map(x => ({ ...x, selected: x.value === t.tone }))
    }));
    const relationshipRows = factions.filter(f => f.id !== selected.id).map(other => {
      const relation = selected.relationships?.[other.id] || { score: 0, notes: "" };
      const score = clampScore(relation.score || 0);
      return { id: other.id, name: other.name, score, notes: relation.notes || "", label: relationLabel(score) };
    });
    const logRows = [...selected.log].reverse().map(row => ({ ...row, deltaLabel: row.delta > 0 ? `+${row.delta}` : String(row.delta), deltaClass: row.delta > 0 ? "delta-positive" : row.delta < 0 ? "delta-negative" : "", when: new Date(row.when).toLocaleString() }));
    data.selected = {
      ...selected,
      rawImage: selected.image,
      image: factionImage(selected),
      tagsText: (selected.tags || []).join(", "),
      partyTierName: partyTier.name,
      scoreClass: scoreClass(selected.partyScore),
      memberRows,
      characterRows,
      tierRows,
      relationshipRows,
      logRows
    };
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] || html;
    root.querySelector("[name='factionFilter']")?.addEventListener("input", ev => {
      const q = ev.target.value.toLowerCase();
      root.querySelectorAll(".sbsf-faction-card").forEach(card => card.classList.toggle("hidden", !card.dataset.search.includes(q)));
    });
    root.querySelectorAll("[data-action='select-faction']").forEach(btn => btn.addEventListener("click", () => { this.selectedId = btn.dataset.factionId; this.render(true); }));
    root.querySelectorAll("[data-action='tab']").forEach(btn => btn.addEventListener("click", () => { this.activeTab = btn.dataset.tab; this.render(true); }));
    root.querySelector("[data-action='new-faction']")?.addEventListener("click", () => this._newFaction());
    root.querySelector("[data-action='delete-faction']")?.addEventListener("click", () => this._deleteFaction());
    root.querySelector("[data-action='sync-effects']")?.addEventListener("click", async () => { await applyEffects(this.selectedId, { target: "party" }); ui.notifications.info("Faction effects reapplied."); this.render(true); });
    root.querySelector("[data-action='save-details']")?.addEventListener("click", async () => {
      const f = FactionStore.getSync(this.selectedId); if (!f) return;
      for (const key of ["name", "shortName", "image", "description", "gmNotes"]) f[key] = String(root.querySelector(`[name='${key}']`)?.value || "").trim();
      f.tags = String(root.querySelector("[name='tags']")?.value || "").split(",").map(x => x.trim()).filter(Boolean);
      await FactionStore.save(f); ui.notifications.info(`${f.name} saved.`); this.render(true);
    });

    const drop = root.querySelector("[data-member-drop]");
    for (const type of ["dragenter", "dragover"]) drop?.addEventListener(type, ev => { ev.preventDefault(); ev.stopPropagation(); drop.classList.add("dragover"); if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy"; }, { capture: true });
    drop?.addEventListener("dragleave", ev => { ev.stopPropagation(); drop.classList.remove("dragover"); }, { capture: true });
    drop?.addEventListener("drop", async ev => {
      ev.preventDefault(); ev.stopPropagation(); drop.classList.remove("dragover");
      try { const doc = await documentFromDragData(readDragData(ev)); if (!doc) throw new Error("Could not read dropped document."); await addFactionMember(this.selectedId, doc); this.render(true); }
      catch (err) { console.error(`${MODULE_TITLE} | member drop failed`, err); ui.notifications.error(err.message || "Could not add faction member."); }
    }, { capture: true });

    root.querySelectorAll(".sbsf-member-row").forEach(row => {
      const saveMember = async () => {
        const f = FactionStore.getSync(this.selectedId), member = f?.members.find(m => m.id === row.dataset.memberId); if (!member) return;
        member.role = row.querySelector("[name='role']")?.value || "Member";
        member.memories = row.querySelector("[name='memories']")?.checked !== false;
        member.disposition = row.querySelector("[name='disposition']")?.checked !== false;
        member.merchantFavor = row.querySelector("[name='merchantFavor']")?.checked !== false;
        await FactionStore.save(f);
      };
      row.querySelector("[name='role']")?.addEventListener("change", saveMember);
      for (const n of ["memories", "disposition", "merchantFavor"]) row.querySelector(`[name='${n}']`)?.addEventListener("change", saveMember);
      row.querySelector("[data-action='remove-member']")?.addEventListener("click", async () => { const f = FactionStore.getSync(this.selectedId); f.members = f.members.filter(m => m.id !== row.dataset.memberId); await FactionStore.save(f); this.render(true); });
    });

    root.querySelectorAll("[data-action='change-rep']").forEach(btn => btn.addEventListener("click", async () => {
      const reason = String(root.querySelector("[name='reputationReason']")?.value || "").trim();
      const target = btn.dataset.target === "party" ? "party" : game.actors.get(btn.dataset.target);
      await changeReputation(this.selectedId, target, Number(btn.dataset.delta), { reason });
      this.render(true);
    }));
    root.querySelectorAll("[data-action='set-rep']").forEach(btn => btn.addEventListener("click", async () => {
      const reason = String(root.querySelector("[name='reputationReason']")?.value || "").trim();
      const targetId = btn.dataset.target;
      const input = root.querySelector(`[data-exact-score='${targetId}']`);
      const target = targetId === "party" ? "party" : game.actors.get(targetId);
      await setReputation(this.selectedId, target, clampScore(input?.value), { reason });
      this.render(true);
    }));
    root.querySelectorAll("[data-action='clear-override']").forEach(btn => btn.addEventListener("click", async () => { const actor = game.actors.get(btn.dataset.target); await clearCharacterOverride(this.selectedId, actor); this.render(true); }));

    for (const setting of ["autoMerchantFavor", "autoDisposition", "autoMemories"]) root.querySelector(`[name='${setting}']`)?.addEventListener("change", async ev => { const f = FactionStore.getSync(this.selectedId); f.effects[setting] = ev.target.checked; await FactionStore.save(f); });
    root.querySelectorAll(".sbsf-tier-row").forEach(row => {
      const saveTier = async () => {
        const f = FactionStore.getSync(this.selectedId), tier = f?.tiers.find(t => t.id === row.dataset.tierId); if (!tier) return;
        tier.min = clampScore(row.querySelector("[name='min']")?.value); tier.name = row.querySelector("[name='name']")?.value || "Standing"; tier.merchantFavorId = row.querySelector("[name='merchantFavorId']")?.value || "neutral"; tier.disposition = Number(row.querySelector("[name='disposition']")?.value || 0); tier.tone = row.querySelector("[name='tone']")?.value || "neutral"; f.tiers.sort((a, b) => a.min - b.min); await FactionStore.save(f); this.render(true);
      };
      row.querySelectorAll("input,select").forEach(input => input.addEventListener("change", saveTier));
      row.querySelector("[data-action='remove-tier']")?.addEventListener("click", async () => { const f = FactionStore.getSync(this.selectedId); if (f.tiers.length <= 1) return ui.notifications.warn("A faction needs at least one standing tier."); f.tiers = f.tiers.filter(t => t.id !== row.dataset.tierId); await FactionStore.save(f); this.render(true); });
    });
    root.querySelector("[data-action='add-tier']")?.addEventListener("click", async () => { const f = FactionStore.getSync(this.selectedId); f.tiers.push(normalizeTier({ min: 0, name: "New Tier", merchantFavorId: "neutral", disposition: 0, tone: "neutral" })); f.tiers.sort((a, b) => a.min - b.min); await FactionStore.save(f); this.render(true); });
    root.querySelector("[data-action='reset-tiers']")?.addEventListener("click", () => this._resetTiers());

    root.querySelectorAll(".sbsf-relationship-row").forEach(row => {
      const saveRelation = async () => { const f = FactionStore.getSync(this.selectedId); const id = row.dataset.otherId; f.relationships[id] = { score: clampScore(row.querySelector("[name='score']")?.value), notes: row.querySelector("[name='notes']")?.value || "" }; await FactionStore.save(f); this.render(true); };
      row.querySelector("[name='score']")?.addEventListener("change", saveRelation); row.querySelector("[name='notes']")?.addEventListener("change", saveRelation);
    });
  }

  _newFaction() {
    new Dialog({ title: "Create Faction", content: `<div class="sbsf-dialog"><label>Faction Name<input name="name" autofocus placeholder="The Silver Hand"></label></div>`, buttons: { cancel: { label: "Cancel" }, create: { label: "Create Faction", callback: async html => { const root = html[0] || html, name = String(root.querySelector("[name='name']")?.value || "New Faction").trim() || "New Faction"; const faction = await FactionStore.save(normalizeFaction({ name })); this.selectedId = faction.id; this.activeTab = "details"; this.render(true); } } }, default: "create" }, { classes: ["sbs-factions"], width: 460 }).render(true);
  }

  _deleteFaction() {
    const f = FactionStore.getSync(this.selectedId); if (!f) return;
    new Dialog({ title: `Delete ${f.name}?`, content: `<p>This permanently deletes the faction record and its reputation history. NPC Memories already written remain as history.</p>`, buttons: { cancel: { label: "Cancel" }, remove: { label: "Delete Faction", callback: async () => { await FactionStore.remove(f.id); this.selectedId = null; this.render(true); } } }, default: "cancel" }, { classes: ["sbs-factions"], width: 500 }).render(true);
  }

  _resetTiers() {
    const f = FactionStore.getSync(this.selectedId); if (!f) return;
    new Dialog({ title: "Reset Standing Tiers?", content: `<p>Replace this faction's tier definitions with the six SBS defaults?</p>`, buttons: { cancel: { label: "Cancel" }, reset: { label: "Reset", callback: async () => { f.tiers = DEFAULT_TIERS.map(normalizeTier); await FactionStore.save(f); this.render(true); } } }, default: "cancel" }, { classes: ["sbs-factions"], width: 480 }).render(true);
  }
}

let manager = null;

async function ensureLauncherMacro() {
  if (!game.user.isGM) return;
  let folder = game.folders.find(f => f.type === "Macro" && f.name === "SBS Factions");
  if (!folder) folder = await Folder.create({ name: "SBS Factions", type: "Macro" });
  let macro = game.macros.find(m => m.getFlag?.(MODULE_ID, "launcher") === true);
  const data = { name: "SBS Faction Manager", type: "script", command: "game.sbsFactions.open();", img: DEFAULT_IMAGE, folder: folder.id };
  if (!macro) macro = await Macro.create({ ...data, flags: { [MODULE_ID]: { launcher: true } } });
  else {
    const patch = {}; for (const k of ["name", "command", "img"]) if (macro[k] !== data[k]) patch[k] = data[k]; if (macro.folder?.id !== folder.id) patch.folder = folder.id; if (Object.keys(patch).length) await macro.update(patch);
  }
}

Hooks.once("init", () => console.log(`${MODULE_TITLE} | Initializing`));
Hooks.once("ready", async () => {
  if (game.user.isGM) await FactionStore.refresh();
  game.sbsFactions = {
    version: game.modules.get(MODULE_ID)?.version,
    open: () => { if (!game.user.isGM) return ui.notifications.warn("SBS Factions is GM-only."); manager ??= new FactionManager(); manager.render(true); return manager; },
    list: () => FactionStore.allSync().map(clone),
    get: id => FactionStore.getSync(id),
    create: async data => FactionStore.save(normalizeFaction(data)),
    update: async (id, patch = {}) => { const f = FactionStore.getSync(id); if (!f) throw new Error("Faction not found."); return FactionStore.save({ ...f, ...patch, id: f.id }); },
    remove: id => FactionStore.remove(id),
    addMember: addFactionMember,
    changeReputation,
    setReputation,
    clearCharacterOverride,
    effectiveReputation: (id, actor) => { const f = FactionStore.getSync(id); return f ? effectiveScore(f, actor) : 0; },
    tierFor: (id, score) => { const f = FactionStore.getSync(id); return f ? clone(tierFor(f, clampScore(score))) : null; },
    applyEffects: (id, options = {}) => applyEffects(id, options),
    refresh: () => FactionStore.refresh()
  };
  if (game.user.isGM) ensureLauncherMacro().catch(err => console.warn(`${MODULE_TITLE} | launcher macro failed`, err));
  console.log(`${MODULE_TITLE} | Ready`);
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools.sbsFactions = { name: "sbsFactions", title: "SBS Faction Manager", icon: "fa-solid fa-people-group", order: Object.keys(tools).length + 1, button: true, visible: true, onChange: () => game.sbsFactions.open() };
});
