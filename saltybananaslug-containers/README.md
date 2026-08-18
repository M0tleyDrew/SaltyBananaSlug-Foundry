# SaltyBananaSlug's Containers v0.1.7

## v0.1.6 interaction hotfix
- SBS now intercepts the actual Token double-click for SBS containers instead of using Lock & Key's `TokendblClick` hook as the opener.
- Non-GM double-clicks are explicitly passed through Lock & Key's own `TokendblClick` permission gate before SBS can open. Locked means no SBS window.
- SBS never forwards an allowed SBS double-click to Foundry's native token/Actor sheet, preventing the hidden container inventory Actor sheet from opening for GMs.
- Lock & Key remains authoritative for key/password/pick/break/lock interactions.
- Existing v0.1.x containers require no migration.

Independent container and loot storage for **Foundry VTT 13 + D&D5e**. **No Item Piles dependency and no Item Piles data is touched.**

## Required
- Foundry VTT 13
- D&D5e
- Lock & Key 5.0.5 or newer (`LocknKey`)

## Install for local testing
1. Extract the `saltybananaslug-containers` folder into `FoundryVTT/Data/modules/`.
2. Restart Foundry.
3. Enable **Lock & Key** and **SaltyBananaSlug's Containers** in the world.
4. In Token controls, use the container-create button to launch the GM Container Maker.
5. Use the Container Manager button to locate, open, edit, or inspect container journals.

## What v0.1.0 does
- Gives every container its own hidden D&D5e Actor inventory.
- Stores real embedded D&D5e Items and native D&D5e currency.
- Uses a custom SBS container sheet rather than an Actor sheet or Item Piles sheet.
- Includes a GM Container Maker with Basics, Appearance, Access, Lock & Key, Inventory, Journal, Advanced, and Summary steps.
- Makes wizard/dialog content viewport-aware, resizable, and internally scrollable.
- Includes matching Closed/Open/Locked artwork for **19 container types**: Chest, Strongbox, Crate, Box, Barrel, Cabinet, Cupboard, Wardrobe, Drawer, Desk, Bookshelf, Weapon Rack, Safe, Sack, Backpack, Coffin, Display Case, Locker, and Other.
- Supports custom Closed/Open/Locked artwork with Foundry's File Picker.
- Automatically changes the placed token image when the container opens, closes, locks, or unlocks.
- Double-clicks a container to interact with it.
- Lets players drag items from Actors they own into an open container when they have deposit permission.
- Lets players take one or all of an item to an Actor they own when they have withdrawal permission.
- Supports direct currency deposits and withdrawals.
- Adds **Split Evenly Among Active Players** for container currency.
  - Uses active non-GM users with assigned character Actors.
  - Deduplicates the same character if represented more than once.
  - Splits CP/SP/EP/GP/PP separately.
  - Leaves indivisible remainders in the container.
  - Shows a confirmation preview, including skipped active users and the remainder, before committing.
- Routes player changes through the active GM client, which re-checks permissions, distance, state, lock status, quantities, and ownership before changing inventory.
- Does not expose the hidden inventory Actor to players; player inventory views are safe snapshots returned after GM-side validation.
- Supports configurable interaction distance and separate open/close/inspect/deposit/withdraw permissions.
- Treats Lock & Key as the authority for locked/unlocked state.
- Registers SBS containers as a Lock & Key token lock type rather than masquerading as an Item Pile.
- Supports Lock & Key key IDs, new-key creation, passwords, pick DC, break DC, attempt limits, required successes, special lockpicks, and lock-on-close configuration.
- Uses Lock & Key's normal token interaction controls for key/password/pick/break actions.
- Automatically creates a companion Journal for every container.
- Makes the companion Journal **GM-only by default**, with optional All Players or selected-player visibility.
- Names Journals `Container Name — Scene Name`; exact duplicates become `... 2`, `... 3`, `... 4`, and so on.
- Keeps current contents, currency, original-content snapshot, lock summary, and optional transaction history in the journal.
- Records currency splits in transaction history when logging is enabled.
- Provides a Container Manager with locate/open/edit/journal controls.
- Preserves the hidden inventory Actor and Journal if a container token is deleted, so accidental token deletion does not destroy the loot record.
- Automatically forks copy/pasted SBS containers to new independent inventory Actors and Journals, preventing duplicated tokens from sharing one inventory.

## Journal visibility warning
If you deliberately share a container Journal with players, its journal content can reveal the container's recorded contents. The default is **GM Only** for this reason. Players do not need journal access to loot or deposit items through the container UI.

## Player-created containers
Player creation is disabled by default. If the GM enables it, player-created containers:
- start unlocked,
- start empty,
- use the safe player wizard,
- can then receive items by dragging them from an Actor the player owns.

Starting player containers empty is intentional: it prevents a player from constructing arbitrary item data in the creation request and duplicating loot.

## Deliberately conservative in v0.1.0
- Capacity settings are stored in the data model but are not strictly enforced yet.
- Lock & Key password, lockpicking, breaking, and specialized lock actions remain in Lock & Key's normal token interaction UI.
- Deleted-token recovery data is preserved and shown as an orphan in Container Manager; one-click restore is planned for a later pass.
- This is a first test build. It has been statically validated, but it still needs a smoke test inside an actual Foundry world before trusting it with campaign-critical loot.

## Suggested first smoke test
Use a throwaway scene and create one container with a junk item and a few coins. Test, in order:
1. Closed/Open image switching.
2. Lock/unlock through Lock & Key.
3. GM Take/Deposit.
4. Player Take/Deposit with an assigned character.
5. Currency transfer.
6. Split Evenly Among Active Players.
7. Journal naming/visibility.
8. Copy/paste the container and verify the copy has independent contents.
9. Delete the test token and verify its inventory/journal remain listed as recoverable data.

## Macro/API
- `game.sbsContainers.create()`
- `game.sbsContainers.manager()`
- `game.sbsContainers.open()` — uses the selected token when no token is supplied.
- `game.sbsContainers.edit()`

## Item Piles safety
This module does not read, write, migrate, convert, or modify Item Piles actors, tokens, flags, settings, or inventories. It can be enabled alongside existing Item Piles containers for testing.


## v0.1.2
- New containers are now placed interactively after finishing the wizard; left-click places, Esc/right-click cancels without creating documents.
- Wizard footer navigation buttons now use explicit high-contrast styling.

## v0.1.3
- Drag a Foundry Journal Entry or Journal Page onto an open container to preview and import linked Foundry Items.
- Journal imports preserve recognized item quantities and loose cp/sp/ep/gp/pp currency while ignoring value text such as “gem worth 25 gp.”
- Journal imports are copy-only: the source Journal is never edited, emptied, or deleted.
- Unresolvable or unauthorized Item links are reported as skipped instead of creating fake placeholder items.
- Hardened player lock enforcement: non-GM open, inspect, snapshot, item transfer, currency transfer, split, and Journal-import requests are revalidated by the active GM client.
- Lock checks now fail closed against Lock & Key's native LockedFlag as well as its API state. GM administrative access to locked containers remains unchanged.



## v0.1.4
- Locked-player windows now fail closed before rendering contents and are immediately closed on a Lock & Key lock-state update.
- Player Take, Deposit, Currency, Split, Snapshot, and Journal actions perform an additional local lock check before sending anything to the GM.
- Player socket requests carry the player's observed locked state; the GM rejects the request if either client sees the container as locked.
- Double-click handling now suppresses the underlying token double-click event for SBS containers so a locked interaction cannot fall through to another sheet-opening path.
- All SBS buttons and SBS dialogs now use explicit high-contrast button styling instead of inheriting grey-on-grey theme colors.
- The Container Maker Inventory step now accepts Journal Entries and Journal Pages before creation, previews recognized loot, and stages their linked Items plus recognized cp/sp/ep/gp/pp currency. The source Journal remains unchanged.


## v0.1.5 lock-interaction fix
- Removed SBS's direct wrapper around `Token.prototype._onClickLeft2`.
- SBS now opens containers through Lock & Key's `LocknKey.TokendblClick` gate.
- The Lock & Key canvas `callAll` fallback is separately guarded so a locked player interaction cannot reach the SBS opener through that path either.
- Lock & Key therefore has sole first authority over locked player double-clicks; if it rejects the click, the SBS container opener is never called.
- Allowed double-clicks still open the SBS interface and suppress the linked inventory Actor sheet.
- Existing local and GM-side lock checks remain as defense-in-depth for take/deposit/currency/socket actions.

## v0.1.7 lock hardening + identification
- SBS container map tokens are now **actorless**. The private inventory Actor is referenced only by SBS flags and remains GM-only. This prevents Foundry/Lock & Key token ownership from exposing the inventory Actor or bypassing the SBS player lock rule.
- Existing SBS container tokens are hardened automatically by the GM on world load: legacy inventory Actor links are detached, inventory Actor ownership is reset to GM-only, and current Lock & Key state is mirrored into a fail-closed SBS safety flag. No loot is moved or deleted.
- Player access no longer honors Lock & Key's optional owned-token opening exception. If the actual Lock & Key lock is locked, SBS treats it as locked for every non-GM user.
- Lock state is checked again on the GM socket for snapshots, item transfers, journal imports, currency, and splitting.
- GM container rows now expose **Identify / Mark Unidentified** controls for D&D5e items that support `system.identified`.
- The creation wizard also lets the GM stage supported items as identified or unidentified before placement.
- Player snapshots mask unidentified names/images, and player-visible companion journals also mask unidentified current contents. GM-only audit/history sections remain private when a journal is shared.


## v0.1.8 shell-token repair
- Foundry tokens are no longer actorless. Each SBS container gets a dedicated, empty, GM-only **shell Actor** for its map token.
- The real loot remains on the separate private inventory Actor; the shell contains no loot and grants players no ownership.
- On GM login, v0.1.7 actorless containers and older inventory-linked containers are automatically repaired to the shell-Actor model without moving or deleting loot.
- This avoids Foundry's “Token references an Actor which no longer exists” error while also avoiding Lock & Key's `alwaysopenOwned` exception for player-owned tokens.
- GM Identified / Unidentified item controls from v0.1.7 remain included.


## v0.1.10
- Added SaltyBananaSlug branding using the supplied banana-slug icon.
- Creator and Manager now have compact SBS branded headers.
- Live container windows include a small SBS brand mark.
- Both automatically-created launcher macros now use the SBS logo.
