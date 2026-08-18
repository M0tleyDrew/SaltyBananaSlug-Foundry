# SaltyBananaSlugs's Party Viewer

## SaltyBananaSlugs's Party Viewer v0.3.9

- Player deposits from owned actor sheets still auto-route through the active GM client, but now include safer source item data and clearer timeout diagnostics if the GM client never responds.
- Storage/trade dropdowns now show only real inventory item types: weapon, equipment, consumable, tool, loot, backpack/container. Spells, features, classes, and other sheet mechanics are filtered out.
- Drop handling now rejects non-inventory sheet items with a visible warning instead of trying to put Action Surge in the wagon.


SaltyBananaSlugs's Party Viewer is a lightweight Foundry VTT v13 / dnd5e party dashboard for Drew's irresponsibly modded table. It keeps its hands to itself: no sheet overrides, no libWrapper use, no Item Piles dependency, no actor sheet monkey-patching. Tiny module, big clipboard energy.

## Features

- Floating **Party** button for players and GM.
- Party dashboard with portrait, HP, AC, passive perception, conditions, death saves, exhaustion, inspiration, and role tags.
- GM roster controls for PCs, companions, hirelings, vehicles, mounts, and summons.
- Shared storage containers for wagons, mule bags, party chests, Bags of Holding, suspicious sacks, etc.
- Manual loot entry with value, weight, quantity, image path, and description.
- Move/copy items from owned actors into shared storage.
- Take items from shared storage into an actor.
- Shared currency per storage container.
- Trade offers with accept/decline.
- Transaction log.
- GM permission/visibility settings.
- Notes system:
  - Shared party notes.
  - Private per-user notes.
  - Player option to make private notes public.
  - GM-only note sections.
  - GM option to make specific GM note sections public.

## Install

Place the `party-viewer` folder in your Foundry `Data/modules/` folder, restart Foundry, and enable **SaltyBananaSlugs's Party Viewer**.

## Compatibility

Built for:

- Foundry VTT 13.347
- dnd5e 5.2.4

## Version

0.3.6

## Privacy note

Private notes are hidden in the Party Viewer UI from other players and the GM unless made public. They are stored in the module's world data, so they should be treated as table-private convenience notes, not Fort Knox with a lute. Do not put actual secrets there that would cause real-world drama if someone dug through module data.


## 0.3.0

- Added explicit **Save Storage** button for renaming storage and editing max capacity / permissions.
- Trades now use only tradeable items from party actors the player owns. GM trades use actors currently in the Party Viewer roster.
- Trade targets are limited to actors in the Party Viewer roster.
- Party member portraits and names now open that actor's sheet when clicked, respecting Foundry permissions.

## v0.3.2

Bug-fix pass:

- Replaced the Party Roster actor selector with a searchable type-to-filter actor field.
- Made storage drag-and-drop more reliable in Foundry v13 by using Foundry drag data helpers plus native drop handlers.
- Items dragged from owned actor sheets can now be moved into shared storage.
- GM can drag world/sidebar/compendium items into shared storage as copied item data.
- Non-GM users are still limited to items from actors they own, so players cannot conjure free loot from the sidebar like tiny capitalism wizards.



## Version 0.3.2

- Restored easy storage naming/capacity controls in the Storage tab and added a GM Manage Shared Storage section.
- Added visible drop zones to each storage container.
- Made item drop parsing more defensive for Foundry v13 actor sheets, Items sidebar entries, raw item data, UUID links, and compendium items.
- Added native capture drop handlers so heavily modded sheets/sidebar drags are less likely to get eaten by the tiny UI goblin.


## Changelog

### 0.3.3

- Fixed storage drag/drop being swallowed when the drop target was a text/icon child inside the drop zone.
- Improved embedded actor item detection for Foundry v13 by checking item parent actors as well as item.actor.
- Added console debug output for drop data to help identify any remaining module-specific drag payload weirdness.

### 0.3.2

- Restored storage naming/capacity editing and added visible storage drop zones.


## 0.3.4

- Restored and double-wired storage renaming/capacity edits from both the Storage tab and GM tab.
- Added version display in the Party Viewer header so you can verify the loaded module after replacing files.
- Reworked drag/drop parsing again with more aggressive Foundry v13 drop payload handling, including UUID extraction from raw transfer data and fromUuid fallbacks.
- Added clearer console diagnostics when a drop is seen but the item cannot be resolved.

If a drop lights up but still does not add, open the browser console with F12 and look for `party-viewer 0.3.4 | Drop data`. That line will show exactly what Foundry or another module is handing Party Viewer.


## 0.3.5

- Removed the browser `prompt()` call from drag/drop because Foundry v13 rejects it. Dragging now adds 1 item by default, or the full available stack if you hold Shift while dropping.
- Made the Storage tab's rename/capacity controls more explicit with a visible **Storage Name** label.
- Added extra resolved-drop console diagnostics showing the item name, available quantity, chosen quantity, and source actor.

## 0.3.6

Player deposits from owned actor sheets no longer appear as an approval request. Foundry still routes the world-data update through the active GM client in the background, but it now behaves like a direct deposit: the player drags an item from an owned character sheet into shared storage and the active GM client commits it automatically.

Added request result messages so players get a success or error notification instead of a vague “request sent to GM” message.


## Party Viewer v0.3.9

- Player-owned inventory deposits now use socketlib when available, so players can drag items from character sheets into shared storage without an approval prompt or a silent no-response socket failure.
- The Add Item from Character dropdown uses the stricter inventory item filter for weapons, equipment, consumables, tools, loot, backpacks, and containers only.



## v0.3.9

- Added `socket: true` to the module manifest so Foundry opens the module socket channel.
- Added a socketlib relationship and a guarded late socketlib registration fallback.
- Player-owned inventory deposits should now be processed by the active GM client without approval prompts or timeout warnings.

