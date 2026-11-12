# Changelog

## 0.4.1 — 2026-11-12

* Mending supports clicking a map token, uses its live inventory for HP and repair, and refreshes while the picker is open.

## 0.4.0 — 2026-11-11

* Added native Mending cast detection with a post-cast token/character and item picker, plus inventory-item drop. Damaged item panels can launch a native cast. Default restoration is 1 physical HP per one-minute cast, configurable by the GM.
* Mending preserves breaks/charges/magic flags, rejects destroyed items and shared stacks, respects casting-time/combat restrictions, and tracks one target per completed cast. Observable party equipment can be mended without granting ordinary edit/repair access.
* Added a dedicated Tool roles / All-Purpose Tool button and expanded editor on item sheets and the tracker, including actual tools. Added broader document-sheet decoration hooks.
* Placed repairer instances now complete paid single/batch repairs without GM approval. Unplaced/fallback services retain approval. Each token has its own queue/history; existing linked repairer tokens and future repairer placements become independent/unlinked.
* Buyer-scene validation, hidden/unavailable NPC checks, fresh quotes, per-customer transactions and per-instance locking protect simultaneous repairs. Different tokens based on the same NPC no longer share combat locks.
* Currency payment now spends smallest denominations first, preserves untouched coins, and changes only the smallest larger coin needed. It does not normalize the entire purse or introduce electrum as change.

## 0.3.0 — 2026-11-11

* Added an always-available priced GM-approval service request for single repairs and Fix All. No NPC or service setup is required; explicit unavailable service IDs still fail rather than silently changing the quote.
* Added the GM Add / place repairer shortcut: creates a master-artisan NPC/workshop and enabled service, with an optional linked token on the viewed map. Failed service registration cleans up the NPC; failed placement preserves the useful NPC/service and reports how to place it manually.
* Repair dialogs and Fix All can choose an owned repairing character for tools and skills. Materials remain with the item owner. Both actors are locked against concurrent transactions in consistent order; owner items, supplies and helper tool wear share rollback handling.
* Any physical item can also serve as chosen tool roles. All-artisan coverage, proficiency grants and attunement requirements are separate controls. Native tool categories now include artisan tools, kits, navigation, thieves’ tools, instruments and games.
* Recognizes attuned All-Purpose Tool items automatically for artisan roles/proficiency; no blanket artificer-class tool grants. Native broken-repair checks use temporary proficiency on a transient actor copy, preserving native calculation and saved character data.
* Item sheets display tool roles. Native tool checks recognize custom tool-role items, while tagged internal repair rolls cannot double-count wear. Existing HP, breaks, background tracking and repair restrictions remain intact.

## 0.2.2 — 2026-11-11

* Made the tracker strictly contextual: selected token first, assigned player character second, or an explicit creature/item opened from its sheet. Removed the actor roster and arbitrary first-character fallback.
* An open tracker follows token selection. Token selection never launches a closed tracker, and rerunning the macro resolves the current token instead of retaining an old creature.
* Item sheets show stored uses and wear progress directly, with an explicit background-tracking status. The item remains the source of truth; the tracker has no activation/initialization role.
* Added first-ever-launch regression checks: native weapon and armor wear occurs before any tracker is opened, then appears on the item sheet. Existing HP, break history and GM overrides remain preserved.

## 0.2.1 — 2026-11-11

* Fixed inventory rows inheriting native fixed button heights, overlapping labels, cramped controls, and detail-pane layout. Both panes retain scroll position during background refresh; selecting another item resets its detail scroll.
* Fixed title-bar Close/Menu clicks entering the tracker action handler. Closing unregisters refresh immediately, and late updates or action completions cannot reopen the closed instance. Explicitly launching it still works.
* Armor defaults to wear once per native actor damage update, including temporary HP and manually applied HP damage. Targeted native attack hits remain a separate selectable mode; the two paths never stack. Armor panels show event counts, fractional wear and equipped status.
* Durability is automatic for all creatures’ physical equipment, including NPCs and unlinked tokens, without initializing the tracker. Added a contextual creature-sheet launcher and item-sheet Record Use/Repair access. Natural AC needs a physical armor item to have equipment durability.
* The tracker lists player characters and explicitly opened/selected creatures; it no longer loads all world/scene NPC equipment into its picker. Removed the misleading enable-tracking step from the tracker. Individual opt-outs and saved HP/breaks remain intact.
* Added regression coverage for native close controls, late updates, fixed-height CSS, both armor modes, NPCs, synthetic actors, lazy selection, and native sheet access.

## 0.2.0 — 2026-11-11

* All physical inventory items are automatically eligible for gradual use wear, whether equipped or not. Added profiles for containers, rope, books, foci, jewelry, consumables, and ammunition. Repair supplies and nonphysical features are excluded.
* Starting HP and wear use editable type, rarity, material, quality, and use-intensity factors. Fractional wear carries forward. Existing saved HP/break history stays intact; GM Recalculate HP preserves damage percentage when adopting the new maximum.
* Players can Record Use on ordinary gear or enter multiple/intensive narrative uses. Native activities, tool checks, ammunition, item resources, and charge spending can record uses; native charge/activity use is not counted twice.
* Inventory stacks share condition, with repair prices and materials accounting for quantity. Artifacts can wear but still require an approved custom repair recipe. Single-use consumables remain normally consumed.
* Added Fix All with item selection, required supplies, itemized paid prices, total costs/time, and separate checks only for broken items. Shared inventory parts cannot be allocated twice. Paid batches require GM approval and charge only successful repairs; combat and stale-quote guards apply to both routes.
* Repair tools record use while remaining in inventory. Batch item, supply, tool-condition, and currency changes share rollback handling.
* Armor-hit base rates accept fractional HP, and clearing a per-item override restores the campaign setting. Profile selection calculates HP with rarity/material/quality factors.
* Added role-specific first-use guides and per-user update notes once per version, with a world-wide GM disable setting and manual Help access.
* Earlier default manual profiles migrate once to use wear; explicit per-item overrides are preserved. Extended the rule, service, popup, and DOM interaction checks.

## 0.1.2 — 2026-11-11

* Weapons at 50% damage or worse reduce their native base damage dice by one step (d12 → d10 → d8 → d6 → d4 → d2 → d1).
* Dice counts, flat bonuses, separately added damage parts, and critical behavior are preserved. Versatile damage uses the selected weapon mode.
* Repeated native roll-dialog builds cannot stack the penalty. Repairs above half HP restore original dice without changing the Item's stored damage formula.
* Tracker, item panels, and character inventory show the reduced-damage warning.
* Broken/destroyed equipment use and equipping restrictions are always enforced. A final roll check catches equipment breaking while a roll dialog is open; Unbreakable does not bypass existing broken/destroyed status.

## 0.1.1 — 2026-11-11

* Existing items without a durability record begin at full profile HP and zero breaks. Saved HP, wear, and break history remain unchanged.
* Added the native Unbreakable item property, plus GM-controlled temporary protection with world-time expiration or manual removal.
* Unbreakable prevents weapon wear, armor wear, direct damage, and destruction, preserving existing damage and history without a deferred wear backlog.
* Body armor is automatically tracked and loses a configurable fixed amount of HP per native targeted attack that hits (default 1 HP), independent of damage dealt.
* Armor hit detection uses the attack card's target/AC snapshot, ignores misses, and deduplicates repeated delivery. Shields remain separate.
* Added armor hit counters, per-item wear overrides, a manual GM hit action, protection displays, and Unbreakable tracker filtering.

## 0.1.0 — 2026-11-11

* Initial release for Foundry VTT 13 / D&D5e 5.2.x, targeting 5.2.4.
* Shared player/GM Equipment Tracker macro and SBS hub registration.
* Native weapon-damage wear, critical exemption, configurable use/manual profiles.
* Item HP, percentage damaged, history, character-sheet badges, and item-sheet panels.
* First/second break repair checks; third lifetime break destroys automatically.
* Tool/proficiency/Arcana checks, real supply consumption, partial repairs, and combat locks.
* Rarity-based repair pricing, supplied-parts discounts, and GM-approved paid services.
* Serialized GM updates, stale-request protection, and transaction rollback handling.
