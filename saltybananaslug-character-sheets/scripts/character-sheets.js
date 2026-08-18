const MODULE_ID = "saltybananaslug-character-sheets";
const MODULE_TITLE = "SaltyBananaSlug's Character Sheets";
const MODULE_PATH = `modules/${MODULE_ID}`;
const LOGO_PATH = `${MODULE_PATH}/assets/saltybananaslug.svg`;

const FEATURE_ITEM_TYPES = new Set(["feat"]);
const STRUCTURAL_CHARACTER_ITEM_TYPES = new Set(["class", "subclass", "background", "race", "species"]);
const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
const SPELL_LEVEL_NAMES = {
  0: "Cantrips",
  1: "1st Level",
  2: "2nd Level",
  3: "3rd Level",
  4: "4th Level",
  5: "5th Level",
  6: "6th Level",
  7: "7th Level",
  8: "8th Level",
  9: "9th Level"
};

let exporterApp = null;
let previewApp = null;

function get(object, path, fallback = undefined) {
  const value = foundry.utils.getProperty(object, path);
  return value === undefined || value === null ? fallback : value;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escapeAttr(value = "") {
  return escapeHTML(value).replaceAll("`", "&#96;");
}

function stripHTML(html = "") {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function slugify(value = "character") {
  return String(value || "character")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "character";
}

function safeFileStem(value = "Character") {
  return String(value || "Character")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/[. ]+$/g, "")
    .trim() || "Character";
}

function titleCase(value = "") {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value == null || value === "" ? "—" : String(value);
  return number >= 0 ? `+${number}` : String(number);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value == null || value === "" ? "—" : String(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function localized(value) {
  if (!value) return "";
  try {
    return game.i18n.localize(value);
  } catch (_error) {
    return String(value);
  }
}

function configLabel(map, key, fallback = null) {
  if (key === undefined || key === null || key === "") return fallback ?? "";
  const entry = map?.[key];
  if (entry === undefined || entry === null) return fallback ?? titleCase(key);
  if (typeof entry === "string") return localized(entry);
  if (typeof entry === "object") return localized(entry.label ?? entry.name ?? fallback ?? titleCase(key));
  return fallback ?? titleCase(key);
}

function valuesArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (typeof value.values === "function") {
    try { return Array.from(value.values()); } catch (_error) { /* noop */ }
  }
  if (typeof value === "object") return Object.values(value);
  return [value];
}

function entriesArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
  if (typeof value.entries === "function") {
    try { return Array.from(value.entries()); } catch (_error) { /* noop */ }
  }
  if (typeof value === "object") return Object.entries(value);
  return [];
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function normalizedText(value = "") {
  return stripHTML(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’‘]/g, "'")
    .trim();
}

function isPreparedSpell(item) {
  if (item?.type !== "spell") return false;
  const level = Number(get(item, "system.level", 0)) || 0;
  const prep = get(item, "system.preparation", {}) ?? {};
  const mode = String(prep.mode || "").toLowerCase();
  if (level === 0) return true;
  if (prep.prepared === true) return true;
  return ["always", "atwill", "innate"].includes(mode);
}

function spellItemsForMode(actor, mode = "all") {
  const spells = actor?.items?.contents?.filter((item) => item.type === "spell") ?? [];
  if (mode === "none") return [];
  if (["prepared", "prepared-details"].includes(mode)) return spells.filter(isPreparedSpell);
  return spells;
}

function formatDistance(data = {}) {
  if (!data || typeof data !== "object") return "";
  if (data.special) return String(data.special);
  const value = firstDefined(data.value, data.normal);
  const units = firstDefined(data.units, "");
  if (units === "self") return "Self";
  if (units === "touch") return "Touch";
  if (units === "any") return "Any";
  if (value !== undefined && value !== null && value !== "") return `${value}${units ? ` ${units}` : ""}`;
  if (units) return titleCase(units);
  return "";
}

function formatDuration(data = {}) {
  if (!data || typeof data !== "object") return "";
  if (data.special) return String(data.special);
  const units = data.units;
  if (units === "inst") return "Instantaneous";
  if (units === "perm") return "Permanent";
  if (units === "spec") return "Special";
  const value = data.value;
  if (value !== undefined && value !== null && value !== "") return `${value} ${titleCase(units || "")}`.trim();
  return units ? titleCase(units) : "";
}

function formatActivation(data = {}) {
  if (!data || typeof data !== "object") return "";
  const type = data.type;
  const value = data.value;
  const label = configLabel(CONFIG?.DND5E?.activityActivationTypes ?? CONFIG?.DND5E?.activationTypes, type, titleCase(type || ""));
  if (!label) return "";
  if (value && Number(value) !== 1) return `${value} ${label}`;
  return label;
}

function formatUses(uses = {}) {
  // Player exports only show simple, human-readable native counters.
  // Formula-driven values and module automation belong in Foundry, not on the printed sheet.
  if (!uses || typeof uses !== "object") return "";
  const plainNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value ?? "").trim();
    return /^\d+$/.test(text) ? Number(text) : null;
  };

  const max = plainNumber(firstDefined(uses.max, ""));
  if (max === null) return "";

  const spent = plainNumber(firstDefined(uses.spent, 0)) ?? 0;
  const explicitValue = plainNumber(firstDefined(uses.value, ""));
  const value = explicitValue ?? Math.max(0, max - spent);

  const recoveryLabels = {
    sr: "Short Rest",
    shortrest: "Short Rest",
    shortRest: "Short Rest",
    lr: "Long Rest",
    longrest: "Long Rest",
    longRest: "Long Rest",
    day: "Day",
    daily: "Day",
    dawn: "Dawn",
    dusk: "Dusk"
  };
  const recovery = uniqueStrings(valuesArray(uses.recovery)
    .map((entry) => typeof entry === "string" ? entry : firstDefined(entry?.period, entry?.type, ""))
    .map((entry) => recoveryLabels[String(entry ?? "").trim()] ?? "")
    .filter(Boolean))
    .join(", ");

  return `${value}/${max}${recovery ? ` • ${recovery}` : ""}`;
}

function formatPrice(price) {
  if (price == null) return "";
  if (typeof price === "number") return String(price);
  if (typeof price !== "object") return String(price);
  const value = firstDefined(price.value, price.amount, "");
  const denomination = firstDefined(price.denomination, price.currency, "");
  if (value === "" && !denomination) return "";
  return `${value}${denomination ? ` ${denomination}` : ""}`.trim();
}

function formatProperties(item) {
  const props = valuesArray(get(item, "system.properties", []));
  const maps = [
    CONFIG?.DND5E?.itemProperties,
    CONFIG?.DND5E?.weaponProperties,
    CONFIG?.DND5E?.equipmentProperties,
    CONFIG?.DND5E?.spellProperties
  ];
  return uniqueStrings(props.map((key) => {
    for (const map of maps) {
      const result = configLabel(map, key, null);
      if (result && result !== titleCase(key)) return result;
    }
    return titleCase(key);
  }));
}

function abilityLabel(id) {
  return configLabel(CONFIG?.DND5E?.abilities, id, String(id || "").toUpperCase());
}

function skillLabel(id) {
  return configLabel(CONFIG?.DND5E?.skills, id, titleCase(id));
}

function isFeatureItem(item) {
  return FEATURE_ITEM_TYPES.has(item.type);
}

function isStructuralCharacterItem(item) {
  return STRUCTURAL_CHARACTER_ITEM_TYPES.has(item.type);
}

function canExportActor(actor) {
  if (!actor) return false;
  return game.user.isGM || actor.isOwner;
}

function availableActors() {
  const actors = game.actors.contents.filter(canExportActor);
  actors.sort((a, b) => {
    const aChar = a.type === "character" ? 0 : 1;
    const bChar = b.type === "character" ? 0 : 1;
    return aChar - bChar || a.name.localeCompare(b.name);
  });
  return actors;
}

function resolveActor(actorOrId = null) {
  if (actorOrId?.documentName === "Actor") return actorOrId;
  if (actorOrId?.actor?.documentName === "Actor") return actorOrId.actor;
  if (typeof actorOrId === "string") return game.actors.get(actorOrId) || null;
  return null;
}

function defaultActor() {
  const controlled = canvas?.tokens?.controlled?.find((token) => canExportActor(token.actor))?.actor;
  if (controlled) return controlled;
  if (game.user.character && canExportActor(game.user.character)) return game.user.character;
  return availableActors()[0] || null;
}

function itemCounts(actor, { spellMode = "all" } = {}) {
  const items = actor?.items?.contents ?? [];
  return {
    spells: spellItemsForMode(actor, spellMode).length,
    allSpells: items.filter((item) => item.type === "spell").length,
    preparedSpells: spellItemsForMode(actor, "prepared").length,
    features: items.filter(isFeatureItem).length,
    inventory: items.filter((item) => item.type !== "spell" && !isFeatureItem(item) && !isStructuralCharacterItem(item)).length
  };
}

function actorSubtitle(actor) {
  if (!actor) return "No Actor available";
  const sys = actor.system ?? {};
  const level = firstDefined(get(sys, "details.level"), classLevelTotal(actor));
  const classText = classSummary(actor);
  const bits = [titleCase(actor.type)];
  if (level !== undefined && level !== null && level !== "") bits.push(`Level ${level}`);
  if (classText) bits.push(classText);
  return uniqueStrings(bits).join(" • ");
}

function classLevelTotal(actor) {
  const classItems = actor.items?.contents?.filter((item) => item.type === "class") ?? [];
  if (!classItems.length) return "";
  const total = classItems.reduce((sum, item) => sum + (Number(get(item, "system.levels", 0)) || 0), 0);
  return total || "";
}

function classSummary(actor) {
  const items = actor.items?.contents ?? [];
  const classes = items.filter((item) => item.type === "class").map((item) => {
    const levels = get(item, "system.levels", "");
    return `${item.name}${levels ? ` ${levels}` : ""}`;
  });
  const subclasses = items.filter((item) => item.type === "subclass").map((item) => item.name);
  return [...classes, ...subclasses].join(" / ");
}

function getRaceSpeciesBackground(actor) {
  const items = actor.items?.contents ?? [];
  const race = items.find((item) => ["race", "species"].includes(item.type));
  const background = items.find((item) => item.type === "background");
  return {
    race: race?.name || firstDefined(get(actor, "system.details.race"), get(actor, "system.details.species"), ""),
    background: background?.name || firstDefined(get(actor, "system.details.background"), "")
  };
}

function actorCoreRows(actor) {
  const sys = actor.system ?? {};
  const details = sys.details ?? {};
  const attrs = sys.attributes ?? {};
  const rb = getRaceSpeciesBackground(actor);
  const hp = attrs.hp ?? {};
  const ac = firstDefined(get(attrs, "ac.value"), attrs.ac, "");
  const prof = firstDefined(get(attrs, "prof"), get(attrs, "prof.value"), "");
  const init = firstDefined(get(attrs, "init.total"), get(attrs, "init.mod"), get(attrs, "init.value"), "");
  const spellDc = firstDefined(get(attrs, "spelldc"), "");
  const cr = firstDefined(details.cr, "");
  const rows = [
    ["Actor Type", titleCase(actor.type)],
    ["Class / Subclass", classSummary(actor)],
    ["Level", firstDefined(details.level, classLevelTotal(actor), "")],
    ["Species / Race", rb.race],
    ["Background", rb.background],
    ["Alignment", details.alignment],
    ["Armor Class", ac],
    ["Hit Points", hp.max !== undefined ? `${firstDefined(hp.value, 0)}/${hp.max}${hp.temp ? ` + ${hp.temp} temp` : ""}` : firstDefined(hp.value, "")],
    ["Proficiency Bonus", prof !== "" ? formatSigned(prof) : ""],
    ["Initiative", init !== "" ? formatSigned(init) : ""],
    ["Spell Save DC", spellDc],
    ["Challenge Rating", cr],
    ["Inspiration", attrs.inspiration === true ? "Yes" : attrs.inspiration === false ? "No" : attrs.inspiration],
    ["Exhaustion", firstDefined(attrs.exhaustion, get(attrs, "exhaustion.value"), "")]
  ];
  return rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function movementText(actor) {
  const movement = get(actor, "system.attributes.movement", {}) ?? {};
  const units = movement.units || "ft";
  const parts = [];
  for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
    const value = movement[key];
    if (value !== undefined && value !== null && value !== "" && Number(value) !== 0) parts.push(`${titleCase(key)} ${value} ${units}`);
  }
  if (movement.hover) parts.push("Hover");
  return parts.join(" • ");
}

function sensesText(actor) {
  const senses = get(actor, "system.attributes.senses", {}) ?? {};
  const units = senses.units || "ft";
  const parts = [];
  for (const [key, value] of Object.entries(senses)) {
    if (["units", "special"].includes(key)) continue;
    if (value !== undefined && value !== null && value !== "" && Number(value) !== 0) parts.push(`${titleCase(key)} ${value} ${units}`);
  }
  if (senses.special) parts.push(String(senses.special));
  return parts.join(" • ");
}

function abilityCards(actor) {
  const abilities = get(actor, "system.abilities", {}) ?? {};
  return ABILITY_ORDER.map((id) => {
    const data = abilities[id] ?? {};
    const score = firstDefined(data.value, "—");
    const mod = firstDefined(get(data, "mod"), get(data, "check.total"), "");
    const save = firstDefined(get(data, "save.total"), get(data, "save"), "");
    const proficient = firstDefined(data.proficient, get(data, "save.proficient"), "");
    return { id, label: abilityLabel(id), score, mod, save, proficient };
  });
}

function skillRows(actor) {
  const skills = get(actor, "system.skills", {}) ?? {};
  return Object.entries(skills)
    .map(([id, data]) => {
      const total = firstDefined(data.total, data.mod, get(data, "check.total"), "");
      const passive = firstDefined(data.passive, get(data, "check.passive"), "");
      const prof = firstDefined(data.value, data.proficient, data.prof, "");
      const ability = firstDefined(data.ability, get(data, "ability.value"), "");
      return [skillLabel(id), ability ? abilityLabel(ability) : "", total !== "" ? formatSigned(total) : "", prof, passive];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function traitValues(actor, path, configMap = null) {
  const trait = get(actor, path, {}) ?? {};
  const value = valuesArray(trait.value ?? trait);
  const labels = value.map((entry) => configMap ? configLabel(configMap, entry, titleCase(entry)) : titleCase(entry));
  if (trait.custom) labels.push(...String(trait.custom).split(";").map((entry) => entry.trim()));
  return uniqueStrings(labels);
}

function defensesRows(actor) {
  const traits = get(actor, "system.traits", {}) ?? {};
  const rows = [
    ["Damage Immunities", traitValues(actor, "system.traits.di", CONFIG?.DND5E?.damageTypes)],
    ["Damage Resistances", traitValues(actor, "system.traits.dr", CONFIG?.DND5E?.damageTypes)],
    ["Damage Vulnerabilities", traitValues(actor, "system.traits.dv", CONFIG?.DND5E?.damageTypes)],
    ["Condition Immunities", traitValues(actor, "system.traits.ci", CONFIG?.DND5E?.conditionTypes)],
    ["Languages", traitValues(actor, "system.traits.languages", CONFIG?.DND5E?.languages)],
    ["Armor Proficiencies", traitValues(actor, "system.traits.armorProf", CONFIG?.DND5E?.armorProficiencies)],
    ["Weapon Proficiencies", traitValues(actor, "system.traits.weaponProf", CONFIG?.DND5E?.weaponProficiencies)],
    ["Tool Proficiencies", traitValues(actor, "system.traits.toolProf", CONFIG?.DND5E?.toolProficiencies)]
  ];
  if (traits.size) rows.unshift(["Size", configLabel(CONFIG?.DND5E?.actorSizes, traits.size, titleCase(traits.size))]);
  return rows.filter(([, value]) => Array.isArray(value) ? value.length : value !== undefined && value !== null && value !== "");
}

function resourceRows(actor) {
  const resources = get(actor, "system.resources", {}) ?? {};
  return Object.entries(resources).map(([key, data]) => {
    if (data == null || typeof data !== "object") return [titleCase(key), String(data ?? "")];
    const label = firstDefined(data.label, data.name, titleCase(key));
    const max = firstDefined(data.max, "");
    const value = firstDefined(data.value, max !== "" && data.spent !== undefined ? Math.max(0, Number(max) - Number(data.spent || 0)) : "");
    const parts = [];
    if (max !== "") parts.push(`${value !== "" ? value : "?"}/${max}`);
    else if (value !== "") parts.push(String(value));
    const recovery = valuesArray(data.recovery).map((entry) => firstDefined(entry?.period, entry?.type, entry, "")).filter(Boolean).map(titleCase);
    if (recovery.length) parts.push(`Recovery: ${recovery.join(", ")}`);
    return [label, parts.join(" • ")];
  }).filter(([, value]) => value);
}

function spellSlotRows(actor) {
  const spells = get(actor, "system.spells", {}) ?? {};
  return Object.entries(spells).map(([key, data]) => {
    if (!data || typeof data !== "object") return null;
    const max = firstDefined(data.max, "");
    const value = firstDefined(data.value, "");
    if (max === "" && value === "") return null;
    const label = key === "pact" ? "Pact Slots" : key.replace(/^spell/, "Level ");
    return [titleCase(label), `${value}/${max}`];
  }).filter(Boolean);
}

function currencyRows(actor) {
  const currency = get(actor, "system.currency", {}) ?? {};
  return Object.entries(currency)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([coin, value]) => [coin.toUpperCase(), String(value)]);
}

function metadataTable(rows) {
  const filtered = rows.filter(([, value]) => {
    if (Array.isArray(value)) return value.length;
    return value !== undefined && value !== null && value !== "";
  });
  if (!filtered.length) return "";
  return `<dl class="sbs-meta-grid">${filtered.map(([key, value]) => `<div><dt>${escapeHTML(key)}</dt><dd>${escapeHTML(Array.isArray(value) ? value.join(", ") : value)}</dd></div>`).join("")}</dl>`;
}

function dataTable(headers, rows, className = "") {
  if (!rows.length) return `<p class="sbs-empty">None recorded.</p>`;
  return `<div class="sbs-table-wrap"><table class="${escapeAttr(className)}"><thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(Array.isArray(cell) ? cell.join(", ") : cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function itemPublicIdentity(item, options) {
  const identified = get(item, "system.identified", true) !== false;
  const hideTruth = !identified && (!game.user.isGM || !options.revealUnidentified);
  if (!hideTruth) return { name: item.name, identified: true, description: get(item, "system.description.value", "") || "" };
  const genericName = firstDefined(get(item, "system.unidentified.name"), get(item, "system.unidentified.label"), "Unidentified Item");
  const genericDescription = firstDefined(get(item, "system.unidentified.description"), get(item, "system.unidentified.value"), "");
  return {
    name: genericName,
    identified: false,
    description: genericDescription || `<p><em>This item is unidentified. No player-safe unidentified description is stored in Foundry.</em></p>`
  };
}

async function enrichDescription(raw, documentContext, options) {
  if (!raw) return `<p class="sbs-empty">No description recorded.</p>`;
  let enriched = String(raw);
  try {
    enriched = await TextEditor.enrichHTML(String(raw), {
      async: true,
      secrets: Boolean(game.user.isGM && options.includeSecrets),
      documents: true,
      relativeTo: documentContext,
      rollData: documentContext?.getRollData?.() ?? documentContext?.actor?.getRollData?.() ?? {}
    });
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not enrich description`, documentContext, error);
  }
  return sanitizeDescriptionHtml(enriched, Boolean(game.user.isGM && options.includeSecrets));
}

function sanitizeDescriptionHtml(html, includeSecrets) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const root = template.content;
  root.querySelectorAll("script, style, form, button, input, select, textarea, iframe, object, embed").forEach((node) => node.remove());
  if (!includeSecrets) root.querySelectorAll("section.secret, .secret").forEach((node) => node.remove());

  // Foundry automation modules sometimes inject configuration/readout blocks into enriched item text.
  // These are useful at the VTT layer but are not character-reference rules, so never export them.
  root.querySelectorAll("*").forEach((element) => {
    const classTokens = Array.from(element.classList || []);
    const id = String(element.id || "");
    const automationClass = classTokens.some((token) => /^(midi(?:-qol)?|dae|times-up|itemacro)(?:-|$)/i.test(token));
    const automationId = /^(midi(?:-qol)?|dae|times-up|itemacro)(?:-|$)/i.test(id);
    const automationData = Array.from(element.attributes || []).some((attr) => /^(data-)?(midi(?:-qol)?|dae|itemacro)(?:-|$)/i.test(attr.name));
    if (automationClass || automationId || automationData) element.remove();
  });

  root.querySelectorAll("a").forEach((anchor) => {
    const href = String(anchor.getAttribute("href") || "");
    const isExternal = /^(https?:|mailto:)/i.test(href);
    if (isExternal) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      for (const attr of Array.from(anchor.attributes)) {
        if (!["href", "target", "rel", "title"].includes(attr.name)) anchor.removeAttribute(attr.name);
      }
      return;
    }
    const span = document.createElement("span");
    span.className = "sbs-static-link";
    span.innerHTML = anchor.innerHTML || escapeHTML(anchor.getAttribute("data-tooltip") || anchor.getAttribute("title") || "Referenced entry");
    anchor.replaceWith(span);
  });

  root.querySelectorAll("*").forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) element.removeAttribute(attr.name);
      if (name.startsWith("data-") && !["data-caption"].includes(name)) element.removeAttribute(attr.name);
      if (["draggable", "contenteditable", "tabindex"].includes(name)) element.removeAttribute(attr.name);
    }
  });

  return template.innerHTML || `<p class="sbs-empty">No player-visible description recorded.</p>`;
}

function sourceText(item) {
  const source = get(item, "system.source", {}) ?? {};
  if (typeof source === "string") return source;
  return uniqueStrings([
    source.custom,
    source.book,
    source.page ? `p. ${source.page}` : "",
    source.rules ? `${source.rules} rules` : ""
  ]).join(" • ");
}

function preparationText(item) {
  const prep = get(item, "system.preparation", {}) ?? {};
  const bits = [];
  if (prep.mode) bits.push(configLabel(CONFIG?.DND5E?.spellPreparationModes, prep.mode, titleCase(prep.mode)));
  if (prep.prepared === true) bits.push("Prepared");
  if (prep.prepared === false && prep.mode) bits.push("Not prepared");
  return uniqueStrings(bits).join(" • ");
}

// Deliberately no activity/action-detail renderer here. D&D5e activities are an automation surface
// heavily extended by MIDI-QOL/DAE and similar modules. The exported sheet uses the item's own
// readable description plus conservative top-level metadata instead.
function itemMetadata(item, publicIdentity, options) {
  const sys = item.system ?? {};
  const rows = [];
  const properties = formatProperties(item);
  const uses = formatUses(sys.uses);
  const quantity = firstDefined(sys.quantity, "");
  const weight = firstDefined(sys.weight?.value, sys.weight, "");
  const price = formatPrice(sys.price);
  const rarity = firstDefined(sys.rarity, "");
  const typeValue = firstDefined(get(sys, "type.value"), typeof sys.type === "string" ? sys.type : "", "");
  const subtype = firstDefined(get(sys, "type.subtype"), "");

  if (item.type === "spell") {
    const level = Number(sys.level ?? 0);
    rows.push(["Level", level === 0 ? "Cantrip" : String(level)]);
    rows.push(["School", configLabel(CONFIG?.DND5E?.spellSchools, sys.school, titleCase(sys.school || ""))]);
    rows.push(["Casting Time", formatActivation(sys.activation)]);
    rows.push(["Range", formatDistance(sys.range)]);
    rows.push(["Duration", formatDuration(sys.duration)]);
    rows.push(["Preparation", preparationText(item)]);
    const componentProps = properties.filter((prop) => /Vocal|Verbal|Somatic|Material|Ritual|Concentration/i.test(prop));
    if (componentProps.length) rows.push(["Components / Tags", componentProps.join(", ")]);
    if (sys.materials?.value) rows.push(["Materials", sys.materials.value]);
  } else {
    rows.push(["Type", uniqueStrings([titleCase(item.type), typeValue ? titleCase(typeValue) : "", subtype ? titleCase(subtype) : ""]).join(" • ")]);
    if (quantity !== "") rows.push(["Quantity", quantity]);
    if (weight !== "") rows.push(["Weight", typeof weight === "object" ? firstDefined(weight.value, "") : weight]);
    if (price) rows.push(["Value", price]);
    if (rarity) rows.push(["Rarity", titleCase(rarity)]);
    if (sys.equipped !== undefined) rows.push(["Equipped", sys.equipped ? "Yes" : "No"]);
    if (sys.proficient !== undefined) rows.push(["Proficient", sys.proficient ? "Yes" : "No"]);
    if (sys.attuned !== undefined) rows.push(["Attuned", sys.attuned ? "Yes" : "No"]);
    if (sys.attunement) rows.push(["Attunement", typeof sys.attunement === "string" ? titleCase(sys.attunement) : String(sys.attunement)]);
    if (sys.requirements) rows.push(["Requirements", sys.requirements]);
  }

  if (properties.length) rows.push(["Properties", properties.join(", ")]);
  if (uses) rows.push(["Uses", uses]);
  if (options.includeSource) {
    const source = sourceText(item);
    if (source) rows.push(["Source", source]);
  }
  if (!publicIdentity.identified) rows.unshift(["Identification", "Unidentified — player-safe presentation"]);
  return rows;
}

async function renderItemCard(item, options, { spell = false } = {}) {
  const identity = itemPublicIdentity(item, options);
  const description = await enrichDescription(identity.description, item, options);
  const metadata = itemMetadata(item, identity, options);
  const image = options.includeItemImages && item.img ? `<img class="sbs-entry-img" src="${escapeAttr(item.img)}" alt="${escapeAttr(identity.name)}">` : "";
  const levelClass = spell ? ` spell-level-${Number(get(item, "system.level", 0))}` : "";
  return `<article class="sbs-entry${levelClass}">
    <header class="sbs-entry-header">${image}<div><h4>${escapeHTML(identity.name)}</h4><div class="sbs-entry-type">${escapeHTML(spell ? (Number(get(item, "system.level", 0)) === 0 ? "Cantrip" : `Level ${get(item, "system.level", 0)} Spell`) : titleCase(item.type))}</div></div></header>
    ${metadataTable(metadata)}
    <div class="sbs-full-description"><h5>Full Description</h5>${description}</div>
  </article>`;
}

function biographyRaw(actor) {
  return firstDefined(
    get(actor, "system.details.biography.value"),
    get(actor, "system.details.biography.public"),
    get(actor, "system.details.biography"),
    get(actor, "system.details.notes"),
    ""
  );
}

function activeEffectsRows(actor) {
  const effects = actor.effects?.contents ?? valuesArray(actor.effects);
  return effects.map((effect) => {
    const duration = effect.duration ?? {};
    const durationText = firstDefined(duration.label, duration.remaining, duration.seconds, duration.rounds ? `${duration.rounds} rounds` : "", "");
    const statuses = valuesArray(effect.statuses).map(titleCase).join(", ");
    // Never expose raw effect change keys/values. Those are Foundry/module implementation details.
    return [effect.name || "Effect", effect.disabled ? "Disabled" : "Active", statuses, durationText];
  });
}

function tocLink(id, label, count = null) {
  return `<a href="#${escapeAttr(id)}">${escapeHTML(label)}${count !== null ? ` <span>${count}</span>` : ""}</a>`;
}

function section(id, title, body, { subtitle = "", breakBefore = false } = {}) {
  return `<section id="${escapeAttr(id)}" class="sbs-section${breakBefore ? " sbs-break-before" : ""}"><header class="sbs-section-title"><div><h2>${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}</div><a href="#top">Back to top</a></header>${body}</section>`;
}

function actorQuickSection(actor) {
  const core = actorCoreRows(actor);
  const abilities = abilityCards(actor);
  const movement = movementText(actor);
  const senses = sensesText(actor);
  const passivePerception = firstDefined(get(actor, "system.skills.prc.passive"), get(actor, "system.attributes.passivePerception"), "");
  const death = get(actor, "system.attributes.death", {}) ?? {};
  return `<div class="sbs-quick-grid">
    <div class="sbs-card"><h3>Core</h3>${metadataTable(core)}</div>
    <div class="sbs-card"><h3>Movement & Awareness</h3>${metadataTable([
      ["Movement", movement],
      ["Senses", senses],
      ["Passive Perception", passivePerception],
      ["Death Saves", (death.success !== undefined || death.failure !== undefined) ? `${death.success ?? 0} successes / ${death.failure ?? 0} failures` : ""]
    ])}</div>
  </div>
  <div class="sbs-abilities">${abilities.map((ability) => `<div class="sbs-ability"><span>${escapeHTML(ability.label)}</span><strong>${escapeHTML(ability.score)}</strong><small>Mod ${escapeHTML(ability.mod !== "" ? formatSigned(ability.mod) : "—")} • Save ${escapeHTML(ability.save !== "" ? formatSigned(ability.save) : "—")}</small></div>`).join("")}</div>`;
}

function skillsSection(actor) {
  return dataTable(["Skill", "Ability", "Bonus", "Proficiency", "Passive"], skillRows(actor), "sbs-skills-table");
}

function traitsSection(actor) {
  const rows = defensesRows(actor).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]);
  return metadataTable(rows);
}

function resourcesSection(actor, options) {
  const resources = resourceRows(actor);
  const slots = spellSlotRows(actor);
  const currency = options.includeCurrency ? currencyRows(actor) : [];
  const blocks = [];
  if (resources.length) blocks.push(`<div class="sbs-card"><h3>Resources</h3>${dataTable(["Resource", "Current / Recovery"], resources)}</div>`);
  if (slots.length) blocks.push(`<div class="sbs-card"><h3>Spell Slots</h3>${dataTable(["Slot", "Current / Max"], slots)}</div>`);
  if (currency.length) blocks.push(`<div class="sbs-card"><h3>Currency</h3>${dataTable(["Coin", "Amount"], currency)}</div>`);
  return blocks.length ? `<div class="sbs-quick-grid">${blocks.join("")}</div>` : `<p class="sbs-empty">No resources recorded.</p>`;
}

async function featuresSection(actor, options) {
  const features = actor.items.contents.filter(isFeatureItem).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  if (!features.length) return `<p class="sbs-empty">No embedded features recorded.</p>`;
  const cards = [];
  for (const item of features) cards.push(await renderItemCard(item, options));
  return cards.join("");
}

function preparedSpellListSection(actor) {
  const spells = spellItemsForMode(actor, "prepared").sort((a, b) => Number(get(a, "system.level", 0)) - Number(get(b, "system.level", 0)) || a.name.localeCompare(b.name));
  if (!spells.length) return `<p class="sbs-empty">No prepared or always-available spells are recorded.</p>`;
  const groups = new Map();
  for (const spell of spells) {
    const level = Number(get(spell, "system.level", 0)) || 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(spell);
  }
  return Array.from(groups.entries()).map(([level, group]) => {
    const names = group.map((spell) => `<li>${escapeHTML(spell.name)}</li>`).join("");
    return `<div class="sbs-spell-list-group"><h3>${escapeHTML(SPELL_LEVEL_NAMES[level] || `Level ${level}`)} <span>${group.length}</span></h3><ul class="sbs-spell-name-list">${names}</ul></div>`;
  }).join("");
}

async function spellsSection(actor, options) {
  if (options.spellMode === "prepared") return preparedSpellListSection(actor);
  const spells = spellItemsForMode(actor, options.spellMode).sort((a, b) => Number(get(a, "system.level", 0)) - Number(get(b, "system.level", 0)) || a.name.localeCompare(b.name));
  if (!spells.length) return `<p class="sbs-empty">No spells match this export setting.</p>`;
  const groups = new Map();
  for (const spell of spells) {
    const level = Number(get(spell, "system.level", 0)) || 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(spell);
  }
  const blocks = [];
  for (const [level, group] of groups.entries()) {
    const cards = [];
    for (const spell of group) cards.push(await renderItemCard(spell, options, { spell: true }));
    blocks.push(`<div class="sbs-spell-level"><h3>${escapeHTML(SPELL_LEVEL_NAMES[level] || `Level ${level}`)} <span>${group.length}</span></h3>${cards.join("")}</div>`);
  }
  return blocks.join("");
}

async function inventorySection(actor, options) {
  const items = actor.items.contents.filter((item) => item.type !== "spell" && !isFeatureItem(item) && !isStructuralCharacterItem(item)).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  if (!items.length) return `<p class="sbs-empty">No embedded inventory items recorded.</p>`;
  const groups = new Map();
  for (const item of items) {
    const type = titleCase(item.type || "Other");
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(item);
  }
  const blocks = [];
  for (const [type, group] of groups.entries()) {
    const cards = [];
    for (const item of group) cards.push(await renderItemCard(item, options));
    blocks.push(`<div class="sbs-item-group"><h3>${escapeHTML(type)} <span>${group.length}</span></h3>${cards.join("")}</div>`);
  }
  return blocks.join("");
}

async function biographySection(actor, options) {
  const raw = biographyRaw(actor);
  if (!raw || typeof raw !== "string") return `<p class="sbs-empty">No biography or notes recorded.</p>`;
  return `<div class="sbs-biography">${await enrichDescription(raw, actor, options)}</div>`;
}

function effectsSection(actor) {
  const rows = activeEffectsRows(actor);
  if (!rows.length) return `<p class="sbs-empty">No active effects recorded.</p>`;
  return dataTable(["Effect", "State", "Statuses", "Duration"], rows);
}

function exportCss() {
  return `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #ece8dd; color: #20251f; font-family: Georgia, 'Times New Roman', serif; line-height: 1.5; }
a { color: #355d3a; }
.sbs-toolbar { position: sticky; top: 0; z-index: 100; display: flex; justify-content: center; gap: 10px; padding: 9px; background: rgba(27, 35, 27, .94); box-shadow: 0 2px 7px rgba(0,0,0,.25); }
.sbs-toolbar button { appearance: none; padding: 8px 13px; border: 1px solid #b7c9b5; border-radius: 6px; background: #f7f4eb; color: #1f2a1e; font: 600 14px Arial, sans-serif; cursor: pointer; }
.sbs-page { width: min(1040px, calc(100% - 32px)); margin: 24px auto 50px; padding: 40px 46px 52px; background: #fffdf7; border: 1px solid #c9c1ad; border-radius: 10px; box-shadow: 0 12px 34px rgba(0,0,0,.13); }
.sbs-hero { display: grid; grid-template-columns: 130px minmax(0,1fr); gap: 22px; align-items: center; padding-bottom: 22px; border-bottom: 3px double #57765a; }
.sbs-portrait { width: 130px; height: 130px; object-fit: cover; border: 2px solid #57765a; border-radius: 10px; background: #e8eadf; }
.sbs-hero h1 { margin: 0; font-size: 38px; line-height: 1.05; color: #253827; }
.sbs-subtitle { margin: 7px 0 0; font: 600 16px Arial, sans-serif; color: #5a6259; }
.sbs-brandline { display: flex; align-items: center; gap: 8px; margin-top: 13px; font: 700 13px Arial, sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #4c654d; }
.sbs-brandline img { width: 34px; height: 34px; object-fit: contain; }
.sbs-toc { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin: 24px 0; }
.sbs-toc a { display: flex; justify-content: space-between; gap: 8px; padding: 9px 11px; border: 1px solid #d2d3c7; border-radius: 7px; background: #f4f4ec; text-decoration: none; font: 700 13px Arial, sans-serif; }
.sbs-toc a span { opacity: .64; }
.sbs-section { margin: 34px 0 0; display: flow-root; }
.sbs-section-title { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin-bottom: 18px; padding-bottom: 9px; border-bottom: 2px solid #6d876e; }
.sbs-section-title h2 { margin: 0; font-size: 25px; color: #2f4931; }
.sbs-section-title p { margin: 2px 0 0; color: #676d65; font: 13px Arial, sans-serif; }
.sbs-section-title > a { flex: 0 0 auto; font: 12px Arial, sans-serif; }
.sbs-quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.sbs-card { min-width: 0; padding: 15px 16px; border: 1px solid #d8d4c7; border-radius: 8px; background: #fbfaf4; }
.sbs-card h3 { margin: 0 0 10px; color: #365238; }
.sbs-meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px 13px; margin: 0; }
.sbs-meta-grid > div { min-width: 0; padding-bottom: 5px; border-bottom: 1px dotted #ded9ca; }
.sbs-meta-grid dt { margin: 0; color: #677066; font: 700 11px Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.sbs-meta-grid dd { margin: 2px 0 0; overflow-wrap: anywhere; }
.sbs-abilities { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 8px; margin-top: 14px; }
.sbs-ability { padding: 10px 6px; border: 1px solid #cdd4c8; border-radius: 8px; background: #f3f6ef; text-align: center; }
.sbs-ability span { display: block; font: 700 12px Arial, sans-serif; text-transform: uppercase; }
.sbs-ability strong { display: block; margin: 3px 0; font-size: 25px; color: #304d32; }
.sbs-ability small { display: block; color: #5d655c; font: 11px Arial, sans-serif; }
.sbs-table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 7px 8px; border: 1px solid #d8d4c7; text-align: left; vertical-align: top; }
th { background: #eef1e8; color: #334735; font-family: Arial, sans-serif; }
.sbs-entry { margin: 0 0 24px; padding: 17px 18px 18px; border: 1px solid #cfcbbc; border-radius: 9px; background: #fffef9; break-inside: avoid-page; display: flow-root; }
.sbs-entry-header { display: flex; align-items: center; gap: 12px; margin-bottom: 13px; }
.sbs-entry-header h4 { margin: 0; font-size: 20px; color: #2f4931; }
.sbs-entry-type { color: #6e746c; font: 700 11px Arial, sans-serif; text-transform: uppercase; letter-spacing: .05em; }
.sbs-entry-img { flex: 0 0 58px; width: 58px; height: 58px; object-fit: cover; border: 1px solid #bfc7b9; border-radius: 7px; }
.sbs-entry .sbs-meta-grid { margin-bottom: 14px; }
.sbs-full-description { margin-top: 12px; padding-top: 12px; border-top: 1px solid #ded9ca; display: flow-root; }
.sbs-full-description > h5, .sbs-subsection > h5 { margin: 0 0 10px; color: #405d42; font: 700 13px Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.sbs-full-description p, .sbs-biography p { margin: 0 0 12px; line-height: 1.55; }
.sbs-full-description p:last-child, .sbs-biography p:last-child { margin-bottom: 0; }
.sbs-full-description ul, .sbs-full-description ol, .sbs-biography ul, .sbs-biography ol { margin: 8px 0 14px; padding-left: 25px; }
.sbs-full-description li, .sbs-biography li { margin: 0 0 5px; line-height: 1.5; }
.sbs-full-description li:last-child, .sbs-biography li:last-child { margin-bottom: 0; }
.sbs-full-description h1, .sbs-full-description h2, .sbs-full-description h3, .sbs-full-description h4, .sbs-full-description h5, .sbs-full-description h6, .sbs-biography h1, .sbs-biography h2, .sbs-biography h3, .sbs-biography h4, .sbs-biography h5, .sbs-biography h6 { margin-top: 18px; margin-bottom: 9px; line-height: 1.2; }
.sbs-full-description > h1:first-child, .sbs-full-description > h2:first-child, .sbs-full-description > h3:first-child, .sbs-full-description > h4:first-child, .sbs-full-description > h5:first-child, .sbs-full-description > h6:first-child, .sbs-biography > h1:first-child, .sbs-biography > h2:first-child, .sbs-biography > h3:first-child, .sbs-biography > h4:first-child, .sbs-biography > h5:first-child, .sbs-biography > h6:first-child { margin-top: 0; }
.sbs-full-description h1, .sbs-full-description h2, .sbs-full-description h3, .sbs-full-description h4, .sbs-full-description h5, .sbs-full-description h6 { color: #344e36; }
.sbs-full-description img, .sbs-biography img { max-width: 100%; height: auto; }
.sbs-full-description table, .sbs-biography table { margin: 8px 0; }
.sbs-full-description blockquote, .sbs-biography blockquote { margin: 10px 0; padding: 8px 12px; border-left: 4px solid #8ca08a; background: #f1f3ec; }
.sbs-full-description code, .sbs-biography code { overflow-wrap: anywhere; }
.sbs-static-link { font-weight: 700; color: #425e44; }
.sbs-subsection { margin-top: 15px; padding-top: 12px; border-top: 1px dashed #d7d1c2; display: flow-root; }
.sbs-spell-level, .sbs-item-group, .sbs-spell-list-group { display: flow-root; }
.sbs-spell-level > h3, .sbs-item-group > h3, .sbs-spell-list-group > h3 { display: flex; justify-content: space-between; margin: 26px 0 14px; padding: 8px 11px; border-radius: 6px; background: #e8eee4; color: #365238; }
.sbs-spell-level > h3 span, .sbs-item-group > h3 span, .sbs-spell-list-group > h3 span { opacity: .6; font-family: Arial, sans-serif; }
.sbs-spell-name-list { columns: 3 180px; column-gap: 28px; margin: 0 4px 12px; padding-left: 22px; }
.sbs-spell-name-list li { break-inside: avoid; margin: 0 0 4px; }
.sbs-empty { color: #747970; font-style: italic; }
.sbs-biography { padding: 6px 2px; display: flow-root; }
.sbs-footer { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 32px; padding-top: 14px; border-top: 1px solid #d5d0c1; color: #697068; font: 12px Arial, sans-serif; }
.sbs-footer img { width: 28px; height: 28px; object-fit: contain; }
.sbs-generated { text-align: center; margin-top: 6px; color: #8a8d87; font: 10px Arial, sans-serif; }
@media (max-width: 760px) { .sbs-page { width: 100%; margin: 0; padding: 24px 18px 40px; border: 0; border-radius: 0; } .sbs-hero { grid-template-columns: 92px minmax(0,1fr); } .sbs-portrait { width: 92px; height: 92px; } .sbs-hero h1 { font-size: 29px; } .sbs-toc, .sbs-quick-grid { grid-template-columns: 1fr; } .sbs-abilities { grid-template-columns: repeat(3,1fr); } .sbs-meta-grid { grid-template-columns: 1fr; } }
@page { size: auto; margin: 0.45in; }
@media print {
  body { background: #fff; color: #111; font-size: 10.5pt; }
  .sbs-toolbar { display: none !important; }
  .sbs-page { width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: #fff; }
  .sbs-toc a { color: #111; }
  .sbs-section-title > a { display: none; }
  .sbs-break-before { break-before: page; }
  .sbs-entry { break-inside: auto; page-break-inside: auto; }
  .sbs-entry-header, .sbs-entry .sbs-meta-grid, table tr { break-inside: avoid; page-break-inside: avoid; }
  .sbs-full-description p, .sbs-biography p, li { orphans: 3; widows: 3; }
  a { color: inherit; text-decoration: none; }
}
`;
}

async function pathToDataUrl(path) {
  if (!path || /^data:/i.test(path)) return path || "";
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not embed image ${path}`, error);
    return path;
  }
}

async function embedImages(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img[src]"));
  const cache = new Map();
  for (const image of images) {
    const src = image.getAttribute("src");
    if (!src || /^data:/i.test(src)) continue;
    if (!cache.has(src)) cache.set(src, await pathToDataUrl(src));
    image.setAttribute("src", cache.get(src));
  }
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function exportDocumentShell(actor, options, body, counts, logoPath, portraitPath) {
  const generatedAt = new Date().toLocaleString();
  const portrait = options.includePortrait && portraitPath ? `<img class="sbs-portrait" src="${escapeAttr(portraitPath)}" alt="${escapeAttr(actor.name)}">` : `<img class="sbs-portrait" src="${escapeAttr(logoPath)}" alt="SaltyBananaSlug">`;
  const spellTocLabel = options.spellMode === "prepared"
    ? "Prepared Spell List"
    : options.spellMode === "prepared-details"
      ? "Prepared Spellbook"
      : "Spellbook";
  const toc = options.spellbookOnly
    ? [tocLink("spells", spellTocLabel, counts.spells)]
    : [
        tocLink("overview", "Overview"),
        tocLink("skills", "Skills"),
        tocLink("traits", "Traits & Proficiencies"),
        tocLink("resources", "Resources"),
        tocLink("features", "Features", counts.features),
        ...(options.spellMode !== "none" ? [tocLink("spells", spellTocLabel, counts.spells)] : []),
        tocLink("inventory", "Items & Equipment", counts.inventory)
      ];
  if (!options.spellbookOnly && options.includeBiography) toc.push(tocLink("biography", "Biography"));
  if (!options.spellbookOnly && options.includeEffects) toc.push(tocLink("effects", "Active Effects"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(actor.name)} — SaltyBananaSlug ${options.spellbookOnly ? "Spellbook" : "Character Sheet"}</title>
<style>${exportCss()}</style>
</head>
<body id="top" data-sbs-export-kind="${options.spellbookOnly ? "spellbook" : "character-sheet"}">
<div class="sbs-toolbar">
  <button type="button" onclick="window.print()">Browser Print / Save PDF (Fallback)</button>
  <button type="button" onclick="document.getElementById('top').scrollIntoView()">Top</button>
</div>
<main class="sbs-page">
  <header class="sbs-hero">
    ${portrait}
    <div>
      <h1>${escapeHTML(actor.name)}</h1>
      <p class="sbs-subtitle">${escapeHTML(actorSubtitle(actor))}</p>
      <div class="sbs-brandline"><img src="${escapeAttr(logoPath)}" alt=""><span>SaltyBananaSlug ${options.spellbookOnly ? "Spellbook" : "Character Sheet"}</span></div>
    </div>
  </header>
  <nav class="sbs-toc">${toc.join("")}</nav>
  ${body}
  <footer class="sbs-footer"><img src="${escapeAttr(logoPath)}" alt=""><span>Made with SaltyBananaSlug's Character Sheets for Foundry VTT</span></footer>
  <div class="sbs-generated">Generated ${escapeHTML(generatedAt)} • Export contains the Actor data visible to the exporting Foundry user.</div>
</main>
</body>
</html>`;
}

async function buildExportHtml(actor, options = {}) {
  if (!actor) throw new Error("No Actor selected.");
  if (!canExportActor(actor)) throw new Error("You do not own this Actor and cannot export it.");
  if (game.system.id !== "dnd5e") throw new Error("This module currently supports the D&D5e system.");

  const resolved = {
    includeBiography: options.includeBiography !== false,
    includePortrait: options.includePortrait !== false,
    includeItemImages: options.includeItemImages === true,
    includeEffects: options.includeEffects !== false,
    includeCurrency: options.includeCurrency !== false,
    includeSource: options.includeSource !== false,
    spellMode: ["all", "prepared", "prepared-details", "none"].includes(options.spellMode) ? options.spellMode : "prepared",
    spellbookOnly: options.spellbookOnly === true,
    includeSecrets: game.user.isGM && options.includeSecrets === true,
    revealUnidentified: game.user.isGM && options.revealUnidentified === true
  };

  const counts = itemCounts(actor, { spellMode: resolved.spellMode });
  const sections = [];

  if (!resolved.spellbookOnly) {
    sections.push(section("overview", "Character Overview", actorQuickSection(actor)));
    sections.push(section("skills", "Skills", skillsSection(actor)));
    sections.push(section("traits", "Traits, Defenses & Proficiencies", traitsSection(actor)));
    sections.push(section("resources", "Resources & Currency", resourcesSection(actor, resolved)));
    sections.push(section("features", "Features & Abilities", await featuresSection(actor, resolved), { subtitle: "Only features actually present on this Actor, with full readable descriptions" }));
  }

  if (resolved.spellMode !== "none") {
    const spellTitle = resolved.spellMode === "prepared"
      ? "Prepared Spell List"
      : resolved.spellMode === "prepared-details"
        ? "Prepared Spellbook"
        : "Spellbook";
    const spellSubtitle = resolved.spellMode === "prepared"
      ? "Compact list of cantrips, always-available spells, and spells currently marked prepared"
      : resolved.spellMode === "prepared-details"
        ? "Only prepared, always-available, and cantrip spells, with complete descriptions and casting details"
        : "All spell entries currently on this Actor, with complete descriptions and casting details";
    sections.push(section("spells", spellTitle, await spellsSection(actor, resolved), { subtitle: spellSubtitle }));
  } else if (resolved.spellbookOnly) {
    sections.push(section("spells", "Spellbook", `<p class="sbs-empty">Spellbook Only is enabled, but spell export is set to No spells.</p>`));
  }

  if (!resolved.spellbookOnly) {
    sections.push(section("inventory", "Items & Equipment", await inventorySection(actor, resolved), { subtitle: "Items actually carried by this Actor, with complete readable descriptions" }));
    if (resolved.includeBiography) sections.push(section("biography", "Biography & Notes", await biographySection(actor, resolved)));
    if (resolved.includeEffects) sections.push(section("effects", "Active Effects & Conditions", effectsSection(actor)));
  }

  const rawHtml = exportDocumentShell(actor, resolved, sections.join(""), counts, LOGO_PATH, actor.img);
  return embedImages(rawHtml);
}


function pdfNormalizeText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function pdfElementText(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.("br").forEach((br) => br.replaceWith("\n"));
  return pdfNormalizeText(clone.textContent || "");
}

function pdfPush(blocks, text, { size = 9.4, bold = false, before = 0, after = 3, indent = 0, rule = false } = {}) {
  const clean = pdfNormalizeText(text);
  if (!clean) return;
  blocks.push({ text: clean, size, bold, before, after, indent, rule });
}

function pdfCollectContent(element, blocks) {
  if (!element || element.nodeType !== 1) return;
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "img", "nav", "button"].includes(tag)) return;
  if (element.classList.contains("sbs-toolbar") || element.classList.contains("sbs-section-title") || element.classList.contains("sbs-footer") || element.classList.contains("sbs-generated")) return;

  if (element.classList.contains("sbs-entry")) {
    const name = element.querySelector(":scope > .sbs-entry-header h4")?.textContent || "Entry";
    const type = element.querySelector(":scope > .sbs-entry-header .sbs-entry-type")?.textContent || "";
    pdfPush(blocks, name, { size: 12.2, bold: true, before: 5, after: 1 });
    if (type) pdfPush(blocks, type, { size: 8.2, bold: true, after: 2 });
    const metadata = element.querySelector(":scope > .sbs-meta-grid");
    if (metadata) pdfCollectContent(metadata, blocks);
    const desc = element.querySelector(":scope > .sbs-full-description");
    if (desc) {
      for (const child of desc.children) {
        if (child.tagName?.toLowerCase() === "h5" && /full description/i.test(child.textContent || "")) continue;
        pdfCollectContent(child, blocks);
      }
    }
    return;
  }

  if (element.classList.contains("sbs-card")) {
    const heading = element.querySelector(":scope > h3");
    if (heading) pdfPush(blocks, heading.textContent, { size: 11.2, bold: true, before: 4, after: 2 });
    for (const child of element.children) if (child !== heading) pdfCollectContent(child, blocks);
    return;
  }

  if (element.classList.contains("sbs-ability")) {
    const label = element.querySelector("span")?.textContent || "Ability";
    const score = element.querySelector("strong")?.textContent || "";
    const detail = element.querySelector("small")?.textContent || "";
    pdfPush(blocks, `${label}: ${score}${detail ? ` - ${detail}` : ""}`, { size: 9.2, after: 1 });
    return;
  }

  if (element.classList.contains("sbs-meta-grid") || tag === "dl") {
    const rows = Array.from(element.querySelectorAll(":scope > div"));
    if (rows.length) {
      for (const row of rows) {
        const key = row.querySelector("dt")?.textContent || "";
        const value = row.querySelector("dd")?.textContent || "";
        if (key || value) pdfPush(blocks, key ? `${key}: ${value}` : value, { size: 9.1, after: 1 });
      }
      return;
    }
  }

  if (tag === "table") {
    for (const row of Array.from(element.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) => pdfElementText(cell)).filter(Boolean);
      if (!cells.length) continue;
      if (cells.length === 2) pdfPush(blocks, `${cells[0]}: ${cells[1]}`, { size: 8.9, after: 1 });
      else pdfPush(blocks, cells.join(" | "), { size: 8.5, after: 1 });
    }
    return;
  }

  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    Array.from(element.children).filter((child) => child.tagName?.toLowerCase() === "li").forEach((li, index) => {
      pdfPush(blocks, `${ordered ? `${index + 1}.` : "-"} ${pdfElementText(li)}`, { size: 9.2, indent: 10, after: 1 });
    });
    return;
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const size = level <= 2 ? 13.2 : level === 3 ? 11.4 : 10.2;
    pdfPush(blocks, element.textContent, { size, bold: true, before: level <= 2 ? 7 : 4, after: 2, rule: level <= 2 });
    return;
  }

  if (tag === "p" || tag === "blockquote" || tag === "pre") {
    pdfPush(blocks, pdfElementText(element), { size: 9.3, indent: tag === "blockquote" ? 10 : 0, after: 3 });
    return;
  }

  if (tag === "a" && /back to top/i.test(element.textContent || "")) return;

  const blockChildren = Array.from(element.children).filter((child) => !["span", "strong", "em", "b", "i", "small", "a", "code"].includes(child.tagName?.toLowerCase()));
  if (!blockChildren.length) {
    const text = pdfElementText(element);
    if (text) pdfPush(blocks, text, { size: 9.3, after: 2 });
    return;
  }
  for (const child of element.children) pdfCollectContent(child, blocks);
}

function pdfBlocksFromHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const page = doc.querySelector(".sbs-page") || doc.body;
  const blocks = [];
  const title = page.querySelector(".sbs-hero h1")?.textContent || doc.title || "Character Sheet";
  const subtitle = page.querySelector(".sbs-subtitle")?.textContent || "";
  const kind = doc.body?.dataset?.sbsExportKind === "spellbook" ? "Spellbook" : "Character Sheet";
  pdfPush(blocks, title, { size: 20, bold: true, after: 2 });
  if (subtitle) pdfPush(blocks, subtitle, { size: 10.4, bold: true, after: 2 });
  pdfPush(blocks, `SaltyBananaSlug ${kind}`, { size: 9.2, bold: true, after: 8, rule: true });

  for (const section of Array.from(page.querySelectorAll(":scope > .sbs-section"))) {
    const heading = section.querySelector(":scope > .sbs-section-title h2")?.textContent || "Section";
    const subtitleText = section.querySelector(":scope > .sbs-section-title p")?.textContent || "";
    pdfPush(blocks, heading, { size: 14.2, bold: true, before: 8, after: 2, rule: true });
    if (subtitleText) pdfPush(blocks, subtitleText, { size: 8.7, after: 4 });
    for (const child of section.children) {
      if (child.classList?.contains("sbs-section-title")) continue;
      pdfCollectContent(child, blocks);
    }
  }
  return { blocks, kind, title: pdfNormalizeText(title) };
}

function pdfWrapLine(text, fontSize, maxWidth) {
  const maxChars = Math.max(18, Math.floor(maxWidth / Math.max(4.3, fontSize * 0.51)));
  const lines = [];
  for (const rawParagraph of String(text || "").split(/\n+/)) {
    const words = rawParagraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) { lines.push(line); line = ""; }
        for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function pdfEscapeString(text) {
  return pdfNormalizeText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfBuildBytes(htmlText) {
  const { blocks, kind, title } = pdfBlocksFromHtml(htmlText);
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 46;
  const topY = 748;
  const bottomY = 48;
  const contentWidth = pageWidth - marginX * 2;
  const pages = [];
  let commands = [];
  let y = topY;

  const finishPage = () => {
    const pageNo = pages.length + 1;
    commands.push(`BT /F1 7 Tf ${marginX} 24 Td (SaltyBananaSlug ${pdfEscapeString(kind)} - Page ${pageNo}) Tj ET`);
    pages.push(commands.join("\n"));
    commands = [];
    y = topY;
  };

  const ensureSpace = (needed) => {
    if (y - needed < bottomY) finishPage();
  };

  for (const block of blocks) {
    y -= Number(block.before || 0);
    const fontSize = Number(block.size || 9.4);
    const lineHeight = Math.max(10.5, fontSize * 1.32);
    const indent = Number(block.indent || 0);
    const maxWidth = contentWidth - indent;
    const wrapped = pdfWrapLine(block.text, fontSize, maxWidth);
    if (!wrapped.length) continue;
    if (block.bold && wrapped.length <= 2) ensureSpace(lineHeight * Math.min(2, wrapped.length) + Number(block.after || 0) + 8);
    for (const line of wrapped) {
      ensureSpace(lineHeight);
      const font = block.bold ? "F2" : "F1";
      commands.push(`BT /${font} ${fontSize.toFixed(2)} Tf ${(marginX + indent).toFixed(2)} ${y.toFixed(2)} Td (${pdfEscapeString(line)}) Tj ET`);
      y -= lineHeight;
    }
    if (block.rule) {
      ensureSpace(5);
      const ruleY = Math.max(bottomY, y + 1);
      commands.push(`0.55 w ${marginX} ${ruleY.toFixed(2)} m ${pageWidth - marginX} ${ruleY.toFixed(2)} l S`);
      y -= 4;
    }
    y -= Number(block.after || 0);
  }
  if (commands.length || !pages.length) finishPage();

  const pageCount = pages.length;
  const fontNormalId = 3 + pageCount * 2;
  const fontBoldId = fontNormalId + 1;
  const objects = new Array(fontBoldId + 1);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const kids = [];
  for (let i = 0; i < pageCount; i++) kids.push(`${3 + i * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;
  for (let i = 0; i < pageCount; i++) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const stream = pages[i];
    const streamLength = new TextEncoder().encode(stream).length;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontNormalId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontNormalId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[fontBoldId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = new Array(objects.length).fill(0);
  let byteOffset = 0;
  const append = (text) => {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    byteOffset += bytes.length;
  };
  append("%PDF-1.4\n%SBS\n");
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = byteOffset;
    append(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xrefOffset = byteOffset;
  append(`xref\n0 ${objects.length}\n`);
  append("0000000000 65535 f \n");
  for (let id = 1; id < objects.length; id++) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title (${pdfEscapeString(title + " - " + kind)}) /Producer (SaltyBananaSlug Character Sheets) >> >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
  return output;
}

function pdfStringFromHtml(htmlText) {
  // pdfBuildBytes deliberately emits an ASCII-only PDF. Converting those bytes
  // directly to a JS string lets Foundry's native saveDataToFile preserve the
  // exact PDF bytes without using a blob/object URL in this module.
  const bytes = pdfBuildBytes(htmlText);
  const chunkSize = 0x8000;
  let output = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return output;
}



// ---------------------------------------------------------------------------
// Styled PDF capture
// ---------------------------------------------------------------------------
// The HTML preview is the source of truth for the PDF. We capture that rendered
// layout page-by-page so branding, cards, spacing, images, and typography match
// what the user sees instead of rebuilding a second, text-only document.

function sbsWaitForImage(image, timeoutMs = 8000) {
  if (!image) return Promise.resolve();
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

async function sbsWaitForPreviewAssets(doc) {
  if (!doc) return;
  try { await doc.fonts?.ready; } catch (_) {}
  await Promise.all(Array.from(doc.images || []).map((img) => sbsWaitForImage(img)));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function sbsRelativeBox(element, rootRect) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - rootRect.top,
    bottom: rect.bottom - rootRect.top,
    height: rect.height
  };
}

function sbsSmartPageRanges(doc, root, pagePixelHeight, topPadding, bottomPadding) {
  const rootRect = root.getBoundingClientRect();
  const totalHeight = Math.ceil(rootRect.height);
  const capacity = Math.max(300, pagePixelHeight - topPadding - bottomPadding);
  const EPS = 2;

  const relTop = (rect) => rect.top - rootRect.top;
  const relBottom = (rect) => rect.bottom - rootRect.top;

  // -----------------------------------------------------------------------
  // Safe break candidates
  // -----------------------------------------------------------------------
  // Instead of eventually falling back to an arbitrary pixel coordinate, we
  // collect places where the browser has actually rendered whitespace: block
  // boundaries and the gaps BETWEEN line boxes. This prevents the capture
  // crop from bisecting glyphs or a line of prose.
  const blockBreaks = [];
  const lineBreaks = [];

  const addCandidate = (list, value) => {
    if (!Number.isFinite(value) || value <= 1 || value >= totalHeight - 1) return;
    list.push(value);
  };

  const blockSelectors = [
    ".sbs-section-title",
    ".sbs-entry",
    ".sbs-quick-grid > .sbs-card",
    ".sbs-spell-level > h3",
    ".sbs-item-group > h3",
    ".sbs-spell-list-group > h3",
    ".sbs-full-description > *",
    ".sbs-biography > *",
    ".sbs-subsection > *",
    "table tr"
  ].join(",");

  for (const el of root.querySelectorAll(blockSelectors)) {
    const rect = el.getBoundingClientRect();
    addCandidate(blockBreaks, relTop(rect));
    addCandidate(blockBreaks, relBottom(rect));
  }

  const lineContainers = root.querySelectorAll([
    ".sbs-full-description p",
    ".sbs-full-description li",
    ".sbs-biography p",
    ".sbs-biography li",
    ".sbs-subsection p",
    ".sbs-subsection li",
    ".sbs-entry-type",
    ".sbs-meta-value",
    "table td",
    "table th"
  ].join(","));

  for (const el of lineContainers) {
    let rects = [];
    try {
      const range = doc.createRange();
      range.selectNodeContents(el);
      rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
        .map((rect) => ({ top: relTop(rect), bottom: relBottom(rect) }))
        .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
      range.detach?.();
    } catch (_) {
      rects = [];
    }

    // Range rects can produce several fragments on the same visual line when
    // inline markup is present. Collapse those fragments into one line box.
    const lines = [];
    for (const rect of rects) {
      const existing = lines.find((line) => Math.abs(line.top - rect.top) <= 2.5);
      if (existing) {
        existing.top = Math.min(existing.top, rect.top);
        existing.bottom = Math.max(existing.bottom, rect.bottom);
      } else {
        lines.push({ ...rect });
      }
    }
    lines.sort((a, b) => a.top - b.top);

    // The safest cut is halfway through the rendered leading between lines.
    for (let i = 0; i < lines.length - 1; i++) {
      const current = lines[i];
      const next = lines[i + 1];
      if (next.top >= current.bottom - 0.5) {
        addCandidate(lineBreaks, (current.bottom + next.top) / 2);
      }
    }

    // Ending immediately after the element is also safe and often gives the
    // cleanest page bottom after a paragraph/list item.
    const elRect = el.getBoundingClientRect();
    addCandidate(lineBreaks, relBottom(elRect));
  }

  // De-duplicate coordinates so candidate selection stays deterministic.
  const uniqueSorted = (values) => Array.from(new Set(values.map((v) => Math.round(v * 10) / 10))).sort((a, b) => a - b);
  const cleanBlockBreaks = uniqueSorted(blockBreaks);
  const cleanLineBreaks = uniqueSorted(lineBreaks);

  // Prefer the CENTER of real visual gutters rather than the exact edge of a
  // block. The HTML intentionally uses consistent spacing between cards,
  // headings, and description blocks; cutting through the middle of those
  // gutters gives the rasterizer several pixels of safety on either side.
  const gapBreaks = [];
  const gapElements = Array.from(root.querySelectorAll([
    ".sbs-section-title",
    ".sbs-entry",
    ".sbs-quick-grid > .sbs-card",
    ".sbs-spell-level > h3",
    ".sbs-item-group > h3",
    ".sbs-spell-list-group > h3",
    ".sbs-full-description > *",
    ".sbs-biography > *",
    ".sbs-subsection > *"
  ].join(",")))
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height > 0.5)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  for (let i = 0; i < gapElements.length - 1; i++) {
    const a = gapElements[i].rect;
    const b = gapElements[i + 1].rect;
    // Only use vertical siblings/blocks with a meaningful clear band. A 7px
    // minimum keeps us away from antialiasing and borders.
    const gapTop = relBottom(a);
    const gapBottom = relTop(b);
    if (gapBottom - gapTop >= 7) addCandidate(gapBreaks, (gapTop + gapBottom) / 2);
  }
  const cleanGapBreaks = uniqueSorted(gapBreaks);

  // -----------------------------------------------------------------------
  // Keep-with-next / no-break zones
  // -----------------------------------------------------------------------
  // These zones keep headings attached to meaningful content. They do NOT try
  // to keep an entire huge entry together; they only protect the title/header
  // and the beginning of its content so a page never ends with a lonely label.
  const forbidden = [];
  const addForbidden = (top, bottom) => {
    top = Math.max(0, top);
    bottom = Math.min(totalHeight, bottom);
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom - top > 4) forbidden.push({ top, bottom });
  };

  const keepHeadingWithNext = (heading, next, maxKeep = 190) => {
    if (!heading || !next) return;
    const h = heading.getBoundingClientRect();
    const n = next.getBoundingClientRect();
    const top = relTop(h) + EPS;
    const naturalBottom = relBottom(n) - EPS;
    const cappedBottom = Math.min(naturalBottom, relBottom(h) + maxKeep);
    if (cappedBottom > top) addForbidden(top, cappedBottom);
  };

  // Main section title + the beginning of its first content block.
  for (const heading of root.querySelectorAll(".sbs-section-title")) {
    const next = heading.nextElementSibling;
    keepHeadingWithNext(heading, next, 210);
  }

  // Spell level / item group / prepared-list headings + first row/card.
  for (const heading of root.querySelectorAll(".sbs-spell-level > h3, .sbs-item-group > h3, .sbs-spell-list-group > h3")) {
    keepHeadingWithNext(heading, heading.nextElementSibling, 190);
  }

  // Entry title/header + metadata/first description content. Long entries may
  // span pages, but their title is never stranded at the previous page bottom.
  for (const entry of root.querySelectorAll(".sbs-entry")) {
    const header = entry.querySelector(":scope > .sbs-entry-header") || entry.firstElementChild;
    if (!header) continue;
    const firstUseful = entry.querySelector(":scope > .sbs-meta-grid") || entry.querySelector(":scope > .sbs-full-description") || header.nextElementSibling;
    keepHeadingWithNext(header, firstUseful, 210);
  }

  // Headings that occur inside full rules text stay with at least the start of
  // the paragraph/list/table that follows them.
  for (const heading of root.querySelectorAll(".sbs-full-description h1, .sbs-full-description h2, .sbs-full-description h3, .sbs-full-description h4, .sbs-full-description h5, .sbs-full-description h6, .sbs-biography h1, .sbs-biography h2, .sbs-biography h3, .sbs-biography h4, .sbs-biography h5, .sbs-biography h6, .sbs-subsection h5")) {
    keepHeadingWithNext(heading, heading.nextElementSibling, 160);
  }

  // Table headers should not be abandoned without the first body row.
  for (const table of root.querySelectorAll("table")) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    const nextRow = headerRow?.nextElementSibling || table.querySelector("tbody tr");
    if (headerRow && nextRow && headerRow !== nextRow) keepHeadingWithNext(headerRow, nextRow, 170);
  }

  const isForbidden = (value) => forbidden.some((zone) => value > zone.top + EPS && value < zone.bottom - EPS);

  // Normal-sized visual units should simply move intact to the next page.
  const intactSelectors = [
    ".sbs-entry",
    ".sbs-quick-grid > .sbs-card",
    "table tr"
  ].join(",");
  const intact = Array.from(root.querySelectorAll(intactSelectors))
    .map((el) => ({ el, ...sbsRelativeBox(el, rootRect) }))
    .sort((a, b) => a.top - b.top);

  const candidateNear = (candidates, start, desired, minFillRatio) => {
    const min = start + capacity * minFillRatio;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const value = candidates[i];
      if (value >= desired - EPS) continue;
      if (value <= min) break;
      if (value <= start + 24 || isForbidden(value)) continue;
      return value;
    }
    return null;
  };

  const ranges = [];
  let start = 0;
  let guard = 0;
  while (start < totalHeight - 1 && guard++ < 500) {
    const desired = Math.min(totalHeight, start + capacity);
    if (desired >= totalHeight - 1) {
      ranges.push({ start, end: totalHeight });
      break;
    }

    let end = null;

    // Priority 1: if a card/row that fits on one page crosses the page edge,
    // break before it and leave whitespace. This gives the cleanest result.
    const crossing = intact
      .filter((box) => box.top > start + 20 && box.top < desired - EPS && box.bottom > desired + EPS && box.height < capacity * 0.94)
      .sort((a, b) => b.top - a.top)[0];
    if (crossing && crossing.top - start >= capacity * 0.30 && !isForbidden(crossing.top)) {
      end = Math.max(start + 80, crossing.top - 7);
    }

    // Priority 2: the middle of a real visual gutter near the page bottom.
    if (end == null) end = candidateNear(cleanGapBreaks, start, desired, 0.58);

    // Priority 3: natural block boundary near the bottom of the page.
    if (end == null) end = candidateNear(cleanBlockBreaks, start, desired, 0.58);

    // Priority 4: measured whitespace BETWEEN rendered text lines. This is the
    // critical fallback for entries/descriptions taller than a full page.
    if (end == null) end = candidateNear(cleanLineBreaks, start, desired, 0.50);

    // Priority 5: accept an earlier safe gutter/boundary rather than ever
    // bisecting text.
    if (end == null) end = candidateNear(cleanGapBreaks, start, desired, 0.25);
    if (end == null) end = candidateNear(cleanBlockBreaks, start, desired, 0.25);
    if (end == null) end = candidateNear(cleanLineBreaks, start, desired, 0.20);

    // Truly pathological content (for example one enormous unsplittable image)
    // may provide no safe browser-measured boundary. Only then use the raw edge.
    if (!Number.isFinite(end) || end <= start + 40) end = desired;
    end = Math.min(totalHeight, end);

    ranges.push({ start, end });
    start = end;
  }

  return ranges;
}

function sbsSerializePreviewPage(doc, root, width) {
  const css = Array.from(doc.querySelectorAll("style")).map((style) => style.textContent || "").join("\n");
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script").forEach((node) => node.remove());
  const serialized = new XMLSerializer().serializeToString(clone);
  const override = `
html,body{margin:0!important;padding:0!important;background:#fff!important;}
.sbs-page{width:${width}px!important;max-width:none!important;margin:0!important;box-shadow:none!important;border-radius:0!important;}
.sbs-toolbar{display:none!important;}
`;
  return { css: css + override, serialized };
}

function sbsSvgDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function sbsLoadSvgImage(svgText) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not rasterize the styled character sheet page."));
    image.src = sbsSvgDataUrl(svgText);
  });
}

function sbsDataUrlBytes(dataUrl) {
  const comma = String(dataUrl).indexOf(",");
  if (comma < 0) throw new Error("Invalid image data while building PDF.");
  const binary = atob(String(dataUrl).slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sbsCaptureStyledPdfPages(doc) {
  await sbsWaitForPreviewAssets(doc);
  const root = doc.querySelector(".sbs-page");
  if (!root) throw new Error("The rendered character sheet could not be found in the preview.");

  // Measure the exact visible sheet and keep that precise width. Rounding the
  // width before rendering can change wrapping by a pixel and invalidate the
  // carefully measured page-break coordinates.
  const rootRect = root.getBoundingClientRect();
  const width = Math.max(600, rootRect.width);
  const totalHeight = Math.max(1, Math.ceil(rootRect.height));
  const pagePixelHeight = Math.ceil(width * (297 / 210)); // A4 portrait ratio
  const topPadding = Math.round(width * 0.028);
  const bottomPadding = Math.round(width * 0.032);
  const ranges = sbsSmartPageRanges(doc, root, pagePixelHeight, topPadding, bottomPadding);
  const { css, serialized } = sbsSerializePreviewPage(doc, root, width);

  // Render the character sheet ONCE as one continuous image. Previous builds
  // re-rendered the HTML separately for each PDF page; even tiny reflow or font
  // differences could move a line across a crop boundary. Cropping one already-
  // rendered image means the measured sheet and every PDF page share the exact
  // same pixels and line wrapping.
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
<foreignObject x="0" y="0" width="${width}" height="${totalHeight}">
<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${width}px;height:${totalHeight}px;overflow:hidden;background:#ffffff;">
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
${serialized}
</div>
</foreignObject>
</svg>`;

  const image = await sbsLoadSvgImage(fullSvg);

  // Stay comfortably under common browser canvas limits while preserving as
  // much resolution as possible. Normal character sheets will remain at 1.6x.
  const MAX_CANVAS_DIMENSION = 30000;
  const scale = Math.min(1.6, MAX_CANVAS_DIMENSION / Math.max(width, totalHeight));
  const renderScale = Math.max(0.7, scale);
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = Math.max(1, Math.ceil(width * renderScale));
  fullCanvas.height = Math.max(1, Math.ceil(totalHeight * renderScale));
  const fullCtx = fullCanvas.getContext("2d", { alpha: false });
  if (!fullCtx) throw new Error("Canvas rendering is unavailable in this browser.");
  fullCtx.fillStyle = "#ffffff";
  fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
  fullCtx.drawImage(image, 0, 0, fullCanvas.width, fullCanvas.height);

  const pages = [];
  for (let pageIndex = 0; pageIndex < ranges.length; pageIndex++) {
    const range = ranges[pageIndex];
    const sliceHeight = Math.max(1, range.end - range.start);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(width * renderScale);
    pageCanvas.height = Math.ceil(pagePixelHeight * renderScale);
    const ctx = pageCanvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas rendering is unavailable in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    // Convert the DOM coordinates directly into coordinates on the one full
    // rendered sheet. Use floor/ceil on the OUTSIDE edges so antialiased glyphs
    // are never clipped by a fractional-pixel crop.
    const sourceY = Math.max(0, Math.floor(range.start * renderScale));
    const sourceEnd = Math.min(fullCanvas.height, Math.ceil(range.end * renderScale));
    const sourceHeight = Math.max(1, sourceEnd - sourceY);
    const destY = Math.round(topPadding * renderScale);

    ctx.drawImage(
      fullCanvas,
      0,
      sourceY,
      fullCanvas.width,
      sourceHeight,
      0,
      destY,
      pageCanvas.width,
      sourceHeight
    );

    const jpeg = pageCanvas.toDataURL("image/jpeg", 0.94);
    pages.push({
      bytes: sbsDataUrlBytes(jpeg),
      width: pageCanvas.width,
      height: pageCanvas.height
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  // Release the large backing canvas as soon as possible.
  fullCanvas.width = 1;
  fullCanvas.height = 1;
  return pages;
}


// ---------------------------------------------------------------------------
// Semantic paged PDF capture (v0.1.13+)
// ---------------------------------------------------------------------------
// The downloadable HTML remains a continuous, linked document. PDF export uses
// the SAME rendered content and CSS, but lays cloned semantic blocks into real
// A4-sized page containers before rasterization. Nothing is ever cropped out of
// a continuous screenshot, so text lines and words cannot be bisected by a page
// boundary.

function sbsPdfGatherCss(doc, pageWidth, pageHeight) {
  const css = Array.from(doc.querySelectorAll("style")).map((style) => style.textContent || "").join("\n");
  return `${css}\n
html,body{margin:0!important;padding:0!important;background:#fff!important;}
.sbs-toolbar{display:none!important;}
.sbs-pdf-page{width:${pageWidth}px!important;max-width:none!important;height:${pageHeight}px!important;min-height:${pageHeight}px!important;margin:0!important;box-sizing:border-box!important;overflow:hidden!important;box-shadow:none!important;border-radius:0!important;position:relative!important;}
.sbs-pdf-page>.sbs-section-title{margin-top:24px!important;}
.sbs-pdf-page>.sbs-pdf-group{margin-top:0!important;}
.sbs-pdf-page .sbs-section-title>a{display:none!important;}
.sbs-pdf-page .sbs-entry{break-inside:auto!important;page-break-inside:auto!important;margin-bottom:18px!important;}
.sbs-pdf-page .sbs-entry.sbs-pdf-entry-continuation{border-top:3px solid #8ca08a!important;}
.sbs-pdf-page .sbs-pdf-entry-continuation .sbs-entry-header{margin-bottom:10px!important;}
.sbs-pdf-page .sbs-pdf-cont-label{font:700 10px Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#6e746c;margin-top:2px;}
.sbs-pdf-page .sbs-full-description{overflow:visible!important;}
.sbs-pdf-page .sbs-table-wrap{overflow:visible!important;}
.sbs-pdf-page-footer{position:absolute!important;left:46px!important;right:46px!important;bottom:17px!important;height:30px!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important;align-items:center!important;gap:12px!important;border-top:1px solid #c9c1ad!important;padding-top:7px!important;box-sizing:border-box!important;color:#596159!important;font-family:Arial,Helvetica,sans-serif!important;font-size:10px!important;line-height:1!important;}
.sbs-pdf-page-footer .sbs-pdf-footer-brand{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;font-weight:700!important;white-space:nowrap!important;}
.sbs-pdf-page-footer .sbs-pdf-footer-brand img{width:20px!important;height:20px!important;object-fit:contain!important;display:block!important;flex:0 0 auto!important;}
.sbs-pdf-page-footer .sbs-pdf-footer-name{text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;color:#72786f!important;}
.sbs-pdf-page-footer .sbs-pdf-footer-number{text-align:right!important;font-weight:700!important;white-space:nowrap!important;}
`;
}

function sbsPdfPageFits(page, reserve = 18) {
  const rect = page.getBoundingClientRect();
  const style = page.ownerDocument.defaultView.getComputedStyle(page);
  const bottomPadding = Number.parseFloat(style.paddingBottom) || 0;
  const children = Array.from(page.children).filter((el) => el.getClientRects().length);
  if (!children.length) return true;
  const bottom = Math.max(...children.map((el) => el.getBoundingClientRect().bottom));
  return bottom <= rect.bottom - bottomPadding - reserve;
}

function sbsPdfPageUsedRatio(page) {
  const rect = page.getBoundingClientRect();
  const style = page.ownerDocument.defaultView.getComputedStyle(page);
  const top = rect.top + (Number.parseFloat(style.paddingTop) || 0);
  const bottom = rect.bottom - (Number.parseFloat(style.paddingBottom) || 0);
  const children = Array.from(page.children).filter((el) => el.getClientRects().length);
  if (!children.length || bottom <= top) return 0;
  const usedBottom = Math.max(...children.map((el) => el.getBoundingClientRect().bottom));
  return Math.max(0, Math.min(1, (usedBottom - top) / (bottom - top)));
}

function sbsPdfDescriptionUnits(container) {
  if (!container) return [];
  const atomic = new Set(["P", "UL", "OL", "TABLE", "BLOCKQUOTE", "PRE", "FIGURE", "IMG", "HR", "H1", "H2", "H3", "H4", "H5", "H6"]);
  const blockish = new Set(["P", "UL", "OL", "TABLE", "BLOCKQUOTE", "PRE", "FIGURE", "DIV", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6"]);

  const wrap = (node, wrappers) => {
    let out = node;
    for (let i = wrappers.length - 1; i >= 0; i--) {
      const shell = wrappers[i].cloneNode(false);
      shell.removeAttribute?.("id");
      shell.appendChild(out);
      out = shell;
    }
    return out;
  };

  const walk = (node, wrappers = []) => {
    if (!node || node.nodeType !== 1) return [];
    const tag = node.tagName;
    if (atomic.has(tag)) return [{ node: wrap(node.cloneNode(true), wrappers), leafTag: tag }];

    const children = Array.from(node.children);
    const hasBlockChildren = children.some((child) => blockish.has(child.tagName));
    if (!children.length || !hasBlockChildren) return [{ node: wrap(node.cloneNode(true), wrappers), leafTag: tag }];

    const shell = node.cloneNode(false);
    shell.removeAttribute?.("id");
    return children.flatMap((child) => walk(child, [...wrappers, shell]));
  };

  return Array.from(container.children).flatMap((child) => walk(child));
}

function sbsPdfCloneGroupShell(group) {
  const shell = group.cloneNode(false);
  shell.removeAttribute("id");
  shell.classList.add("sbs-pdf-group");
  return shell;
}

function sbsPdfFlattenFlow(root) {
  const units = [];
  const push = (node, kind = "atomic", keepNext = false) => {
    if (!node) return;
    node.removeAttribute?.("id");
    units.push({ node, kind, keepNext });
  };

  const hero = root.querySelector(":scope > .sbs-hero");
  const toc = root.querySelector(":scope > .sbs-toc");
  if (hero) push(hero.cloneNode(true), "atomic");
  if (toc) push(toc.cloneNode(true), "atomic");

  for (const section of root.querySelectorAll(":scope > .sbs-section")) {
    const title = section.querySelector(":scope > .sbs-section-title");
    if (title) push(title.cloneNode(true), "heading", true);

    for (const child of Array.from(section.children).filter((el) => el !== title)) {
      if (child.matches(".sbs-spell-level, .sbs-item-group, .sbs-spell-list-group")) {
        const groupHeading = child.querySelector(":scope > h3");
        if (groupHeading) {
          const shell = sbsPdfCloneGroupShell(child);
          shell.appendChild(groupHeading.cloneNode(true));
          push(shell, "heading", true);
        }
        for (const groupChild of Array.from(child.children).filter((el) => el !== groupHeading)) {
          const shell = sbsPdfCloneGroupShell(child);
          shell.appendChild(groupChild.cloneNode(true));
          const kind = groupChild.matches(".sbs-entry") ? "entry" : groupChild.matches(".sbs-spell-name-list") ? "list" : "atomic";
          push(shell, kind);
        }
        continue;
      }

      if (child.matches(".sbs-entry")) {
        push(child.cloneNode(true), "entry");
        continue;
      }

      if (child.matches(".sbs-biography")) {
        const unitsInBio = sbsPdfDescriptionUnits(child);
        for (const descUnit of unitsInBio) {
          const bio = child.cloneNode(false);
          bio.appendChild(descUnit.node);
          push(bio, descUnit.leafTag === "TABLE" ? "table" : descUnit.leafTag === "UL" || descUnit.leafTag === "OL" ? "list" : "atomic");
        }
        continue;
      }

      if (child.matches(".sbs-table-wrap") || child.tagName === "TABLE") {
        push(child.cloneNode(true), "table");
        continue;
      }

      push(child.cloneNode(true), "atomic");
    }
  }

  const footer = root.querySelector(":scope > .sbs-footer");
  const generated = root.querySelector(":scope > .sbs-generated");
  if (footer) push(footer.cloneNode(true), "heading", true);
  if (generated) push(generated.cloneNode(true), "atomic");
  return units;
}

function sbsPdfSplitListNode(node) {
  const list = node.matches?.("ul,ol") ? node : node.querySelector?.("ul,ol");
  if (!list) return [];
  const items = Array.from(list.children).filter((el) => el.tagName === "LI");
  if (items.length < 2) return [];
  const parts = [];
  for (const item of items) {
    const outer = node.cloneNode(true);
    const outList = outer.matches?.("ul,ol") ? outer : outer.querySelector("ul,ol");
    outList.innerHTML = "";
    outList.appendChild(item.cloneNode(true));
    parts.push({ node: outer, kind: "atomic", keepNext: false });
  }
  return parts;
}

function sbsPdfSplitTableNode(node) {
  const table = node.tagName === "TABLE" ? node : node.querySelector?.("table");
  if (!table) return [];
  const bodyRows = Array.from(table.querySelectorAll("tbody > tr"));
  const looseRows = !bodyRows.length ? Array.from(table.querySelectorAll(":scope > tr")) : [];
  const rows = bodyRows.length ? bodyRows : looseRows;
  if (rows.length < 2) return [];
  const head = table.querySelector("thead")?.cloneNode(true) || null;
  const parts = [];
  for (const row of rows) {
    const outer = node.cloneNode(true);
    const outTable = outer.tagName === "TABLE" ? outer : outer.querySelector("table");
    outTable.innerHTML = "";
    if (head) outTable.appendChild(head.cloneNode(true));
    const tbody = outTable.ownerDocument.createElement("tbody");
    tbody.appendChild(row.cloneNode(true));
    outTable.appendChild(tbody);
    parts.push({ node: outer, kind: "atomic", keepNext: false });
  }
  return parts;
}

function sbsPdfEntryPieces(entry) {
  const header = entry.querySelector(":scope > .sbs-entry-header");
  const meta = entry.querySelector(":scope > .sbs-meta-grid");
  const desc = entry.querySelector(":scope > .sbs-full-description");
  if (!desc) return [];

  const title = header?.querySelector("h4")?.textContent?.trim() || "Entry";
  const descHeading = desc.querySelector(":scope > h5");
  const bodyUnits = sbsPdfDescriptionUnits(desc).filter((unit) => !unit.node.matches?.("h5") && !unit.node.querySelector?.(":scope > h5"));
  if (!bodyUnits.length) return [];

  // First split keeps a few neighboring description blocks together so a long
  // feature does not become a stack of one-paragraph mini-cards. Only if one of
  // those chunks is itself still too tall do we refine it to one semantic block
  // per continuation card.
  const splitLevel = Number(entry.dataset?.sbsPdfSplitLevel || 0) || 0;
  const chunkSize = splitLevel === 0 ? 3 : 1;
  const chunks = [];
  for (let i = 0; i < bodyUnits.length; i += chunkSize) chunks.push(bodyUnits.slice(i, i + chunkSize));
  if (chunks.length < 2 && splitLevel > 0) return [];

  const pieces = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const article = entry.cloneNode(false);
    article.removeAttribute("id");
    article.dataset.sbsPdfSplitLevel = String(splitLevel + 1);
    if (i === 0) {
      if (header) article.appendChild(header.cloneNode(true));
      if (meta) article.appendChild(meta.cloneNode(true));
    } else {
      article.classList.add("sbs-pdf-entry-continuation");
      const continuation = article.ownerDocument.createElement("header");
      continuation.className = "sbs-entry-header";
      continuation.innerHTML = `<div><h4>${escapeHTML(title)}</h4><div class="sbs-pdf-cont-label">Continued</div></div>`;
      article.appendChild(continuation);
    }
    const outDesc = desc.cloneNode(false);
    if (descHeading) {
      const heading = descHeading.cloneNode(true);
      if (i > 0) heading.textContent = "Full Description — Continued";
      outDesc.appendChild(heading);
    }
    for (const bodyUnit of chunk) outDesc.appendChild(bodyUnit.node);
    article.appendChild(outDesc);

    const soleTag = chunk.length === 1 ? chunk[0].leafTag : "";
    const kind = chunk.length > 1 ? "entry" : soleTag === "TABLE" ? "table" : soleTag === "UL" || soleTag === "OL" ? "list" : "atomic";
    pieces.push({ node: article, kind, keepNext: false, entryPiece: true });
  }
  return pieces;
}

async function sbsBuildSemanticPdfDom(doc, root, pageWidth, pageHeight) {
  const style = doc.defaultView.getComputedStyle(root);
  const paddingTop = Number.parseFloat(style.paddingTop) || 40;
  const paddingRight = Number.parseFloat(style.paddingRight) || 46;
  const paddingBottom = Math.max(Number.parseFloat(style.paddingBottom) || 52, 78);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 46;

  const host = doc.createElement("div");
  host.className = "sbs-pdf-measure-host";
  host.style.cssText = `position:fixed;left:-200000px;top:0;width:${pageWidth}px;z-index:-10000;pointer-events:none;background:#fff;`;
  doc.body.appendChild(host);

  const pages = [];
  const newPage = () => {
    const page = doc.createElement("main");
    page.className = "sbs-page sbs-pdf-page";
    page.style.cssText = `width:${pageWidth}px;max-width:none;height:${pageHeight}px;min-height:${pageHeight}px;margin:0;padding:${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;box-sizing:border-box;overflow:hidden;box-shadow:none;border-radius:0;`;
    host.appendChild(page);
    pages.push(page);
    return page;
  };

  let page = newPage();
  const queue = sbsPdfFlattenFlow(root);

  const appendNodes = (targetPage, unitList) => {
    const added = unitList.map((unit) => {
      const node = unit.node.cloneNode(true);
      targetPage.appendChild(node);
      return node;
    });
    const fits = sbsPdfPageFits(targetPage);
    if (!fits) added.forEach((node) => node.remove());
    return fits;
  };

  const placeWhole = (unit) => {
    if (appendNodes(page, [unit])) return true;
    if (page.children.length) {
      page = newPage();
      if (appendNodes(page, [unit])) return true;
    }
    return false;
  };

  let guard = 0;
  for (let i = 0; i < queue.length && guard++ < 10000;) {
    const unit = queue[i];

    if (unit.keepNext) {
      const bundle = [unit];
      let j = i + 1;
      while (j < queue.length && queue[j].keepNext) bundle.push(queue[j++]);
      if (j < queue.length) bundle.push(queue[j]);

      if (appendNodes(page, bundle)) {
        i += bundle.length;
        continue;
      }
      if (page.children.length) {
        page = newPage();
        if (appendNodes(page, bundle)) {
          i += bundle.length;
          continue;
        }
      }
      // The following content is too large to remain whole. Split that content
      // first, then retry the heading chain with its first semantic piece so a
      // section/group title can never be stranded by itself.
      const tailIndex = i + bundle.length - 1;
      const tail = queue[tailIndex];
      let splitTail = [];
      if (tail?.kind === "entry") splitTail = sbsPdfEntryPieces(tail.node);
      else if (tail?.kind === "table") splitTail = sbsPdfSplitTableNode(tail.node);
      else if (tail?.kind === "list") splitTail = sbsPdfSplitListNode(tail.node);
      if (splitTail.length > 1) {
        queue.splice(tailIndex, 1, ...splitTail);
        continue;
      }

      // Unsplittable pathological content gets the heading on the same page;
      // the normal oversized-block fallback below will scale that one block if
      // absolutely necessary rather than chopping through it.
      const headings = bundle.slice(0, -1);
      if (headings.length && appendNodes(page, headings)) {
        i += headings.length;
        continue;
      }
    }

    // First try the semantic unit exactly where it naturally falls.
    if (appendNodes(page, [unit])) {
      i++;
      continue;
    }

    const splitUnit = () => {
      if (unit.kind === "entry") return sbsPdfEntryPieces(unit.node);
      if (unit.kind === "table") return sbsPdfSplitTableNode(unit.node);
      if (unit.kind === "list") return sbsPdfSplitListNode(unit.node);
      return [];
    };

    // Avoid gratuitous half-empty pages. If a large entry/table/list reaches a
    // page that is still less than about two-thirds full, split it at semantic
    // boundaries and use the remaining space instead of moving the entire block.
    if (page.children.length && sbsPdfPageUsedRatio(page) < 0.64) {
      const parts = splitUnit();
      if (parts.length > 1) {
        queue.splice(i, 1, ...parts);
        continue;
      }
    }

    // Otherwise prefer keeping a normal-sized unit whole on the next page.
    if (page.children.length) {
      page = newPage();
      if (appendNodes(page, [unit])) {
        i++;
        continue;
      }
    }

    // If it cannot fit even on an empty page, it must be broken only at real
    // paragraphs/list items/table rows -- never at an arbitrary pixel line.
    const semanticParts = splitUnit();
    if (semanticParts.length > 1) {
      queue.splice(i, 1, ...semanticParts);
      continue;
    }

    // A single semantic block can theoretically be taller than a full page
    // (for example, one giant image). Scale only that exceptional block to fit
    // rather than slicing through text or overflowing the page.
    const forced = unit.node.cloneNode(true);
    page.appendChild(forced);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!sbsPdfPageFits(page)) {
      const pageRect = page.getBoundingClientRect();
      const nodeRect = forced.getBoundingClientRect();
      const available = Math.max(120, pageRect.height - paddingTop - paddingBottom - 24);
      if (nodeRect.height > available) {
        const factor = Math.max(0.68, Math.min(1, available / nodeRect.height));
        forced.style.transformOrigin = "top left";
        forced.style.transform = `scale(${factor})`;
        forced.style.width = `${100 / factor}%`;
      }
    }
    i++;
  }

  await sbsWaitForPreviewAssets(doc);
  return { host, pages, padding: { top: paddingTop, right: paddingRight, bottom: paddingBottom, left: paddingLeft } };
}

function sbsPdfAddPageFooters(pages, root) {
  if (!pages?.length || !root) return;
  const doc = root.ownerDocument;
  const logoSrc = root.querySelector(".sbs-brandline img, .sbs-footer img")?.getAttribute("src") || "";
  const actorName = root.querySelector(".sbs-hero h1")?.textContent?.trim() || "Character";
  const exportKind = doc.body?.dataset?.sbsExportKind === "spellbook" ? "Spellbook" : "Character Sheet";
  const total = pages.length;

  pages.forEach((page, index) => {
    const footer = doc.createElement("footer");
    footer.className = "sbs-pdf-page-footer";

    const brand = doc.createElement("div");
    brand.className = "sbs-pdf-footer-brand";
    if (logoSrc) {
      const img = doc.createElement("img");
      img.src = logoSrc;
      img.alt = "SaltyBananaSlug";
      brand.appendChild(img);
    }
    const brandText = doc.createElement("span");
    brandText.textContent = `SaltyBananaSlug ${exportKind}`;
    brand.appendChild(brandText);

    const name = doc.createElement("div");
    name.className = "sbs-pdf-footer-name";
    name.textContent = actorName;

    const number = doc.createElement("div");
    number.className = "sbs-pdf-footer-number";
    number.textContent = `Page ${index + 1} of ${total}`;

    footer.append(brand, name, number);
    page.appendChild(footer);
  });
}

async function sbsCaptureSemanticPdfPages(doc) {
  await sbsWaitForPreviewAssets(doc);
  const root = doc.querySelector(".sbs-page");
  if (!root) throw new Error("The rendered character sheet could not be found in the preview.");

  const rootRect = root.getBoundingClientRect();
  const width = Math.max(600, rootRect.width);
  const pageHeight = Math.ceil(width * (297 / 210));
  const { host, pages: pageNodes } = await sbsBuildSemanticPdfDom(doc, root, width, pageHeight);
  sbsPdfAddPageFooters(pageNodes, root);
  await sbsWaitForPreviewAssets(doc);
  const css = sbsPdfGatherCss(doc, width, pageHeight);
  const scale = 1.45;
  const pages = [];

  try {
    for (const pageNode of pageNodes) {
      const serialized = new XMLSerializer().serializeToString(pageNode);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${pageHeight}" viewBox="0 0 ${width} ${pageHeight}">
<foreignObject x="0" y="0" width="${width}" height="${pageHeight}">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${pageHeight}px;overflow:hidden;background:#ffffff;">
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>${serialized}</div>
</foreignObject></svg>`;
      const image = await sbsLoadSvgImage(svg);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(width * scale));
      canvas.height = Math.max(1, Math.ceil(pageHeight * scale));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas rendering is unavailable in this browser.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      pages.push({ bytes: sbsDataUrlBytes(canvas.toDataURL("image/jpeg", 0.95)), width: canvas.width, height: canvas.height });
      canvas.width = 1;
      canvas.height = 1;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    host.remove();
  }

  return pages;
}


function sbsHexEncode(bytes) {
  const table = "0123456789ABCDEF";
  const parts = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i];
    parts[i] = table[value >> 4] + table[value & 15];
  }
  return parts.join("");
}

function sbsPdfAsciiEscape(value = "") {
  return String(value || "")
    .normalize?.("NFKD")
    ?.replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)") || "Character Sheet";
}

function sbsBuildImagePdf(pages, title = "Character Sheet") {
  if (!pages.length) throw new Error("No styled PDF pages were generated.");
  const A4_W = 595.28;
  const A4_H = 841.89;
  const objects = [];
  const pageRefs = [];

  // Object 1: catalog. Object 2: pages tree (filled after page objects exist).
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  let nextObject = 3;

  for (const page of pages) {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    const imageObject = nextObject++;
    pageRefs.push(`${pageObject} 0 R`);

    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    const content = `q\n${A4_W} 0 0 ${A4_H} 0 0 cm\n/Im0 Do\nQ\n`;
    objects[contentObject] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;

    // ASCIIHex keeps the entire PDF string ASCII-only. Foundry can therefore
    // save it without binary-string/UTF-8 corruption, while DCTDecode preserves
    // the JPEG page capture.
    const hex = sbsHexEncode(page.bytes) + ">";
    objects[imageObject] = `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n%SBS-STYLED\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title (${sbsPdfAsciiEscape(title)}) /Producer (SaltyBananaSlug Character Sheets - styled HTML capture) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

async function sbsStyledPdfFromPreview(frame, title) {
  const doc = frame?.contentDocument;
  if (!doc) throw new Error("The preview is not ready yet.");
  const pages = await sbsCaptureSemanticPdfPages(doc);
  return sbsBuildImagePdf(pages, title);
}

class CharacterSheetPreviewApplication extends Application {
  constructor(actor, htmlText, { preferredAction = "preview" } = {}) {
    super();
    this.actor = actor;
    this.htmlText = htmlText;
    this.preferredAction = preferredAction;
    const exportKind = htmlText.includes('data-sbs-export-kind="spellbook"') ? "Spellbook" : "Character Sheet";
    const stem = `${safeFileStem(actor.name)} - ${exportKind}`;
    this.htmlFilename = `${stem}.html`;
    this.pdfFilename = `${stem}.pdf`;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-preview`,
      title: "SaltyBananaSlug Character Sheet Preview",
      template: `${MODULE_PATH}/templates/preview.html`,
      width: 1000,
      height: 800,
      resizable: true,
      classes: ["saltybananaslug-character-sheets-preview"]
    });
  }

  getData() {
    return {
      actorName: this.actor?.name || "Character",
      htmlFilename: this.htmlFilename,
      pdfFilename: this.pdfFilename,
      logoPath: LOGO_PATH,
      preferDownload: this.preferredAction === "download",
      preferPdf: this.preferredAction === "pdf" || this.preferredAction === "print",
      preferPrint: this.preferredAction === "print"
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on("click", "[data-action='download-pdf']", async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const frame = html.find("iframe.sbs-cs-preview-frame")[0];
      const originalHtml = button?.innerHTML;
      try {
        if (button) {
          button.disabled = true;
          button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building Styled PDF…';
        }
        ui.notifications.info(`${this.actor?.name || "Character"}: building a styled PDF from the preview.`);
        const pdfText = await sbsStyledPdfFromPreview(frame, `${this.actor?.name || "Character"} - ${this.htmlText.includes('data-sbs-export-kind="spellbook"') ? "Spellbook" : "Character Sheet"}`);
        foundry.utils.saveDataToFile(pdfText, "application/pdf", this.pdfFilename);
      } catch (error) {
        console.error(`${MODULE_TITLE} | Styled PDF download failed`, error);
        ui.notifications.error(`${MODULE_TITLE}: styled PDF generation failed. Browser Print remains available as a fallback.`);
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalHtml || '<i class="fas fa-file-pdf"></i> Download PDF';
        }
      }
    });

    html.on("click", "[data-action='download-html']", (event) => {
      event.preventDefault();
      try {
        foundry.utils.saveDataToFile(this.htmlText, "text/html;charset=utf-8", this.htmlFilename);
      } catch (error) {
        console.error(`${MODULE_TITLE} | HTML download failed`, error);
        ui.notifications.error(`${MODULE_TITLE}: HTML download failed. Check the console for details.`);
      }
    });

    const frame = html.find("iframe.sbs-cs-preview-frame")[0];
    if (frame) {
      frame.srcdoc = this.htmlText.replace(
        "</head>",
        "<style>.sbs-toolbar{display:none!important}</style></head>"
      );
    }

    html.on("click", "[data-action='print-preview']", (event) => {
      event.preventDefault();
      const previewFrame = html.find("iframe.sbs-cs-preview-frame")[0];
      if (!previewFrame?.contentWindow) return ui.notifications.error(`${MODULE_TITLE}: Preview is not ready yet.`);

      const isSpellbook = this.htmlText.includes('data-sbs-export-kind="spellbook"');
      const printTitle = `${safeFileStem(this.actor?.name || "Character")} - ${isSpellbook ? "Spellbook" : "Character Sheet"}.pdf`;
      const oldPageTitle = document.title;
      const frameDocument = previewFrame.contentDocument;
      const oldFrameTitle = frameDocument?.title || "";
      document.title = printTitle;
      if (frameDocument) frameDocument.title = printTitle;

      const restoreTitles = () => {
        document.title = oldPageTitle;
        if (frameDocument) frameDocument.title = oldFrameTitle;
      };
      previewFrame.contentWindow.addEventListener("afterprint", restoreTitles, { once: true });
      previewFrame.contentWindow.focus();
      previewFrame.contentWindow.print();
      window.setTimeout(restoreTitles, 60000);
    });

    html.on("click", "[data-action='close-preview']", (event) => {
      event.preventDefault();
      this.close();
    });
  }

  async _onClose(options) {
    if (previewApp === this) previewApp = null;
    return super._onClose(options);
  }
}

async function openInternalPreview(actor, options, { preferredAction = "preview" } = {}) {
  const htmlText = await buildExportHtml(actor, options);
  if (previewApp) await previewApp.close();
  previewApp = new CharacterSheetPreviewApplication(actor, htmlText, { preferredAction });
  previewApp.render(true);
  return previewApp;
}

async function ensureLauncherMacro() {
  if (!game.user.isGM) return null;
  const command = `game.modules.get("${MODULE_ID}")?.api?.open();`;
  const existing = game.macros.find((macro) => macro.getFlag(MODULE_ID, "launcher"));
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
  if (existing) {
    const update = {};
    if (existing.name !== MODULE_TITLE) update.name = MODULE_TITLE;
    if (existing.img !== LOGO_PATH) update.img = LOGO_PATH;
    if (existing.command !== command) update.command = command;
    if (existing.type !== "script") update.type = "script";
    if (foundry.utils.getProperty(existing, "ownership.default") !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) update.ownership = ownership;
    if (Object.keys(update).length) await existing.update(update);
    return existing;
  }
  const macro = await Macro.create({
    name: MODULE_TITLE,
    type: "script",
    img: LOGO_PATH,
    command,
    ownership,
    flags: { [MODULE_ID]: { launcher: true } }
  });
  ui.notifications.info(`${MODULE_TITLE}: Shared launcher macro created.`);
  return macro;
}

class CharacterSheetExporterApplication extends Application {
  constructor(actor = null, options = {}) {
    super(options);
    const resolvedActor = resolveActor(actor) || defaultActor();
    this.state = {
      actorId: resolvedActor?.id || "",
      includeBiography: true,
      includePortrait: true,
      includeItemImages: false,
      includeEffects: false,
      includeCurrency: true,
      includeSource: false,
      spellMode: "prepared",
      spellbookOnly: false,
      includeSecrets: false,
      revealUnidentified: false
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: MODULE_ID,
      title: MODULE_TITLE,
      template: `${MODULE_PATH}/templates/exporter.html`,
      width: 900,
      height: 720,
      resizable: true,
      classes: ["saltybananaslug-character-sheets-window"]
    });
  }

  get selectedActor() {
    const actor = game.actors.get(this.state.actorId);
    if (actor && canExportActor(actor)) return actor;
    return defaultActor();
  }

  getData() {
    const actors = availableActors();
    const actor = this.selectedActor;
    const counts = actor ? itemCounts(actor, { spellMode: this.state.spellMode }) : { spells: 0, allSpells: 0, preparedSpells: 0, features: 0, inventory: 0 };
    return {
      logoPath: LOGO_PATH,
      ...this.state,
      spellModeAll: this.state.spellMode === "all",
      spellModePrepared: this.state.spellMode === "prepared",
      spellModePreparedDetails: this.state.spellMode === "prepared-details",
      spellModeNone: this.state.spellMode === "none",
      canRevealSecrets: game.user.isGM,
      actors: actors.map((entry) => ({
        id: entry.id,
        name: entry.name,
        typeLabel: titleCase(entry.type),
        selected: entry.id === actor?.id
      })),
      selectedActorName: actor?.name || "No Actor available",
      selectedActorImg: actor?.img || LOGO_PATH,
      selectedActorSummary: actor ? `${actorSubtitle(actor)} • ${counts.features} features • ${counts.allSpells} spells (${counts.preparedSpells} prepared/always available) • ${counts.inventory} inventory items` : "You do not currently own an Actor that can be exported."
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("change input", "input, select", (event) => {
      const element = event.currentTarget;
      if (!element.name) return;
      this.state[element.name] = element.type === "checkbox" ? element.checked : element.value;
      if (element.name === "actorId") this.render(false);
    });

    html.on("click", "[data-action]", async (event) => {
      event.preventDefault();
      this._syncForm();
      const action = event.currentTarget.dataset.action;
      try {
        if (action === "use-selected") {
          const token = canvas?.tokens?.controlled?.[0];
          if (!token?.actor) throw new Error("Select a token first.");
          if (!canExportActor(token.actor)) throw new Error("You do not own that token's Actor.");
          this.state.actorId = token.actor.id;
          this.render(false);
          return;
        }

        const actor = this.selectedActor;
        if (!actor) throw new Error("No exportable Actor is available.");

        if (action === "preview") {
          await openInternalPreview(actor, this.state, { preferredAction: "preview" });
          return;
        }
        if (action === "print") {
          await openInternalPreview(actor, this.state, { preferredAction: "pdf" });
          ui.notifications.info(`${actor.name}: PDF ready — click Download PDF in the Foundry preview window.`);
          return;
        }
        if (action === "download") {
          await openInternalPreview(actor, this.state, { preferredAction: "download" });
          ui.notifications.info(`${actor.name}: preview ready — click Download HTML in the Foundry preview window.`);
          return;
        }
      } catch (error) {
        console.error(`${MODULE_TITLE} | ${action} failed`, error);
        ui.notifications.error(`${MODULE_TITLE}: ${error.message || "The export slug dropped the paperwork."}`);
      }
    });
  }

  _syncForm() {
    const root = this.element?.[0];
    if (!root) return;
    for (const element of root.querySelectorAll("input, select")) {
      if (!element.name) continue;
      this.state[element.name] = element.type === "checkbox" ? element.checked : element.value;
    }
  }
}

function openExporter(actorOrId = null) {
  const actor = resolveActor(actorOrId);
  if (actor && !canExportActor(actor)) {
    ui.notifications.warn(`${MODULE_TITLE}: You do not own that Actor.`);
    return null;
  }
  if (!availableActors().length) {
    ui.notifications.warn(`${MODULE_TITLE}: No exportable Actors are available to this user.`);
    return null;
  }
  if (!exporterApp) exporterApp = new CharacterSheetExporterApplication(actor);
  else if (actor) exporterApp.state.actorId = actor.id;
  exporterApp.render(true);
  return exporterApp;
}

Hooks.once("init", () => {
  const api = {
    open: openExporter,
    exportHtml(actorOrId, options = {}) {
      const actor = resolveActor(actorOrId) || defaultActor();
      return buildExportHtml(actor, options);
    },
    preview(actorOrId, options = {}) {
      const actor = resolveActor(actorOrId) || defaultActor();
      if (!actor) throw new Error("No Actor available.");
      return openInternalPreview(actor, options, { preferredAction: "preview" });
    },
    print(actorOrId, options = {}) {
      const actor = resolveActor(actorOrId) || defaultActor();
      if (!actor) throw new Error("No Actor available.");
      return openInternalPreview(actor, options, { preferredAction: "print" });
    },
    get app() { return exporterApp; },
    get logoPath() { return LOGO_PATH; }
  };
  game.modules.get(MODULE_ID).api = api;
  game.sbsCharacterSheets = api;
});

Hooks.once("ready", async () => {
  if (game.system.id !== "dnd5e") {
    if (game.user.isGM) ui.notifications.warn(`${MODULE_TITLE} is designed for the D&D5e system.`);
    return;
  }
  try {
    await ensureLauncherMacro();
  } catch (error) {
    console.error(`${MODULE_TITLE} | Could not create launcher macro`, error);
  }
});
