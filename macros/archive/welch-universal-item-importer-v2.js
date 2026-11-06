// Welch Universal Item Importer v2.0
// Foundry VTT v13 + dnd5e 5.x
//
// Supports:
// - Weapon
// - Equipment / Wondrous Item
// - Armor
// - Consumable
// - Tool
// - Container
// - Loot
// - Spell
//
// Paste a plain-text stat block using labels such as:
//
// Name: Basket of the Returning Picnic
// Type: Container
// Rarity: Uncommon
// Weight: 4
// Value: 300 gp
// Capacity: 30 lb
// Properties: Magical
// Unidentified Description:
// A sturdy picnic basket.
// Identified Description:
// Full magical description here.
//
// Spell example:
// Name: Grave Lantern
// Type: Spell
// Level: 2
// School: Necromancy
// Casting Time: 1 action
// Range: 60 ft
// Duration: 1 minute
// Components: V, S, M
// Materials: A black candle
// Concentration: Yes
// Ritual: No
// Damage: 2d8
// Damage Type: Necrotic
// Save Ability: Constitution
// Save DC: 14
// Identified Description:
// Spell text here.

(async () => {
  try {
    if (game.system.id !== "dnd5e") {
      return ui.notifications.error("This macro requires the dnd5e system.");
    }

    const VERSION = "2.0";
    const esc = foundry.utils.escapeHTML;

    const normalizeHtml = (text = "") => {
      const value = String(text || "").trim();
      if (!value) return "";
      if (/<(?:p|div|ul|ol|table|h[1-6]|br)\b/i.test(value)) return value;
      return value
        .split(/\n{2,}/)
        .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
    };

    const numberFrom = (value, fallback = null) => {
      const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : fallback;
    };

    const boolFrom = (value, fallback = false) => {
      const text = String(value ?? "").trim().toLowerCase();
      if (!text) return fallback;
      return ["yes", "true", "1", "y", "required"].includes(text);
    };

    const slug = (value = "") => String(value)
      .trim()
      .toLowerCase()
      .replace(/['".,()[\]{}]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";

    const parsePrice = (value = "") => {
      const text = String(value || "").trim().toLowerCase();
      const amount = numberFrom(text, 0);
      const denom = (text.match(/\b(pp|gp|ep|sp|cp)\b/) || [])[1] || "gp";
      return { value: amount, denomination: denom };
    };

    const parseDistance = (value = "") => {
      const text = String(value || "").trim().toLowerCase();
      const match = text.match(/(\d+(?:\.\d+)?)\s*(ft|feet|foot|mi|mile|miles|self|touch)?/);
      if (!match) return { value: null, units: "" };
      const rawUnits = match[2] || "ft";
      const units =
        rawUnits === "feet" || rawUnits === "foot" ? "ft" :
        rawUnits === "mile" || rawUnits === "miles" ? "mi" :
        rawUnits;
      return { value: Number(match[1]), units };
    };

    const SCHOOL_MAP = {
      abjuration: "abj", abj: "abj",
      conjuration: "con", con: "con",
      divination: "div", div: "div",
      enchantment: "enc", enc: "enc",
      evocation: "evo", evo: "evo",
      illusion: "ill", ill: "ill",
      necromancy: "nec", nec: "nec",
      transmutation: "trs", transmutation: "trs", trs: "trs"
    };

    const DAMAGE_TYPE_MAP = {
      acid: "acid",
      bludgeoning: "bludgeoning",
      cold: "cold",
      fire: "fire",
      force: "force",
      lightning: "lightning",
      necrotic: "necrotic",
      piercing: "piercing",
      poison: "poison",
      psychic: "psychic",
      radiant: "radiant",
      slashing: "slashing",
      thunder: "thunder"
    };

    const TYPE_ALIASES = {
      weapon: "weapon",
      armor: "equipment",
      armour: "equipment",
      equipment: "equipment",
      wondrous: "equipment",
      "wondrous item": "equipment",
      consumable: "consumable",
      potion: "consumable",
      scroll: "consumable",
      tool: "tool",
      container: "container",
      backpack: "container",
      bag: "container",
      chest: "container",
      loot: "loot",
      treasure: "loot",
      spell: "spell"
    };

    const TYPE_LABELS = {
      weapon: "Weapon",
      equipment: "Equipment / Wondrous / Armor",
      consumable: "Consumable",
      tool: "Tool",
      container: "Container",
      loot: "Loot / Treasure",
      spell: "Spell"
    };

    const inferType = (value = "") => {
      const text = String(value || "").trim().toLowerCase();
      for (const [key, mapped] of Object.entries(TYPE_ALIASES)) {
        if (text === key || text.includes(key)) return mapped;
      }
      return null;
    };

    const parseBlock = (raw) => {
      const lines = String(raw || "").replace(/\r/g, "").split("\n");
      const data = {};
      const blockFields = new Set([
        "description",
        "identified description",
        "unidentified description"
      ]);

      let currentBlock = null;

      for (const original of lines) {
        const line = original.trimEnd();
        const match = line.match(/^([A-Za-z][A-Za-z0-9 ()/'-]*):\s*(.*)$/);

        if (match) {
          const key = match[1].trim().toLowerCase();
          const value = match[2] ?? "";
          currentBlock = blockFields.has(key) ? key : null;
          data[key] = data[key]
            ? `${data[key]}\n${value}`.trim()
            : value.trim();
          continue;
        }

        if (currentBlock !== null) {
          data[currentBlock] = `${data[currentBlock] || ""}\n${line}`.trim();
        } else if (line.trim()) {
          data.description = `${data.description || ""}\n${line}`.trim();
        }
      }

      return data;
    };

    const dialogResult = await new Promise(resolve => {
      new Dialog({
        title: `Welch Universal Item Importer v${VERSION}`,
        content: `
          <style>
            .welch-importer-grid {
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:.65rem 1rem;
            }
            .welch-importer-grid .full { grid-column:1 / -1; }
            .welch-importer-text {
              width:100%;
              min-height:340px;
              resize:vertical;
              font-family:ui-monospace, SFMono-Regular, Consolas, monospace;
            }
          </style>

          <form class="welch-importer-grid">
            <label class="full">
              <strong>Paste Item or Spell Text</strong>
              <textarea class="welch-importer-text" name="block"
                placeholder="Name: ...
Type: Container | Loot | Spell | Weapon | Equipment | Consumable | Tool
Rarity: ...
Weight: ...
Value: ...
Capacity: ...
Quantity: ...

Spell fields:
Level: ...
School: ...
Casting Time: ...
Range: ...
Duration: ...
Components: V, S, M
Materials: ...
Concentration: Yes
Ritual: No
Damage: ...
Damage Type: ...
Save Ability: ...

Unidentified Description:
...

Identified Description:
..."></textarea>
            </label>

            <label>
              <strong>Fallback Item Type</strong>
              <select name="fallbackType">
                ${Object.entries(TYPE_LABELS)
                  .map(([value, label]) => `<option value="${value}" ${value === "equipment" ? "selected" : ""}>${label}</option>`)
                  .join("")}
              </select>
            </label>

            <label>
              <strong>Start Identified?</strong>
              <select name="identified">
                <option value="yes" selected>Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label>
              <strong>Open Sheet?</strong>
              <select name="openSheet">
                <option value="yes" selected>Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </form>
        `,
        buttons: {
          import: {
            label: "Build",
            callback: html => resolve({
              raw: html.find('[name="block"]').val(),
              fallbackType: html.find('[name="fallbackType"]').val(),
              identified: html.find('[name="identified"]').val() === "yes",
              openSheet: html.find('[name="openSheet"]').val() === "yes"
            })
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "import",
        close: () => resolve(null)
      }).render(true);
    });

    if (!dialogResult) return;
    if (!String(dialogResult.raw || "").trim()) {
      return ui.notifications.warn("Paste an item block first.");
    }

    const data = parseBlock(dialogResult.raw);
    const itemType = inferType(data.type) || dialogResult.fallbackType;
    const name = data.name || "New Item";

    // Create the item first using only universally safe fields.
    // Then inspect the live data model and update only fields that actually exist.
    const item = await Item.create({
      name,
      type: itemType,
      img: itemType === "spell"
        ? "icons/svg/book.svg"
        : itemType === "container"
          ? "icons/svg/chest.svg"
          : itemType === "loot"
            ? "icons/svg/coins.svg"
            : "icons/svg/item-bag.svg"
    }, { renderSheet: false });

    if (!item) throw new Error("Foundry did not create the item.");

    const itemObject = item.toObject();
    const hasPath = path => foundry.utils.hasProperty(itemObject, path);
    const patch = {};
    const safeSet = (path, value) => {
      if (value === undefined || value === null) return;
      if (hasPath(path)) patch[path] = value;
    };

    // ---------------- Common fields ----------------
    let identifiedDescription = String(
      data["identified description"] || data.description || ""
    ).trim();

    const unidentifiedDescription = String(
      data["unidentified description"] || ""
    ).trim();

    safeSet("system.description.value", normalizeHtml(identifiedDescription));
    safeSet("system.description.chat", "");
    safeSet("system.identified", dialogResult.identified);

    if (hasPath("system.unidentified.description")) {
      patch["system.unidentified.description"] = normalizeHtml(unidentifiedDescription);
    } else if (hasPath("system.description.unidentified")) {
      patch["system.description.unidentified"] = normalizeHtml(unidentifiedDescription);
    } else if (unidentifiedDescription) {
      patch["flags.dnd5e.unidentifiedDescription"] = normalizeHtml(unidentifiedDescription);
    }

    safeSet("system.identifier", slug(name));

    const rarity = String(data.rarity || "")
      .replace(/\(.*?\)/g, "")
      .trim()
      .toLowerCase();

    if (rarity) safeSet("system.rarity", rarity);

    const attunementText = String(data.attunement || data.rarity || "").toLowerCase();
    const requiresAttunement =
      /requires?\s+attunement/.test(attunementText) ||
      /attunement:\s*(yes|required)/.test(attunementText) ||
      ["yes", "required", "true"].includes(String(data.attunement || "").trim().toLowerCase());

    if (hasPath("system.attunement")) {
      const current = foundry.utils.getProperty(itemObject, "system.attunement");
      patch["system.attunement"] = typeof current === "number"
        ? (requiresAttunement ? 1 : 0)
        : (requiresAttunement ? "required" : "");
    }

    const weight = numberFrom(data.weight);
    safeSet("system.weight.value", weight);
    safeSet("system.weight.units", "lb");
    safeSet("system.weight", weight);

    const quantity = numberFrom(data.quantity, 1);
    safeSet("system.quantity", quantity);

    const price = parsePrice(data.value || data.price);
    if (hasPath("system.price.value")) {
      patch["system.price.value"] = price.value;
      safeSet("system.price.denomination", price.denomination);
    } else if (hasPath("system.price")) {
      patch["system.price"] = `${price.value} ${price.denomination}`;
    }

    const propertiesText = String(data.properties || "").toLowerCase();
    const propertyTokens = propertiesText
      .split(/[;,]/)
      .map(v => v.trim())
      .filter(Boolean);

    if (hasPath("system.properties")) {
      const currentProps = foundry.utils.getProperty(itemObject, "system.properties");
      if (Array.isArray(currentProps)) {
        const props = [];
        if (propertyTokens.some(v => v.includes("magic"))) props.push("mgc");
        if (propertyTokens.some(v => v.includes("silver"))) props.push("sil");
        if (propertyTokens.some(v => v.includes("adamantine"))) props.push("ada");
        if (boolFrom(data.ritual) || propertyTokens.some(v => v === "ritual")) props.push("ritual");
        if (boolFrom(data.concentration) || propertyTokens.some(v => v === "concentration")) props.push("concentration");
        patch["system.properties"] = props;
      }
    }

    // ---------------- Container ----------------
    if (itemType === "container") {
      const capacity = numberFrom(data.capacity, 0);
      const capacityText = String(data.capacity || "").toLowerCase();
      const weightless =
        boolFrom(data.weightless) ||
        /weightless|does not count|doesn't count/.test(capacityText);

      safeSet("system.capacity.type", "weight");
      safeSet("system.capacity.value", capacity);
      safeSet("system.capacity.weightless", weightless);

      // Some dnd5e versions expose container currency.
      if (hasPath("system.currency")) {
        for (const denomination of ["pp", "gp", "ep", "sp", "cp"]) {
          if (hasPath(`system.currency.${denomination}`)) {
            patch[`system.currency.${denomination}`] = 0;
          }
        }
      }
    }

    // ---------------- Loot ----------------
    if (itemType === "loot") {
      // Loot mainly needs quantity, weight, price, rarity and description.
      // Those are handled by common fields above.
      safeSet("system.type.value", String(data.subtype || data["loot type"] || "").toLowerCase());
    }

    // ---------------- Equipment / Armor ----------------
    if (itemType === "equipment") {
      const typeText = String(data.type || "").toLowerCase();
      let equipmentType = String(data.subtype || "").trim().toLowerCase();

      if (!equipmentType) {
        if (typeText.includes("shield")) equipmentType = "shield";
        else if (typeText.includes("light armor")) equipmentType = "light";
        else if (typeText.includes("medium armor")) equipmentType = "medium";
        else if (typeText.includes("heavy armor")) equipmentType = "heavy";
        else equipmentType = "wondrous";
      }

      safeSet("system.type.value", equipmentType);
      safeSet("system.armor.value", numberFrom(data.ac));
      safeSet("system.strength", numberFrom(data.strength));
      safeSet("system.stealth", /disadvantage/i.test(String(data.stealth || "")));
      safeSet("system.equipped", boolFrom(data.equipped, false));
    }

    // ---------------- Consumable ----------------
    if (itemType === "consumable") {
      const typeText = String(data.type || "").toLowerCase();
      const consumableType =
        typeText.includes("potion") ? "potion" :
        typeText.includes("scroll") ? "scroll" :
        typeText.includes("food") ? "food" :
        typeText.includes("ammo") ? "ammo" :
        "trinket";

      safeSet("system.type.value", consumableType);

      const charges = numberFrom(data.charges);
      safeSet("system.uses.max", charges != null ? String(charges) : "");
      safeSet("system.uses.spent", 0);
    }

    // ---------------- Tool ----------------
    if (itemType === "tool") {
      safeSet("system.type.value", String(data.subtype || "art").toLowerCase());
      safeSet("system.ability", String(data.ability || "").toLowerCase().slice(0, 3));
    }

    // ---------------- Weapon ----------------
    if (itemType === "weapon") {
      const actionType = String(data["action type"] || "mwak").trim().toLowerCase();
      const attackAbility =
        String(data.ability || "").trim().toLowerCase().slice(0, 3) ||
        (actionType === "rwak" ? "dex" : "str");

      safeSet("system.type.value", String(data.subtype || "simpleM").trim());
      safeSet("system.equipped", boolFrom(data.equipped, true));
      safeSet("system.proficient", 1);

      const range = parseDistance(data.range || data.reach);
      safeSet("system.range.value", range.value);
      safeSet("system.range.units", range.units || "ft");

      const longRange = (() => {
        const match = String(data.range || "").match(/(\d+)\s*\/\s*(\d+)/);
        return match ? Number(match[2]) : null;
      })();
      safeSet("system.range.long", longRange);

      // Add a basic weapon attack activity when the current model supports activities.
      if (hasPath("system.activities")) {
        const activityId = foundry.utils.randomID();
        const damageFormula = String(data.damage || "").trim();
        const damageType = DAMAGE_TYPE_MAP[String(data["damage type"] || "").trim().toLowerCase()] || "";

        const diceMatch = damageFormula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
        const damageParts = diceMatch ? [{
          number: Number(diceMatch[1]),
          denomination: Number(diceMatch[2]),
          bonus: diceMatch[3] && diceMatch[4]
            ? `${diceMatch[3]}${diceMatch[4]}`
            : "",
          types: damageType ? [damageType] : [],
          custom: { enabled: false },
          scaling: { mode: "", number: 1 }
        }] : [];

        patch[`system.activities.${activityId}`] = {
          _id: activityId,
          type: "attack",
          activation: { type: "action", value: 1, override: false },
          consumption: { scaling: { allowed: false }, spellSlot: true, targets: [] },
          description: {},
          duration: { units: "inst", concentration: false, override: false },
          effects: [],
          range: { units: range.units || "ft", override: false },
          target: {
            prompt: true,
            template: { contiguous: false, units: "ft", type: "", size: "", width: "", height: "", count: "" },
            affects: { count: "1", type: "creature", choice: false, special: "" },
            override: false
          },
          attack: {
            flat: false,
            type: {
              value: actionType.includes("r") ? "ranged" : "melee",
              classification: ""
            },
            ability: attackAbility,
            bonus: String(data["attack bonus"] || ""),
            critical: {}
          },
          damage: {
            parts: damageParts,
            critical: {},
            includeBase: true
          },
          uses: { spent: 0, recovery: [] },
          sort: 0
        };
      }
    }

    // ---------------- Spell ----------------
    if (itemType === "spell") {
      const level = Math.max(0, Math.min(9, numberFrom(data.level, 0)));
      const schoolKey = String(data.school || "evocation").trim().toLowerCase();
      const school = SCHOOL_MAP[schoolKey] || SCHOOL_MAP.evocation;

      safeSet("system.level", level);
      safeSet("system.school", school);
      safeSet("system.ability", String(data.ability || "").trim().toLowerCase().slice(0, 3));

      const componentText = String(data.components || "").toLowerCase();
      const spellProperties = [];
      if (/\bv\b|verbal/.test(componentText)) spellProperties.push("vocal");
      if (/\bs\b|somatic/.test(componentText)) spellProperties.push("somatic");
      if (/\bm\b|material/.test(componentText)) spellProperties.push("material");
      if (boolFrom(data.ritual)) spellProperties.push("ritual");
      if (boolFrom(data.concentration)) spellProperties.push("concentration");

      if (hasPath("system.properties")) patch["system.properties"] = spellProperties;

      safeSet("system.materials.value", String(data.materials || ""));
      safeSet("system.materials.consumed", boolFrom(data["materials consumed"]));
      safeSet("system.materials.cost", numberFrom(data["material cost"], 0));
      safeSet("system.materials.supply", 0);

      const castingTime = String(data["casting time"] || "1 action").toLowerCase();
      const castingValue = numberFrom(castingTime, 1);
      const activationType =
        castingTime.includes("bonus") ? "bonus" :
        castingTime.includes("reaction") ? "reaction" :
        castingTime.includes("minute") ? "minute" :
        castingTime.includes("hour") ? "hour" :
        "action";

      safeSet("system.activation.type", activationType);
      safeSet("system.activation.value", castingValue);
      safeSet("system.activation.condition", String(data["casting condition"] || ""));

      const rangeText = String(data.range || "").trim().toLowerCase();
      const parsedRange = parseDistance(rangeText);
      const spellRangeUnits =
        rangeText.includes("self") ? "self" :
        rangeText.includes("touch") ? "touch" :
        parsedRange.units || "ft";

      safeSet("system.range.value", spellRangeUnits === "self" || spellRangeUnits === "touch" ? "" : parsedRange.value);
      safeSet("system.range.units", spellRangeUnits);

      const durationText = String(data.duration || "Instantaneous").trim().toLowerCase();
      const durationValue = numberFrom(durationText, "");
      const durationUnits =
        durationText.includes("round") ? "round" :
        durationText.includes("minute") ? "minute" :
        durationText.includes("hour") ? "hour" :
        durationText.includes("day") ? "day" :
        durationText.includes("permanent") ? "perm" :
        durationText.includes("instant") ? "inst" :
        "special";

      safeSet("system.duration.value", durationValue || "");
      safeSet("system.duration.units", durationUnits);

      // Basic spell activity: attack, save, damage-only, or utility.
      if (hasPath("system.activities")) {
        const activityId = foundry.utils.randomID();
        const damageFormula = String(data.damage || "").trim();
        const damageType = DAMAGE_TYPE_MAP[String(data["damage type"] || "").trim().toLowerCase()] || "";
        const saveAbility = String(data["save ability"] || "").trim().toLowerCase().slice(0, 3);
        const attackType = String(data["attack type"] || "").trim().toLowerCase();

        const diceMatch = damageFormula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
        const damageParts = diceMatch ? [{
          number: Number(diceMatch[1]),
          denomination: Number(diceMatch[2]),
          bonus: diceMatch[3] && diceMatch[4]
            ? `${diceMatch[3]}${diceMatch[4]}`
            : "",
          types: damageType ? [damageType] : [],
          custom: { enabled: false },
          scaling: { mode: "", number: 1 }
        }] : [];

        const activityType = saveAbility
          ? "save"
          : attackType || data["action type"]
            ? "attack"
            : damageParts.length
              ? "damage"
              : "utility";

        const activity = {
          _id: activityId,
          type: activityType,
          activation: { type: activationType, value: castingValue, override: false },
          consumption: { scaling: { allowed: false }, spellSlot: true, targets: [] },
          description: {},
          duration: {
            units: durationUnits,
            concentration: boolFrom(data.concentration),
            override: false
          },
          effects: [],
          range: { units: spellRangeUnits, override: false },
          target: {
            prompt: true,
            template: {
              contiguous: false,
              units: "ft",
              type: String(data["template type"] || ""),
              size: String(numberFrom(data["template size"], "") || ""),
              width: "",
              height: "",
              count: ""
            },
            affects: {
              count: String(numberFrom(data.targets, 1)),
              type: String(data["target type"] || "creature"),
              choice: false,
              special: String(data.target || "")
            },
            override: false
          },
          uses: { spent: 0, recovery: [] },
          sort: 0
        };

        if (activityType === "save") {
          activity.save = {
            ability: [saveAbility],
            dc: {
              calculation: data["save dc"] ? "" : "spellcasting",
              formula: data["save dc"] ? String(numberFrom(data["save dc"])) : ""
            }
          };
          activity.damage = {
            onSave: String(data["on save"] || "half").toLowerCase(),
            parts: damageParts,
            critical: { allow: false }
          };
          activity.friendlySave = "default";
        } else if (activityType === "attack") {
          activity.attack = {
            flat: false,
            type: {
              value: attackType.includes("melee") ? "melee" : "ranged",
              classification: "spell"
            },
            ability: String(data.ability || ""),
            bonus: String(data["attack bonus"] || ""),
            critical: {}
          };
          activity.damage = {
            parts: damageParts,
            critical: {},
            includeBase: true
          };
        } else if (activityType === "damage") {
          activity.damage = {
            parts: damageParts,
            critical: { allow: false }
          };
        } else {
          activity.roll = { prompt: false, visible: false };
        }

        patch[`system.activities.${activityId}`] = activity;
      }
    }

    await item.update(patch);

    ui.notifications.info(`Created ${TYPE_LABELS[itemType] || itemType}: ${item.name}`);

    if (dialogResult.openSheet) {
      item.sheet.render(true);
    }
  } catch (error) {
    console.error("Welch Universal Item Importer error:", error);
    ui.notifications.error(`Importer error: ${error.message || error}`);
  }
})();