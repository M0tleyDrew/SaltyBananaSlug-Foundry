const MODULE_ID = "saltybananaslug-scene-summarized";
const MODULE_TITLE = "SaltyBananaSlug's Scene Summarized";
const MODULE_PATH = `modules/${MODULE_ID}`;
const LOGO_PATH = `${MODULE_PATH}/assets/saltybananaslug.svg`;
const JOURNAL_FOLDER = "SaltyBananaSlug Scene Summaries";
const MANAGED_PAGE_FLAG = "managedPage";
const CONTAINERS_MODULE_ID = "saltybananaslug-containers";
const MERCHANTS_MODULE_ID = "saltybananaslug-merchants";
const MERCHANT_COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

let sceneSummaryApp;

function deepClone(data) {
  return foundry.utils.deepClone(data);
}

function escapeHTML(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escapeAttr(value = "") {
  return escapeHTML(value).replaceAll("`", "&#96;");
}

function safeJSON(value, space = 2) {
  try {
    return JSON.stringify(value, null, space);
  } catch (error) {
    return JSON.stringify({ error: `Could not serialize data: ${error.message}` }, null, space);
  }
}

function stripHTML(html = "") {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function truncate(text = "", max = 600) {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function titleCase(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return String(value ?? "—");
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function formatBoolean(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value == null ? "—" : String(value);
}

function formatValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return formatBoolean(value);
  if (typeof value === "number") return formatNumber(value);
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "—";
  if (typeof value === "object") {
    if ("value" in value && Object.keys(value).length <= 4) return formatValue(value.value);
    return `<code>${escapeHTML(safeJSON(value, 0))}</code>`;
  }
  return escapeHTML(String(value));
}

function get(object, path, fallback = undefined) {
  const value = foundry.utils.getProperty(object, path);
  return value === undefined || value === null ? fallback : value;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function collectionArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function documentLink(document, label = null) {
  if (!document?.uuid) return escapeHTML(label || document?.name || "Unknown document");
  return `@UUID[${document.uuid}]{${escapeHTML(label || document.name || document.documentName)}}`;
}

function table(rows, { headers = null, className = "" } = {}) {
  const filtered = rows.filter((row) => Array.isArray(row) && row.some((cell) => cell !== undefined && cell !== null && cell !== ""));
  if (!filtered.length) return `<p><em>None recorded.</em></p>`;
  const head = headers ? `<thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead>` : "";
  const body = filtered.map((row) => `<tr>${row.map((cell, index) => `<td${!headers && index === 0 ? ' class="sbs-summary-key"' : ""}>${cell ?? "—"}</td>`).join("")}</tr>`).join("");
  return `<table class="${escapeAttr(className)}">${head}<tbody>${body}</tbody></table>`;
}

function list(items, { ordered = false } = {}) {
  const filtered = items.filter((item) => item !== undefined && item !== null && item !== "");
  if (!filtered.length) return `<p><em>None recorded.</em></p>`;
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${filtered.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
}

function secretBlock(content, enabled, label = "GM Details") {
  if (!enabled) return content;
  return `<section class="secret" id="${foundry.utils.randomID()}"><h3>${escapeHTML(label)}</h3>${content}</section>`;
}

function detailsBlock(summary, content, open = false) {
  return `<details${open ? " open" : ""}><summary>${escapeHTML(summary)}</summary>${content}</details>`;
}

function fileKind(path = "") {
  const clean = String(path).split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(clean)) return "image";
  if (/\.(webm|mp4|m4v|mov|ogv)$/.test(clean)) return "video";
  if (/\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/.test(clean)) return "audio";
  if (/\.pdf$/.test(clean)) return "pdf";
  return "file";
}

function mediaPreview(path, kind, alt = "Media preview") {
  if (!path) return "";
  const src = escapeAttr(path);
  if (kind === "image") return `<img src="${src}" alt="${escapeAttr(alt)}" loading="lazy">`;
  if (kind === "video") return `<video src="${src}" controls preload="metadata"></video>`;
  if (kind === "audio") return `<audio src="${src}" controls preload="none"></audio>`;
  return "";
}

function mediaCard(entry, embedMedia) {
  const preview = embedMedia ? mediaPreview(entry.path, entry.kind, entry.label) : "";
  return `<article class="sbs-summary-media-card">
    <strong>${escapeHTML(entry.label)}</strong>
    <div><small>${escapeHTML(titleCase(entry.kind))} · ${escapeHTML(entry.origin)}</small></div>
    ${preview}
    <div><code>${escapeHTML(entry.path)}</code></div>
  </article>`;
}

function addMedia(mediaMap, path, label, origin, { secret = false, kind = null } = {}) {
  if (!path || typeof path !== "string") return;
  const clean = path.trim();
  if (!clean) return;
  const key = `${clean}::${origin}`;
  if (!mediaMap.has(key)) mediaMap.set(key, { path: clean, label: label || clean.split("/").pop(), origin, kind: kind || fileKind(clean), secret });
}

function flattenObject(object, { prefix = "", maxDepth = 3, depth = 0, rows = [], skip = [] } = {}) {
  if (object == null || depth > maxDepth) return rows;
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (skip.some((entry) => path === entry || path.startsWith(`${entry}.`))) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && depth < maxDepth) {
      flattenObject(value, { prefix: path, maxDepth, depth: depth + 1, rows, skip });
    } else {
      rows.push([escapeHTML(titleCase(path)), formatValue(value)]);
    }
  }
  return rows;
}

function flagSummary(document) {
  const flags = document?.flags || document?._source?.flags || {};
  const scopes = Object.keys(flags);
  if (!scopes.length) return "None";
  return scopes.map((scope) => `<code>${escapeHTML(scope)}</code>`).join(", ");
}


function getSBSContainerData(token) {
  const data = token?.getFlag?.(CONTAINERS_MODULE_ID, "container") ?? token?.flags?.[CONTAINERS_MODULE_ID]?.container ?? null;
  return data?.isContainer ? data : null;
}

function getSBSMerchantPublicData(token) {
  const data = token?.getFlag?.(MERCHANTS_MODULE_ID, "merchant") ?? token?.flags?.[MERCHANTS_MODULE_ID]?.merchant ?? null;
  return data?.isMerchant ? data : null;
}

function getSBSMerchantData(token) {
  const pub = getSBSMerchantPublicData(token);
  if (!pub) return null;
  const inventory = game.actors.get(pub.inventoryActorId);
  const privateConfig = inventory?.getFlag?.(MERCHANTS_MODULE_ID, "config") ?? inventory?.flags?.[MERCHANTS_MODULE_ID]?.config ?? null;
  if (!privateConfig) return deepClone(pub);
  return foundry.utils.mergeObject(deepClone(privateConfig), deepClone(pub), { inplace: false, recursive: true });
}

function isSBSContainer(token) {
  return Boolean(getSBSContainerData(token));
}

function isSBSMerchant(token) {
  return Boolean(getSBSMerchantPublicData(token));
}

function isSBSIntegrationShell(actor) {
  return Boolean(
    actor?.getFlag?.(CONTAINERS_MODULE_ID, "isShell") ||
    actor?.getFlag?.(MERCHANTS_MODULE_ID, "isShell") ||
    actor?.flags?.[CONTAINERS_MODULE_ID]?.isShell ||
    actor?.flags?.[MERCHANTS_MODULE_ID]?.isShell
  );
}

function integrationCurrency(actor) {
  const currency = get(actor, "system.currency", {}) || {};
  const entries = Object.entries(currency)
    .filter(([, value]) => Number(value))
    .map(([coin, value]) => `${formatNumber(value)} ${escapeHTML(coin)}`);
  return entries.length ? entries.join(", ") : "None";
}

function merchantCopperToText(cp) {
  let remaining = Math.max(0, Math.floor(Number(cp) || 0));
  const parts = [];
  for (const coin of ["pp", "gp", "ep", "sp", "cp"]) {
    const amount = Math.floor(remaining / MERCHANT_COIN_CP[coin]);
    if (amount) parts.push(`${amount} ${coin}`);
    remaining -= amount * MERCHANT_COIN_CP[coin];
  }
  return parts.join(", ") || "0 cp";
}

function merchantStockSettings(item) {
  const raw = item?.getFlag?.(MERCHANTS_MODULE_ID, "stock") ?? item?.flags?.[MERCHANTS_MODULE_ID]?.stock ?? {};
  return {
    infinite: Boolean(raw.infinite),
    visible: raw.visible !== false,
    allowZero: Boolean(raw.allowZero),
    customSellCp: raw.customSellCp === null || raw.customSellCp === undefined || raw.customSellCp === "" ? null : Number(raw.customSellCp),
    customBuyCp: raw.customBuyCp === null || raw.customBuyCp === undefined || raw.customBuyCp === "" ? null : Number(raw.customBuyCp),
    ignoreFavor: Boolean(raw.ignoreFavor),
    favorRequired: String(raw.favorRequired ?? ""),
    maxPerCustomer: Math.max(0, Number(raw.maxPerCustomer ?? 0) || 0),
    resell: raw.resell !== false,
    source: String(raw.source ?? "")
  };
}

function containerTypeText(data) {
  return data?.customType || data?.typeLabel || data?.type || "Container";
}

function containerCurrentlyLocked(token) {
  const mirror = token?.getFlag?.(CONTAINERS_MODULE_ID, "lockMirror") ?? token?.flags?.[CONTAINERS_MODULE_ID]?.lockMirror;
  const lockable = token?.getFlag?.("LocknKey", "LockableFlag") ?? token?.flags?.LocknKey?.LockableFlag;
  const locked = token?.getFlag?.("LocknKey", "LockedFlag") ?? token?.flags?.LocknKey?.LockedFlag;
  return Boolean(mirror || (lockable && locked));
}

function merchantShopText(data) {
  return data?.customShopType || data?.shopTypeLabel || data?.shopType || "Merchant";
}

function getSceneIntegrations(scene) {
  const containers = [];
  const merchants = [];
  for (const token of collectionArray(scene?.tokens)) {
    const containerData = getSBSContainerData(token);
    if (containerData) {
      containers.push({
        token,
        data: containerData,
        inventory: game.actors.get(containerData.inventoryActorId) || null,
        journal: game.journal.get(containerData.journalId) || null
      });
    }
    const merchantData = getSBSMerchantData(token);
    if (merchantData) {
      merchants.push({
        token,
        data: merchantData,
        inventory: game.actors.get(merchantData.inventoryActorId) || null,
        journal: game.journal.get(merchantData.journalId) || null
      });
    }
  }
  return { containers, merchants };
}

function containerSummaryRows(entry) {
  const { token, data, inventory, journal } = entry;
  return [
    ["Token", documentLink(token, token.name)],
    ["Type", escapeHTML(containerTypeText(data))],
    ["State", escapeHTML(titleCase(data.state || "closed"))],
    ["Description", data.description ? escapeHTML(data.description) : "—"],
    ["Inventory Actor", inventory ? documentLink(inventory, inventory.name) : "Missing"],
    ["Companion Journal", journal ? documentLink(journal, journal.name) : "Missing"],
    ["Items", formatNumber(inventory?.items?.size ?? inventory?.items?.length ?? 0)],
    ["Currency", integrationCurrency(inventory)],
    ["Interaction Distance", data.distance != null ? `${formatNumber(data.distance)} ${escapeHTML(token.parent?.grid?.units || "ft")}` : "—"],
    ["Lock Enabled", formatBoolean(data.lock?.enabled)],
    ["Currently Locked", formatBoolean(containerCurrentlyLocked(token))],
    ["Start Locked", formatBoolean(data.lock?.startLocked)],
    ["Lock on Close", formatBoolean(data.lock?.lockOnClose)],
    ["Pick DC", formatValue(data.lock?.pickDC)],
    ["Break DC", formatValue(data.lock?.breakDC)],
    ["Journal Visibility", formatValue(data.journal?.visibility)],
    ["Permissions", data.permissions ? `<code>${escapeHTML(safeJSON(data.permissions, 0))}</code>` : "—"]
  ];
}

function merchantSummaryRows(entry) {
  const { token, data, inventory, journal } = entry;
  const defaultFavorId = data.favor?.defaultLevelId || "neutral";
  const defaultFavor = collectionArray(data.favor?.levels).find((level) => level.id === defaultFavorId);
  const maximumFunds = data.treasury?.unlimited ? "Unlimited" : merchantCopperToText(data.treasury?.maxFundsCp ?? 0);
  return [
    ["Token", documentLink(token, token.name)],
    ["Shop Type", escapeHTML(merchantShopText(data))],
    ["Status", escapeHTML(titleCase(data.status || "open"))],
    ["Token Mode", escapeHTML(titleCase(data.tokenMode || "generated"))],
    ["Description", data.description ? escapeHTML(data.description) : "—"],
    ["Inventory Actor", inventory ? documentLink(inventory, inventory.name) : "Missing"],
    ["Ledger Journal", journal ? documentLink(journal, journal.name) : "Missing"],
    ["Stock Lines", formatNumber(inventory?.items?.size ?? inventory?.items?.length ?? 0)],
    ["Treasury", integrationCurrency(inventory)],
    ["Maximum Buying Funds", maximumFunds],
    ["Sells to Players", `${formatNumber(data.pricing?.sellRate ?? 100)}% base rate`],
    ["Buys from Players", `${formatNumber(data.pricing?.buyRate ?? 60)}% base rate`],
    ["Default Favor", escapeHTML(defaultFavor?.name || titleCase(defaultFavorId) || "Neutral")],
    ["Interaction Distance", data.interactionDistance != null ? `${formatNumber(data.interactionDistance)} ${escapeHTML(token.parent?.grid?.units || "ft")}` : "—"],
    ["Restock Mode", formatValue(data.restock?.mode)],
    ["Greeting Sound", data.sound?.enabled ? `${escapeHTML(data.sound.path || "Configured sound")} (${formatNumber((Number(data.sound.volume ?? 0.8)) * 100)}%)` : "Disabled"],
    ["GM Notes", data.gmNotes ? escapeHTML(data.gmNotes) : "—"]
  ];
}

function integrationInventoryPreview(actor, { merchant = false } = {}) {
  const items = collectionArray(actor?.items);
  if (!items.length) return `<p><em>Empty.</em></p>`;
  const rows = items.map((item) => {
    const qty = merchant && merchantStockSettings(item).infinite ? "∞" : formatValue(getItemQuantity(item));
    const cells = [documentLink(item), escapeHTML(titleCase(item.type || "Item")), qty];
    if (merchant) {
      const stock = merchantStockSettings(item);
      cells.push(formatBoolean(stock.visible), stock.customSellCp == null ? "Default" : merchantCopperToText(stock.customSellCp));
    }
    return cells;
  });
  return table(rows, { headers: merchant ? ["Item", "Type", "Stock", "Player Visible", "Custom Sell Price"] : ["Item", "Type", "Qty"] });
}

function merchantStockCard(item, options) {
  const stock = merchantStockSettings(item);
  const stockRows = [
    ["Stock", stock.infinite ? "Unlimited (X)" : formatValue(getItemQuantity(item))],
    ["Visible to Players", formatBoolean(stock.visible)],
    ["Zero-value Sale Enabled", formatBoolean(stock.allowZero)],
    ["Custom Sell Price", stock.customSellCp == null ? "Default pricing" : merchantCopperToText(stock.customSellCp)],
    ["Custom Buy Price", stock.customBuyCp == null ? "Default pricing" : merchantCopperToText(stock.customBuyCp)],
    ["Ignore Favor", formatBoolean(stock.ignoreFavor)],
    ["Favor Required", stock.favorRequired ? escapeHTML(stock.favorRequired) : "None"],
    ["Max per Purchase", stock.maxPerCustomer ? formatNumber(stock.maxPerCustomer) : "None"],
    ["Resell", formatBoolean(stock.resell)],
    ["Stock Source", stock.source ? escapeHTML(stock.source) : "—"]
  ];
  return `<div class="sbs-summary-integration-stock">${table(stockRows)}${itemCard(item, options)}</div>`;
}

function ownershipData(audience) {
  const defaultLevel = audience === "gm"
    ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
    : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  return { default: defaultLevel };
}

async function getOrCreateFolder(name, type) {
  let folder = game.folders.find((entry) => entry.type === type && entry.name === name && !entry.folder);
  if (!folder) folder = await Folder.create({ name, type, sorting: "a" });
  return folder;
}

function playerVisibleTokenLabel(token, index = 0) {
  const mode = Number(token?.displayName);
  const always = Number(CONST.TOKEN_DISPLAY_MODES?.ALWAYS);
  const hover = Number(CONST.TOKEN_DISPLAY_MODES?.HOVER);
  if ([always, hover].includes(mode)) return token.name || `Visible Token ${index + 1}`;
  return `Visible Token ${index + 1}`;
}

function resolveScenePlaylist(scene) {
  if (!scene?.playlist) return null;
  if (scene.playlist.documentName === "Playlist") return scene.playlist;
  return game.playlists.get(scene.playlist) || null;
}

function resolveScenePlaylistSound(scene, playlist) {
  if (!scene?.playlistSound || !playlist) return null;
  if (scene.playlistSound.documentName === "PlaylistSound") return scene.playlistSound;
  return playlist.sounds?.get(scene.playlistSound) || null;
}

function getSceneCounts(scene) {
  const tokens = collectionArray(scene.tokens);
  const visibleTokens = tokens.filter((token) => !token.hidden).length;
  const hiddenTokens = tokens.length - visibleTokens;
  const integrations = getSceneIntegrations(scene);
  const actorItems = tokens.reduce((sum, token) => sum + (isSBSIntegrationShell(token.actor) ? 0 : (token.actor?.items?.size ?? token.actor?.items?.length ?? 0)), 0);
  const integrationItems = [...integrations.containers, ...integrations.merchants].reduce((sum, entry) => sum + (entry.inventory?.items?.size ?? entry.inventory?.items?.length ?? 0), 0);
  return {
    tokens: tokens.length,
    visibleTokens,
    hiddenTokens,
    actors: new Set(tokens.map((token) => token.actor?.uuid).filter(Boolean)).size,
    actorItems,
    integrationItems,
    items: actorItems + integrationItems,
    containers: integrations.containers.length,
    merchants: integrations.merchants.length,
    tiles: collectionArray(scene.tiles).length,
    sounds: collectionArray(scene.sounds).length,
    lights: collectionArray(scene.lights).length,
    notes: collectionArray(scene.notes).length,
    drawings: collectionArray(scene.drawings).length,
    walls: collectionArray(scene.walls).length,
    doors: collectionArray(scene.walls).filter((wall) => Number(wall.door) > 0).length,
    regions: collectionArray(scene.regions).length,
    templates: collectionArray(scene.templates).length
  };
}

function movementText(actor) {
  const movement = get(actor, "system.attributes.movement", {});
  const parts = [];
  for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
    const value = movement?.[key];
    if (Number(value)) parts.push(`${titleCase(key)} ${formatNumber(value)}`);
  }
  if (movement?.hover) parts.push("Hover");
  const units = movement?.units || get(actor, "system.traits.size.units", "ft");
  return parts.length ? `${parts.join(", ")} ${escapeHTML(units || "")}`.trim() : "—";
}

function actorTypeText(actor) {
  const typeValue = firstDefined(
    get(actor, "system.details.type.value"),
    get(actor, "system.details.type"),
    get(actor, "system.details.race"),
    actor.type
  );
  const subtype = get(actor, "system.details.type.subtype");
  return [typeValue, subtype].filter(Boolean).map((value) => escapeHTML(String(value))).join(" — ") || "—";
}

function creatureChallengeText(actor) {
  const cr = firstDefined(get(actor, "system.details.cr"), get(actor, "system.details.challengeRating"));
  const xp = firstDefined(get(actor, "system.details.xp.value"), get(actor, "system.details.xp"));
  if (cr == null && xp == null) return "—";
  return [cr != null ? `CR ${formatNumber(cr)}` : null, xp != null ? `${formatNumber(xp)} XP` : null].filter(Boolean).join(" · ");
}

function actorCoreRows(actor) {
  const hp = get(actor, "system.attributes.hp", {});
  const ac = firstDefined(get(actor, "system.attributes.ac.value"), get(actor, "system.attributes.ac.flat"));
  const senses = get(actor, "system.attributes.senses", get(actor, "system.traits.senses", {}));
  const languages = get(actor, "system.traits.languages", {});
  const languageText = [
    ...(Array.isArray(languages?.value) ? languages.value : []),
    languages?.custom
  ].filter(Boolean).join(", ");
  const spellcasting = firstDefined(get(actor, "system.attributes.spellcasting"), get(actor, "system.details.spellLevel"));
  return [
    ["Document", documentLink(actor)],
    ["Actor Type", escapeHTML(actor.type || "—")],
    ["Creature / Ancestry Type", actorTypeText(actor)],
    ["Alignment", formatValue(get(actor, "system.details.alignment"))],
    ["Challenge", creatureChallengeText(actor)],
    ["Armor Class", formatValue(ac)],
    ["Hit Points", `${formatNumber(hp?.value ?? "—")} / ${formatNumber(hp?.max ?? "—")}${Number(hp?.temp) ? ` (+${formatNumber(hp.temp)} temp)` : ""}`],
    ["Movement", movementText(actor)],
    ["Initiative", formatValue(firstDefined(get(actor, "system.attributes.init.total"), get(actor, "system.attributes.init.bonus")))],
    ["Proficiency Bonus", formatValue(get(actor, "system.attributes.prof"))],
    ["Spellcasting", formatValue(spellcasting)],
    ["Senses", formatValue(senses)],
    ["Languages", escapeHTML(languageText || "—")],
    ["Actor Image", actor.img ? `<code>${escapeHTML(actor.img)}</code>` : "—"],
    ["Flag Scopes", flagSummary(actor)]
  ];
}

function abilityRows(actor) {
  const abilities = get(actor, "system.abilities", {});
  return Object.entries(abilities).map(([key, ability]) => [
    escapeHTML(CONFIG.DND5E?.abilities?.[key]?.label || titleCase(key)),
    formatNumber(ability?.value ?? "—"),
    formatNumber(ability?.mod ?? "—"),
    formatNumber(firstDefined(ability?.save, ability?.saveBonus, "—")),
    formatValue(firstDefined(ability?.proficient, ability?.proficiency))
  ]);
}

function skillRows(actor) {
  const skills = get(actor, "system.skills", {});
  return Object.entries(skills).map(([key, skill]) => [
    escapeHTML(CONFIG.DND5E?.skills?.[key]?.label || titleCase(key)),
    formatValue(skill?.ability),
    formatNumber(firstDefined(skill?.total, skill?.mod, "—")),
    formatNumber(firstDefined(skill?.passive, "—")),
    formatValue(firstDefined(skill?.value, skill?.proficient))
  ]);
}

function actorDefenses(actor) {
  const traits = get(actor, "system.traits", {});
  const readTrait = (key) => {
    const trait = traits?.[key];
    if (!trait) return "—";
    const values = Array.isArray(trait.value) ? trait.value : (trait.value ? [trait.value] : []);
    return [...values, trait.custom].filter(Boolean).join(", ") || "—";
  };
  return [
    ["Damage Immunities", escapeHTML(readTrait("di"))],
    ["Damage Resistances", escapeHTML(readTrait("dr"))],
    ["Damage Vulnerabilities", escapeHTML(readTrait("dv"))],
    ["Condition Immunities", escapeHTML(readTrait("ci"))]
  ];
}

function actorResources(actor) {
  const rows = [];
  const resources = get(actor, "system.resources", {});
  for (const [key, resource] of Object.entries(resources || {})) {
    if (!resource || (!resource.label && resource.value == null && resource.max == null)) continue;
    rows.push([escapeHTML(resource.label || titleCase(key)), `${formatNumber(resource.value ?? "—")} / ${formatNumber(resource.max ?? "—")}`]);
  }
  const currency = get(actor, "system.currency", {});
  if (currency && Object.keys(currency).length) rows.push(["Currency", Object.entries(currency).map(([key, value]) => `${escapeHTML(key.toUpperCase())} ${formatNumber(value)}`).join(", ")]);
  return rows;
}

function tokenRows(token) {
  const detectionModes = collectionArray(token.detectionModes || token._source?.detectionModes).map((mode) => `${mode.id || "mode"} (${mode.range ?? 0})`).join(", ");
  const bars = ["bar1", "bar2"].map((bar) => {
    const attribute = token[bar]?.attribute ?? token._source?.[bar]?.attribute;
    return attribute ? `${bar}: ${attribute}` : null;
  }).filter(Boolean).join(", ");
  return [
    ["Token Document", documentLink(token)],
    ["Actor", token.actor ? documentLink(token.actor) : "No Actor attached"],
    ["Position", `x ${formatNumber(token.x)}, y ${formatNumber(token.y)}, elevation ${formatNumber(token.elevation ?? 0)}`],
    ["Size", `${formatNumber(token.width)} × ${formatNumber(token.height)} grid units`],
    ["Rotation", `${formatNumber(token.rotation ?? 0)}°`],
    ["Disposition", escapeHTML(titleCase(Object.entries(CONST.TOKEN_DISPOSITIONS || {}).find(([, value]) => value === token.disposition)?.[0] || token.disposition))],
    ["Hidden", formatBoolean(token.hidden)],
    ["Linked to Actor", formatBoolean(token.actorLink)],
    ["Locked", formatBoolean(token.locked)],
    ["Name Display", formatValue(token.displayName)],
    ["Bars", escapeHTML(bars || "—")],
    ["Sight Enabled", formatBoolean(token.sight?.enabled)],
    ["Sight Range / Angle", `${formatNumber(token.sight?.range ?? 0)} / ${formatNumber(token.sight?.angle ?? 360)}°`],
    ["Vision Mode", formatValue(token.sight?.visionMode)],
    ["Detection Modes", escapeHTML(detectionModes || "—")],
    ["Emitted Light", `Bright ${formatNumber(token.light?.bright ?? 0)}, Dim ${formatNumber(token.light?.dim ?? 0)}, Angle ${formatNumber(token.light?.angle ?? 360)}°`],
    ["Token Image", token.texture?.src ? `<code>${escapeHTML(token.texture.src)}</code>` : "—"],
    ["Flag Scopes", flagSummary(token)]
  ];
}

function effectSummary(effect) {
  const changes = collectionArray(effect.changes).map((change) => `${change.key}: ${change.value} (mode ${change.mode})`).join("; ");
  const duration = effect.duration ? safeJSON(effect.duration, 0) : "—";
  return `<li><strong>${escapeHTML(effect.name || effect.label || "Unnamed Effect")}</strong> — disabled: ${formatBoolean(effect.disabled)}, transfer: ${formatBoolean(effect.transfer)}, duration: <code>${escapeHTML(duration)}</code>${changes ? `<br><small>${escapeHTML(changes)}</small>` : ""}</li>`;
}

function getItemQuantity(item) {
  const quantity = firstDefined(get(item, "system.quantity"), get(item, "system.uses.value"), 1);
  return Number.isFinite(Number(quantity)) ? Number(quantity) : quantity;
}

function itemActivityRows(item) {
  const activities = get(item, "system.activities", {});
  const values = Array.isArray(activities) ? activities : Object.values(activities || {});
  return values.map((activity) => [
    escapeHTML(activity?.name || titleCase(activity?.type || "Activity")),
    formatValue(activity?.type),
    formatValue(activity?.activation),
    formatValue(activity?.range),
    formatValue(activity?.target),
    formatValue(firstDefined(activity?.damage, activity?.healing, activity?.save, activity?.attack))
  ]);
}

function itemKeyRows(item) {
  const system = item.system || {};
  const damageParts = get(item, "system.damage.parts", []);
  const damageText = Array.isArray(damageParts)
    ? damageParts.map((part) => Array.isArray(part) ? `${part[0]} ${part[1] || ""}`.trim() : String(part)).join("; ")
    : formatValue(damageParts);
  const properties = get(item, "system.properties", []);
  const propertyText = properties instanceof Set ? Array.from(properties).join(", ") : formatValue(properties);
  return [
    ["Item Document", documentLink(item)],
    ["Type", escapeHTML(item.type || "—")],
    ["Quantity", formatValue(getItemQuantity(item))],
    ["Rarity", formatValue(get(item, "system.rarity"))],
    ["Attunement", formatValue(get(item, "system.attunement"))],
    ["Equipped", formatBoolean(get(item, "system.equipped"))],
    ["Identified", formatBoolean(get(item, "system.identified"))],
    ["Weight", formatValue(get(item, "system.weight"))],
    ["Price", formatValue(get(item, "system.price"))],
    ["Activation", formatValue(get(item, "system.activation"))],
    ["Action Type", formatValue(get(item, "system.actionType"))],
    ["Range", formatValue(get(item, "system.range"))],
    ["Target", formatValue(get(item, "system.target"))],
    ["Duration", formatValue(get(item, "system.duration"))],
    ["Uses", formatValue(get(item, "system.uses"))],
    ["Recharge", formatValue(get(item, "system.recharge"))],
    ["Damage", damageText ? escapeHTML(String(damageText)) : "—"],
    ["Versatile Damage", formatValue(get(item, "system.damage.versatile"))],
    ["Save", formatValue(get(item, "system.save"))],
    ["Properties", propertyText || "—"],
    ["Source", formatValue(firstDefined(get(item, "system.source.book"), get(item, "system.source")))],
    ["Image", item.img ? `<code>${escapeHTML(item.img)}</code>` : "—"],
    ["Flag Scopes", flagSummary(item)]
  ];
}

function itemDescription(item) {
  return firstDefined(
    get(item, "system.description.value"),
    get(item, "system.description"),
    get(item, "system.details.biography.value"),
    ""
  );
}

function actorBiography(actor) {
  return firstDefined(
    get(actor, "system.details.biography.value"),
    get(actor, "system.details.biography.public"),
    get(actor, "system.biography.value"),
    ""
  );
}

function itemCard(item, options) {
  const activityRows = itemActivityRows(item);
  const effects = collectionArray(item.effects);
  const description = itemDescription(item);
  const body = [
    table(itemKeyRows(item)),
    activityRows.length ? `<h4>Activities</h4>${table(activityRows, { headers: ["Name", "Type", "Activation", "Range", "Target", "Roll / Effect"] })}` : "",
    effects.length ? `<h4>Active Effects</h4><ul>${effects.map(effectSummary).join("")}</ul>` : "",
    options.includeDescriptions && description ? `<h4>Description</h4><div>${description}</div>` : ""
  ].join("");
  return `<article class="sbs-summary-card">
    <div class="sbs-summary-card-header">
      ${item.img ? `<img src="${escapeAttr(item.img)}" alt="${escapeAttr(item.name)}">` : ""}
      <div><h3>${documentLink(item, item.name)}</h3><p>${escapeHTML(titleCase(item.type || "Item"))}</p></div>
    </div>
    ${body}
  </article>`;
}

function sceneMainImage(scene) {
  return firstDefined(scene.thumb, scene.background?.src, scene.background?.texture?.src, scene.foreground, LOGO_PATH);
}

function getSceneJournal(scene) {
  if (!scene) return null;
  const id = scene.getFlag(MODULE_ID, "summaryJournalId");
  const flagged = id ? game.journal.get(id) : null;
  if (flagged) return flagged;
  return game.journal.find((journal) => journal.getFlag(MODULE_ID, "sceneId") === scene.id) || null;
}

function buildOverviewPage(scene, options, counts) {
  const safe = options.audience === "safe";
  const image = sceneMainImage(scene);
  const publicPrompts = [
    options.firstImpression ? `<h3>What Players Notice First</h3><p>${escapeHTML(options.firstImpression)}</p>` : "",
    options.purpose && options.audience !== "safe" ? `<h3>Scene Purpose</h3><p>${escapeHTML(options.purpose)}</p>` : ""
  ].join("");

  const gmPrompts = [
    options.purpose ? ["What is this Scene for?", escapeHTML(options.purpose)] : null,
    options.entry ? ["How does it begin?", escapeHTML(options.entry)] : null,
    options.flow ? ["Intended flow", escapeHTML(options.flow)] : null,
    options.secrets ? ["Secrets / triggers", escapeHTML(options.secrets)] : null,
    options.rewards ? ["Rewards / exits", escapeHTML(options.rewards)] : null
  ].filter(Boolean);

  const countCardData = safe ? [
    [counts.visibleTokens, "Visible Tokens"]
  ] : [
    [counts.tokens, "Tokens"],
    [counts.actors, "Actors"],
    [counts.items, "Items / Stock"],
    [counts.containers, "Containers"],
    [counts.merchants, "Merchants"],
    [counts.tiles, "Tiles"],
    [counts.sounds, "Ambient Sounds"],
    [counts.lights, "Lights"],
    [counts.notes, "Notes"],
    [counts.walls, "Walls"]
  ];
  const countCards = countCardData.map(([value, label]) => `<div class="sbs-summary-count"><strong>${value}</strong><span>${escapeHTML(label)}</span></div>`).join("");

  const visibleTokenNames = collectionArray(scene.tokens)
    .filter((token) => !token.hidden)
    .map((token, index) => documentLink(token, safe ? playerVisibleTokenLabel(token, index) : token.name));

  const gmInventory = `
    <h3>Complete Scene Counts</h3>
    ${table([
      ["Visible Tokens", formatNumber(counts.visibleTokens)],
      ["Hidden Tokens", formatNumber(counts.hiddenTokens)],
      ["Unique Actors", formatNumber(counts.actors)],
      ["Placed Actor Items", formatNumber(counts.actorItems)],
      ["Container / Merchant Items", formatNumber(counts.integrationItems)],
      ["SBS Containers", formatNumber(counts.containers)],
      ["SBS Merchants", formatNumber(counts.merchants)],
      ["Tiles", formatNumber(counts.tiles)],
      ["Ambient Sounds", formatNumber(counts.sounds)],
      ["Ambient Lights", formatNumber(counts.lights)],
      ["Map Notes", formatNumber(counts.notes)],
      ["Drawings", formatNumber(counts.drawings)],
      ["Walls", formatNumber(counts.walls)],
      ["Doors", formatNumber(counts.doors)],
      ["Regions", formatNumber(counts.regions)],
      ["Measured Templates", formatNumber(counts.templates)]
    ])}
    ${gmPrompts.length ? `<h3>GM Intent and Reminders</h3>${table(gmPrompts)}` : ""}
  `;

  return `<section class="sbs-scene-summary-journal">
    <div class="sbs-summary-hero">
      <img class="sbs-summary-logo" src="${LOGO_PATH}" alt="SaltyBananaSlug">
      <div>
        <h1>${escapeHTML(scene.name)}</h1>
        <p>${documentLink(scene)} · Generated ${escapeHTML(new Date().toLocaleString())}</p>
      </div>
    </div>
    ${image ? `<img class="sbs-summary-scene-image" src="${escapeAttr(image)}" alt="${escapeAttr(scene.name)}">` : ""}
    ${publicPrompts}
    <h3>Visible Cast</h3>
    ${list(visibleTokenNames)}
    <div class="sbs-summary-counts">${countCards}</div>
    ${safe ? `<p class="sbs-summary-warning"><strong>Player-safe summary:</strong> hidden tokens, creature statistics, secrets, traps, coordinates, and technical configuration are protected as GM-only Secret blocks.</p>` : ""}
    ${secretBlock(gmInventory, safe, "GM Scene Summary")}
  </section>`;
}

function buildCastPage(scene, options) {
  const safe = options.audience === "safe";
  const tokens = collectionArray(scene.tokens);
  if (!tokens.length) return `<section class="sbs-scene-summary-journal"><h1>Cast & Creatures</h1><p><em>No tokens are placed in this Scene.</em></p></section>`;

  const cards = tokens.map((token, index) => {
    const actor = token.actor;
    const containerData = getSBSContainerData(token);
    const merchantData = getSBSMerchantData(token);
    const publicLabel = safe ? playerVisibleTokenLabel(token, index) : (token.name || `Token ${index + 1}`);

    if (containerData) {
      const entry = { token, data: containerData, inventory: game.actors.get(containerData.inventoryActorId) || null, journal: game.journal.get(containerData.journalId) || null };
      const header = `<article class="sbs-summary-card sbs-summary-integration-card">
        <div class="sbs-summary-card-header">
          ${token.texture?.src ? `<img src="${escapeAttr(token.texture.src)}" alt="${escapeAttr(publicLabel)}">` : ""}
          <div><h3>${documentLink(token, publicLabel)}</h3><p>${safe ? "Visible token" : `SBS Container · ${escapeHTML(containerTypeText(containerData))}`}</p></div>
        </div>`;
      const body = `<p>This token is managed by <strong>SaltyBananaSlug's Containers</strong>. Its real contents are stored on a separate hidden inventory Actor.</p>${table(containerSummaryRows(entry))}<h4>Container Contents</h4>${integrationInventoryPreview(entry.inventory)}`;
      if (safe) {
        if (token.hidden) return secretBlock(`${header}${body}</article>`, true, `Hidden Container: ${token.name || `Token ${index + 1}`}`);
        return `${header}<p>A visible container is present in the Scene.</p>${secretBlock(body, true, `${token.name || `Token ${index + 1}`} Container Details`)}</article>`;
      }
      return `${header}${body}</article>`;
    }

    if (merchantData && (merchantData.tokenMode === "generated" || isSBSIntegrationShell(actor))) {
      const entry = { token, data: merchantData, inventory: game.actors.get(merchantData.inventoryActorId) || null, journal: game.journal.get(merchantData.journalId) || null };
      const header = `<article class="sbs-summary-card sbs-summary-integration-card">
        <div class="sbs-summary-card-header">
          ${token.texture?.src ? `<img src="${escapeAttr(token.texture.src)}" alt="${escapeAttr(publicLabel)}">` : ""}
          <div><h3>${documentLink(token, publicLabel)}</h3><p>${safe ? "Visible token" : `SBS Merchant · ${escapeHTML(merchantShopText(merchantData))}`}</p></div>
        </div>`;
      const body = `<p>This generated merchant uses a lightweight shell Actor. Shop stock, treasury, pricing, favor, and ledger data live on separate SBS documents.</p>${table(merchantSummaryRows(entry))}<h4>Stock Preview</h4>${integrationInventoryPreview(entry.inventory, { merchant: true })}`;
      if (safe) {
        if (token.hidden) return secretBlock(`${header}${body}</article>`, true, `Hidden Merchant: ${token.name || `Token ${index + 1}`}`);
        return `${header}<p>A visible merchant is present in the Scene.</p>${secretBlock(body, true, `${token.name || `Token ${index + 1}`} Merchant Details`)}</article>`;
      }
      return `${header}${body}</article>`;
    }

    const actorEffects = collectionArray(actor?.effects);
    const biography = actor ? actorBiography(actor) : "";
    const publicSubtitle = safe ? "Visible token" : (merchantData ? `SBS Merchant · ${escapeHTML(merchantShopText(merchantData))}` : (actor ? escapeHTML(actorTypeText(actor).replace(/<[^>]*>/g, "")) : "No Actor attached"));
    const publicHeader = `<article class="sbs-summary-card">
      <div class="sbs-summary-card-header">
        ${token.texture?.src ? `<img src="${escapeAttr(token.texture.src)}" alt="${escapeAttr(publicLabel)}">` : ""}
        <div><h3>${documentLink(token, publicLabel)}</h3><p>${publicSubtitle}</p></div>
      </div>`;

    const merchantEntry = merchantData ? { token, data: merchantData, inventory: game.actors.get(merchantData.inventoryActorId) || null, journal: game.journal.get(merchantData.journalId) || null } : null;
    const merchantDetails = merchantEntry ? `<h4>SBS Merchant Configuration</h4><p>This existing NPC is linked to SaltyBananaSlug's Merchants; its normal Actor remains intact while shop stock is stored separately.</p>${table(merchantSummaryRows(merchantEntry))}<h5>Stock Preview</h5>${integrationInventoryPreview(merchantEntry.inventory, { merchant: true })}` : "";
    const gmBody = actor ? `
      ${merchantDetails}
      <h4>Token Configuration</h4>${table(tokenRows(token))}
      <h4>Actor Statistics</h4>${table(actorCoreRows(actor))}
      ${abilityRows(actor).length ? `<h4>Abilities</h4>${table(abilityRows(actor), { headers: ["Ability", "Score", "Modifier", "Save", "Proficiency"] })}` : ""}
      ${options.detailLevel !== "overview" && skillRows(actor).length ? `<h4>Skills</h4>${table(skillRows(actor), { headers: ["Skill", "Ability", "Total", "Passive", "Proficiency"] })}` : ""}
      <h4>Defenses</h4>${table(actorDefenses(actor))}
      ${actorResources(actor).length ? `<h4>Resources</h4>${table(actorResources(actor))}` : ""}
      ${actorEffects.length ? `<h4>Active Effects</h4><ul>${actorEffects.map(effectSummary).join("")}</ul>` : ""}
      ${actorFeaturesContent(actor, options)}
      ${options.includeDescriptions && biography ? `<h4>Biography / Description</h4><div>${biography}</div>` : ""}
      ${options.detailLevel === "exhaustive" ? detailsBlock("Actor system data", `<pre>${escapeHTML(safeJSON(actor.system))}</pre>`) : ""}
    ` : `<p>No Actor document is attached to this token.</p>${table(tokenRows(token))}`;

    if (safe) {
      if (token.hidden) return secretBlock(`${publicHeader}${gmBody}</article>`, true, `Hidden Token: ${token.name || `Token ${index + 1}`}`);
      return `${publicHeader}<p>A visible token is present in the Scene.</p>${secretBlock(gmBody, true, `${token.name || `Token ${index + 1}`} Statistics`)}</article>`;
    }
    return `${publicHeader}${gmBody}</article>`;
  }).join("");

  return `<section class="sbs-scene-summary-journal"><h1>Cast & Creatures</h1><p>Every placed token, including native SBS Containers and Merchants. Generated shell Actors are recognized so their dummy NPC statistics are not mistaken for the real container or storefront data.</p>${cards}</section>`;
}

const ACTOR_FEATURE_ITEM_TYPES = new Set([
  "feat", "spell", "class", "subclass", "background", "race", "species",
  "action", "reaction", "legendary", "lair", "maneuver", "affliction",
  "advancement", "facility"
]);

function isActorFeatureItem(item) {
  return ACTOR_FEATURE_ITEM_TYPES.has(String(item?.type || "").toLowerCase());
}

function actorFeatureItems(actor) {
  return collectionArray(actor?.items).filter(isActorFeatureItem);
}

function actorInventoryItems(actor) {
  return collectionArray(actor?.items).filter((item) => !isActorFeatureItem(item));
}

function actorFeaturesContent(actor, options) {
  const features = actorFeatureItems(actor);
  if (!features.length) return "";
  const grouped = new Map();
  for (const item of features) {
    const key = item.type || "feature";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const sections = Array.from(grouped.entries()).map(([type, entries]) => `
    <h5>${escapeHTML(titleCase(type))} (${entries.length})</h5>
    ${options.detailLevel === "overview"
      ? list(entries.map((item) => `${documentLink(item)}${itemDescription(item) ? ` — ${escapeHTML(truncate(stripHTML(itemDescription(item)), 180))}` : ""}`))
      : entries.map((item) => itemCard(item, options)).join("")}
  `).join("");
  return `<h4>Features, Actions & Spells</h4>${sections}`;
}

function buildItemsPage(scene, options) {
  const safe = options.audience === "safe";
  const groups = [];
  const seenActors = new Set();
  for (const token of collectionArray(scene.tokens)) {
    const actor = token.actor;
    if (!actor?.uuid || seenActors.has(actor.uuid) || isSBSIntegrationShell(actor)) continue;
    seenActors.add(actor.uuid);
    const items = actorInventoryItems(actor);
    if (!items.length) continue;
    const grouped = new Map();
    for (const item of items) {
      const key = item.type || "item";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const itemSections = Array.from(grouped.entries()).map(([type, typeItems]) => `
      <h3>${escapeHTML(titleCase(type))} (${typeItems.length})</h3>
      ${typeItems.map((item) => itemCard(item, options)).join("")}
    `).join("");
    const content = `<h2>${documentLink(actor, actor.name)}</h2><p>Represented by token ${documentLink(token, token.name)}.</p>${itemSections}`;
    groups.push(safe ? secretBlock(content, true, `${actor.name} Inventory and Equipment`) : content);
  }

  const integrations = getSceneIntegrations(scene);
  for (const entry of integrations.containers) {
    const items = collectionArray(entry.inventory?.items);
    const content = `<h2>${documentLink(entry.token, entry.token.name)} — Container Contents</h2>
      <p>${escapeHTML(containerTypeText(entry.data))}${entry.journal ? ` · ${documentLink(entry.journal, "Companion Journal")}` : ""}${entry.inventory ? ` · ${documentLink(entry.inventory, "Inventory Actor")}` : ""}</p>
      <p><strong>Currency:</strong> ${integrationCurrency(entry.inventory)}</p>
      ${items.length ? items.map((item) => itemCard(item, options)).join("") : "<p><em>Container is empty.</em></p>"}`;
    groups.push(safe ? secretBlock(content, true, `${entry.token.name} Container Inventory`) : content);
  }

  for (const entry of integrations.merchants) {
    const items = collectionArray(entry.inventory?.items);
    const content = `<h2>${documentLink(entry.token, entry.token.name)} — Merchant Stock</h2>
      <p>${escapeHTML(merchantShopText(entry.data))}${entry.journal ? ` · ${documentLink(entry.journal, "Ledger Journal")}` : ""}${entry.inventory ? ` · ${documentLink(entry.inventory, "Inventory Actor")}` : ""}</p>
      <p><strong>Treasury:</strong> ${integrationCurrency(entry.inventory)} · <strong>Maximum buying funds:</strong> ${entry.data.treasury?.unlimited ? "Unlimited" : merchantCopperToText(entry.data.treasury?.maxFundsCp ?? 0)}</p>
      ${items.length ? items.map((item) => merchantStockCard(item, options)).join("") : "<p><em>Merchant has no stock.</em></p>"}`;
    groups.push(safe ? secretBlock(content, true, `${entry.token.name} Merchant Stock`) : content);
  }

  return `<section class="sbs-scene-summary-journal"><h1>Items, Loot & Equipment</h1><p>Physical inventory and equipment carried by placed Actors, plus the real hidden inventory Actors used by SaltyBananaSlug's Containers and SaltyBananaSlug's Merchants. Actor features, monster actions, class features, and spells remain with their Actor on the Cast & Creatures page.</p>${groups.join("") || "<p><em>No physical inventory, container contents, or merchant stock was found.</em></p>"}</section>`;
}

function buildIntegrationsPage(scene, options) {
  const safe = options.audience === "safe";
  const { containers, merchants } = getSceneIntegrations(scene);
  if (!containers.length && !merchants.length) {
    return `<section class="sbs-scene-summary-journal"><h1>Containers & Merchants</h1><p><em>No SaltyBananaSlug Containers or Merchants are placed in this Scene.</em></p></section>`;
  }

  const renderContainer = (entry, playerSafe = false) => {
    const label = playerSafe ? playerVisibleTokenLabel(entry.token) : entry.token.name;
    const subtitle = playerSafe ? "Visible token" : `Container · ${escapeHTML(containerTypeText(entry.data))}`;
    const header = `<article class="sbs-summary-card sbs-summary-integration-card"><div class="sbs-summary-card-header">${entry.token.texture?.src ? `<img src="${escapeAttr(entry.token.texture.src)}" alt="${escapeAttr(label)}">` : ""}<div><h3>${documentLink(entry.token, label)}</h3><p>${subtitle}</p></div></div>`;
    if (playerSafe) return `${header}<p>A visible scene token is managed as a container. Its contents and configuration are GM-only.</p></article>`;
    return `${header}${table(containerSummaryRows(entry))}<h4>Contents Snapshot</h4>${integrationInventoryPreview(entry.inventory)}</article>`;
  };

  const renderMerchant = (entry, playerSafe = false) => {
    const label = playerSafe ? playerVisibleTokenLabel(entry.token) : entry.token.name;
    const subtitle = playerSafe ? "Visible token" : `Merchant · ${escapeHTML(merchantShopText(entry.data))}`;
    const header = `<article class="sbs-summary-card sbs-summary-integration-card"><div class="sbs-summary-card-header">${entry.token.texture?.src ? `<img src="${escapeAttr(entry.token.texture.src)}" alt="${escapeAttr(label)}">` : ""}<div><h3>${documentLink(entry.token, label)}</h3><p>${subtitle}</p></div></div>`;
    if (playerSafe) return `${header}<p>A visible scene token is managed as a merchant. Stock, treasury, pricing, favor, and ledger details are GM-only.</p></article>`;
    return `${header}${table(merchantSummaryRows(entry))}<h4>Stock Snapshot</h4>${integrationInventoryPreview(entry.inventory, { merchant: true })}</article>`;
  };

  if (safe) {
    const visibleContainers = containers.filter((entry) => !entry.token.hidden);
    const visibleMerchants = merchants.filter((entry) => !entry.token.hidden);
    const publicCards = [...visibleContainers.map((entry) => renderContainer(entry, true)), ...visibleMerchants.map((entry) => renderMerchant(entry, true))].join("");
    const gmDetails = `${containers.length ? `<h2>Containers (${containers.length})</h2>${containers.map((entry) => renderContainer(entry)).join("")}` : ""}${merchants.length ? `<h2>Merchants (${merchants.length})</h2>${merchants.map((entry) => renderMerchant(entry)).join("")}` : ""}`;
    return `<section class="sbs-scene-summary-journal"><h1>Containers & Merchants</h1><p>Visible integrated tokens are listed below. Their inventories and technical configuration remain GM-only.</p>${publicCards || "<p><em>No integrated tokens are publicly visible.</em></p>"}${secretBlock(gmDetails, true, "Complete GM Container & Merchant Data")}</section>`;
  }

  return `<section class="sbs-scene-summary-journal"><h1>Containers & Merchants</h1><p>Native integration with SaltyBananaSlug's Containers and Merchants. The summarizer follows each scene token to its hidden inventory Actor and companion Journal instead of treating the shell Actor as the whole story.</p>${containers.length ? `<h2>Containers (${containers.length})</h2>${containers.map((entry) => renderContainer(entry)).join("")}` : ""}${merchants.length ? `<h2>Merchants (${merchants.length})</h2>${merchants.map((entry) => renderMerchant(entry)).join("")}` : ""}</section>`;
}

function buildMapPage(scene, options) {
  const safe = options.audience === "safe";
  const tiles = collectionArray(scene.tiles);
  const sceneRows = [
    ["Scene Document", documentLink(scene)],
    ["Dimensions", `${formatNumber(scene.width)} × ${formatNumber(scene.height)} pixels`],
    ["Padding", formatValue(scene.padding)],
    ["Grid", formatValue(scene.grid)],
    ["Initial View", formatValue(scene.initial)],
    ["Navigation Visible", formatBoolean(scene.navigation)],
    ["Navigation Name / Order", `${escapeHTML(scene.navName || "—")} / ${formatNumber(scene.navOrder ?? "—")}`],
    ["Background Color", formatValue(scene.backgroundColor)],
    ["Background", scene.background?.src ? `<code>${escapeHTML(scene.background.src)}</code>` : "—"],
    ["Foreground", scene.foreground ? `<code>${escapeHTML(scene.foreground)}</code>` : "—"],
    ["Foreground Elevation", formatValue(scene.foregroundElevation)],
    ["Thumbnail", scene.thumb ? `<code>${escapeHTML(scene.thumb)}</code>` : "—"],
    ["Fog Overlay", scene.fog?.overlay ? `<code>${escapeHTML(scene.fog.overlay)}</code>` : "—"],
    ["Fog Exploration", formatBoolean(scene.fog?.exploration)],
    ["Flag Scopes", flagSummary(scene)]
  ];

  const tileCards = tiles.map((tile, index) => {
    const source = firstDefined(tile.texture?.src, tile.img, tile._source?.texture?.src);
    const body = `
      <div class="sbs-summary-card-header">
        ${source && fileKind(source) === "image" ? `<img src="${escapeAttr(source)}" alt="Tile ${index + 1}">` : ""}
        <div><h3>${documentLink(tile, tile.name || `Tile ${index + 1}`)}</h3><p>${source ? `<code>${escapeHTML(source)}</code>` : "No media source"}</p></div>
      </div>
      ${table([
        ["Position", `x ${formatNumber(tile.x)}, y ${formatNumber(tile.y)}, elevation ${formatNumber(tile.elevation ?? 0)}`],
        ["Dimensions", `${formatNumber(tile.width)} × ${formatNumber(tile.height)}`],
        ["Rotation", `${formatNumber(tile.rotation ?? 0)}°`],
        ["Alpha", formatValue(tile.alpha)],
        ["Hidden", formatBoolean(tile.hidden)],
        ["Locked", formatBoolean(tile.locked)],
        ["Overhead / Occlusion", `${formatBoolean(firstDefined(tile.overhead, get(tile, "occlusion.mode") !== undefined))} / ${formatValue(tile.occlusion)}`],
        ["Video", formatValue(tile.video)],
        ["Restrictions", formatValue(tile.restrictions)],
        ["Flag Scopes", flagSummary(tile)]
      ])}
      ${options.detailLevel === "exhaustive" ? detailsBlock("Complete Tile data", `<pre>${escapeHTML(safeJSON(tile.toObject()))}</pre>`) : ""}`;
    return `<article class="sbs-summary-card">${body}</article>`;
  }).join("");

  const technical = `<h2>Scene Configuration</h2>${table(sceneRows)}<h2>Tiles (${tiles.length})</h2>${tileCards || "<p><em>No tiles are placed.</em></p>"}`;
  const safeIntro = options.includeMediaIndex
    ? "Scene media is also collected on the optional Media Index page. Technical layout and tile triggers are protected."
    : "Technical layout, media paths, and tile triggers are protected as GM details.";
  return `<section class="sbs-scene-summary-journal"><h1>Map, Images & Tiles</h1>${safe ? `<p>${safeIntro}</p>${secretBlock(technical, true, "GM Map Configuration")}` : technical}</section>`;
}

function buildAudioPage(scene, options) {
  const safe = options.audience === "safe";
  const playlist = resolveScenePlaylist(scene);
  const selectedSound = resolveScenePlaylistSound(scene, playlist);
  const playlistRows = playlist ? [
    ["Playlist", documentLink(playlist)],
    ["Mode", formatValue(playlist.mode)],
    ["Playing", formatBoolean(playlist.playing)],
    ["Selected Starting Sound", selectedSound ? documentLink(selectedSound) : "—"],
    ["Track Count", formatNumber(playlist.sounds.size ?? collectionArray(playlist.sounds).length)]
  ] : [["Linked Playlist", "None"]];

  const ambientCards = collectionArray(scene.sounds).map((sound, index) => {
    const rows = [
      ["Sound Document", documentLink(sound, sound.name || `Ambient Sound ${index + 1}`)],
      ["File", sound.path ? `<code>${escapeHTML(sound.path)}</code>` : "—"],
      ["Position", `x ${formatNumber(sound.x)}, y ${formatNumber(sound.y)}, elevation ${formatNumber(sound.elevation ?? 0)}`],
      ["Radius", formatValue(sound.radius)],
      ["Volume", formatValue(sound.volume)],
      ["Repeats", formatBoolean(sound.repeat)],
      ["Constrained by Walls", formatBoolean(sound.walls)],
      ["Distance Easing", formatBoolean(sound.easing)],
      ["Hidden", formatBoolean(sound.hidden)],
      ["Darkness Range", formatValue(sound.darkness)],
      ["Effects", formatValue(sound.effects)],
      ["Flag Scopes", flagSummary(sound)]
    ];
    const content = `<article class="sbs-summary-card"><h3>${escapeHTML(sound.name || `Ambient Sound ${index + 1}`)}</h3>${options.embedMedia && sound.path ? mediaPreview(sound.path, "audio", sound.name) : ""}${table(rows)}</article>`;
    return safe ? secretBlock(content, true, sound.name || `Ambient Sound ${index + 1}`) : content;
  }).join("");

  const playlistTracks = playlist ? collectionArray(playlist.sounds).map((sound) => `<article class="sbs-summary-card"><h3>${documentLink(sound)}</h3>${options.embedMedia && sound.path ? mediaPreview(sound.path, "audio", sound.name) : ""}${table([
    ["File", sound.path ? `<code>${escapeHTML(sound.path)}</code>` : "—"],
    ["Volume", formatValue(sound.volume)],
    ["Repeat", formatBoolean(sound.repeat)],
    ["Fade", formatValue(sound.fade)],
    ["Playing", formatBoolean(sound.playing)],
    ["Paused Time", formatValue(sound.pausedTime)],
    ["Flags", flagSummary(sound)]
  ])}</article>`).join("") : "";

  const full = `<h2>Scene Playlist</h2>${table(playlistRows)}${playlistTracks ? `<h2>Playlist Tracks</h2>${playlistTracks}` : ""}<h2>Ambient Sounds</h2>${ambientCards || "<p><em>No ambient sounds are placed.</em></p>"}`;
  return `<section class="sbs-scene-summary-journal"><h1>Audio & Atmosphere</h1>${safe ? `<p>Audio files and hidden sound zones are protected as GM details.</p>${secretBlock(full, true, "GM Audio Configuration")}` : full}</section>`;
}

function buildLightingPage(scene, options) {
  const safe = options.audience === "safe";
  const lights = collectionArray(scene.lights);
  const sceneLighting = table([
    ["Token Vision Required", formatBoolean(scene.tokenVision)],
    ["Weather Effect", formatValue(scene.weather)],
    ["Environment", formatValue(scene.environment)],
    ["Fog Settings", formatValue(scene.fog)],
    ["Background Color", formatValue(scene.backgroundColor)]
  ]);
  const lightCards = lights.map((light, index) => `<article class="sbs-summary-card"><h3>${documentLink(light, light.name || `Ambient Light ${index + 1}`)}</h3>${table([
    ["Position", `x ${formatNumber(light.x)}, y ${formatNumber(light.y)}, elevation ${formatNumber(light.elevation ?? 0)}`],
    ["Bright / Dim Radius", `${formatNumber(light.config?.bright ?? 0)} / ${formatNumber(light.config?.dim ?? 0)}`],
    ["Angle / Rotation", `${formatNumber(light.config?.angle ?? 360)}° / ${formatNumber(light.rotation ?? 0)}°`],
    ["Color / Alpha", `${formatValue(light.config?.color)} / ${formatValue(light.config?.alpha)}`],
    ["Animation", formatValue(light.config?.animation)],
    ["Darkness Range", formatValue(light.config?.darkness)],
    ["Negative Light", formatBoolean(light.config?.negative)],
    ["Vision Source", formatBoolean(light.config?.vision)],
    ["Walls", formatBoolean(light.walls)],
    ["Hidden", formatBoolean(light.hidden)],
    ["Flag Scopes", flagSummary(light)]
  ])}${options.detailLevel === "exhaustive" ? detailsBlock("Complete Light data", `<pre>${escapeHTML(safeJSON(light.toObject()))}</pre>`) : ""}</article>`).join("");
  const content = `<h2>Scene Environment</h2>${sceneLighting}<h2>Ambient Lights (${lights.length})</h2>${lightCards || "<p><em>No ambient lights are placed.</em></p>"}`;
  return `<section class="sbs-scene-summary-journal"><h1>Lighting, Vision & Environment</h1>${safe ? secretBlock(content, true, "GM Lighting and Vision Configuration") : content}</section>`;
}

async function noteExcerpt(note) {
  try {
    const page = note.page || (note.pageId && note.entry?.pages?.get(note.pageId));
    if (!page) return "";
    if (page.type === "text") return truncate(stripHTML(page.text?.content || ""), 700);
    if (["image", "video", "pdf"].includes(page.type)) return page.src ? `Media: ${page.src}` : "";
  } catch (error) {
    console.debug(`${MODULE_TITLE} | Could not read note excerpt`, note, error);
  }
  return "";
}

async function buildNotesPage(scene, options) {
  const safe = options.audience === "safe";
  const notes = collectionArray(scene.notes);
  const noteCards = [];
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const entry = note.entry;
    const page = note.page;
    const excerpt = await noteExcerpt(note);
    noteCards.push(`<article class="sbs-summary-card"><h3>${entry ? documentLink(entry, note.label || entry.name) : escapeHTML(note.label || `Map Note ${index + 1}`)}</h3>${table([
      ["Journal Entry", entry ? documentLink(entry) : "Missing or inaccessible"],
      ["Journal Page", page ? documentLink(page) : "Whole Journal / none"],
      ["Position", `x ${formatNumber(note.x)}, y ${formatNumber(note.y)}`],
      ["Icon", note.texture?.src ? `<code>${escapeHTML(note.texture.src)}</code>` : "—"],
      ["Icon Size", formatValue(note.iconSize)],
      ["Label", formatValue(note.label)],
      ["Text Anchor / Font", `${formatValue(note.textAnchor)} / ${formatValue(note.fontSize)}`],
      ["Flags", flagSummary(note)]
    ])}${excerpt ? `<h4>Page Excerpt</h4><p>${escapeHTML(excerpt)}</p>` : ""}</article>`);
  }

  const drawings = collectionArray(scene.drawings).map((drawing, index) => `<article class="sbs-summary-card"><h3>${documentLink(drawing, drawing.text || `Drawing ${index + 1}`)}</h3>${table([
    ["Shape Type", formatValue(drawing.shape?.type)],
    ["Position", `x ${formatNumber(drawing.x)}, y ${formatNumber(drawing.y)}, elevation ${formatNumber(drawing.elevation ?? 0)}`],
    ["Dimensions", `${formatNumber(drawing.shape?.width ?? 0)} × ${formatNumber(drawing.shape?.height ?? 0)}`],
    ["Rotation", `${formatNumber(drawing.rotation ?? 0)}°`],
    ["Text", formatValue(drawing.text)],
    ["Hidden / Locked", `${formatBoolean(drawing.hidden)} / ${formatBoolean(drawing.locked)}`],
    ["Stroke", `${formatValue(drawing.strokeColor)} · ${formatValue(drawing.strokeWidth)} · alpha ${formatValue(drawing.strokeAlpha)}`],
    ["Fill", `${formatValue(drawing.fillType)} · ${formatValue(drawing.fillColor)} · alpha ${formatValue(drawing.fillAlpha)}`],
    ["Font", `${formatValue(drawing.fontFamily)} · ${formatValue(drawing.fontSize)}`],
    ["Flags", flagSummary(drawing)]
  ])}</article>`).join("");

  const templates = collectionArray(scene.templates).map((template, index) => `<article class="sbs-summary-card"><h3>${documentLink(template, `Template ${index + 1}`)}</h3>${table([
    ["Type", formatValue(template.t)],
    ["Position", `x ${formatNumber(template.x)}, y ${formatNumber(template.y)}, elevation ${formatNumber(template.elevation ?? 0)}`],
    ["Distance", formatValue(template.distance)],
    ["Direction / Angle", `${formatValue(template.direction)} / ${formatValue(template.angle)}`],
    ["Width", formatValue(template.width)],
    ["Texture", template.texture ? `<code>${escapeHTML(template.texture)}</code>` : "—"],
    ["Hidden", formatBoolean(template.hidden)],
    ["Flags", flagSummary(template)]
  ])}</article>`).join("");

  const regions = collectionArray(scene.regions).map((region, index) => {
    const behaviors = collectionArray(region.behaviors).map((behavior) => `${behavior.name || behavior.type || "Behavior"} (${behavior.disabled ? "disabled" : "enabled"})`).join(", ");
    return `<article class="sbs-summary-card"><h3>${documentLink(region, region.name || `Region ${index + 1}`)}</h3>${table([
      ["Elevation", `${formatValue(region.elevation?.bottom)} to ${formatValue(region.elevation?.top)}`],
      ["Shapes", formatValue(region.shapes)],
      ["Behaviors", escapeHTML(behaviors || "—")],
      ["Visibility", formatValue(region.visibility)],
      ["Color", formatValue(region.color)],
      ["Flags", flagSummary(region)]
    ])}${options.detailLevel === "exhaustive" ? detailsBlock("Complete Region data", `<pre>${escapeHTML(safeJSON(region.toObject()))}</pre>`) : ""}</article>`;
  }).join("");

  const full = `<h2>Map Notes (${notes.length})</h2>${noteCards.join("") || "<p><em>No map notes are placed.</em></p>"}<h2>Drawings (${collectionArray(scene.drawings).length})</h2>${drawings || "<p><em>No drawings are placed.</em></p>"}<h2>Measured Templates (${collectionArray(scene.templates).length})</h2>${templates || "<p><em>No measured templates are placed.</em></p>"}<h2>Regions (${collectionArray(scene.regions).length})</h2>${regions || "<p><em>No regions are defined.</em></p>"}`;
  return `<section class="sbs-scene-summary-journal"><h1>Notes, Drawings, Templates & Regions</h1>${safe ? secretBlock(full, true, "GM Notes and Interactive Geometry") : full}</section>`;
}

function wallSenseLabel(value) {
  const match = Object.entries(CONST.WALL_SENSE_TYPES || {}).find(([, numeric]) => numeric === value);
  return match ? titleCase(match[0]) : String(value ?? "—");
}

function doorStateLabel(value) {
  const match = Object.entries(CONST.WALL_DOOR_STATES || {}).find(([, numeric]) => numeric === value);
  return match ? titleCase(match[0]) : String(value ?? "—");
}

function doorTypeLabel(value) {
  const match = Object.entries(CONST.WALL_DOOR_TYPES || {}).find(([, numeric]) => numeric === value);
  return match ? titleCase(match[0]) : String(value ?? "—");
}

function buildWallsPage(scene, options) {
  const safe = options.audience === "safe";
  const walls = collectionArray(scene.walls);
  const doors = walls.filter((wall) => Number(wall.door) > 0);
  const summary = table([
    ["Total Walls", formatNumber(walls.length)],
    ["Doors", formatNumber(doors.length)],
    ["Open Doors", formatNumber(doors.filter((wall) => Number(wall.ds) === CONST.WALL_DOOR_STATES?.OPEN).length)],
    ["Closed Doors", formatNumber(doors.filter((wall) => Number(wall.ds) === CONST.WALL_DOOR_STATES?.CLOSED).length)],
    ["Locked Doors", formatNumber(doors.filter((wall) => Number(wall.ds) === CONST.WALL_DOOR_STATES?.LOCKED).length)],
    ["Secret Doors", formatNumber(doors.filter((wall) => Number(wall.door) === CONST.WALL_DOOR_TYPES?.SECRET).length)]
  ]);

  const wallRows = walls.map((wall, index) => [
    documentLink(wall, wall.name || `Wall ${index + 1}`),
    escapeHTML((wall.c || []).map(formatNumber).join(", ")),
    escapeHTML(doorTypeLabel(wall.door)),
    escapeHTML(doorStateLabel(wall.ds)),
    escapeHTML(wallSenseLabel(wall.move)),
    escapeHTML(wallSenseLabel(wall.sight)),
    escapeHTML(wallSenseLabel(wall.sound)),
    escapeHTML(wallSenseLabel(wall.light)),
    formatValue(wall.dir),
    flagSummary(wall)
  ]);

  const detail = `<h2>Wall and Door Summary</h2>${summary}${options.detailLevel === "overview" ? "" : `<h2>Every Wall Segment</h2>${table(wallRows, { headers: ["Wall", "Coordinates", "Door Type", "Door State", "Movement", "Sight", "Sound", "Light", "Direction", "Flags"] })}`}${options.detailLevel === "exhaustive" ? detailsBlock("Complete Wall data", `<pre>${escapeHTML(safeJSON(walls.map((wall) => wall.toObject())))}</pre>`) : ""}`;
  return `<section class="sbs-scene-summary-journal"><h1>Walls, Doors & Technical Layout</h1>${safe ? secretBlock(detail, true, "GM Wall and Door Configuration") : detail}</section>`;
}

async function collectMedia(scene) {
  const media = new Map();
  addMedia(media, scene.thumb, `${scene.name} Thumbnail`, "Scene");
  addMedia(media, scene.background?.src, `${scene.name} Background`, "Scene");
  addMedia(media, scene.foreground, `${scene.name} Foreground`, "Scene");
  addMedia(media, scene.fog?.overlay, `${scene.name} Fog Overlay`, "Scene");

  for (const tile of collectionArray(scene.tiles)) addMedia(media, firstDefined(tile.texture?.src, tile.img), tile.name || "Tile", `Tile: ${tile.name || tile.id}`, { secret: true });
  for (const [index, token] of collectionArray(scene.tokens).entries()) {
    const publicLabel = playerVisibleTokenLabel(token, index);
    addMedia(media, token.texture?.src, token.hidden ? `${token.name} Token` : publicLabel, token.hidden ? `Hidden Token: ${token.name}` : "Visible Token", { secret: Boolean(token.hidden) });
    if (token.actor) {
      addMedia(media, token.actor.img, `${token.actor.name} Actor`, `Actor: ${token.actor.name}`, { secret: true });
      addMedia(media, token.actor.prototypeToken?.texture?.src, `${token.actor.name} Prototype Token`, `Actor: ${token.actor.name}`, { secret: true });
      for (const item of collectionArray(token.actor.items)) addMedia(media, item.img, `${item.name} Image`, `Item on ${token.actor.name}`, { secret: true });
    }
  }
  const integrations = getSceneIntegrations(scene);
  for (const entry of integrations.containers) {
    for (const [state, path] of Object.entries(entry.data.images || {})) addMedia(media, path, `${entry.token.name} ${titleCase(state)} Image`, `SBS Container: ${entry.token.name}`, { secret: true });
    addMedia(media, entry.inventory?.img, `${entry.token.name} Inventory Actor`, `SBS Container Inventory: ${entry.token.name}`, { secret: true });
    for (const item of collectionArray(entry.inventory?.items)) addMedia(media, item.img, `${item.name} Image`, `SBS Container: ${entry.token.name}`, { secret: true });
  }
  for (const entry of integrations.merchants) {
    addMedia(media, entry.inventory?.img, `${entry.token.name} Merchant Inventory Actor`, `SBS Merchant: ${entry.token.name}`, { secret: true });
    for (const item of collectionArray(entry.inventory?.items)) addMedia(media, item.img, `${item.name} Image`, `SBS Merchant: ${entry.token.name}`, { secret: true });
    if (entry.data.sound?.enabled) addMedia(media, entry.data.sound.path, `${entry.token.name} Greeting Sound`, `SBS Merchant: ${entry.token.name}`, { secret: true, kind: "audio" });
  }
  for (const sound of collectionArray(scene.sounds)) addMedia(media, sound.path, sound.name || "Ambient Sound", "Ambient Sound", { secret: true, kind: "audio" });
  const playlist = resolveScenePlaylist(scene);
  if (playlist) for (const sound of collectionArray(playlist.sounds)) addMedia(media, sound.path, sound.name, `Playlist: ${playlist.name}`, { secret: true, kind: "audio" });
  for (const note of collectionArray(scene.notes)) {
    addMedia(media, note.texture?.src, note.label || "Map Note Icon", "Map Note", { secret: true });
    const page = note.page;
    if (page?.src) addMedia(media, page.src, page.name, `Journal: ${note.entry?.name || "Map Note"}`, { secret: true });
  }
  for (const template of collectionArray(scene.templates)) addMedia(media, template.texture, "Measured Template Texture", "Measured Template", { secret: true });
  return Array.from(media.values());
}

async function buildMediaPage(scene, options) {
  const safe = options.audience === "safe";
  const media = await collectMedia(scene);
  const publicMedia = media.filter((entry) => !entry.secret && entry.kind === "image");
  const allCards = `<div class="sbs-summary-media-grid">${media.map((entry) => mediaCard(entry, options.embedMedia)).join("")}</div>`;
  const publicCards = `<div class="sbs-summary-media-grid">${publicMedia.map((entry) => mediaCard(entry, options.embedMedia)).join("")}</div>`;
  return `<section class="sbs-scene-summary-journal"><h1>Media Index</h1><p>Every discoverable image, video, audio track, token portrait, Item icon, map asset, Journal media page, and template texture referenced by this Scene.</p>${safe ? `${publicCards || "<p><em>No player-facing images found.</em></p>"}${secretBlock(allCards, true, "Complete GM Media Index")}` : allCards || "<p><em>No media paths were found.</em></p>"}</section>`;
}

function buildRawDataPage(scene, options) {
  const safe = options.audience === "safe";
  const source = deepClone(scene.toObject());
  const integrations = getSceneIntegrations(scene);
  const external = {
    containers: integrations.containers.map((entry) => ({ tokenId: entry.token.id, tokenName: entry.token.name, config: deepClone(entry.data), inventoryActor: entry.inventory?.toObject?.() ?? null, journal: entry.journal ? { id: entry.journal.id, uuid: entry.journal.uuid, name: entry.journal.name } : null })),
    merchants: integrations.merchants.map((entry) => ({ tokenId: entry.token.id, tokenName: entry.token.name, config: deepClone(entry.data), inventoryActor: entry.inventory?.toObject?.() ?? null, journal: entry.journal ? { id: entry.journal.id, uuid: entry.journal.uuid, name: entry.journal.name } : null }))
  };
  const content = `<p>This is a complete serialized snapshot of the Scene document at generation time, followed by external SBS Container/Merchant inventory Actors that do not live inside the Scene document itself. It can be enormous. That is not a bug; it is the forensic goblin fulfilling its oath.</p><h2>Scene Document</h2><pre>${escapeHTML(safeJSON(source))}</pre><h2>External SBS Data</h2><pre>${escapeHTML(safeJSON(external))}</pre>`;
  return `<section class="sbs-scene-summary-journal"><h1>Raw Scene Data</h1>${secretBlock(content, safe, "Complete Raw Scene Data")}</section>`;
}

async function buildPages(scene, options) {
  const counts = getSceneCounts(scene);
  const pages = [
    { key: "overview", name: "Scene Overview", content: buildOverviewPage(scene, options, counts) },
    { key: "cast", name: "Cast & Creatures", content: buildCastPage(scene, options) },
    { key: "items", name: "Items, Loot & Equipment", content: buildItemsPage(scene, options) },
    { key: "integrations", name: "Containers & Merchants", content: buildIntegrationsPage(scene, options) },
    { key: "map", name: "Map, Images & Tiles", content: buildMapPage(scene, options) },
    { key: "audio", name: "Audio & Atmosphere", content: buildAudioPage(scene, options) },
    { key: "lighting", name: "Lighting, Vision & Environment", content: buildLightingPage(scene, options) },
    { key: "notes", name: "Notes, Drawings, Templates & Regions", content: await buildNotesPage(scene, options) },
    { key: "walls", name: "Walls, Doors & Technical Layout", content: buildWallsPage(scene, options) }
  ];
  if (options.includeMediaIndex) pages.push({ key: "media", name: "Media Index", content: await buildMediaPage(scene, options) });
  if (options.includeRawData || options.detailLevel === "exhaustive") pages.push({ key: "raw", name: "Raw Scene Data", content: buildRawDataPage(scene, options) });
  return pages;
}

async function createManagedPages(journal, pageSpecs) {
  const pageData = pageSpecs.map((page, index) => ({
    name: page.name,
    type: "text",
    sort: (index + 1) * 100000,
    text: {
      content: page.content,
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    },
    flags: {
      [MODULE_ID]: {
        [MANAGED_PAGE_FLAG]: true,
        pageKey: page.key
      }
    }
  }));
  return journal.createEmbeddedDocuments("JournalEntryPage", pageData);
}

async function pinJournalToScene(scene, journal, page) {
  const existing = collectionArray(scene.notes).find((note) => note.getFlag(MODULE_ID, "summaryNote") || (note.entryId === journal.id && note.pageId === page.id));
  const selected = canvas?.scene?.id === scene.id ? canvas.tokens?.controlled?.[0]?.document : null;
  const gridSize = scene.grid?.size || canvas?.grid?.size || 100;
  const x = selected ? selected.x + ((selected.width || 1) * gridSize) / 2 : (scene.width || 0) / 2;
  const y = selected ? selected.y + ((selected.height || 1) * gridSize) / 2 : (scene.height || 0) / 2;
  const data = {
    entryId: journal.id,
    pageId: page.id,
    x,
    y,
    texture: { src: LOGO_PATH },
    iconSize: Math.max(64, gridSize),
    text: journal.name,
    fontSize: 24,
    textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1,
    textColor: "#f6e6a8",
    flags: { [MODULE_ID]: { summaryNote: true, journalId: journal.id } }
  };
  if (existing) {
    await existing.update(data);
    return existing;
  }
  const [note] = await scene.createEmbeddedDocuments("Note", [data]);
  return note;
}

async function summarizeScene(scene, options = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can summarize Scenes.");
  if (!scene) throw new Error("Choose a Scene first.");

  const resolved = {
    journalName: options.journalName || `${scene.name} — Scene Summary`,
    audience: options.audience || "gm",
    detailLevel: options.detailLevel || "detailed",
    includeDescriptions: options.includeDescriptions !== false,
    embedMedia: options.embedMedia !== false,
    includeMediaIndex: Boolean(options.includeMediaIndex),
    includeRawData: Boolean(options.includeRawData),
    updateExisting: options.updateExisting !== false,
    linkSceneJournal: options.linkSceneJournal !== false,
    pinNote: Boolean(options.pinNote),
    showPlayers: Boolean(options.showPlayers),
    openResult: options.openResult !== false,
    purpose: options.purpose || "",
    firstImpression: options.firstImpression || "",
    entry: options.entry || "",
    flow: options.flow || "",
    secrets: options.secrets || "",
    rewards: options.rewards || ""
  };

  const folder = await getOrCreateFolder(JOURNAL_FOLDER, "JournalEntry");
  const ownership = ownershipData(resolved.audience);
  let journal = resolved.updateExisting ? getSceneJournal(scene) : null;
  const isNew = !journal;

  if (!journal) {
    journal = await JournalEntry.create({
      name: resolved.journalName,
      folder: folder.id,
      ownership,
      flags: { [MODULE_ID]: { managed: true, sceneId: scene.id } }
    });
  } else {
    await journal.update({ name: resolved.journalName, folder: folder.id, ownership });
  }

  try {
    const pageSpecs = await buildPages(scene, resolved);
    const managedPageIds = collectionArray(journal.pages)
      .filter((page) => page.getFlag(MODULE_ID, MANAGED_PAGE_FLAG))
      .map((page) => page.id);
    if (managedPageIds.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", managedPageIds);

    const pages = await createManagedPages(journal, pageSpecs);
    const overview = pages.find((page) => page.getFlag(MODULE_ID, "pageKey") === "overview") || pages[0];

    await journal.update({
      name: resolved.journalName,
      ownership,
      [`flags.${MODULE_ID}.managed`]: true,
      [`flags.${MODULE_ID}.sceneId`]: scene.id,
      [`flags.${MODULE_ID}.generatedAt`]: Date.now(),
      [`flags.${MODULE_ID}.audience`]: resolved.audience,
      [`flags.${MODULE_ID}.detailLevel`]: resolved.detailLevel,
      [`flags.${MODULE_ID}.overviewPageId`]: overview.id
    });
    await scene.setFlag(MODULE_ID, "summaryJournalId", journal.id);

    if (resolved.linkSceneJournal) await scene.update({ journal: journal.id, journalEntryPage: overview.id });
    if (resolved.pinNote) await pinJournalToScene(scene, journal, overview);
    if (resolved.showPlayers && resolved.audience !== "gm") await journal.show(false);
    if (resolved.openResult) journal.sheet.render(true, { pageId: overview.id });

    ui.notifications.info(`${isNew ? "Created" : "Updated"} ${journal.name} with ${pages.length} generated pages.`);
    return journal;
  } catch (error) {
    if (isNew) await journal.delete();
    throw error;
  }
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

class SceneSummarizedApplication extends Application {
  constructor(options = {}) {
    super(options);
    const scene = canvas?.scene || game.scenes.active || game.scenes.contents[0] || null;
    this.state = {
      sceneId: scene?.id || "",
      journalName: scene ? `${scene.name} — Scene Summary` : "Scene Summary",
      audience: "gm",
      detailLevel: "detailed",
      includeDescriptions: true,
      embedMedia: true,
      includeMediaIndex: false,
      includeRawData: false,
      updateExisting: true,
      linkSceneJournal: true,
      pinNote: false,
      showPlayers: false,
      openResult: true,
      purpose: "",
      firstImpression: "",
      entry: "",
      flow: "",
      secrets: "",
      rewards: ""
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: MODULE_ID,
      title: MODULE_TITLE,
      template: `${MODULE_PATH}/templates/scene-summarized-v104.html`,
      width: 960,
      height: 860,
      resizable: true,
      classes: ["saltybananaslug-scene-summarized-window"]
    });
  }

  get selectedScene() {
    return game.scenes.get(this.state.sceneId) || canvas?.scene || game.scenes.active || null;
  }

  getData() {
    const scene = this.selectedScene;
    const existing = scene ? getSceneJournal(scene) : null;
    const counts = scene ? getSceneCounts(scene) : null;
    return {
      logoPath: LOGO_PATH,
      scenes: game.scenes.contents
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ id: entry.id, name: entry.name, selected: entry.id === scene?.id })),
      ...this.state,
      selectedSceneName: scene?.name || "No Scene selected",
      existingJournalName: existing?.name || "",
      sceneCounts: counts ? `${counts.tokens} tokens · ${counts.items} items/stock · ${counts.containers} containers · ${counts.merchants} merchants · ${counts.tiles} tiles · ${counts.sounds} sounds · ${counts.notes} notes · ${counts.walls} walls` : "",
      summarizeLabel: existing && this.state.updateExisting ? "Update Scene Summary" : "Create Scene Summary",
      audienceGM: this.state.audience === "gm",
      audienceSafe: this.state.audience === "safe",
      audienceFull: this.state.audience === "full",
      detailOverview: this.state.detailLevel === "overview",
      detailDetailed: this.state.detailLevel === "detailed",
      detailExhaustive: this.state.detailLevel === "exhaustive"
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("change input", "input, select, textarea", (event) => {
      const element = event.currentTarget;
      if (!element.name) return;
      this.state[element.name] = element.type === "checkbox" ? element.checked : element.value;
      if (element.name === "sceneId") {
        const scene = game.scenes.get(element.value);
        if (scene) this.state.journalName = `${scene.name} — Scene Summary`;
        this.render(false);
      }
    });

    html.on("click", "[data-action]", async (event) => {
      event.preventDefault();
      this._syncForm();
      const action = event.currentTarget.dataset.action;
      try {
        if (action === "use-viewed-scene") {
          if (!canvas?.scene) throw new Error("No Scene is currently viewed on the canvas.");
          this.state.sceneId = canvas.scene.id;
          this.state.journalName = `${canvas.scene.name} — Scene Summary`;
          this.render(false);
        }
        if (action === "open-existing") {
          const journal = getSceneJournal(this.selectedScene);
          if (!journal) throw new Error("This Scene does not have a generated summary yet.");
          journal.sheet.render(true);
        }
        if (action === "summarize") {
          const scene = this.selectedScene;
          await summarizeScene(scene, this.state);
          this.render(false);
        }
      } catch (error) {
        console.error(`${MODULE_TITLE} | ${action} failed`, error);
        ui.notifications.error(`${MODULE_TITLE}: ${error.message || "The summary goblin dropped the clipboard."}`);
      }
    });
  }

  _syncForm() {
    const root = this.element?.[0];
    if (!root) return;
    for (const element of root.querySelectorAll("input, select, textarea")) {
      if (!element.name) continue;
      this.state[element.name] = element.type === "checkbox" ? element.checked : element.value;
    }
  }
}

Hooks.once("init", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = {
    open() {
      if (!game.user.isGM) {
        ui.notifications.warn(`${MODULE_TITLE} is GM-only.`);
        return null;
      }
      sceneSummaryApp ??= new SceneSummarizedApplication();
      sceneSummaryApp.render(true);
      return sceneSummaryApp;
    },
    summarize(sceneId = canvas?.scene?.id, options = {}) {
      const scene = game.scenes.get(sceneId);
      return summarizeScene(scene, options);
    },
    get app() { return sceneSummaryApp; },
    get logoPath() { return LOGO_PATH; }
  };
});

Hooks.once("ready", async () => {
  await createLauncherMacro();
});
