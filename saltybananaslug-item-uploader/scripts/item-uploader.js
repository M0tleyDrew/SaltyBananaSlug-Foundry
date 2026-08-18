const MODULE_ID = "saltybananaslug-item-uploader";
const MODULE_PATH = `modules/${MODULE_ID}`;
const LOG_PREFIX = "SaltyBananaSlug's Item Uploader";

const FU = foundry.utils;
const BaseApplication = globalThis.Application ?? foundry?.appv1?.api?.Application;
const CoreFilePicker = globalThis.FilePicker ?? foundry?.applications?.apps?.FilePicker;

function log(...args) {
  console.log(`${LOG_PREFIX} |`, ...args);
}

function warn(...args) {
  console.warn(`${LOG_PREFIX} |`, ...args);
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asString(value) {
  return value == null ? "" : String(value).trim();
}

function asNumber(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = asString(value).toLowerCase();
  if (["true", "yes", "y", "1", "x", "enabled", "import"].includes(text)) return true;
  if (["false", "no", "n", "0", "disabled", "skip"].includes(text)) return false;
  return fallback;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function slugify(value) {
  if (FU.slugify) return FU.slugify(value, { strict: true });
  return String(value ?? "item")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function xmlChildren(node, localName) {
  return Array.from(node?.children ?? []).filter((child) => child.localName === localName);
}

function xmlFirst(node, localName) {
  return Array.from(node?.children ?? []).find((child) => child.localName === localName) ?? null;
}

function xmlDescendants(node, localName) {
  return Array.from(node?.getElementsByTagNameNS?.("*", localName) ?? []);
}

function relationshipId(node) {
  return node?.getAttributeNS?.("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
    ?? node?.getAttribute?.("r:id")
    ?? "";
}

function relationshipEmbed(node) {
  return node?.getAttributeNS?.("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed")
    ?? node?.getAttribute?.("r:embed")
    ?? "";
}

function parseXml(text, label = "XML") {
  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  const parserError = documentXml.querySelector("parsererror");
  if (parserError) throw new Error(`${label} could not be read.`);
  return documentXml;
}

function resolveZipPath(basePath, target) {
  if (!target) return "";
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const baseParts = basePath.split("/");
  baseParts.pop();
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") baseParts.pop();
    else baseParts.push(segment);
  }
  return baseParts.join("/");
}

function relsPathFor(path) {
  const parts = path.split("/");
  const file = parts.pop();
  return [...parts, "_rels", `${file}.rels`].join("/");
}

function columnIndexFromReference(reference) {
  const letters = String(reference ?? "").match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = (index * 26) + letter.charCodeAt(0) - 64;
  return index - 1;
}

function extensionMime(extension) {
  const ext = extension.toLowerCase();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    bmp: "image/bmp"
  }[ext] ?? "application/octet-stream";
}

class XlsxArchive {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.zip = null;
    this.workbookXml = null;
    this.workbookPath = "xl/workbook.xml";
    this.sheets = new Map();
    this.sharedStrings = [];
  }

  async initialize() {
    if (!globalThis.JSZip) throw new Error("JSZip did not load. Reinstall the module.");
    this.zip = await globalThis.JSZip.loadAsync(this.arrayBuffer);
    await this.#loadWorkbook();
    await this.#loadSharedStrings();
    return this;
  }

  async #readText(path, required = true) {
    const entry = this.zip.file(path);
    if (!entry) {
      if (required) throw new Error(`Workbook component is missing: ${path}`);
      return "";
    }
    return entry.async("string");
  }

  async #relationshipMap(path) {
    const text = await this.#readText(path, false);
    if (!text) return new Map();
    const xml = parseXml(text, path);
    const map = new Map();
    for (const relationship of xmlDescendants(xml, "Relationship")) {
      map.set(relationship.getAttribute("Id"), relationship.getAttribute("Target"));
    }
    return map;
  }

  async #loadWorkbook() {
    const workbookText = await this.#readText(this.workbookPath);
    this.workbookXml = parseXml(workbookText, "workbook.xml");
    const rels = await this.#relationshipMap(relsPathFor(this.workbookPath));
    for (const sheet of xmlDescendants(this.workbookXml, "sheet")) {
      const name = sheet.getAttribute("name");
      const rId = relationshipId(sheet);
      const target = rels.get(rId);
      if (!name || !target) continue;
      this.sheets.set(name, resolveZipPath(this.workbookPath, target));
    }
  }

  async #loadSharedStrings() {
    const path = "xl/sharedStrings.xml";
    const text = await this.#readText(path, false);
    if (!text) return;
    const xml = parseXml(text, path);
    this.sharedStrings = xmlDescendants(xml, "si").map((si) =>
      xmlDescendants(si, "t").map((node) => node.textContent ?? "").join("")
    );
  }

  sheetNames() {
    return Array.from(this.sheets.keys());
  }

  findSheetName(candidates) {
    const normalized = new Map(this.sheetNames().map((name) => [normalizeHeader(name), name]));
    for (const candidate of candidates) {
      const found = normalized.get(normalizeHeader(candidate));
      if (found) return found;
    }
    return null;
  }

  async readSheetMatrix(sheetName) {
    const path = this.sheets.get(sheetName);
    if (!path) throw new Error(`Sheet not found: ${sheetName}`);
    const xml = parseXml(await this.#readText(path), path);
    const matrix = [];
    for (const rowNode of xmlDescendants(xml, "row")) {
      const declaredRow = Number(rowNode.getAttribute("r"));
      const rowIndex = Number.isFinite(declaredRow) && declaredRow > 0 ? declaredRow - 1 : matrix.length;
      const row = matrix[rowIndex] ?? [];
      for (const cell of xmlChildren(rowNode, "c")) {
        const reference = cell.getAttribute("r") ?? "A1";
        const columnIndex = columnIndexFromReference(reference);
        const type = cell.getAttribute("t") ?? "n";
        const valueNode = xmlFirst(cell, "v");
        let value = "";
        if (type === "inlineStr") {
          value = xmlDescendants(cell, "t").map((node) => node.textContent ?? "").join("");
        } else if (type === "s") {
          value = this.sharedStrings[Number(valueNode?.textContent ?? -1)] ?? "";
        } else if (type === "b") {
          value = valueNode?.textContent === "1";
        } else if (type === "str" || type === "e") {
          value = valueNode?.textContent ?? "";
        } else {
          const raw = valueNode?.textContent ?? "";
          value = raw === "" ? "" : (Number.isFinite(Number(raw)) ? Number(raw) : raw);
        }
        row[columnIndex] = value;
      }
      matrix[rowIndex] = row;
    }
    return matrix;
  }

  async readSheetObjects(sheetName) {
    const matrix = await this.readSheetMatrix(sheetName);
    const headerIndex = matrix.findIndex((row) => row?.some((cell) => asString(cell)));
    if (headerIndex < 0) return [];
    const headers = matrix[headerIndex].map((header) => asString(header));
    const rows = [];
    for (let index = headerIndex + 1; index < matrix.length; index += 1) {
      const cells = matrix[index] ?? [];
      if (!cells.some((cell) => asString(cell))) continue;
      const row = { __rowNumber: index + 1 };
      headers.forEach((header, column) => {
        if (header) row[header] = cells[column] ?? "";
      });
      rows.push(row);
    }
    return rows;
  }

  async extractItemImages(sheetName = "Item Images") {
    const actualName = this.findSheetName([sheetName]);
    if (!actualName) return new Map();
    const sheetPath = this.sheets.get(actualName);
    const worksheetXml = parseXml(await this.#readText(sheetPath), sheetPath);
    const worksheetRels = await this.#relationshipMap(relsPathFor(sheetPath));
    const drawingNode = xmlDescendants(worksheetXml, "drawing")[0];
    const drawingTarget = worksheetRels.get(relationshipId(drawingNode));
    if (!drawingTarget) return new Map();

    const drawingPath = resolveZipPath(sheetPath, drawingTarget);
    const drawingXml = parseXml(await this.#readText(drawingPath), drawingPath);
    const drawingRels = await this.#relationshipMap(relsPathFor(drawingPath));
    const matrix = await this.readSheetMatrix(actualName);
    const images = new Map();

    const anchors = [
      ...xmlDescendants(drawingXml, "oneCellAnchor"),
      ...xmlDescendants(drawingXml, "twoCellAnchor")
    ];

    for (const anchor of anchors) {
      const from = xmlDescendants(anchor, "from")[0];
      const rowNode = from ? xmlDescendants(from, "row")[0] : null;
      const colNode = from ? xmlDescendants(from, "col")[0] : null;
      const rowIndex = Number(rowNode?.textContent ?? -1);
      const columnIndex = Number(colNode?.textContent ?? -1);
      if (rowIndex < 1 || columnIndex < 1) continue;

      const itemId = asString(matrix[rowIndex]?.[0]);
      if (!itemId || images.has(itemId)) continue;

      const blip = xmlDescendants(anchor, "blip")[0];
      const target = drawingRels.get(relationshipEmbed(blip));
      if (!target) continue;
      const mediaPath = resolveZipPath(drawingPath, target);
      const mediaFile = this.zip.file(mediaPath);
      if (!mediaFile) continue;

      const extension = mediaPath.split(".").pop()?.toLowerCase() || "png";
      const blob = await mediaFile.async("blob");
      const normalizedBlob = blob.type ? blob : new Blob([blob], { type: extensionMime(extension) });
      images.set(itemId, {
        itemId,
        blob: normalizedBlob,
        extension,
        mimeType: normalizedBlob.type || extensionMime(extension),
        sourcePath: mediaPath,
        objectUrl: URL.createObjectURL(normalizedBlob)
      });
    }
    return images;
  }
}

function getValue(row, ...headers) {
  const keys = new Map(Object.keys(row).map((key) => [normalizeHeader(key), key]));
  for (const header of headers) {
    const actual = keys.get(normalizeHeader(header));
    if (actual != null) return row[actual];
  }
  return "";
}


const BASE_WEAPONS = {
  club: { subtype: "simpleM", damage: "1d4", damageType: "bludgeoning", properties: ["lgt"], range: 5, mastery: "slow", attackMode: "oneHanded" },
  dagger: { subtype: "simpleM", damage: "1d4", damageType: "piercing", properties: ["fin", "lgt", "thr"], range: 20, longRange: 60, mastery: "nick", attackMode: "oneHanded" },
  greatclub: { subtype: "simpleM", damage: "1d8", damageType: "bludgeoning", properties: ["two"], range: 5, mastery: "push", attackMode: "twoHanded" },
  handaxe: { subtype: "simpleM", damage: "1d6", damageType: "slashing", properties: ["lgt", "thr"], range: 20, longRange: 60, mastery: "vex", attackMode: "oneHanded" },
  javelin: { subtype: "simpleM", damage: "1d6", damageType: "piercing", properties: ["thr"], range: 30, longRange: 120, mastery: "slow", attackMode: "oneHanded" },
  "light hammer": { subtype: "simpleM", damage: "1d4", damageType: "bludgeoning", properties: ["lgt", "thr"], range: 20, longRange: 60, mastery: "nick", attackMode: "oneHanded" },
  mace: { subtype: "simpleM", damage: "1d6", damageType: "bludgeoning", properties: [], range: 5, mastery: "sap", attackMode: "oneHanded" },
  quarterstaff: { subtype: "simpleM", damage: "1d6", versatile: "1d8", damageType: "bludgeoning", properties: ["ver"], range: 5, mastery: "topple", attackMode: "oneHanded" },
  sickle: { subtype: "simpleM", damage: "1d4", damageType: "slashing", properties: ["lgt"], range: 5, mastery: "nick", attackMode: "oneHanded" },
  spear: { subtype: "simpleM", damage: "1d6", versatile: "1d8", damageType: "piercing", properties: ["thr", "ver"], range: 20, longRange: 60, mastery: "sap", attackMode: "oneHanded" },
  "light crossbow": { subtype: "simpleR", damage: "1d8", damageType: "piercing", properties: ["amm", "lod", "two"], range: 80, longRange: 320, mastery: "slow", attackMode: "twoHanded" },
  dart: { subtype: "simpleR", damage: "1d4", damageType: "piercing", properties: ["fin", "thr"], range: 20, longRange: 60, mastery: "vex", attackMode: "oneHanded" },
  shortbow: { subtype: "simpleR", damage: "1d6", damageType: "piercing", properties: ["amm", "two"], range: 80, longRange: 320, mastery: "vex", attackMode: "twoHanded" },
  sling: { subtype: "simpleR", damage: "1d4", damageType: "bludgeoning", properties: ["amm"], range: 30, longRange: 120, mastery: "slow", attackMode: "oneHanded" },
  battleaxe: { subtype: "martialM", damage: "1d8", versatile: "1d10", damageType: "slashing", properties: ["ver"], range: 5, mastery: "topple", attackMode: "oneHanded" },
  flail: { subtype: "martialM", damage: "1d8", damageType: "bludgeoning", properties: [], range: 5, mastery: "sap", attackMode: "oneHanded" },
  glaive: { subtype: "martialM", damage: "1d10", damageType: "slashing", properties: ["hvy", "rch", "two"], range: 10, reach: 10, mastery: "graze", attackMode: "twoHanded" },
  greataxe: { subtype: "martialM", damage: "1d12", damageType: "slashing", properties: ["hvy", "two"], range: 5, mastery: "cleave", attackMode: "twoHanded" },
  greatsword: { subtype: "martialM", damage: "2d6", damageType: "slashing", properties: ["hvy", "two"], range: 5, mastery: "graze", attackMode: "twoHanded" },
  halberd: { subtype: "martialM", damage: "1d10", damageType: "slashing", properties: ["hvy", "rch", "two"], range: 10, reach: 10, mastery: "cleave", attackMode: "twoHanded" },
  lance: { subtype: "martialM", damage: "1d10", damageType: "piercing", properties: ["hvy", "rch", "two"], range: 10, reach: 10, mastery: "topple", attackMode: "twoHanded" },
  longsword: { subtype: "martialM", damage: "1d8", versatile: "1d10", damageType: "slashing", properties: ["ver"], range: 5, mastery: "sap", attackMode: "oneHanded" },
  maul: { subtype: "martialM", damage: "2d6", damageType: "bludgeoning", properties: ["hvy", "two"], range: 5, mastery: "topple", attackMode: "twoHanded" },
  morningstar: { subtype: "martialM", damage: "1d8", damageType: "piercing", properties: [], range: 5, mastery: "sap", attackMode: "oneHanded" },
  pike: { subtype: "martialM", damage: "1d10", damageType: "piercing", properties: ["hvy", "rch", "two"], range: 10, reach: 10, mastery: "push", attackMode: "twoHanded" },
  rapier: { subtype: "martialM", damage: "1d8", damageType: "piercing", properties: ["fin"], range: 5, mastery: "vex", attackMode: "oneHanded" },
  scimitar: { subtype: "martialM", damage: "1d6", damageType: "slashing", properties: ["fin", "lgt"], range: 5, mastery: "nick", attackMode: "oneHanded" },
  shortsword: { subtype: "martialM", damage: "1d6", damageType: "piercing", properties: ["fin", "lgt"], range: 5, mastery: "vex", attackMode: "oneHanded" },
  trident: { subtype: "martialM", damage: "1d8", versatile: "1d10", damageType: "piercing", properties: ["thr", "ver"], range: 20, longRange: 60, mastery: "topple", attackMode: "oneHanded" },
  warhammer: { subtype: "martialM", damage: "1d8", versatile: "1d10", damageType: "bludgeoning", properties: ["ver"], range: 5, mastery: "push", attackMode: "oneHanded" },
  warpick: { subtype: "martialM", damage: "1d8", versatile: "1d10", damageType: "piercing", properties: ["ver"], range: 5, mastery: "sap", attackMode: "oneHanded" },
  whip: { subtype: "martialM", damage: "1d4", damageType: "slashing", properties: ["fin", "rch"], range: 10, reach: 10, mastery: "slow", attackMode: "oneHanded" },
  blowgun: { subtype: "martialR", damage: "1", damageType: "piercing", properties: ["amm", "lod"], range: 25, longRange: 100, mastery: "vex", attackMode: "oneHanded" },
  "hand crossbow": { subtype: "martialR", damage: "1d6", damageType: "piercing", properties: ["amm", "lgt", "lod"], range: 30, longRange: 120, mastery: "vex", attackMode: "oneHanded" },
  "heavy crossbow": { subtype: "martialR", damage: "1d10", damageType: "piercing", properties: ["amm", "hvy", "lod", "two"], range: 100, longRange: 400, mastery: "push", attackMode: "twoHanded" },
  longbow: { subtype: "martialR", damage: "1d8", damageType: "piercing", properties: ["amm", "hvy", "two"], range: 150, longRange: 600, mastery: "slow", attackMode: "twoHanded" },
  musket: { subtype: "martialR", damage: "1d12", damageType: "piercing", properties: ["amm", "lod", "two"], range: 40, longRange: 120, mastery: "slow", attackMode: "twoHanded" },
  pistol: { subtype: "martialR", damage: "1d10", damageType: "piercing", properties: ["amm", "lod"], range: 30, longRange: 90, mastery: "vex", attackMode: "oneHanded" }
};

function normalizeRarity(value) {
  const text = normalizeHeader(value).replace(/\s+/g, "");
  return ({ common: "common", uncommon: "uncommon", rare: "rare", veryrare: "veryRare", legendary: "legendary", artifact: "artifact" })[text] ?? asString(value);
}

function normalizeAttunement(value) {
  const text = normalizeHeader(value);
  if (["required", "requires attunement", "yes", "true"].includes(text)) return "required";
  if (["", "none", "no", "false"].includes(text)) return "";
  return asString(value);
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  return asString(value).split(/[;,|\s]+/).map((entry) => entry.trim()).filter(Boolean);
}

function parseJsonObject(value, label) {
  const text = asString(value);
  if (!text) return { value: null, error: "" };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be an object.");
    return { value: parsed, error: "" };
  } catch (error) {
    return { value: null, error: `${label}: ${error.message}` };
  }
}

function parseDiceFormula(value) {
  const text = asString(value).replace(/\s+/g, "");
  if (!text) return null;
  const match = text.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (match) return { number: Number(match[1]), denomination: Number(match[2]), bonus: match[3] ?? "" };
  if (/^[+-]?\d+$/.test(text)) return { number: null, denomination: null, bonus: text };
  return { custom: text };
}

function signedBonus(value) {
  const text = asString(value);
  if (!text) return "";
  if (/^[+-]/.test(text)) return text;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? `+${number}` : text;
}

function htmlFromCell(value) {
  const text = asString(value);
  if (!text) return "";
  return /<\/?[a-z][\s\S]*>/i.test(text) ? text : textBlockToHtml(text);
}

function inferBaseItem(row) {
  if (row.baseItem) return row.baseItem.toLowerCase();
  const haystack = `${row.name} ${row.itemTypeText}`.toLowerCase();
  if (/arcspanner/.test(haystack)) return "warhammer";
  if (/slurryforged arsenal/.test(haystack)) return "longsword";
  for (const key of Object.keys(BASE_WEAPONS).sort((a, b) => b.length - a.length)) {
    if (haystack.includes(key)) return key;
  }
  return "";
}

function inferMagicBonus(row) {
  if (row.magicalBonus !== "" && row.magicalBonus != null) return asNumber(row.magicalBonus, 0);
  const firstTier = row.tiers?.[0] ?? "";
  const match = firstTier.match(/(?:^|[|;\s])(\+\d+)(?:\b|[;|])/);
  return match ? asNumber(match[1], 0) : 0;
}

function inferWeaponAbility(row, base) {
  if (row.weaponAbility) return row.weaponAbility.toLowerCase();
  const byClass = { artificer: "int", bard: "cha", cleric: "str", druid: "wis", fighter: "str", monk: "dex", paladin: "str", ranger: "dex", rogue: "dex", sorcerer: "cha", warlock: "cha", wizard: "int", barbarian: "str" };
  const required = asString(row.requiredClass).toLowerCase();
  if (byClass[required]) return byClass[required];
  if (base?.subtype?.endsWith("R")) return "dex";
  if (base?.properties?.includes("fin")) return "dex";
  return "str";
}

function recoveryArray(value) {
  const text = normalizeHeader(value);
  if (!text || text === "none") return [];
  const period = text === "sr" || text.includes("short") ? "sr"
    : text === "lr" || text.includes("long") ? "lr"
    : text.includes("dawn") ? "dawn"
    : text.includes("dusk") ? "dusk"
    : text.includes("initiative") ? "initiative"
    : text.includes("day") ? "day"
    : text;
  return [{ period, type: "recoverAll" }];
}

function mechanicsFor(row) {
  if (row.foundryType !== "weapon") return { baseItem: "", base: null, magicBonus: inferMagicBonus(row) };
  const baseItem = inferBaseItem(row);
  const base = BASE_WEAPONS[baseItem] ?? null;
  const magicBonus = inferMagicBonus(row);
  const properties = Array.from(new Set([
    ...parseList(row.properties),
    ...(base?.properties ?? []),
    ...(magicBonus || row.rarity ? ["mgc"] : [])
  ]));
  return {
    baseItem,
    base,
    magicBonus,
    subtype: row.subtype || base?.subtype || (/ranged|bow|crossbow|pistol|musket|psychic blade/i.test(`${row.itemTypeText} ${row.name}`) ? "simpleR" : "martialM"),
    ability: inferWeaponAbility(row, base),
    damageDice: row.damageDice || base?.damage || "",
    damageBonus: row.damageBonus !== "" ? row.damageBonus : magicBonus,
    damageType: row.damageType || base?.damageType || "",
    versatileDamage: row.versatileDamage || base?.versatile || "",
    range: row.range || base?.range || 5,
    longRange: row.longRange || base?.longRange || "",
    reach: row.reach || base?.reach || "",
    mastery: row.mastery || base?.mastery || "",
    attackMode: row.attackMode || base?.attackMode || "oneHanded",
    attackBonus: row.attackBonus !== "" ? row.attackBonus : magicBonus,
    properties
  };
}

function mapFoundryImportRow(source, imageMap) {
  const rawResult = parseJsonObject(getValue(source, "Raw JSON", "Foundry JSON"), "Raw JSON");
  const activitiesResult = parseJsonObject(getValue(source, "Activities JSON", "Activity JSON"), "Activities JSON");
  const itemId = asString(getValue(source, "Item ID", "ID"));
  const enabled = asBoolean(getValue(source, "Import?", "Import", "Enabled"), true);
  const name = asString(getValue(source, "Name", "Item Name"));
  const foundryType = asString(getValue(source, "Foundry Type", "Document Type", "Type")).toLowerCase();
  const requiredClass = asString(getValue(source, "Required Class", "Class"));
  const scope = asString(getValue(source, "Item Scope", "Scope")) || (requiredClass ? "Class-Specific" : "General");
  const errors = [];
  const warnings = [];
  if (enabled && !name) errors.push("Name is required");
  if (enabled && !foundryType) errors.push("Foundry Type is required");
  if (rawResult.error) errors.push(rawResult.error);
  if (activitiesResult.error) errors.push(activitiesResult.error);

  const embeddedImage = itemId ? imageMap.get(itemId) : null;
  const row = {
    sourceRow: source.__rowNumber,
    enabled,
    itemId,
    name,
    foundryType,
    subtype: asString(getValue(source, "D&D5e Subtype", "DND5E Subtype", "Subtype")),
    scope,
    rarity: normalizeRarity(getValue(source, "Rarity")),
    attunement: normalizeAttunement(getValue(source, "Attunement")),
    attuned: asBoolean(getValue(source, "Attuned?", "Attuned"), false),
    quantity: asNumber(getValue(source, "Quantity"), 1),
    weight: asNumber(getValue(source, "Weight (lb)", "Weight", "Weight lb"), 0),
    price: asNumber(getValue(source, "Price (gp)", "Price", "Price gp"), 0),
    equipped: asBoolean(getValue(source, "Equipped?", "Equipped"), false),
    identified: asBoolean(getValue(source, "Identified?", "Identified"), true),
    imagePath: asString(getValue(source, "Image Path", "Image", "Img")),
    folder: asString(getValue(source, "Folder", "Folder Path")),
    requiredClass,
    scalingLevels: asString(getValue(source, "Scaling Levels", "Levels")),
    summary: asString(getValue(source, "Summary", "At a Glance")),
    lore: asString(getValue(source, "Lore", "Welch Lore")),
    coreRules: asString(getValue(source, "Core Rules", "Rules")),
    tiers: [1, 2, 3, 4].map((number) => asString(getValue(source, `Tier ${number}`, `State ${number}`))),
    balanceNote: asString(getValue(source, "Balance Note", "GM Balance Note")),
    itemTypeText: asString(getValue(source, "Item Type Text", "Type Text")),
    descriptionHtml: asString(getValue(source, "Description HTML", "HTML Description")),
    identifier: asString(getValue(source, "Identifier", "Slug")),
    unidentifiedDescription: asString(getValue(source, "Unidentified Description", "Unidentified Description HTML", "Mystery Description")),
    chatDescription: asString(getValue(source, "Chat Description", "Chat Description HTML", "Chat Flavor")),
    properties: getValue(source, "Properties", "Weapon Properties"),
    baseItem: asString(getValue(source, "Base Item", "Base Weapon")),
    weaponAbility: asString(getValue(source, "Weapon Ability", "Attack Ability", "Ability")),
    magicalBonus: getValue(source, "Magic Bonus", "Magical Bonus"),
    attackBonus: getValue(source, "Attack Bonus", "To Hit Bonus", "To-Hit Bonus"),
    damageDice: asString(getValue(source, "Damage Dice", "Base Damage", "Damage Formula")),
    damageBonus: getValue(source, "Damage Bonus"),
    damageType: asString(getValue(source, "Damage Type")),
    versatileDamage: asString(getValue(source, "Versatile Damage", "Versatile Dice")),
    range: asNumber(getValue(source, "Range (ft)", "Range"), 0),
    longRange: asNumber(getValue(source, "Long Range (ft)", "Long Range"), 0),
    reach: asNumber(getValue(source, "Reach (ft)", "Reach"), 0),
    mastery: asString(getValue(source, "Weapon Mastery", "Mastery")),
    attackMode: asString(getValue(source, "Attack Mode")),
    proficient: asBoolean(getValue(source, "Proficient?", "Proficient"), foundryType === "weapon"),
    usesMax: asString(getValue(source, "Uses Max", "Max Uses")),
    usesRecovery: asString(getValue(source, "Uses Recovery", "Recovery")),
    activationType: asString(getValue(source, "Activation Type")) || "action",
    activationCost: asNumber(getValue(source, "Activation Cost"), 1),
    armorValue: getValue(source, "Armor Value", "AC"),
    armorDex: getValue(source, "Armor Dex", "Dex Cap"),
    armorMagicalBonus: getValue(source, "Armor Magic Bonus", "Armor Magical Bonus"),
    strengthRequirement: getValue(source, "Strength Requirement", "Strength"),
    stealthDisadvantage: asBoolean(getValue(source, "Stealth Disadvantage?", "Stealth Disadvantage"), false),
    sourceRules: asString(getValue(source, "Source Rules", "Rules Version")) || "2024",
    sourceRevision: asNumber(getValue(source, "Source Revision", "Revision"), 1),
    activitiesJson: activitiesResult.value,
    rawJson: rawResult.value,
    rawJsonText: asString(getValue(source, "Raw JSON", "Foundry JSON")),
    embeddedImage,
    imagePreview: embeddedImage?.objectUrl || "",
    warnings,
    errors
  };

  if (enabled && !row.rarity) warnings.push("Rarity is blank");
  if (enabled && foundryType === "weapon") {
    const mechanics = mechanicsFor(row);
    if (!mechanics.subtype) warnings.push("Weapon subtype is blank");
    if (!mechanics.damageDice || !mechanics.damageType) warnings.push("Weapon damage is incomplete");
  }
  return decoratePreviewRow(row);
}

function mapLegacyRow(source, imageMap) {
  const itemId = asString(getValue(source, "Item ID"));
  const kind = asString(getValue(source, "Kind", "Scaling Item Type"));
  const itemTypeText = asString(getValue(source, "Type", "Item Type Text"));
  const isWeapon = /weapon/i.test(kind) || /^weapon/i.test(itemTypeText);
  const requiredClass = asString(getValue(source, "Class"));
  const row = {
    sourceRow: source.__rowNumber,
    enabled: true,
    itemId,
    name: asString(getValue(source, "Name", "Item Name")),
    foundryType: isWeapon ? "weapon" : "equipment",
    subtype: isWeapon ? "" : "wondrous",
    scope: requiredClass ? "Class-Specific" : "General",
    rarity: "uncommon",
    attunement: /requires attunement/i.test(asString(getValue(source, "Attunement"))) ? "required" : "",
    attuned: false,
    quantity: 1,
    weight: 0,
    price: 0,
    equipped: false,
    identified: true,
    imagePath: "",
    folder: "Welch Scaling Legacy Items",
    requiredClass,
    scalingLevels: asString(getValue(source, "Scaling Levels")),
    summary: asString(getValue(source, "Summary")),
    lore: asString(getValue(source, "Lore")),
    coreRules: asString(getValue(source, "Core Rules")),
    tiers: [1, 2, 3, 4].map((number) => asString(getValue(source, `Tier ${number}`))),
    balanceNote: asString(getValue(source, "Balance Note")),
    itemTypeText,
    descriptionHtml: "",
    identifier: "",
    unidentifiedDescription: "",
    chatDescription: "",
    properties: "",
    baseItem: "",
    weaponAbility: "",
    magicalBonus: "",
    attackBonus: "",
    damageDice: "",
    damageBonus: "",
    damageType: "",
    versatileDamage: "",
    range: 0,
    longRange: 0,
    reach: 0,
    mastery: "",
    attackMode: "",
    proficient: isWeapon,
    usesMax: "",
    usesRecovery: "",
    activationType: "action",
    activationCost: 1,
    armorValue: "",
    armorDex: "",
    armorMagicalBonus: "",
    strengthRequirement: "",
    stealthDisadvantage: false,
    sourceRules: "2024",
    sourceRevision: 1,
    activitiesJson: null,
    rawJson: null,
    rawJsonText: "",
    embeddedImage: itemId ? imageMap.get(itemId) : null,
    imagePreview: itemId && imageMap.get(itemId)?.objectUrl || "",
    warnings: [],
    errors: []
  };
  if (!row.name) row.errors.push("Name is required");
  return decoratePreviewRow(row);
}

function decoratePreviewRow(row) {
  const valid = row.enabled && row.errors.length === 0;
  const mechanics = mechanicsFor(row);
  const mechanicsLabel = row.foundryType === "weapon"
    ? [mechanics.subtype, mechanics.baseItem, mechanics.damageDice && mechanics.damageType ? `${mechanics.damageDice} ${mechanics.damageType}` : "", mechanics.magicBonus ? `+${mechanics.magicBonus}` : ""].filter(Boolean).join(" · ")
    : [row.subtype || "wondrous", row.rarity].filter(Boolean).join(" · ");
  const readyText = row.warnings?.length ? `Ready — ${row.warnings.join("; ")}` : "Ready";
  return {
    ...row,
    valid,
    statusClass: !row.enabled ? "disabled" : (valid ? (row.warnings?.length ? "warning" : "valid") : "invalid"),
    validationText: !row.enabled ? "Disabled" : (row.errors.length ? row.errors.join("; ") : readyText),
    mechanicsLabel,
    scopeLabel: [row.scope, row.requiredClass].filter(Boolean).join(" — ") || "General"
  };
}

function textBlockToHtml(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  let html = "";
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^[•*-]\s*/.test(line)) {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${escapeHtml(line.replace(/^[•*-]\s*/, ""))}</li>`;
    } else {
      closeList();
      html += `<p>${escapeHtml(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function generatedDescription(row) {
  if (row.descriptionHtml) return row.descriptionHtml;
  const metadata = [];
  if (row.itemTypeText) metadata.push(`<strong>Type:</strong> ${escapeHtml(row.itemTypeText)}`);
  if (row.scope) metadata.push(`<strong>Scope:</strong> ${escapeHtml(row.scope)}`);
  if (row.requiredClass) metadata.push(`<strong>Required Class:</strong> ${escapeHtml(row.requiredClass)}`);
  if (row.scalingLevels) metadata.push(`<strong>Scaling Levels:</strong> ${escapeHtml(row.scalingLevels)}`);

  let html = `<div class="sbs-imported-item">`;
  if (metadata.length) html += `<p>${metadata.join("<br>")}</p>`;
  if (row.summary) html += `<h2>At a Glance</h2>${textBlockToHtml(row.summary)}`;
  if (row.lore) html += `<h2>Lore</h2>${textBlockToHtml(row.lore)}`;
  if (row.coreRules) html += `<h2>Core Rules</h2>${textBlockToHtml(row.coreRules)}`;
  const tiers = row.tiers.filter(Boolean);
  if (tiers.length) {
    html += `<h2>Advancement</h2>`;
    for (const tier of tiers) html += `<div class="sbs-item-tier">${textBlockToHtml(tier)}</div>`;
  }
  if (row.balanceNote) html += `<h3>GM Balance Note</h3>${textBlockToHtml(row.balanceNote)}`;
  html += `</div>`;
  return html;
}

function getInitialSystemData(type) {
  const modelClass = CONFIG.Item?.dataModels?.[type];
  try {
    if (modelClass?.schema?.getInitialValue) return FU.deepClone(modelClass.schema.getInitialValue());
    if (modelClass) return FU.deepClone(new modelClass().toObject?.() ?? {});
  } catch (error) {
    warn(`Could not construct the ${type} data model; using explicit dnd5e fields.`, error);
  }
  return FU.deepClone(game.system?.model?.Item?.[type] ?? {});
}

function buildAttackActivity(row, mechanics) {
  const dice = parseDiceFormula(mechanics.damageDice);
  if (!dice) return null;
  const id = FU.randomID?.(16) ?? Math.random().toString(36).slice(2, 18);
  const ranged = mechanics.subtype?.endsWith("R") || mechanics.range > 10;
  const damagePart = dice.custom
    ? { custom: { enabled: true, formula: dice.custom }, types: mechanics.damageType ? [mechanics.damageType] : [], scaling: { mode: "", number: 1 } }
    : { number: dice.number, denomination: dice.denomination, bonus: signedBonus(row.damageBonus !== "" ? row.damageBonus : mechanics.damageBonus), types: mechanics.damageType ? [mechanics.damageType] : [], custom: { enabled: false }, scaling: { mode: "", number: 1 } };
  return {
    [id]: {
      _id: id,
      type: "attack",
      sort: 0,
      activation: { type: row.activationType || "action", value: row.activationCost || 1, override: false },
      consumption: { scaling: { allowed: false }, spellSlot: true, targets: [] },
      description: {},
      duration: { units: "inst", concentration: false, override: false },
      effects: [],
      flags: {},
      range: { units: "ft", override: false },
      target: {
        prompt: true,
        template: { contiguous: false, units: "ft", type: "", size: "", width: "", height: "", count: "" },
        affects: { count: "1", type: "creature", choice: false, special: "" },
        override: false
      },
      attack: {
        flat: false,
        type: { value: ranged ? "ranged" : "melee", classification: "" },
        ability: mechanics.ability,
        bonus: signedBonus(row.attackBonus !== "" ? row.attackBonus : mechanics.attackBonus),
        critical: {}
      },
      damage: { parts: [damagePart], critical: {}, includeBase: true },
      uses: { spent: 0, recovery: [] },
      visibility: { level: {}, requireAttunement: false, requireIdentification: false, requireMagic: false },
      useConditionText: "",
      useConditionReason: "",
      effectConditionText: "",
      macroData: { name: "", command: "" },
      ignoreTraits: { idi: false, idr: false, idv: false, ida: false, idm: false },
      attackMode: mechanics.attackMode,
      ammunition: "",
      otherActivityId: "",
      otherActivityAsParentType: true,
      otherActivityUuid: "",
      attackRollPerTarget: "default",
      fumbleThreshold: 1
    }
  };
}

function buildSystemData(row, rawSystem = {}) {
  const system = FU.mergeObject(getInitialSystemData(row.foundryType), FU.deepClone(rawSystem ?? {}), {
    inplace: false,
    insertKeys: true,
    insertValues: true,
    overwrite: true,
    recursive: true
  });
  const description = generatedDescription(row);
  const fallbackMystery = row.summary || `An unidentified ${row.itemTypeText || row.foundryType}.`;
  const unidentifiedDescription = htmlFromCell(row.unidentifiedDescription) || textBlockToHtml(fallbackMystery);
  const chatDescription = htmlFromCell(row.chatDescription) || unidentifiedDescription;
  const mechanics = mechanicsFor(row);

  FU.setProperty(system, "description.value", description);
  FU.setProperty(system, "description.chat", chatDescription);
  FU.setProperty(system, "unidentified.description", unidentifiedDescription);
  FU.setProperty(system, "identifier", row.identifier || slugify(row.name));
  FU.setProperty(system, "source.revision", row.sourceRevision || 1);
  FU.setProperty(system, "source.rules", row.sourceRules || "2024");
  FU.setProperty(system, "quantity", row.quantity);
  FU.setProperty(system, "weight.value", row.weight);
  FU.setProperty(system, "weight.units", "lb");
  FU.setProperty(system, "price.value", row.price);
  FU.setProperty(system, "price.denomination", "gp");
  FU.setProperty(system, "rarity", normalizeRarity(row.rarity));
  FU.setProperty(system, "attunement", normalizeAttunement(row.attunement));
  FU.setProperty(system, "attuned", Boolean(row.attuned));
  FU.setProperty(system, "equipped", Boolean(row.equipped));
  FU.setProperty(system, "identified", Boolean(row.identified));
  FU.setProperty(system, "uses.spent", 0);
  FU.setProperty(system, "uses.max", row.usesMax ?? "");
  FU.setProperty(system, "uses.recovery", recoveryArray(row.usesRecovery));

  let subtype = row.subtype;
  if (row.foundryType === "weapon") subtype = mechanics.subtype;
  else if (row.foundryType === "equipment" && !subtype) subtype = "wondrous";
  if (subtype) FU.setProperty(system, "type.value", subtype);
  if (row.foundryType === "weapon") FU.setProperty(system, "type.baseItem", mechanics.baseItem);

  const properties = row.foundryType === "weapon"
    ? mechanics.properties
    : Array.from(new Set([...parseList(row.properties), ...(row.rarity ? ["mgc"] : [])]));
  FU.setProperty(system, "properties", properties);
  FU.setProperty(system, "proficient", row.foundryType === "weapon" ? (row.proficient ? 1 : 0) : null);

  if (row.foundryType === "weapon") {
    FU.setProperty(system, "magicalBonus", mechanics.magicBonus);
    FU.setProperty(system, "mastery", mechanics.mastery);
    FU.setProperty(system, "range.units", "ft");
    FU.setProperty(system, "range.value", mechanics.range || 5);
    FU.setProperty(system, "range.long", mechanics.longRange || null);
    FU.setProperty(system, "range.reach", mechanics.reach || null);
    const dice = parseDiceFormula(mechanics.damageDice);
    if (dice && !dice.custom) {
      FU.setProperty(system, "damage.base.number", dice.number);
      FU.setProperty(system, "damage.base.denomination", dice.denomination);
      FU.setProperty(system, "damage.base.bonus", signedBonus(row.damageBonus !== "" ? row.damageBonus : mechanics.damageBonus));
      FU.setProperty(system, "damage.base.types", mechanics.damageType ? [mechanics.damageType] : []);
      FU.setProperty(system, "damage.base.custom.enabled", false);
      FU.setProperty(system, "damage.base.scaling.number", 1);
    }
    const versatile = parseDiceFormula(mechanics.versatileDamage);
    if (versatile && !versatile.custom) {
      FU.setProperty(system, "damage.versatile.number", versatile.number);
      FU.setProperty(system, "damage.versatile.denomination", versatile.denomination);
      FU.setProperty(system, "damage.versatile.bonus", signedBonus(row.damageBonus !== "" ? row.damageBonus : mechanics.damageBonus));
      FU.setProperty(system, "damage.versatile.types", mechanics.damageType ? [mechanics.damageType] : []);
      FU.setProperty(system, "damage.versatile.custom.enabled", false);
      FU.setProperty(system, "damage.versatile.scaling.number", 1);
    }
    if (row.activitiesJson) FU.setProperty(system, "activities", FU.deepClone(row.activitiesJson));
    else if (!Object.keys(system.activities ?? {}).length) {
      const activity = buildAttackActivity(row, mechanics);
      if (activity) FU.setProperty(system, "activities", activity);
    }
  } else if (row.activitiesJson) {
    FU.setProperty(system, "activities", FU.deepClone(row.activitiesJson));
  }

  if (row.foundryType === "equipment") {
    if (row.armorValue !== "" && row.armorValue != null) FU.setProperty(system, "armor.value", asNumber(row.armorValue, null));
    if (row.armorDex !== "" && row.armorDex != null) FU.setProperty(system, "armor.dex", asNumber(row.armorDex, null));
    if (row.armorMagicalBonus !== "" && row.armorMagicalBonus != null) FU.setProperty(system, "armor.magicalBonus", asNumber(row.armorMagicalBonus, null));
    if (row.strengthRequirement !== "" && row.strengthRequirement != null) FU.setProperty(system, "strength", asNumber(row.strengthRequirement, null));
    FU.setProperty(system, "stealth", Boolean(row.stealthDisadvantage));
  }
  return system;
}

function sanitizeRawJson(raw) {
  const data = FU.deepClone(raw ?? {});
  for (const key of ["_id", "id", "uuid", "folder", "sort", "ownership", "permission", "_stats", "pack"] ) delete data[key];
  return data;
}

function buildItemData(row, imagePath, folderId, workbookName) {
  const raw = sanitizeRawJson(row.rawJson);
  const rawSystem = FU.deepClone(raw.system ?? {});
  delete raw.system;
  const base = {
    name: row.name,
    type: row.foundryType,
    img: imagePath || (!row.imagePath.startsWith("embedded:") ? row.imagePath : "") || `${MODULE_PATH}/assets/banana-slug.svg`,
    folder: folderId || null,
    system: buildSystemData(row, rawSystem),
    flags: {
      [MODULE_ID]: {
        itemId: row.itemId,
        scope: row.scope,
        requiredClass: row.requiredClass,
        scalingLevels: row.scalingLevels,
        sourceWorkbook: workbookName,
        sourceRow: row.sourceRow,
        importedAt: new Date().toISOString(),
        schemaVersion: 2
      }
    }
  };

  const data = FU.mergeObject(raw, base, {
    inplace: false,
    insertKeys: true,
    insertValues: true,
    overwrite: true,
    recursive: true
  });
  data.name = row.name;
  data.type = row.foundryType;
  data.img = base.img;
  data.folder = folderId || null;
  data.system = base.system;
  data.flags = FU.mergeObject(raw.flags ?? {}, base.flags, { inplace: false, overwrite: true, insertKeys: true });
  return data;
}

async function ensureDirectory(path) {
  if (!CoreFilePicker?.createDirectory) throw new Error("Foundry's FilePicker API is unavailable.");
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await CoreFilePicker.createDirectory("data", current, { notify: false });
    } catch (error) {
      const text = String(error?.message ?? error).toLowerCase();
      if (!text.includes("exist") && !text.includes("eexist")) warn(`Could not create directory ${current}`, error);
    }
  }
}

async function uploadEmbeddedImage(row, directory) {
  if (!row.embeddedImage) return row.imagePath;
  await ensureDirectory(directory);
  const ext = row.embeddedImage.extension || "png";
  const filename = `${slugify(row.itemId || row.name)}.${ext}`;
  const file = new File([row.embeddedImage.blob], filename, { type: row.embeddedImage.mimeType });
  const result = await CoreFilePicker.upload("data", directory, file, {}, { notify: false });
  return result?.path ?? `${directory}/${filename}`;
}

async function getOrCreateFolder(path, cache) {
  const cleanPath = asString(path).replace(/^\/+|\/+$/g, "");
  if (!cleanPath) return null;
  if (cache.has(cleanPath)) return cache.get(cleanPath);
  let parent = null;
  let accumulated = "";
  for (const part of cleanPath.split("/").map((value) => value.trim()).filter(Boolean)) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    if (cache.has(accumulated)) {
      parent = cache.get(accumulated);
      continue;
    }
    const existing = game.folders.find((folder) =>
      folder.type === "Item"
      && folder.name === part
      && (folder.folder?.id ?? folder.folder ?? null) === (parent?.id ?? null)
    );
    parent = existing ?? await Folder.create({ name: part, type: "Item", folder: parent?.id ?? null });
    cache.set(accumulated, parent);
  }
  return parent;
}

function findMatchingItem(row) {
  if (row.itemId) {
    const byId = game.items.find((item) => item.getFlag(MODULE_ID, "itemId") === row.itemId);
    if (byId) return byId;
  }
  return game.items.find((item) => item.name === row.name && item.type === row.foundryType) ?? null;
}

function downloadModuleFile(relativePath, filename) {
  const anchor = document.createElement("a");
  anchor.href = `${MODULE_PATH}/${relativePath}`;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

class ItemUploaderApp extends BaseApplication {
  constructor(options = {}) {
    super(options);
    this.rows = [];
    this.fileName = "";
    this.sourceSheet = "";
    this.error = "";
    this.parsing = false;
    this.importing = false;
    this.progressValue = 0;
    this.progressMax = 1;
    this.progressLabel = "";
    this.imageMap = new Map();
  }

  static get defaultOptions() {
    return FU.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-app`,
      title: "SaltyBananaSlug's Item Uploader",
      template: `${MODULE_PATH}/templates/item-uploader.html`,
      width: 1120,
      height: 760,
      resizable: true,
      classes: [MODULE_ID]
    });
  }

  getData() {
    const validRows = this.rows.filter((row) => row.valid);
    const conflictMode = game.settings.get(MODULE_ID, "defaultConflictMode");
    return {
      rows: this.rows,
      fileName: this.fileName,
      sourceSheet: this.sourceSheet,
      error: this.error,
      parsing: this.parsing,
      importing: this.importing,
      validCount: validRows.length,
      invalidCount: this.rows.filter((row) => row.enabled && !row.valid).length,
      embeddedImageCount: this.rows.filter((row) => row.embeddedImage).length,
      canImport: validRows.length > 0 && !this.importing,
      oneValid: validRows.length === 1,
      conflictUpdate: conflictMode === "update",
      conflictSkip: conflictMode === "skip",
      conflictDuplicate: conflictMode === "duplicate",
      createFolders: game.settings.get(MODULE_ID, "createFolders"),
      uploadImages: game.settings.get(MODULE_ID, "uploadEmbeddedImages"),
      progressValue: this.progressValue,
      progressMax: this.progressMax,
      progressLabel: this.progressLabel
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('input[name="workbook"]').on("change", async (event) => {
      const file = event.currentTarget.files?.[0];
      if (file) await this.parseWorkbook(file);
    });
    html.find(".sbs-import").on("click", async () => this.importItems(html));
  }

  async close(options = {}) {
    for (const image of this.imageMap.values()) {
      if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
    }
    return super.close(options);
  }

  async parseWorkbook(file) {
    this.parsing = true;
    this.error = "";
    this.rows = [];
    this.fileName = file.name;
    this.sourceSheet = "";
    this.render(false);

    try {
      for (const image of this.imageMap.values()) if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
      const arrayBuffer = await file.arrayBuffer();
      const archive = await new XlsxArchive(arrayBuffer).initialize();
      this.imageMap = await archive.extractItemImages("Item Images");
      const foundrySheet = archive.findSheetName(["Foundry Import"]);
      const legacySheet = archive.findSheetName(["Machine Data - Do Not Edit", "Machine Data"]);
      if (foundrySheet) {
        const sourceRows = await archive.readSheetObjects(foundrySheet);
        this.rows = sourceRows.map((row) => mapFoundryImportRow(row, this.imageMap));
        this.sourceSheet = foundrySheet;
      } else if (legacySheet) {
        const sourceRows = await archive.readSheetObjects(legacySheet);
        this.rows = sourceRows.map((row) => mapLegacyRow(row, this.imageMap));
        this.sourceSheet = legacySheet;
      } else {
        throw new Error("No Foundry Import or Machine Data sheet was found.");
      }
      if (!this.rows.length) throw new Error(`The ${this.sourceSheet} sheet contains no item rows.`);
      ui.notifications.info(`Read ${this.rows.length} workbook row${this.rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(error);
      this.error = error.message ?? String(error);
      this.rows = [];
    } finally {
      this.parsing = false;
      this.render(false);
    }
  }

  async importItems(html) {
    if (!game.user.isGM) return ui.notifications.error("Only a GM can import world Items.");
    const validRows = this.rows.filter((row) => row.valid);
    if (!validRows.length) return ui.notifications.warn("No valid rows are ready to import.");

    const form = html[0]?.querySelector("form") ?? html[0];
    const formData = new FormData(form);
    const conflictMode = formData.get("conflictMode") || "update";
    const createFolders = formData.get("createFolders") === "on";
    const uploadImages = formData.get("uploadImages") === "on";
    await game.settings.set(MODULE_ID, "defaultConflictMode", conflictMode);
    await game.settings.set(MODULE_ID, "createFolders", createFolders);
    await game.settings.set(MODULE_ID, "uploadEmbeddedImages", uploadImages);

    this.importing = true;
    this.progressValue = 0;
    this.progressMax = validRows.length;
    this.progressLabel = "Starting import…";
    this.render(false);

    const results = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const folderCache = new Map();
    const imageDirectory = game.settings.get(MODULE_ID, "imageDirectory")
      .replace("{world}", game.world.id)
      .replace(/^\/+|\/+$/g, "");

    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index];
      this.progressValue = index;
      this.progressLabel = `Importing ${row.name}…`;
      this.render(false);
      try {
        const existing = findMatchingItem(row);
        if (existing && conflictMode === "skip") {
          results.skipped += 1;
          continue;
        }

        const folder = createFolders ? await getOrCreateFolder(row.folder, folderCache) : null;
        const imagePath = uploadImages && row.embeddedImage
          ? await uploadEmbeddedImage(row, imageDirectory)
          : row.imagePath;
        const data = buildItemData(row, imagePath, folder?.id ?? null, this.fileName);

        if (existing && conflictMode === "update") {
          await existing.update(data);
          results.updated += 1;
        } else {
          await Item.create(data, { renderSheet: false });
          results.created += 1;
        }
      } catch (error) {
        results.failed += 1;
        console.error(`${LOG_PREFIX} | Failed to import ${row.name}`, error);
        ui.notifications.error(`${row.name}: ${error.message ?? error}`);
      }
    }

    this.progressValue = validRows.length;
    this.progressLabel = "Import complete.";
    this.importing = false;
    this.render(false);
    ui.notifications.info(
      `Item upload complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed.`,
      { permanent: results.failed > 0 }
    );
  }
}

function openUploader() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can use the Item Uploader.");
  new ItemUploaderApp().render(true);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultConflictMode", {
    name: "Default matching-item behavior",
    hint: "Choose what the uploader does when Item ID or exact name matches a world Item.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      update: "Update matching items",
      skip: "Skip matching items",
      duplicate: "Create duplicates"
    },
    default: "update"
  });

  game.settings.register(MODULE_ID, "createFolders", {
    name: "Create workbook folders",
    hint: "Create Item folders from slash-separated paths in the Folder column.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "uploadEmbeddedImages", {
    name: "Upload embedded workbook images",
    hint: "Extract pictures from the Item Images sheet and upload them into Foundry's data directory.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "imageDirectory", {
    name: "Embedded image upload directory",
    hint: "A path inside Foundry's data directory. Use {world} as a placeholder for the current world ID.",
    scope: "world",
    config: true,
    type: String,
    default: "worlds/{world}/saltybananaslug-item-uploader/items"
  });

  game.settings.register(MODULE_ID, "showItemDirectoryButton", {
    name: "Show Item sidebar button",
    hint: "Adds an Item Uploader button to the top of the Item sidebar for GMs.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.saltyBananaSlugItemUploader = {
    open: openUploader,
    parseWorkbook: async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const archive = await new XlsxArchive(arrayBuffer).initialize();
      const images = await archive.extractItemImages("Item Images");
      const sheet = archive.findSheetName(["Foundry Import"]);
      if (!sheet) throw new Error("No Foundry Import sheet was found.");
      return (await archive.readSheetObjects(sheet)).map((row) => mapFoundryImportRow(row, images));
    },
    version: "1.1.1"
  };
});

Hooks.once("ready", () => {
  log("Ready. API: game.saltyBananaSlugItemUploader.open()");
});

Hooks.on("renderItemDirectory", (app, html) => {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "showItemDirectoryButton")) return;
  const root = globalThis.jQuery && html instanceof globalThis.jQuery ? html[0] : html;
  if (!root || root.querySelector(`.${MODULE_ID}-open`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-open`;
  button.innerHTML = `<i class="fas fa-file-arrow-up"></i> Item Uploader`;
  button.addEventListener("click", openUploader);
  const header = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root;
  header.append(button);
});
