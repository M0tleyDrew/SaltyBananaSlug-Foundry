# SaltyBananaSlug's Breakable Items

Version 0.4.1 · Foundry VTT 13 · D&D5e 5.2.x (target: 5.2.4).

Give all physical items HP and gradual wear from use, whether equipped or not. Type, rarity, material, quality, and use intensity affect durability. Repair with inventory supplies or a paid service, review a whole inventory through Fix All, and permanently destroy an item on its third lifetime break. No additional modules are required. A connected GM handles updates and repair transactions.

## Install and launch

1. In Foundry Setup, open **Add-on Modules → Install Module**, paste the [Breakable Items manifest](https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/saltybananaslug-breakable-items.json) into **Manifest URL**, and click **Install**. You can also find Breakable Items in the SBS Environment catalog.
2. Restart Foundry and enable **SaltyBananaSlug's Breakable Items** in **Manage Modules**.
3. The connected GM automatically gets a shared **SBS — Equipment Tracker** script macro in the Macros directory. Players can use the same macro. Drag it to the hotbar if desired.
4. Open **Configure Settings → Module Settings → Breakable Items setup** to set campaign rules and create supply templates. The Equipment Tracker is also available in Module Settings and registers with the SBS CSI hub when present.

The module adds no permanent canvas buttons and does not open the tracker when a sheet opens. A short welcome guide appears on first joining, followed by update notes once per new version; the GM can disable these for everyone. If script macro execution is disabled for a player's role, they can use the Equipment Tracker entry in Module Settings or the SBS hub; the GM can also enable that role's script-macro permission.

For manual ZIP installation, extract the module so its manifest is at `Data/modules/saltybananaslug-breakable-items/module.json`.

## Automatic tracking

Durability belongs to each Item document. Its saved HP, use counters, wear progress and lifetime breaks remain with it. Unconfigured physical items are active at full HP by default; no tracker launch, sheet opening, actor enrollment or initialization action is required. Native wear listeners run in the background from game load. Item sheets read and display that state directly, including recorded uses and wear progress. The tracker is an optional view/repair window for the selected token or assigned player character. Closing it stops no tracking. A connected GM is still required to process durability updates.

## First session setup

* Weapons, body armor, shields, tools, containers, clothing, rope, books, wands/foci, ammunition, consumables, and other physical inventory items are tracked automatically. An item need not be worn or equipped to wear from use. Spells, feats, classes, and marked repair-supply stacks are excluded. Campaign switches and individual opt-outs can disable automatic tracking.
* An inventory stack shares one HP/break record. Split it into separate entries to track individual objects. Repair prices and materials account for the stack quantity. One-use consumables still disappear normally; durability does not make a consumed potion reusable. Empty entries cannot be repaired until recovered/restocked.
* Equipped body armor takes incoming wear, independent of damage amount. By default each damage update contributes base 1 HP of wear, modified by durability factors. The GM can instead use targeted native attack hits. These two modes never run together. Shields have ordinary use wear.
* **Existing equipment needs no HP backfill.** An item without a module durability record begins at its full profile HP with zero breaks and zero accumulated wear. Past attacks are not reconstructed. Existing saved HP, wear, and break history are preserved, including saved 0 HP; updates never reset those items to full.
* Tracking works on every creature’s physical items by default, including NPCs and unlinked tokens, without enabling or loading them into the tracker. Open **Equipment durability** on their sheet, open an item’s own durability panel, or select their token and run the tracker. Players can manage only actors they own. The tracker shows the selected token or your assigned player character; it has no world-actor roster. While open it follows token selection. Opening a creature’s sheet button explicitly views that creature. Existing individual tracking opt-outs remain respected.
* Click **Create repair supply items** in setup. This creates world Item templates once; it does not give players free supplies. Drag the appropriate supplies onto a character and set quantities.
* Give the character ordinary D&D tool items and their actual tool proficiencies. Magic repairs additionally require Arcana by default.
* Placed repairers on the player’s current map accept paid repairs directly, without an approval click. No placed NPC is required for the fallback: **Find a repairer — request GM approval** still sends a priced request. Optional services can be created with **Add / place repairer** in the tracker.

## HP and wear factors

`starting max HP = round(profile base HP × rarity HP × material HP × quality HP)`, with a minimum of 1 HP.

`wear contribution = damage or uses × rarity wear × material wear × quality wear × item wear override × use intensity`.

Use intensity affects recorded uses. Native automatic uses have normal intensity. Fractional progress carries forward, so slow wear is not rounded away on every use. A smaller wear multiplier means slower wear. The same durability factors adjust the separate armor-hit wear rate.

| Rarity | HP multiplier | Wear multiplier |
|---|---:|---:|
| Mundane | 1 | 1 |
| Common magic | 1.25 | 0.9 |
| Uncommon | 1.5 | 0.8 |
| Rare | 2 | 0.65 |
| Very rare | 3 | 0.5 |
| Legendary | 4 | 0.35 |
| Artifact | 5 | 0.25 |

Materials include metal, mechanisms, wood, leather, cloth, paper, glass, gem, stone, and adamantine. Qualities range from Fragile and Poor through Standard, Fine, and Masterwork. For example, a mundane standard metal weapon starts with 20 HP; the same rare weapon starts with 40 HP and accumulates wear at ×0.65. A mundane rope uses the rope/cloth profile and starts with 11 HP.

The GM can edit all profile HP, damage/use thresholds, material/rarity/quality multipliers, intensity weights, armor-hit wear, and repair rules in Setup, plus individual overrides in Configure item. Default intensity weights are Gentle ×0.5, Normal ×1, Strenuous ×2, and Abuse ×5. GM direct damage remains available for specific incidents.

**Saved maximum/current HP do not change just because campaign multipliers change.** Use **Recalculate HP** for one item or a character to adopt the calculated maximum while preserving damage percentage (subject to whole-HP rounding), broken status, destruction, and lifetime breaks. This is separate from repairing. Opening or merely carrying an item does not record use.

## Durability and lifetime breaks

* Each item stores maximum/current HP, damage percentage, recorded uses, qualifying damage, wear remainder, break count, and recent history in its own flags.
* Dropping from positive HP to **0** is one break. Applying more damage to an already broken item does not count another break.
* The first and second breaks can be repaired. The **third break immediately destroys the item**, making it permanently unrepairable through normal repair actions.
* Partial and full repairs preserve lifetime breaks and wear remainder. Changing owners through normal Foundry item transfers preserves the flags. Other modules that strip flags or merge inventory stacks may need their own compatibility changes.
* Destroyed items remain in inventory until removed. The GM can separately mark an item destroyed by a specific event.
* Broken/destroyed items cannot use native D&D5e activities, direct native attack/damage/formula rolls, or be equipped. This restriction is always enforced, including if an older saved setting disabled it. Items are unequipped when broken; repairs do not automatically re-equip them. A final roll-configuration check catches items that break while a roll dialog is open.
* The GM can correct HP, maximum HP, and lifetime breaks. Reversing destruction requires the explicit **GM correction: clear destroyed state** option and a break count below three. Ordinary repairs cannot do this.

The character inventory gets a compact durability badge. Item sheets show a durability panel and a tracker link. The tracker shows a prominent warning after two breaks.

## Reduced weapon damage at half HP

A usable tracked weapon with **50% damage or more** (current HP at or below half its maximum) reduces each die in its native base damage formula by one step. The penalty is one step throughout that range, and at 0 HP the weapon cannot be used at all.

| Normal die | Damaged die |
|---|---|
| d12 | d10 |
| d10 | d8 |
| d8 | d6 |
| d6 | d4 |
| d4 | d2 |
| d2 | d1 (one damage per die) |

For example, `2d6 + 4` becomes `2d4 + 4`. Dice counts and flat bonuses remain unchanged. Versatile damage uses the mode selected for the attack. Critical hits use the smaller base dice with native critical multipliers/bonus dice, and still cause no weapon wear by default. Unusual d20/d100 damage uses the same descending ladder (d20 → d12 and d100 → d20); other numeric die sizes step down to the next smaller size on that ladder.

Only the primary part of a native weapon roll tagged `base: true` is changed. Separately added damage parts (such as fire damage), ammunition additions, spells, and feature rolls are preserved. Dice written directly inside the primary base formula count as base damage. Custom damage activities or external macros that do not identify a base weapon roll are not guessed.

The reduced formula is used in the native damage-roll workflow and appears in the tracker/item panel, with an inventory warning. The Item's original stored damage formula is unchanged. Native roll-dialog rebuilds and critical selection do not repeatedly step down the die. HP is rechecked before evaluation if it changes while the prompt is open. Repairing the item to **above** half HP restores its original dice automatically. There is no attack-roll penalty or armor AC penalty from this rule.

Unbreakable prevents new damage and wear; it does not repair existing damage. A weapon already at half HP retains reduced damage dice until repaired above that threshold. Broken/destroyed weapons remain unusable even while protected. The GM can toggle **Reduce weapon damage dice at 50% damage or worse** in setup; the 0-HP/destroyed use restriction remains enforced.

## Automatic weapon wear

The base weapon rule is **1 durability HP per 20 qualifying rolled damage**, modified by its rarity, material, quality, and item override. Example for a standard mundane metal weapon: 13 damage followed by 12 damage costs 1 HP and leaves 5/20 progress. Critical hits add no wear, contribute no qualifying damage, and do not change that remainder; the use is still recorded.

Wear listens to the native D&D5e 5.2 `dnd5e.rollDamage` event on the rolling client. It sums that weapon activity's damage rolls once, before target resistance, and does not multiply wear by the number of targets or repeated applications of the same damage card. A separately repeated/rerolled damage roll is a new roll and can add wear. Separately rolled spells and feature riders do not count; bonuses already included inside the weapon activity's own damage roll cannot always be separated and are included. Native damage rolls are not proof that HP was removed from a target: roll weapon damage when the hit should count, or have the GM correct wear if necessary.

Critical detection uses the native DamageRoll's critical flag. There is no additional Midi-QOL workflow-completion integration in 0.4.0. Armor can follow native actor HP/temporary-HP damage updates regardless of which module applied them. Workflows that bypass native D&D5e hooks may need Record Use, manual GM damage/armor hits, or the public API until specifically integrated.

## Use of ordinary items

Most physical item profiles use **1 HP per N uses**, with slower base rates than weapons and armor. Completed native item activities, native tool checks, ammunition used in attacks, secondary item resources consumed by activities, and charge spending can record uses. Native charge consumption and the corresponding completed activity are counted once. Repairing equipment also records use on the character's repair tool; it is retained rather than consumed.

Foundry cannot infer actions described in conversation, such as climbing a rope, reading a book, opening a pack, or using an object through a macro that bypasses native hooks. The owning player or GM can select any usable tracked item and click **Record Use**, or **Multiple / strenuous uses** to enter a count, intensity, and reason. Do this for use that has not already been counted automatically. Native tool checks and other completed tool activities count use; external workflows that bypass these hooks need Record Use.

Weapons configured for use mode count native attack rolls. Ordinary Record Use also works for narrative use of a damage-mode weapon. Manual mode is an explicit GM opt-out from automatic/use wear; direct GM damage remains available. Body armor's incoming-hit rule is separate from its general activity-use setting.

The GM can apply a flat amount or dice formula for natural 1s, wall attacks, acid, misuse, and other incidents. Optional natural-1 messages offer the GM a damage button and apply no damage by themselves.

## Armor wear from incoming damage or hits

Only actual **equipped** light/medium/heavy armor items receive incoming armor wear. Tracking and event processing work on player characters, NPCs, and unlinked tokens with the tracker closed. An NPC’s natural AC, a flat AC number, or an unarmored-defense feature is not a separate physical armor item; add/equip an armor item if it should have durability. Shields remain separate ordinary-use equipment. Breaking armor unequips it.

**Damage received is the default trigger in 0.2.1.** Each native D&D5e actor damage update contributes one base wear event, whether HP or temporary HP is lost, including damage entered directly on the sheet. A 3-damage update and a 30-damage update have the same wear contribution. Failed-save or environmental damage also counts in this mode. Healing, zero net damage, and prevented damage with no HP/temporary-HP loss do not count. If one attack is applied in several separate HP updates, each update is an event; apply its damage together when it should count once.

The first active GM handles the native `dnd5e.damageActor` event; the actor’s HP loss is not copied onto the armor. Multiple connected GMs do not each apply wear. The GM must remain connected.

**Targeted attack hits is the alternative Setup mode.** This retains the attack-card behavior: target the wearer before rolling a native attack; the module compares the card’s recorded target AC to the attack roll. A miss does not wear armor. A critical hit contributes ordinary armor wear; the critical exemption applies to the attacking weapon. A hit can wear armor despite immunity or prevented HP loss. This mode ignores ordinary actor-damage updates, avoiding a second wear event when damage is applied. Untargeted attacks, unknown AC, total cover, and non-attack damage are not guessed. Native actor targets and token-document targets are resolved, including unlinked tokens. Repeated delivery of the same attack message is deduplicated. Late reactions that change a hit result require a GM correction.

`wear per event = armor base HP lost per event × rarity wear × material wear × quality wear × item wear override`.

The base rate defaults to 1 and accepts fractions in Setup or per item. Fractional progress accumulates between events; for example rare standard metal armor at ×0.65 loses no whole HP on its first event, then loses 1 HP on the second and keeps 0.30 progress. The tracker and item panel show the event count, fractional progress, trigger mode, and whether the item is equipped. Unbreakable prevents wear without a backlog.

The GM can always use **Record a confirmed armor hit** in the tracker or `api.armorHit(actor)` for a manual event. This uses the same configured rate and durability factors.

## Unbreakable protection

Unbreakable is a separate property, independent of the item's HP condition. It prevents new weapon wear, armor wear, direct module damage, and destruction. Existing HP, wear progress, and lifetime breaks remain unchanged. A previously broken or destroyed item remains broken/destroyed; protection is not a repair. There is no deferred damage or wear backlog when protection ends.

* **Permanent:** select **Unbreakable** in the native item's Properties list, alongside properties such as Finesse and Light. It is registered for weapons, armor, tools, and other supported physical items. The GM can also use **Unbreakable protection** in the tracker or the item sheet's **Unbreakable** button. For types without native properties, a module flag provides the same behavior.
* **Temporary:** in that protection window choose minutes, hours, rounds (six seconds each), or until the GM removes it. Timed protection follows Foundry world time and expires automatically when that time is reached. Opening the sheet is not required for expiry to affect damage calculations.
* **Removing protection:** uncheck permanent protection and remove temporary protection if both are present. These are independent sources; removing one does not erase the other.

The tracker, item panel, and character inventory display Unbreakable status. The tracker has an Unbreakable filter. Players can view the status; GM controls grant/remove it. Native item enchantments that add the registered `sbsUnbreakable` property are also recognized while that property is active.

## Items that also work as tools

On any physical item’s sheet or in the tracker, click **Tool roles / All-Purpose Tool** to open the dedicated, expanded editor. This works on actual tool items as well as weapons, equipment, and other physical items. The same options remain in **Configure durability → This item also works as tools**. The GM can select one or more specific roles: for example, a weapon that also serves as Smith's Tools and Tinker's Tools. The item keeps its original type, damage, properties and durability. Supported roles include the native artisan tools, kits, thieves'/navigator's tools, instruments and gaming sets.

* **Works as all artisan’s tools** covers the 17 artisan categories. It does not cover kits, thieves’/navigator’s tools, instruments or games; select those roles explicitly when intended.
* **Grants proficiency** is separate and off by default. Supplying a physical tool does not automatically teach the character how to use it. Native character proficiency/expertise remains available.
* **Tool roles require attunement** is optional. A gated additional role is unavailable until the item is attuned.
* Empty stacks and broken/destroyed tracked items cannot supply tools. A custom item used for a repair records use and wear, just like an ordinary tool.

Imported **All-Purpose Tool** items are recognized by name/identifier when attuned. They supply artisan roles and proficiency, with native repair checks using a temporary actor copy where a granted proficiency is missing. The real character's saved proficiencies are unchanged, and native tool-expertise calculation remains in use. Explicit item-role configuration overrides the automatic detection. Being an artificer alone does not supply a missing physical tool or grant every tool role. See the [official All-Purpose Tool overview](https://www.dndbeyond.com/posts/1354-artificer-201-the-best-magic-items-for-artificers).

These roles are used by this module's repair requirements and tool-use accounting. They do not create tool items in inventory or rewrite other modules' unrelated roll interfaces.

## Mending

A completed native **Mending** spell or named Mending item activity opens **Mending — choose an item** on the casting client. This works when casting from a sheet, chat-card activity, or a macro using the native activity workflow. Click **Choose token on map**, click the visible token, then choose an item from its live inventory. Eligible damaged items appear first. Escape returns from map selection. A list and inventory-item drop are also available. Players see inventories they can own or observe; the caster must be controlled/owned. The GM can choose any creature's equipment. Merely selecting a token does not cast or repair anything.

**Cast Mending** is also available on damaged-item panels and in the tracker. It chooses an owned caster/source, runs the normal native activity, and then opens the same target prompt. A cancelled native cast does not repair HP. Casting from a physical custom item still records that item's ordinary use wear.

The default is **1 item HP per completed one-minute cast**, a configurable house-rule mapping from the spell's physical repair to this module's aggregate durability. Confirm that the break/tear is within the spell's size limit, all pieces are available, and casting time is available. Mending is not blanket reconstruction of missing or destroyed objects. See [the official spell](https://www.dndbeyond.com/spells/2619033-mending).

* One cast repairs one object once. Split a single item out of a shared-condition stack first.
* The first/second broken state may be physically repaired by Mending without a tool check by default. The GM can disallow broken-item Mending, disable spell repairs, change HP per cast, or exclude an individual item.
* Lifetime breaks and fractional wear progress remain. Destroyed items cannot be restored.
* No repair tools, ordinary repair parts or Arcana proficiency are required. The native casting workflow handles its spell resources; a recorded casting minute does not advance the world clock.
* Charges, disabled magic and lost-magic flags are unchanged. The spell can repair physical damage to a magic item; it does not restore lost magic.
* Both owner and caster must be out of combat. A completed native cast card is checked before HP is restored; repeated delivery of the same cast cannot mend a second item.

Custom macros/modules that never complete a native activity hook cannot be detected automatically. `api.mending(item)` runs the module's source chooser and native cast workflow instead.

## Self repairs

* Repairs are blocked while the owning character participates in any started combat, including through the repair API. Combat starting during a broken-item repair check also blocks the final repair and spending.
* Choose the **Character doing the work** in the repair dialog or Fix All. Their usable tools, tool proficiency and Arcana are checked; materials come from the item owner. Players can choose helpers they own; the GM can choose any character. Both owner and helper must be out of combat. The selected tool must have positive quantity and cannot be broken/destroyed.
* Repair parts are consumed from inventory; tools are retained and record use. Supply stacks at zero remain in inventory for easy restocking.
* Routine damaged-item repair is automatic when requirements are met. There is **no check above 0 HP**.
* Broken-item repair requires the native tool check against the rarity/item DC. A successful broken-item repair restores full HP. This avoids paying a tiny repair to bypass the broken-item requirements on the rest of the restoration.
* By default a failed self-repair consumes the quoted parts and downtime, leaves the item broken, and does not add a break. The GM can turn off supply consumption on failure.
* Partial repairs are available above 0 HP and scale supply quantities and downtime to HP restored, rounded up to whole parts/minutes.
* Repair time is displayed for review and recorded in item history and chat. Completing a repair represents that much available downtime; the module does **not** advance the world clock or run a real-time repair countdown.

Default physical parts are one unit per five restored HP. Magic items also need a matching rarity's repair reagents, at four units per full restoration, rounded up for partial repairs. Individual item recipes can override requirements or add extra named/keyed parts. Create custom supply items by configuring a physical item and setting its material key and optional unit credit value. A material key takes precedence; exact recipe labels/names are also accepted.

All default HP, prices, supplies, proficiencies, DCs, and times are adjustable campaign rules, not official D&D repair rules. Rarity/tools/Arcana structure is inspired by [2024 magic-item crafting](https://www.dndbeyond.com/sources/dnd/br-2024/magic-items#CraftingMagicItems).

## Fix All

The tracker has **Fix All — review costs** for players and the GM. It lists damaged items with checkboxes and shows HP to restore, supplies or itemized service prices, broken-item checks, total downtime, and the combined cost before proceeding. Destroyed items are shown as unrepairable and cannot be selected.

* **Self repair:** the chosen repairing character needs the required tools and proficiencies, and the item owner needs enough shared supplies for the whole selection. There is no coin charge; required inventory supplies are spent. Routine repairs need no check. Each broken item gets its own native check; a failed attempt follows the campaign's failed-repair supplies rule.
* **Paid service:** select an on-map repairer for direct payment, or a saved/unplaced service / **Find a repairer** for GM approval. Tools/proficiencies are supplied by the service. Optionally supply available parts for a discount. Both routes show itemized prices first, and only successful professional repairs are charged.

Shared supplies are allocated once across the batch. If items, tools, costs, or supplies change, an old confirmation is rejected for review. Both methods remain unavailable in combat. Successful items return to full HP; lifetime breaks are preserved. Check failures do not add a new break.

## Default profiles

| Profile | Base HP | Base wear | Repair tool | Parts |
|---|---:|---|---|---|
| Standard weapon | 20 | 1 HP / 20 damage | Smith's tools | Metal |
| Bow / wooden weapon | 18 | 1 HP / 20 damage | Woodcarver's tools | Wood |
| Metal armor | 40 | 1 HP / incoming event; 1 HP / 10 activity uses | Smith's tools | Metal |
| Leather armor | 30 | 1 HP / incoming event; 1 HP / 10 activity uses | Leatherworker's tools | Leather |
| Clothing / cloth armor | 15 | 1 HP / 50 uses | Weaver's tools | Cloth |
| Shield | 30 | 1 HP / 20 uses | Smith's tools | Metal |
| Tools / mechanism | 20 | 1 HP / 40 uses | Tinker's tools | Mechanical |
| Other gear | 10 | 1 HP / 60 uses | Tinker's tools | Mechanical |
| Container / pack | 25 | 1 HP / 60 uses | Leatherworker's tools | Leather |
| Rope / cord | 15 | 1 HP / 40 uses | Weaver's tools | Cloth |
| Book / paper object | 12 | 1 HP / 80 uses | Calligrapher's supplies | Paper |
| Wand / focus | 18 | 1 HP / 30 uses | Woodcarver's tools | Wood |
| Jewelry / valuables | 12 | 1 HP / 60 uses | Jeweler's tools | Gem |
| Consumable / charged item | 8 | 1 HP / 80 uses | Alchemist's supplies | Glass |
| Ammunition | 5 | 1 HP / 100 uses | Tinker's tools | Metal |

HP and wear in this table are before durability factors. Profiles use item type/base item plus simple English name hints for objects such as rope and books. Imported or translated/custom objects may need the GM to choose the right profile, durability material, repair tool, and parts. Artifacts can wear but need an approved custom recipe to repair. Earlier untouched manual profiles for armor, clothing, shields, tools, and gear migrate once to use wear; explicit per-item manual overrides remain in place.

## Paid repairs

For the requested HP restoration:

`full repair price = max(rarity base GP, item price × value fraction, item custom minimum GP)`

`quote = ((full price × restored HP / max HP) − supplied-parts credit + broken surcharge) × repairer multiplier`

Charges round up to the next copper piece, with a one-copper minimum. The broken surcharge defaults to 25% of full repair price. Supply credit is capped at 80% of the proportional repair price, retaining a labor charge; it does not erase the broken surcharge. Only allocated supplied parts are consumed.

| Rarity | Base full-repair GP | Item-value fraction | Broken DC | Full routine minutes | Magic reagents | Arcana |
|---|---:|---:|---:|---:|---:|---|
| Mundane | 0 | 20% | 10 | 60 | 0 | No |
| Common magic | 20 | 20% | 12 | 120 | 4 | Yes |
| Uncommon | 100 | 20% | 14 | 240 | 4 | Yes |
| Rare | 500 | 20% | 16 | 480 | 4 | Yes |
| Very rare | 2,500 | 20% | 18 | 1,440 | 4 | Yes |
| Legendary | 10,000 | 20% | 20 | 4,320 | 4 | Yes |

Broken repairs take 1.5 times routine full-repair downtime. Artifacts are automatically tracked but excluded from ordinary repair until the GM enables a custom recipe. Items with blank rarity are mundane, while explicit Common rarity is treated as Common magic. Use the per-item mundane override for imports that incorrectly label ordinary equipment Common. Repair prices and supply quantities are multiplied by the inventory entry's quantity; its shared condition is restored together.

The default saved local repairer is disabled and supports mundane/common/uncommon items when enabled. This does not disable **Find a repairer**, the always-available GM-approval route (price multiplier 1, broken-repair check bonus +5). The GM still decides whether an appropriate professional and downtime are available. It never repairs destroyed items or bypasses the custom-artifact recipe requirement. Multiple optional saved services can be specified in Setup:

```json
[
  {
    "id": "town-smith",
    "name": "Town Smith",
    "enabled": true,
    "rarities": ["mundane", "common", "uncommon"],
    "multiplier": 1,
    "checkBonus": 5
  }
]
```

The GM can click **Add / place repairer** in the tracker without first choosing a character. Enter a name, price multiplier and broken-repair bonus (default +10). The shortcut creates a master-artisan NPC with tool/Arcana proficiency, a workshop item covering all tool roles, and an enabled paid service. Optionally it places an independent (unlinked) NPC token near the center of the viewed map. Each instance has its own repair queue and a separate recent-order history on the Token document. Existing linked module repairer tokens are migrated to unlinked tokens by the primary GM on startup; ordinary NPCs are not changed. It leaves the current equipment view alone. If placement fails, the NPC/service remains valid and can be dragged from Actors. Artifacts still require approved recipes, and broken-item checks may fail.

Players review a quote in the tracker. **On-map instances** show **Pay and repair** or **Pay and repair all** and complete without approval. **Unplaced services** send a private chat card for the GM to approve availability/downtime; no payment occurs before approval. On completion, the module rechecks the item's state, price, supplied inventory, combat status, and affordability. A broken item requires the NPC repairer's d20 + configured check bonus against the repair DC. A failed professional attempt leaves the item broken and **does not charge the character or consume their supplied parts**. A successful repair deducts coins, consumes any supplied parts, and restores HP. Old/cancelled/completed requests cannot be approved again.

Prices use standard pp/gp/ep/sp/cp values, but payment preserves the rest of the purse: copper first, then silver, electrum, gold and platinum. For a 0.2 gp charge, 20 available copper is used first; otherwise two silver can pay it. If exact smaller-coin payment is impossible, only the smallest larger coin needed is broken and change is returned in ordinary gold/silver/copper. Unspent coins are not normalized and new electrum is not introduced as change. Item/currency updates are serialized per customer and per placed repairer on the first active GM; duplicate wear events and stale repair confirmations are rejected. Failed commits attempt to restore both supplies and payment, and report if a restoration itself fails. A GM must be connected; no player-only fallback guesses that an update succeeded.

Placed services are resolved on the buyer's viewed scene, even when the GM is viewing a different scene. Hidden NPCs are unavailable to players; repairers in combat or at 0 HP cannot work. Removing/disabling a repairer during a broken-item check prevents payment. Each order carries its own customer/item IDs, quote and result; multiple customers at one NPC are queued safely, while different NPC instances can work independently. A GM still needs to be connected as the update authority, but does not approve each placed-NPC sale. Placing a previously unplaced service can invalidate old approval requests; reopen the quote to select its on-map instance.

## Welcome and update notes

Each Foundry user gets a short first-use guide for their role when joining the world: players see using/repairing their items; GMs see configuration, supplies, and approval tools. Later versions show the changes since that user's last seen version. A saved per-user flag prevents repeat notices on every login, and users who miss multiple versions see the intervening notes.

The GM can uncheck **Show welcome and update popups** in Module Settings, use the matching Setup checkbox, or disable them from the guide itself. This disables automatic notices for everyone in that world. The tracker **Help** button remains available on demand. Future releases must keep the manifest, package, and `core.mjs` versions in sync and add their user-facing changes to `scripts/notices.mjs`.

## Launcher macro

The shared macro is created automatically by the GM and can be recreated from setup. Its plain script is also included in `macros/Equipment_Tracker.js`:

```js
const module = game.modules.get("saltybananaslug-breakable-items");
if (!module?.active || !module.api) {
  ui.notifications.warn("Enable SaltyBananaSlug's Breakable Items first.");
} else {
  module.api.open();
}
```

## API

```js
const api = game.modules.get("saltybananaslug-breakable-items").api;
api.open();                         // selected owned token, then assigned character; otherwise empty
api.open(actor, item.id);           // open a particular actor/item
api.inspect(item);                 // read state and tracking status
await api.damage(item, 3, "Stone wall impact"); // GM only
await api.recordUse(item);         // one normal use; owner or GM
await api.recordUse(item, 3, {intensity: "strenuous", reason: "Hauling crates"});
api.help();                        // manually reopen the role-specific guide
api.mending(item);                 // choose a caster, complete native cast, choose target
api.toolRoles(item);               // GM: expanded role editor for any physical item
await api.repair(item, 5);          // owner's self repair; all normal rules still apply
await api.repair(item, 5, {repairer: helperActor}); // owned helper's tools/skills; owner's parts
await api.armorHit(actor);          // GM: record one confirmed hit on worn body armor
await api.setUnbreakable(item, {permanent: true}); // GM: native property
await api.setUnbreakable(item, {
  temporaryMode: "minutes", duration: 10, label: "Protective enchantment"
});
await api.setUnbreakable(item, {permanent: false, temporaryMode: "none"});
```

## Validation and limits

Run `npm test` (or `node --test tests/*.test.mjs`) with Node 20+ to verify durability, reduced weapon dice, full-HP defaults, Unbreakable protection/expiry, armor hits, critical exemptions, third-break destruction, currencies, inventory spending, ownership, combat locks, failed repairs, paid-service transactions, and simulated player/GM socket round trips. Additional tests cover all physical-item profiles, durability factors, shared-stack repairs, Fix All supply/payment handling, and per-user welcome/update behavior. DOM interaction checks exercise the tracker, ordinary item use, charge consumption, ammunition, Fix All, guide controls, protection/repair dialogs, native hooks, sheet badges, and setup in a mock Foundry host. See VALIDATION.md for the release's counts. A licensed running Foundry world is not included in this package, so actual visual layout, live player/GM transport, and interactions with other modules still need an in-world check before campaign use.

The module supports native D&D5e activity use restrictions. Other modules that bypass those activities, directly edit actor bonuses, drop flags, or merge different items may require additional integration. Disabled modules and arbitrary custom macros cannot be constrained by this module.

## Quick in-world check

1. Join as GM and player to check each guide; dismiss and reconnect to confirm it stays dismissed. Disable automatic guides in Setup and confirm Help remains available.
2. Open the tracker with a test character; confirm that weapons and unequipped ordinary gear appear at full HP and that inventory/item-sheet durability is visible.
3. Record rope/book use and native tool/charged-item activities; confirm one use per native action and fractional progress. Change rarity/quality on an unconfigured test item and compare calculated HP/wear.
4. Roll ordinary native weapon damage and confirm wear carryover. Roll critical damage and confirm that HP/remainder do not change.
5. Apply enough GM durability damage to break the item. Supply the required tools/parts/proficiencies and attempt its repair outside combat. Repeat twice more: the third break must become destroyed and offer no repair.
6. Start combat with that character and confirm both individual and Fix All repair routes are locked.
7. Damage two items; review Fix All's combined supplies, complete self repairs, then try a placed repairer with direct payment and an unplaced repairer with player request/GM approval. Inspect coins, parts, HP, tool uses, and break history.
8. With Damage received selected, reduce HP and temporary HP on an armored character or NPC while the tracker is closed; check its equipped armor’s event count and wear. Healing should add no wear. Switch to Targeted attack hits and check hit/miss detection, with no extra wear when applying damage.
9. Grant Unbreakable, repeat weapon damage and incoming armor hits, and confirm existing HP/break history remains unchanged. Advance world time beyond a temporary duration and check ordinary wear resumes.
10. Set a test weapon to half HP; check normal/versatile/critical damage dice step down once while bonuses and separately added damage stay unchanged. Repair above half HP and confirm original dice return.
11. Change a saved item's rarity and use Recalculate HP; confirm its damage percentage and break count are preserved.

12. Close the tracker with its native title-bar X while equipment updates arrive. It must stay closed. Reopen from the macro or a creature’s sheet button.
13. Test a long item name and several rows at your normal Foundry UI scale. Rows should grow to fit their text; inventory and details should scroll independently. Background refresh should preserve scroll, while choosing another item should start its detail pane at the top.

14. Before opening the tracker even once, use a weapon and apply damage to an equipped armor wearer. Open each item sheet afterward and verify HP, recorded uses/events and wear progress. With no selected token and no assigned character, the tracker should show an empty selection, not an arbitrary actor.

15. With no saved services enabled, request a paid repair and paid Fix All as a player. Confirm the no-setup option is selected, no payment occurs before approval, and GM approval uses the quoted price.
16. Configure a custom weapon/equipment item with two tool roles. Verify that tool presence is separate from proficiency; test optional proficiency and attunement. Try an attuned All-Purpose Tool.
17. Select an owned helper in single/Fix All repairs. Verify helper tool use, owner supplies, and combat locks on either actor. As GM, use Add / place repairer to create a named NPC and optional independent token.

18. Cast Mending normally from a spell and a custom item activity. Choose a token/item, try item drop, confirm limits, and check the configured HP restoration. Cancel a prompt, repeat the same cast notification, and try a destroyed item; these must not add HP.
19. Place two repairers and pay from two different characters at once. Check separate queues/order histories, no approval prompts for placed services, and no shared token state.
20. Set a 0.2 gp quote and a purse with silver plus gold/platinum. Verify two silver are deducted with higher coins unchanged; repeat with enough copper and then with only one gold coin to test minimal change.
